#!/usr/bin/env node
import { promises as fs, openSync, closeSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { captureSource } from '../assets/app/scripts/source-bundle.mjs';
import { canonicalPath, readRestart, writeRestart } from '../assets/app/server/installation.mjs';
import { prepareRuntime, verifyRuntime } from '../assets/app/server/runtime.mjs';
import { resolveLaunchProject, parseLaunchArguments, validProject } from '../assets/app/server/project-context.mjs';
import { resolveCodexCli } from '../assets/app/server/codex-runtime.mjs';
import { acquireFileLock } from '../assets/app/server/process-lock.mjs';
import { withStateLocks } from '../assets/app/server/state-locks.mjs';
import { readGeneration, writeGeneration, CURRENT_GENERATION } from '../assets/app/server/generation.mjs';
import { absolute, readText } from '../assets/app/server/installs.mjs';
import { readRecord, writeRecord, mirrorRecord, buildRecord, stoppedRecord, refreshRecord, restoreRecord, verifyInstance, legacyFields, ensureLegacyProject, isCurrentRecord } from '../assets/app/server/launcher-record.mjs';
import { installationContext, delegationTarget, delegate, newerDataError, legacyOwnership, migrationCheck, preferredWhenRunning, failureText, EXIT_MIGRATION_BLOCKED } from '../assets/app/server/launch-plan.mjs';
import { convertPlan, snapshotFiles, writeMigrationFailure, clearMigrationFailure } from '../assets/app/server/migration.mjs';
import { backgroundPaths, registrationExists, takeOverRegistration } from '../assets/app/server/background-registration.mjs';
import { writeClaudeRoot } from '../assets/app/server/claude-root.mjs';
import { defaultUpdateState } from '../assets/app/server/update-state.mjs';

const defaultApp = fileURLToPath(new URL('../assets/app/', import.meta.url));
const ACTIONS = ['start', 'status', 'stop', 'restart'];
const TAKEOVER_ATTEMPTS = 3;

export async function fingerprint(appDir) {
  return (await captureSource(appDir)).sourceDigest;
}

export async function probe(url) {
  try {
    const response = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(1500), redirect: 'error' });
    if (!response.ok) return null;
    return await response.json();
  } catch { return null; }
}

// 0.10.x records carry the launch project; 0.11 records carry the fixed legacy
// directory there (API-SDX-001 36a §5.2), so they are tied to the instance by pid,
// state and source digest only.
function matches(health, record) {
  if (health?.app !== 'skilldock' || health.pid !== record.pid || health.state !== record.state) return false;
  if (health.sourceDigest && health.sourceDigest !== record.digest) return false;
  return isCurrentRecord(record) || (health.launchProject || health.project) === record.project;
}

// A stopped 0.11 instance keeps its record (36a §5.3), written under the instance and
// Codex locks and only while the record still names that instance; 0.10.x records are
// removed as before.
// `locked`: the caller already holds the instance and Codex locks. Otherwise they are
// taken briefly; when they stay busy the process is gone anyway and the record is left
// for the next run (status reads the instance, not the record).
async function settle(record, recordFile, codexHome, { locked = false } = {}) {
  if (!isCurrentRecord(record)) return fs.rm(recordFile, { force: true });
  const state = path.dirname(recordFile);
  const write = async () => {
    const latest = await readRecord(state).catch(() => null);
    if (latest?.pid === record.pid && latest.url === record.url && latest.digest === record.digest) await writeRecord(state, stoppedRecord(latest));
  };
  if (locked) return write();
  try { await withStateLocks(state, codexHome, write, { wait: 10000 }); }
  catch (error) { if (error.code !== 'BUSY') throw error; }
}

