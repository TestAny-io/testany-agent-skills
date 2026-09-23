// SPDX-License-Identifier: AGPL-3.0-only
import fs from 'node:fs/promises';
import path from 'node:path';
import { createService } from './service.mjs';
import { readJson, writeJson, redact, safeSegment } from './files.mjs';
import { acquireFileLock, operationLock } from './process-lock.mjs';
import { createBackgroundManager, backgroundPaths, normalizeBackgroundStatus } from './background.mjs';
import { CodexAdapter } from './cli.mjs';
import { installationIdentity, sameInstallation } from './installation.mjs';
import { captureSource } from '../scripts/source-bundle.mjs';
import { prepareRuntime } from './runtime.mjs';
import { resolveCodexCli } from './codex-runtime.mjs';

export async function resolveBackgroundSource(context, adapter) {
  if (context.installation.kind !== 'plugin') {
    try { await fs.access(context.source); return context.source; }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }
  const catalog = await adapter.list();
  const identity = context.installation;
  const installed = catalog.plugins.find(plugin => plugin.installed && plugin.id === `${identity.plugin}@${identity.marketplace}`);
  if (!installed) {
    if (!catalog.cli.available || catalog.diagnostics.length) throw new Error('无法确认 SkillDock 安装状态；未删除后台任务，请恢复 Codex CLI 后重试。');
    return null;
  }
  if (installed.enabled === false) return null;
  if (!safeSegment(installed.version)) throw new Error('无法确认 SkillDock 的已安装版本。');
  const source = path.join(identity.codexHome, 'plugins/cache', identity.marketplace, identity.plugin, installed.version, identity.appPath);
  if (!sameInstallation(identity, await installationIdentity(source, context.codexHome))) throw new Error('新版 SkillDock 的安装身份不匹配。');
  return source;
}

export async function refreshBackgroundRuntime(context, adapter, { prepare = prepareRuntime } = {}) {
  const source = await resolveBackgroundSource(context, adapter);
  if (!source) return null;
  const snapshot = await captureSource(source);
  if (context.digest === snapshot.sourceDigest) return context;
  // A source checkout used for development already has its dependencies.
  const runtime = source === context.runtime ? context.runtime : await prepare(context.stateDir, snapshot);
  const next = { ...context, source, runtime, digest: snapshot.sourceDigest, node: process.execPath };
  await writeJson(backgroundPaths(context.stateDir, context.home).context, next);
  return next;
}

