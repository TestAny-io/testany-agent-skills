#!/usr/bin/env node
import { promises as fs, openSync, closeSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { captureSource } from '../assets/app/scripts/source-bundle.mjs';
import { canonicalPath, readRestart, writeRestart } from '../assets/app/server/installation.mjs';
import { prepareRuntime, verifyRuntime } from '../assets/app/server/runtime.mjs';
import { resolveLaunchProject, parseLaunchArguments } from '../assets/app/server/project-context.mjs';
import { resolveCodexCli } from '../assets/app/server/codex-runtime.mjs';
import { acquireFileLock } from '../assets/app/server/process-lock.mjs';
import { readGeneration, CURRENT_GENERATION } from '../assets/app/server/generation.mjs';
import { readRecord, writeRecord, buildRecord, stoppedRecord, refreshRecord, legacyFields, ensureLegacyProject, isCurrentRecord } from '../assets/app/server/launcher-record.mjs';
import { installationContext, delegationTarget, delegate, newerDataError, legacyOwnership, EXIT_MIGRATION_BLOCKED } from '../assets/app/server/launch-plan.mjs';
import { migrateIfNeeded } from '../assets/app/server/migration.mjs';

const defaultApp = fileURLToPath(new URL('../assets/app/', import.meta.url));
const ACTIONS = ['start', 'status', 'stop', 'restart'];

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

async function settle(record, recordFile) {
  // A stopped 0.11 instance keeps its record (36a §5.3); 0.10.x records are removed as before.
  if (isCurrentRecord(record)) await writeRecord(path.dirname(recordFile), stoppedRecord(record));
  else await fs.rm(recordFile, { force: true });
}

async function stop(record, recordFile) {
  if (isCurrentRecord(record) && record.status === 'stopped') return { status: 'stopped', message: '此实例已停止。' };
  const health = await probe(record.url);
  if (!matches(health, record)) {
    let alive = false;
    try { process.kill(record.pid, 0); alive = true; } catch {}
    if (alive) throw new Error('无法核实记录中的进程属于此 SkillDock 实例；未停止任何进程。');
    await settle(record, recordFile);
    return { status: 'stopped', message: '此实例已停止。' };
  }
  process.kill(record.pid, 'SIGTERM');
  for (let i = 0; i < 100; i++) {
    await new Promise(resolve => setTimeout(resolve, 100));
    let running = true;
    try { process.kill(record.pid, 0); } catch (error) { if (error.code === 'ESRCH') running = false; else throw error; }
    if (!running) {
      await settle(record, recordFile);
      return { status: 'stopped', message: 'SkillDock 网页服务已停止。已启用的独立自动更新不受影响，可在更新页关闭计划。' };
    }
  }
  throw new Error('服务尚未停止；保留启动记录，请稍后检查状态。');
}

async function startRuntime(record, recordFile, { env, projectContext }) {
  const fd = openSync(path.join(record.state, 'server.log'), 'a', 0o600);
  const childEnv = { ...env, PORT: String(new URL(record.url).port), CODEX_HOME: record.codexHome,
    SKILLDOCK_STATE_DIR: record.state, SKILLDOCK_PROJECT_DIR: record.actualProject,
    SKILLDOCK_SOURCE_DIGEST: record.digest, SKILLDOCK_APP_SOURCE: record.running.appPath, SKILLDOCK_PROJECT_CONTEXT: JSON.stringify(projectContext || null),
    ...(record.cli?.available ? { SKILLDOCK_CODEX_BIN: record.cli.path } : {}) };
  for (const name of ['SKILLDOCK_RESTART_JOB', 'SKILLDOCK_HANDOVER', 'SKILLDOCK_HANDOVER_AGENT', 'SKILLDOCK_HANDOVER_FROM', 'SKILLDOCK_DELEGATED']) delete childEnv[name];
  const child = spawn(process.execPath, [path.join(record.runtime, 'server/index.mjs')], {
    cwd: record.actualProject, detached: true, shell: false, env: childEnv, stdio: ['ignore', fd, fd],
  });
  closeSync(fd);
  const next = { ...record, pid: child.pid, status: 'running', updatedAt: new Date().toISOString(),
    execution: { node: process.execPath, nodeVersion: process.versions.node, source: env.SKILLDOCK_NODE_SOURCE || 'direct' } };
  let registered = false; let spawnError;
  child.once('error', error => { spawnError = error; });
  try {
    for (let i = 0; i < 80; i++) {
      if (spawnError) throw spawnError;
      if (matches(await probe(record.url), next)) {
        await fs.writeFile(`${recordFile}.tmp`, JSON.stringify(next, null, 2), { mode: 0o600 });
        await fs.rename(`${recordFile}.tmp`, recordFile);
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

export async function launch(action = 'start', options = {}) {
  if (!ACTIONS.includes(action)) throw new Error('用法：node launch.mjs [start|status|stop|restart]');
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 12)) throw new Error('SkillDock 需要 Node.js 22.12 或更新版本。');
  const env = options.env ?? process.env; const home = options.home ?? os.homedir();
  const appDir = await canonicalPath(path.resolve(options.appDir ?? defaultApp));
  const state = await canonicalPath(path.resolve(options.stateDir ?? env.SKILLDOCK_STATE_DIR ?? path.join(home, '.local/share/skilldock')));
  const codexHome = await canonicalPath(path.resolve(options.codexHome ?? env.CODEX_HOME ?? path.join(home, '.codex')));
  const port = Number(options.port ?? env.PORT ?? 4771);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('PORT 必须为 1024–65535。');
  const url = `http://127.0.0.1:${port}`;
  const recordFile = path.join(state, 'launcher.json');
  const generation = await readGeneration(state);
  if (generation > CURRENT_GENERATION) throw newerDataError(generation);
  const initial = await readRecord(state);
  const plan = await installationContext({ env, home, state, appDir, record: initial, codexHome });
  const target = delegationTarget(plan, { action, env, restartJob: options.restartJob });
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
    if (legacy === 'claude-legacy') throw Object.assign(new Error('Claude 中装有低于 0.10.3 的 SkillDock，正在使用这个数据目录。请先在 Claude 中把 SkillDock 更新到最新版本，再重新打开。'), { code: 'MIGRATION_BLOCKED', exitCode: EXIT_MIGRATION_BLOCKED });
    throw new Error('此数据目录属于另一个源码实例；旧 testany-eng 用户可使用 --migrate-from testany-eng 接续数据，其他来源请使用独立 SKILLDOCK_STATE_DIR。');
  }
  await checkOwner(initial);
  if (action === 'status') {
    const health = initial && await probe(initial.url);
    return initial && matches(health, initial)
      ? { status: 'running', url: initial.url, pid: initial.pid, project: health.project, projectContext: health.projectContext,
          state, execution: initial.execution, cli: initial.cli, backgroundService: true, appVersion: health.appVersion }
      : { status: 'stopped', state };
  }
  if (action === 'stop') return initial ? stop(initial, recordFile) : { status: 'stopped', message: '没有本启动器管理的运行实例。' };

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
  let job; let rollback; let stopped = false;
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
    let current = await readRecord(state); await checkOwner(current);
    const jobId = options.restartJob ?? env.SKILLDOCK_RESTART_JOB;
    if (jobId) {
      const requested = await readRestart(state);
      if (!requested || requested.id !== jobId || requested.source !== appDir || current?.pid !== requested.previousPid)
        throw new Error('重启请求与当前实例不匹配，未接管服务。');
      // Accepted: mark the executor; the 0.10.x digest is not compared (36b §7.4).
      job = { ...requested, executor: { pid: process.pid, startedAt: new Date().toISOString() } };
      await writeRestart(state, job);
    }
    if (generation < CURRENT_GENERATION) {
      await migrateIfNeeded({ state, env, home, codexHome, plan, appDir });
      current = await readRecord(state); await checkOwner(current);
    }
    const snapshot = await captureSource(appDir); const digest = snapshot.sourceDigest;
    const health = current && await probe(current.url);
    const live = current && matches(health, current);
    const running = isCurrentRecord(current) ? current.running : null;
    // DEC-SDX-008: an equal version keeps the live instance even when another copy differs.
    const sameSource = live && (running ? running.appPath === appDir && current.digest === digest : current.digest === digest && current.source === appDir);
    const sameVersion = live && running?.version === plan.own.version && !job;
    const projectKept = health?.project === project || !explicit;
    if (live && action !== 'restart' && current.url === url && projectKept && (sameSource || sameVersion)) {
      try {
        await verifyRuntime(current.runtime, current.digest);
        if (isCurrentRecord(current)) {
          const refreshed = await refreshRecord(current, { codexHome, installs: plan.installs, preferred: plan.preferred });
          if (refreshed !== current) await writeRecord(state, refreshed);
        }
        if (job) await report('ready', { pid: current.pid, completedAt: new Date().toISOString() });
        else await closeLeftoverJob(current.pid, running?.appPath ?? current.source);
        return { status: 'running', url, pid: current.pid, project: health.project, requestedProject: projectInfo.requested, projectContext: health.projectContext || projectContext, state, reused: true, cli: current.cli, backgroundService: true };
      } catch { /* A damaged generated runtime is rebuilt. */ }
    }
    // Compilation and dependency failures leave a healthy old process running.
    if (!live) {
      if (current) await stop(current, recordFile);
      const { createServer } = await import('node:net');
      await new Promise((resolve, reject) => {
        const tester = createServer(); tester.once('error', () => reject(new Error(`端口 ${port} 已占用；请设置其他 PORT。未停止现有服务。`)));
        tester.listen(port, '127.0.0.1', () => tester.close(resolve));
      });
    }
    if (live && isCurrentRecord(current)) {
      try { await verifyRuntime(current.runtime, current.digest); rollback = { ...current, actualProject: health.project }; } catch { /* Never restore unverified files. */ }
    }
    const cli = await resolveCodexCli({ codexHome, explicit: options.codexBin || env.SKILLDOCK_CODEX_BIN });
    for (const attempt of cli.attempts) process.stderr.write(`SkillDock：跳过 CLI ${attempt.path}：${attempt.error}\n`);
    process.stderr.write(cli.available ? `SkillDock：Codex CLI ${cli.path}（${cli.version}）\n` : `SkillDock：${cli.error}\n`);
    const expected = JSON.stringify(live ? current : await readRecord(state));
    await report('preparing');
    const runtime = await prepareRuntime(state, snapshot);
    if (JSON.stringify(await readRecord(state)) !== expected) throw new Error('运行实例已变化，已取消本次重启。');
    if (live) { await report('restarting'); await stop(current, recordFile); stopped = true; }
    const legacyProject = await ensureLegacyProject(state);
    const legacy = await legacyFields({ codexHome, installs: plan.installs, running: plan.ownReference });
    const record = buildRecord({ state, url, pid: 0, digest, runtime, codexHome, cli, legacyProject, legacy,
      running: plan.ownReference, preferred: plan.preferred, actualProject: project });
    const next = await startRuntime(record, recordFile, { env, projectContext });
    if (job) await report('ready', { pid: next.pid, completedAt: new Date().toISOString() }).catch(() => {});
    else await closeLeftoverJob(next.pid, next.running.appPath).catch(() => {});
    return { status: 'running', url, pid: next.pid, project, requestedProject: projectInfo.requested, projectContext, cli, state, reused: false, backgroundService: true };
  } catch (error) {
    let restored = false; let message = error.message;
    if (stopped && rollback) {
      try { await startRuntime(rollback, recordFile, { env, projectContext: null }); restored = true; message += '；已恢复上一运行版本。'; }
      catch (failure) { message += `；恢复上一运行版本失败：${failure.message}`; }
    }
    await report('failed', { message, restored, completedAt: new Date().toISOString() }).catch(() => {});
    if (message === error.message) throw error;
    throw Object.assign(new Error(message, { cause: error }), { code: error.code });
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
      if (error.output) process.stdout.write(`${JSON.stringify(error.output, null, 2)}\n`);
      process.stderr.write(`SkillDock：${error.message}\n`);
      process.exitCode = error.exitCode ?? 1;
    });
}