async function stop(record, recordFile, codexHome, { locked = false } = {}) {
  const health = await probe(record.url);
  if (!matches(health, record)) {
    // A stopped 0.11 record names an instance that is gone; its pid may have been reused.
    if (isCurrentRecord(record) && record.status === 'stopped') return { status: 'stopped', message: '此实例已停止。' };
    let alive = false;
    try { process.kill(record.pid, 0); alive = true; } catch {}
    if (alive) throw new Error('无法核实记录中的进程属于此 SkillDock 实例；未停止任何进程。');
    await settle(record, recordFile, codexHome, { locked });
    return { status: 'stopped', message: '此实例已停止。' };
  }
  process.kill(record.pid, 'SIGTERM');
  for (let i = 0; i < 100; i++) {
    await new Promise(resolve => setTimeout(resolve, 100));
    let running = true;
    try { process.kill(record.pid, 0); } catch (error) { if (error.code === 'ESRCH') running = false; else throw error; }
    if (!running) {
      await settle(record, recordFile, codexHome, { locked });
      return { status: 'stopped', message: 'SkillDock 网页服务已停止。已启用的独立自动更新不受影响，可在更新页关闭计划。' };
    }
  }
  throw new Error('服务尚未停止；保留启动记录，请稍后检查状态。');
}

