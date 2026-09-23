#!/usr/bin/env node
import { promises as fs, openSync, closeSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { captureSource } from '../assets/app/scripts/source-bundle.mjs';
import { canonicalPath, installationIdentity, sameInstallation, readRestart, writeRestart } from '../assets/app/server/installation.mjs';
import { prepareRuntime, verifyRuntime } from '../assets/app/server/runtime.mjs';
import { resolveProject, parseLaunchArguments } from '../assets/app/server/project-context.mjs';
import { resolveCodexCli } from '../assets/app/server/codex-runtime.mjs';

const defaultApp = fileURLToPath(new URL('../assets/app/', import.meta.url));

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

async function readRecord(file) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw new Error(`启动记录不可读：${error.message}`); }
}

function matches(health, record) {
  return health?.app === 'skilldock' && health.pid === record.pid
    && health.state === record.state && (health.launchProject || health.project) === record.project
    && (!health.sourceDigest || health.sourceDigest === record.digest);
}

async function stop(record, recordFile) {
  const health = await probe(record.url);
  if (!matches(health, record)) {
    let alive = false;
    try { process.kill(record.pid, 0); alive = true; } catch {}
    if (alive) throw new Error('无法核实记录中的进程属于此 SkillDock 实例；未停止任何进程。');
    await fs.rm(recordFile, { force: true });
    return { status: 'stopped', message: '此实例已停止。' };
  }
  process.kill(record.pid, 'SIGTERM');
  for (let i = 0; i < 100; i++) {
    await new Promise(resolve => setTimeout(resolve, 100));
    let running = true;
    try { process.kill(record.pid, 0); } catch (error) { if (error.code === 'ESRCH') running = false; else throw error; }
    if (!running) {
      await fs.rm(recordFile, { force: true });
      return { status: 'stopped', message: 'SkillDock 网页服务已停止。已启用的独立自动更新不受影响，可在更新页关闭计划。' };
    }
  }
  throw new Error('服务尚未停止；保留启动记录，请稍后检查状态。');
}