export async function runBackground(context, options = {}) {
  const clock = options.now || Date.now; const stamp = () => new Date(clock()).toISOString();
  const paths = backgroundPaths(context.stateDir, context.home);
  const stateFile = path.join(context.stateDir, 'local/updates.json');
  const previous = normalizeBackgroundStatus(await readJson(paths.status, {}));
  const schedule = (await readJson(stateFile, null))?.schedule;
  const disabled = await readJson(paths.disabled, null);
  const version = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8')).version;
  let status = { ...previous, format: 2, version, lastWakeAt: stamp(), pid: process.pid };
  const report = async extra => { status = { ...status, ...extra }; await writeJson(paths.status, status); };
  // Wakes that are not due do not import a new runtime, contact the CLI or scan.
  if (!schedule?.enabled || disabled) {
    await report({ finishedAt: stamp(), outcome: 'disabled', error: undefined, errorAt: undefined, retryAt: undefined });
    // A crashed registration must not leave a dormant job behind. During a
    // successful enable transaction the owning UI still holds this lock.
    let release;
    try { release = acquireFileLock(operationLock(context.codexHome)); } catch (error) { if (error.code !== 'BUSY') throw error; }
    if (release) {
      let remove = false;
      try {
        remove = !!await readJson(paths.disabled, null) || !(await readJson(stateFile, null))?.schedule.enabled;
        if (remove && await fs.stat(paths.plist).catch(() => null)) await (options.manager || createBackgroundManager({ ...context, project: () => context.projectDir })).remove({ deferBootout: true });
      } finally { release(); }
    }
    return status;
  }
  const due = !schedule.nextRunAt || !Number.isFinite(Date.parse(schedule.nextRunAt)) || Date.parse(schedule.nextRunAt) <= clock();
  let installationStamp;
  if (context.installation.kind === 'plugin') {
    const stat = await fs.stat(path.join(context.codexHome, 'config.toml')).catch(error => { if (error.code !== 'ENOENT') throw error; return null; });
    const present = await fs.stat(context.source).then(() => true, error => { if (error.code !== 'ENOENT') throw error; return false; });
    installationStamp = `${stat?.mtimeMs || 0}:${stat?.size || 0}:${present}`;
  }
  const installationChanged = installationStamp !== undefined && installationStamp !== previous.installationStamp;
  const retryPending = previous.retryAt && Date.parse(previous.retryAt) > clock();
  if ((!due && !previous.runtimePending && !installationChanged) || retryPending) {
    await report({ finishedAt: stamp(), outcome: retryPending ? 'retry-pending' : 'idle' }); return status;
  }
  let release;
  try { release = acquireFileLock(operationLock(context.codexHome)); }
  catch (error) { if (error.code !== 'BUSY') throw error; await report({ finishedAt: stamp(), outcome: 'busy' }); return status; }
  let service; let removeRegistration = false; let stopping = false;
  const stop = () => { stopping = true; service?.close().catch(() => {}); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
  try {
    await report({ outcome: 'running', finishedAt: undefined });
    let codexBin = context.codexBin;
    if (!options.adapter) {
      // A stored explicit path is a preference, not a permanent dependency on
      // an app bundle version; rediscover after a desktop app/CLI replacement.
      const cli = await resolveCodexCli({ codexHome: context.codexHome, ...(codexBin ? { explicit: codexBin } : {}) });
      if (cli.available) codexBin = cli.path;
      else {
        const fallback = await resolveCodexCli({ codexHome: context.codexHome });
        codexBin = fallback.available ? fallback.path : undefined;
      }
    }
    const adapter = options.adapter || new CodexAdapter({ codexHome: context.codexHome, codexBin });
    let source = await resolveBackgroundSource(context, adapter);
    if (!source) {
      await writeJson(paths.disabled, { ...schedule, enabled: false });
      const state = await readJson(stateFile); state.schedule.enabled = false; delete state.schedule.nextRunAt; await writeJson(stateFile, state);
      removeRegistration = true;
      await report({ outcome: 'uninstalled', finishedAt: stamp(), error: undefined, errorAt: undefined, retryAt: undefined });
      return status;
    }
    if (stopping || await readJson(paths.disabled, null)) { await report({ outcome: 'cancelled', finishedAt: stamp(), runtimePending: true }); return status; }
    service = await createService({ home: context.home, codexHome: context.codexHome, stateDir: context.stateDir,
      projectDir: context.projectDir, adapter, background: false, scheduler: false, ownsOperationLock: true, now: clock });
    const previousRunId = (await service.updateProgress('local'))?.id;
    if (due) await service.tickScheduler();
    if (stopping || await readJson(paths.disabled, null)) { await report({ outcome: 'cancelled', finishedAt: stamp(), runtimePending: true }); return status; }
    const progress = await service.updateProgress('local');
    const completedRun = progress && progress.id !== previousRunId ? progress : null;
    // Updating the installed SkillDock never starts a web server. The stable
    // entry points to the new isolated runtime on its next invocation.
    await report({ runtimePending: true });
    const next = await refreshBackgroundRuntime({ ...context, ...(codexBin ? { codexBin } : {}) }, adapter, options);
    if (next === null) { removeRegistration = true; await writeJson(paths.disabled, { ...schedule, enabled: false }); }
    // Per-target failures remain in their dated update run. Worker health must
    // never inherit an old batch, or treat a blocked update as a broken task.
    await report({ outcome: next === null ? 'uninstalled' : completedRun?.status || 'idle', finishedAt: stamp(),
      ...(completedRun ? { lastRunId: completedRun.id } : {}),
      error: undefined, errorAt: undefined, retryAt: undefined, failureCount: 0, runtimePending: false, installationStamp });
  } catch (error) {
    const failureCount = (previous.failureCount || 0) + 1;
    await report({ outcome: 'error', finishedAt: stamp(), error: redact(error.message), errorAt: stamp(), failureCount,
      retryAt: new Date(clock() + Math.min(360, 5 * 2 ** Math.min(failureCount - 1, 6)) * 60000).toISOString() });
  } finally {
    try {
      await service?.close();
      if (removeRegistration) await (options.manager || createBackgroundManager({ stateDir: context.stateDir, home: context.home, codexHome: context.codexHome, project: () => context.projectDir })).remove({ deferBootout: true });
    } finally { release(); process.removeListener('SIGTERM', stop); process.removeListener('SIGINT', stop); }
  }
  return status;
}