// Starts the runtime a record names. A 0.10.x record is only started to restore the old
// instance after a failed migration, with 0.10.2's environment and record shape.
async function startRuntime(record, recordFile, { env, projectContext }) {
  const current = isCurrentRecord(record);
  const project = current ? record.actualProject : record.project;
  const fd = openSync(path.join(record.state, 'server.log'), 'a', 0o600);
  const childEnv = { ...env, PORT: String(new URL(record.url).port), CODEX_HOME: record.codexHome,
    SKILLDOCK_STATE_DIR: record.state, SKILLDOCK_PROJECT_DIR: project,
    SKILLDOCK_SOURCE_DIGEST: record.digest, SKILLDOCK_APP_SOURCE: current ? record.running.appPath : record.source,
    SKILLDOCK_PROJECT_CONTEXT: JSON.stringify((current ? projectContext : record.projectContext) || null),
    ...(record.cli?.available ? { SKILLDOCK_CODEX_BIN: record.cli.path } : {}) };
  for (const name of ['SKILLDOCK_RESTART_JOB', 'SKILLDOCK_HANDOVER', 'SKILLDOCK_HANDOVER_AGENT', 'SKILLDOCK_HANDOVER_FROM', 'SKILLDOCK_DELEGATED']) delete childEnv[name];
  const child = spawn(process.execPath, [path.join(record.runtime, 'server/index.mjs')], {
    cwd: project, detached: true, shell: false, env: childEnv, stdio: ['ignore', fd, fd],
  });
  closeSync(fd);
  const execution = { node: process.execPath, nodeVersion: process.versions.node, source: env.SKILLDOCK_NODE_SOURCE || 'direct' };
  const next = current ? { ...record, pid: child.pid, status: 'running', updatedAt: new Date().toISOString(), execution } : { ...record, pid: child.pid, execution };
  let registered = false; let spawnError;
  child.once('error', error => { spawnError = error; });
  try {
    for (let i = 0; i < 80; i++) {
      if (spawnError) throw spawnError;
      if (matches(await probe(record.url), next)) {
        await fs.writeFile(`${recordFile}.tmp`, JSON.stringify(next, null, 2), { mode: 0o600 });
        await fs.rename(`${recordFile}.tmp`, recordFile);
        await mirrorRecord(record.state, next);
        registered = true; child.unref(); return next;
      }
      if (child.exitCode !== null) break;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error(`SkillDock 未能启动，请查看 ${path.join(record.state, 'server.log')}`);
  } finally {
    // Only terminate the child created here; wait before attempting rollback on its port.
    if (child.pid && !registered && child.exitCode === null && child.signalCode === null) {
      await new Promise(resolve => {
        const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
        child.once('exit', () => { clearTimeout(timer); resolve(); }); child.kill('SIGTERM');
      });
    }
  }
}

/**
 * HLD 3.7 steps 2–5 under the instance and Codex locks: take over the background
 * registration (read back, limited retries), write the version-2 plan, the record in its
 * stopped form and finally generation 2. Any failure before the last step restores every
 * file it touched, so the data stays a consistent generation 1.
 */
async function migrate({ state, codexHome, home, plan, record, runtime, digest, project, cli, env }) {
  const paths = backgroundPaths(state, home);
  const undo = await snapshotFiles([paths.context, paths.entry, paths.script, path.join(state, 'local/updates.json'), path.join(state, 'launcher.json')]);
  try {
    if (await registrationExists(paths)) {
      for (let attempt = 1; ; attempt++) {
        try {
          await takeOverRegistration({ stateDir: state, home, codexHome, claudeRoot: plan.claudeRoot, projectDir: project, appRuntime: runtime,
            source: plan.own.appPath, digest, codexBin: cli.available ? cli.path : undefined,
            environment: Object.fromEntries(['SKILLDOCK_SELECTED_NPM_CLI', 'SKILLDOCK_CODEX_APP_DIR', 'SKILLDOCK_WORKSPACE_RUNTIME'].filter(key => env[key]).map(key => [key, env[key]])) });
          break;
        } catch (error) {
          if (attempt >= TAKEOVER_ATTEMPTS) throw new Error(`接管后台注册失败：${error.message}`);
        }
      }
    }
    await convertPlan(state, defaultUpdateState(2));
    await writeRecord(state, record);
    await writeGeneration(state, plan.own.version);
  } catch (error) {
    const failed = await undo().then(() => null, problem => problem);
    if (failed) error.message += `；撤销未完成，${failed.message}`;
    throw error;
  }
}

export async function launch(action = 'start', options = {}) {
  if (!ACTIONS.includes(action)) throw new Error('用法：node launch.mjs [start|status|stop|restart]');
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 12)) throw new Error('SkillDock 需要 Node.js 22.12 或更新版本。');
  const env = options.env ?? process.env; const home = options.home ?? os.homedir();
  const appDir = await canonicalPath(path.resolve(options.appDir ?? defaultApp));
  const state = await canonicalPath(path.resolve(options.stateDir ?? env.SKILLDOCK_STATE_DIR ?? path.join(home, '.local/share/skilldock')));
  const port = Number(options.port ?? env.PORT ?? 4771);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('PORT 必须为 1024–65535。');
  const url = `http://127.0.0.1:${port}`;
  const recordFile = path.join(state, 'launcher.json');
  const generation = await readGeneration(state);
  if (generation > CURRENT_GENERATION) throw newerDataError(generation);
  const initial = await readRecord(state);
  // 36b 6.3: without CODEX_HOME the Codex home saved in the record is used.
  const codexHome = await canonicalPath(path.resolve(options.codexHome ?? env.CODEX_HOME ?? (absolute(initial?.codexHome) ? initial.codexHome : path.join(home, '.codex'))));
  const plan = await installationContext({ env, home, state, appDir, record: initial, codexHome });
  const jobId = options.restartJob ?? env.SKILLDOCK_RESTART_JOB;
  const target = delegationTarget(plan, { action, env, restartJob: jobId });
  if (target) throw Object.assign(new Error(`转交给 ${target.agent === 'claude' ? 'Claude' : 'Codex'} 中的 SkillDock ${target.version}。`), { code: 'SKILLDOCK_DELEGATE', target });

  // DEC-SDX-007: the data directory belongs to the product family (same marketplace name,
  // plugin and source identity) or, for a development copy, to that copy only.
  async function checkOwner(record) {
    if (!record) return;
    if (record.state !== state) throw new Error('此数据目录属于另一个源码实例；请使用独立 SKILLDOCK_STATE_DIR。');
    if (isCurrentRecord(record)) {
      const running = record.running || {};
      if (running.appPath === appDir) return;
      if (plan.owner && running.marketplace === plan.owner.marketplace && running.sourceKey === plan.owner.key) return;
      throw new Error('此数据目录属于另一个安装来源；请使用独立 SKILLDOCK_STATE_DIR。');
    }
    if (record.source === appDir) return;
    const legacy = await legacyOwnership(record, plan, { migrateFrom: options.migrateFrom });
    if (legacy === 'family' || legacy === 'testany-eng') return;
    if (legacy === 'claude-legacy') {
      const message = 'Claude 中装有低于 0.10.3 的 SkillDock，正在使用这个数据目录；0.11 暂不接管数据，旧版本照常工作。';
      const steps = ['在 Claude 中把 SkillDock 更新到最新版本（或从 Claude 卸载 SkillDock），并重载插件。', '处理后重新打开 SkillDock，会重新检查。'];
      // Exit 4 belongs to the migration gate of start and restart (36b 6.3).
      const gate = ['start', 'restart'].includes(action);
      throw Object.assign(new Error(message), { code: 'MIGRATION_BLOCKED', exitCode: gate ? EXIT_MIGRATION_BLOCKED : 1, output: { status: 'migration-blocked', message, blockers: [], unreadable: [], steps } });
    }
    throw new Error('此数据目录属于另一个源码实例；旧 testany-eng 用户可使用 --migrate-from testany-eng 接续数据，其他来源请使用独立 SKILLDOCK_STATE_DIR。');
  }
  await checkOwner(initial);
  // 36a §7: the fixed legacy directory is confirmed on every run once migrated.
  if (generation >= CURRENT_GENERATION) await ensureLegacyProject(state);
  if (action === 'status') {
    const health = initial && await probe(initial.url);
    return initial && matches(health, initial)
      ? { status: 'running', url: initial.url, pid: initial.pid, project: health.project, projectContext: health.projectContext,
          state, execution: initial.execution, cli: initial.cli, backgroundService: true, appVersion: health.appVersion }
      : { status: 'stopped', state };
  }
  if (action === 'stop') return initial ? stop(initial, recordFile, codexHome) : { status: 'stopped', message: '没有本启动器管理的运行实例。' };

  const projectInfo = await resolveLaunchProject({ projectDir: options.projectDir, env, cwd: process.cwd(), stateDir: state,
    actualProject: isCurrentRecord(initial) ? initial.actualProject : undefined, home });
  const { explicit, ...projectContext } = projectInfo;
  const project = projectInfo.effective;
  process.stderr.write(`SkillDock：请求项目目录 ${projectInfo.requested}（${projectInfo.source}）\nSkillDock：最终扫描目录 ${project}\n`);
  for (const warning of projectInfo.warnings) process.stderr.write(`SkillDock：提示：${warning}\n`);
  if (projectInfo.source === 'saved' && await canonicalPath(process.cwd()) !== project) process.stderr.write('SkillDock：使用界面保存的项目，和本次调用目录不同；可用 --project 明确覆盖。\n');
  process.stderr.write('SkillDock：服务会在后台运行；中断本次调用不一定会停止服务。请用 status 核实，用 stop 停止已确认的实例。\n');
  await fs.mkdir(state, { recursive: true, mode: 0o700 });
  let releaseLock;
  try { releaseLock = acquireFileLock(path.join(state, 'launcher.lock')); }
  catch (error) { if (error.code === 'BUSY') throw new Error('另一个启动操作正在运行，请稍后重试。'); throw error; }
  let job; let rollback; let stopped = false; let migrated = false;
  const report = async (status, extra = {}) => { if (job) await writeRestart(state, { ...job, status, ...extra, updatedAt: new Date().toISOString() }); };
  // 36b §7.4: after a successful start that was not a job, a job left in progress is
  // closed, ready when the instance now runs its source.
  const closeLeftoverJob = async (pid, runningAppPath) => {
    const leftover = await readRestart(state).catch(() => null);
    if (!leftover || !['preparing', 'restarting'].includes(leftover.status)) return;
    const ready = leftover.source === runningAppPath; const completedAt = new Date().toISOString();
    await writeRestart(state, ready ? { ...leftover, status: 'ready', pid, completedAt } : { ...leftover, status: 'failed', message: '重启任务未完成。', completedAt });
  };
  try {
    await options.onLocked?.();
    const generation = await readGeneration(state);
    if (generation > CURRENT_GENERATION) throw newerDataError(generation);
    const migrating = generation < CURRENT_GENERATION;
    // Generation 1: the gate and the fast reject, before anything 0.10.x reads is written.
    if (migrating) { const blocked = await migrationCheck({ state, context: plan, restartJob: jobId }); if (blocked) throw blocked; }
    // DEC-SDX-024 level 2: a Claude session's own directories are saved (a file 0.10.2 never reads).
    if (plan.claudeRoot.origin === 'session' && !plan.claudeRoot.saved) await writeClaudeRoot(state, plan.claudeRoot);
    // Generation 2 without a record (a 0.10.x launcher removed it): write it back first.
    if (!migrating && await readText(recordFile) === undefined) await withStateLocks(state, codexHome, () => restoreRecord(state, { verify: verifyInstance }), { wait: 10000 }).catch(() => {});
    const current = await readRecord(state); await checkOwner(current);
    if (jobId) {
      const requested = await readRestart(state);
      if (!requested || requested.id !== jobId || requested.source !== appDir || current?.pid !== requested.previousPid)
        throw new Error('重启请求与当前实例不匹配，未接管服务。');
      // Accepted: mark the executor; the 0.10.x digest is not compared (36b §7.4).
      job = { ...requested, executor: { pid: process.pid, startedAt: new Date().toISOString() } };
      await writeRestart(state, job);
    }
    const snapshot = await captureSource(appDir); const digest = snapshot.sourceDigest;
    const health = current && await probe(current.url);
    const live = current && matches(health, current);
    const running = isCurrentRecord(current) ? current.running : null;
    // DEC-SDX-008: an equal version keeps the live instance even when another copy differs.
    const sameSource = live && running && running.appPath === appDir && current.digest === digest;
    const sameVersion = live && running?.version === plan.own.version && !job;
    const projectKept = health?.project === project || !explicit;
    if (!migrating && live && action !== 'restart' && current.url === url && projectKept && (sameSource || sameVersion)) {
      try {
        await verifyRuntime(current.runtime, current.digest);
        // The record follows the live instance: preferred target, legacy fields and the
        // running form (36b 6.3), written only if nobody changed it meanwhile.
        let refreshed = await refreshRecord(current, { codexHome, installs: plan.installs, preferred: preferredWhenRunning(plan, running.appPath) });
        if (refreshed.status !== 'running') refreshed = { ...refreshed, status: 'running', updatedAt: new Date().toISOString() };
        if (refreshed !== current) await withStateLocks(state, codexHome, async () => {
          if (JSON.stringify(await readRecord(state)) === JSON.stringify(current)) await writeRecord(state, refreshed);
        }, { wait: 10000 }).catch(() => {});
        if (job) await report('ready', { pid: current.pid, completedAt: new Date().toISOString() });
        else await closeLeftoverJob(current.pid, running.appPath);
        await clearMigrationFailure(state);
        return { status: 'running', url, pid: current.pid, project: health.project, requestedProject: projectInfo.requested, projectContext: health.projectContext || projectContext, state, reused: true, cli: current.cli, backgroundService: true };
      } catch { /* A damaged generated runtime is rebuilt. */ }
    }
    // 36b 6.3: a project from levels ③–⑤ never changes a running instance's project, also
    // when the instance is replaced by another version.
    const keptProject = live && !explicit && health?.project ? await validProject(health.project, state) : null;
    const runProject = keptProject || project;
    const runContext = keptProject ? (health.projectContext?.effective === keptProject ? health.projectContext
      : { requested: keptProject, effective: keptProject, source: 'record', workingDirectory: process.cwd(), warnings: [] }) : projectContext;
    if (keptProject && keptProject !== project) process.stderr.write(`SkillDock：沿用运行实例的项目 ${keptProject}。\n`);
    // Compilation and dependency failures leave a healthy old process running.
    if (!live) {
      if (current) await stop(current, recordFile, codexHome);
      const { createServer } = await import('node:net');
      await new Promise((resolve, reject) => {
        const tester = createServer(); tester.once('error', () => reject(new Error(`端口 ${port} 已占用；请设置其他 PORT。未停止现有服务。`)));
        tester.listen(port, '127.0.0.1', () => tester.close(resolve));
      });
    }
    if (live) {
      // A failed 0.11 start restores the previous runtime; after a migration the 0.10.x
      // runtime is only restored if the migration itself fails (HLD 3.7 step 6).
      try {
        await verifyRuntime(current.runtime, current.digest);
        rollback = isCurrentRecord(current) ? { ...current, actualProject: health.project }
          : { ...current, project: health.launchProject || health.project, projectContext: health.projectContext || current.projectContext };
      } catch { /* Never restore unverified files. */ }
    }
    const cli = await resolveCodexCli({ codexHome, explicit: options.codexBin || env.SKILLDOCK_CODEX_BIN });
    for (const attempt of cli.attempts) process.stderr.write(`SkillDock：跳过 CLI ${attempt.path}：${attempt.error}\n`);
    process.stderr.write(cli.available ? `SkillDock：Codex CLI ${cli.path}（${cli.version}）\n` : `SkillDock：${cli.error}\n`);
    const expected = JSON.stringify(live ? current : await readRecord(state));
    await report('preparing');
    const runtime = await prepareRuntime(state, snapshot, { log: path.join(state, 'build.log') });
    const legacyProject = await ensureLegacyProject(state);
    const legacy = await legacyFields({ codexHome, installs: plan.installs, running: plan.ownReference });
    const record = buildRecord({ state, url, pid: 0, digest, runtime, codexHome, cli, legacyProject, legacy,
      running: plan.ownReference, preferred: preferredWhenRunning(plan, appDir), actualProject: runProject });
    // Inside the locks: a failed switch restores the previous instance (never a 0.10.x
    // runtime once generation 2 is written) and the error says what happened.
    const recover = async error => {
      if (!stopped || !rollback) return error;
      try {
        await startRuntime(rollback, recordFile, { env, projectContext: null });
        // 36b §7.4: a migration that failed after the gate is not retried by restart jobs.
        if (!isCurrentRecord(rollback)) await writeMigrationFailure(state, { appDir, version: plan.own.version, message: error.message }).catch(() => {});
        return Object.assign(error, { restored: true, note: '；已恢复上一运行版本。' });
      } catch (failure) { return Object.assign(error, { note: `；恢复上一运行版本失败：${failure.message}` }); }
    };
    // HLD 3.7: the instance and Codex locks are taken before the old instance stops and held
    // until the new one is recorded or the old one is back; busy locks fail before stopping.
    const next = await withStateLocks(state, codexHome, async () => {
      if (JSON.stringify(await readRecord(state)) !== expected) throw new Error('运行实例已变化，已取消本次重启。');
      if (live) { await report('restarting'); await stop(current, recordFile, codexHome, { locked: true }); stopped = true; }
      try {
        if (migrating) {
          // The stopped form keeps the last known pid: the old instance's, or this launcher's.
          await migrate({ state, codexHome, home, plan, record: stoppedRecord({ ...record, pid: current?.pid ?? process.pid }), runtime, digest, project: runProject, cli, env });
          migrated = true; rollback = undefined;
          process.stderr.write('SkillDock：已迁移数据目录到 0.11 格式。\n');
        }
        return await startRuntime(record, recordFile, { env, projectContext: runContext });
      } catch (error) { throw await recover(error); }
    }, { wait: options.lockWait ?? 60000 });
    if (job) await report('ready', { pid: next.pid, completedAt: new Date().toISOString() }).catch(() => {});
    else await closeLeftoverJob(next.pid, next.running.appPath).catch(() => {});
    await clearMigrationFailure(state);
    return { status: 'running', url, pid: next.pid, project: runProject, requestedProject: projectInfo.requested, projectContext: runContext, cli, state, reused: false, backgroundService: true, ...(migrated ? { migrated: true } : {}) };
  } catch (error) {
    const busy = error.code === 'BUSY' && !stopped;
    const message = busy ? '另一项 SkillDock 操作（例如后台更新）正在进行，未停止现有服务；请稍后重试。'
      : error.note ? error.message + error.note : migrated ? `数据已迁移到 0.11 格式，但新版未能启动：${error.message}` : error.message;
    await report('failed', { message, ...(error.restored ? { restored: true } : {}), completedAt: new Date().toISOString() }).catch(() => {});
    if (message === error.message) throw error;
    throw Object.assign(new Error(message, { cause: error }), { code: error.code, ...(error.exitCode ? { exitCode: error.exitCode } : {}) });
  } finally { releaseLock(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  Promise.resolve().then(() => { const { action, options } = parseLaunchArguments(args); return launch(action, options); })
    .then(result => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
    .catch(async error => {
      if (error.code === 'SKILLDOCK_DELEGATE') {
        process.stderr.write(`SkillDock：${error.message}\n`);
        process.exitCode = await delegate(error.target, args);
        return;
      }
      process.stderr.write(failureText(error));
      process.exitCode = error.exitCode ?? 1;
    });
}