async function startRuntime(record, recordFile) {
  const fd = openSync(path.join(record.state, 'server.log'), 'a', 0o600);
  const env = { ...process.env, PORT: String(new URL(record.url).port), CODEX_HOME: record.codexHome,
    SKILLDOCK_STATE_DIR: record.state, SKILLDOCK_PROJECT_DIR: record.project,
    SKILLDOCK_SOURCE_DIGEST: record.digest, SKILLDOCK_APP_SOURCE: record.source, SKILLDOCK_PROJECT_CONTEXT: JSON.stringify(record.projectContext || null),
    ...(record.cli?.available ? { SKILLDOCK_CODEX_BIN: record.cli.path } : {}) };
  delete env.SKILLDOCK_RESTART_JOB;
  const child = spawn(process.execPath, [path.join(record.runtime, 'server/index.mjs')], {
    cwd: record.project, detached: true, shell: false, env, stdio: ['ignore', fd, fd],
  });
  closeSync(fd);
  const next = { ...record, pid: child.pid,
    execution: { node: process.execPath, nodeVersion: process.versions.node, source: process.env.SKILLDOCK_NODE_SOURCE || 'direct' } };
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
  if (!['start', 'status', 'stop', 'restart'].includes(action)) throw new Error('用法：node launch.mjs [start|status|stop|restart]');
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 12)) throw new Error('SkillDock 需要 Node.js 22.12 或更新版本。');
  const appDir = await canonicalPath(path.resolve(options.appDir ?? defaultApp));
  const state = await canonicalPath(path.resolve(options.stateDir ?? process.env.SKILLDOCK_STATE_DIR ?? path.join(os.homedir(), '.local/share/skilldock')));
  const projectInfo = ['start', 'restart'].includes(action) ? await resolveProject({ projectDir: options.projectDir, stateDir: state }) : null;
  const project = projectInfo?.effective;
  const codexHome = await canonicalPath(path.resolve(options.codexHome ?? process.env.CODEX_HOME ?? path.join(os.homedir(), '.codex')));
  const port = Number(options.port ?? process.env.PORT ?? 4771);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('PORT 必须为 1024–65535。');
  const url = `http://127.0.0.1:${port}`;
  const recordFile = path.join(state, 'launcher.json');
  const identity = await installationIdentity(appDir, codexHome);
  async function checkOwner(record) {
    if (!record) return;
    if (record.state !== state) throw new Error('此数据目录属于另一个源码实例；请使用独立 SKILLDOCK_STATE_DIR。');
    if (record.source === appDir) return;
    const previous = await installationIdentity(record.source, codexHome, { expected: record.installation });
    const migration = options.migrateFrom === 'testany-eng' && previous.kind === 'plugin' && identity.kind === 'plugin'
      && previous.plugin === 'testany-eng' && identity.plugin === 'skilldock' && previous.codexHome === identity.codexHome
      && previous.marketplace === 'testany-agent-skills' && identity.marketplace === previous.marketplace && previous.appPath === identity.appPath;
    if (migration) return;
    if (identity.kind !== 'plugin' || !sameInstallation(identity, previous))
      throw new Error('此数据目录属于另一个源码实例；旧 testany-eng 用户可使用 --migrate-from testany-eng 接续数据，其他来源请使用独立 SKILLDOCK_STATE_DIR。');
  }
  const record = await readRecord(recordFile); await checkOwner(record);
  if (action === 'status') {
    const health = record && await probe(record.url);
    return record && matches(health, record)
      ? { status: 'running', url: record.url, pid: record.pid, project: health.project, projectContext: health.projectContext,
          state, execution: record.execution, cli: record.cli, backgroundService: true }
      : { status: 'stopped', state };
  }
  if (action === 'stop') return record ? stop(record, recordFile) : { status: 'stopped', message: '没有本启动器管理的运行实例。' };
  process.stderr.write(`SkillDock：请求项目目录 ${projectInfo.requested}（${projectInfo.source}）\nSkillDock：最终扫描目录 ${project}\n`);
  for (const warning of projectInfo.warnings) process.stderr.write(`SkillDock：提示：${warning}\n`);
  if (projectInfo.source === 'saved' && await canonicalPath(process.cwd()) !== project) process.stderr.write('SkillDock：使用界面保存的项目，和本次调用目录不同；可用 --project 明确覆盖。\n');
  process.stderr.write('SkillDock：服务会在后台运行；中断本次调用不一定会停止服务。请用 status 核实，用 stop 停止已确认的实例。\n');
  await fs.mkdir(state, { recursive: true, mode: 0o700 });
  const lock = path.join(state, 'launcher.lock'); let lockHandle;
  try { lockHandle = await fs.open(lock, 'wx', 0o600); }
  catch (error) { if (error.code === 'EEXIST') throw new Error('另一个启动操作正在运行。若此前启动被强制中断，请核实后移除 launcher.lock 再重试。'); throw error; }
  let job; let rollback; let stopped = false;
  const report = async (status, extra = {}) => { if (job) await writeRestart(state, { ...job, status, ...extra, updatedAt: new Date().toISOString() }); };
  try {
    const current = await readRecord(recordFile); await checkOwner(current);
    const jobId = options.restartJob ?? process.env.SKILLDOCK_RESTART_JOB;
    if (jobId) {
      const requested = await readRestart(state);
      if (!requested || requested.id !== jobId || requested.source !== appDir || current?.pid !== requested.previousPid)
        throw new Error('重启请求与当前实例不匹配，未接管服务。');
      job = requested;
    }
    const snapshot = await captureSource(appDir); const digest = snapshot.sourceDigest;
    if (job && digest !== job.sourceDigest) throw new Error('重启前源码发生变化，请重新检查更新。');
    const health = current && await probe(current.url);
    const live = current && matches(health, current);
    if (live && action !== 'restart' && current.digest === digest && health.project === project && current.url === url && current.source === appDir) {
      try {
        await verifyRuntime(current.runtime, digest);
        return { status: 'running', url, pid: current.pid, project, requestedProject: projectInfo.requested, projectContext: health.projectContext || projectInfo, state, reused: true, cli: current.cli, backgroundService: true };
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
    if (live) {
      try { await verifyRuntime(current.runtime, current.digest); rollback = { ...current, project: health.project, projectContext: health.projectContext || current.projectContext }; } catch { /* Never restore unverified files. */ }
    }
    const cli = await resolveCodexCli({ codexHome, explicit: options.codexBin || process.env.SKILLDOCK_CODEX_BIN });
    for (const attempt of cli.attempts) process.stderr.write(`SkillDock：跳过 CLI ${attempt.path}：${attempt.error}\n`);
    process.stderr.write(cli.available ? `SkillDock：Codex CLI ${cli.path}（${cli.version}）\n` : `SkillDock：${cli.error}\n`);
    await report('preparing');
    const runtime = await prepareRuntime(state, snapshot);
    if (JSON.stringify(await readRecord(recordFile)) !== JSON.stringify(live ? current : null))
      throw new Error('运行实例已变化，已取消本次重启。');
    if (live) { await report('restarting'); await stop(current, recordFile); stopped = true; }
    const next = await startRuntime({ url, project, projectContext: projectInfo, cli, state, source: appDir, runtime, digest, codexHome, installation: identity }, recordFile);
    await report('ready', { pid: next.pid, completedAt: new Date().toISOString() }).catch(() => {});
    if (!job) await fs.rm(path.join(state, 'restart.json'), { force: true });
    return { status: 'running', url, pid: next.pid, project, requestedProject: projectInfo.requested, projectContext: projectInfo, cli, state, reused: false, backgroundService: true };
  } catch (error) {
    let restored = false; let message = error.message;
    if (stopped && rollback) {
      try { await startRuntime({ ...rollback, codexHome }, recordFile); restored = true; message += '；已恢复上一运行版本。'; }
      catch (failure) { message += `；恢复上一运行版本失败：${failure.message}`; }
    }
    await report('failed', { message, restored, completedAt: new Date().toISOString() }).catch(() => {});
    if (message === error.message) throw error;
    throw Object.assign(new Error(message, { cause: error }), { code: error.code });
  } finally { await lockHandle.close(); await fs.rm(lock, { force: true }); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  Promise.resolve().then(() => { const { action, options } = parseLaunchArguments(process.argv.slice(2)); return launch(action, options); }).then(result => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)).catch(error => {
    process.stderr.write(`SkillDock：${error.message}\n`);
    process.exitCode = 1;
  });
}
