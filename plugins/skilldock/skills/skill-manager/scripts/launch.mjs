#!/usr/bin/env node
import { promises as fs, openSync, closeSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { spawn, execFile } from 'node:child_process';
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
import { installationContext, delegationTarget, delegate, newerDataError, legacyOwnershipDetail, migrationCheck, preferredWhenRunning, failureText, EXIT_MIGRATION_BLOCKED } from '../assets/app/server/launch-plan.mjs';
import { convertPlan, snapshotFiles, writeMigrationFailure, clearMigrationFailure } from '../assets/app/server/migration.mjs';
import { backgroundPaths, registrationExists, takeOverRegistration } from '../assets/app/server/background-registration.mjs';
import { writeClaudeRoot, startedFromClaude, recordClaudeSessionRoot } from '../assets/app/server/claude-root.mjs';
import { recordSessionCli, resolveClaudeCli } from '../assets/app/server/claude-cli.mjs';
import { childEnvironment } from '../assets/app/server/process-env.mjs';
import { defaultUpdateState } from '../assets/app/server/update-state.mjs';
import { writeSavedNode } from '../assets/app/server/node-candidates.mjs';

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

/**
 * Whether nothing listens at the url. Only a refused connection says so: one that is accepted and then
 * answers late, badly or not at all is a listener, and a connection that cannot be tried says nothing.
 */
export function refused(url, { connect = net.connect, wait = 1500 } = {}) {
  return new Promise(resolve => {
    let target; try { target = new URL(url); } catch { return resolve(false); }
    if (!net.isIP(target.hostname) || !target.port) return resolve(false);
    const socket = connect({ host: target.hostname, port: Number(target.port) });
    const done = value => { socket.destroy(); resolve(value); };
    socket.setTimeout(wait, () => done(false));
    socket.once('connect', () => done(false));
    socket.once('error', error => done(error.code === 'ECONNREFUSED'));
  });
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

const processAlive = pid => { try { process.kill(pid, 0); return true; } catch (error) { if (error.code === 'ESRCH') return false; throw error; } };
// Signals a process; one that went meanwhile needs none.
const signal = (pid, name) => { try { process.kill(pid, name); } catch (error) { if (error.code !== 'ESRCH') throw error; } };
// Whether the process is gone within `tenths` tenths of a second.
async function gone(pid, tenths) {
  for (let i = 0; i < tenths; i++) { await new Promise(resolve => setTimeout(resolve, 100)); if (!processAlive(pid)) return true; }
  return false;
}
/** A process's command line from the process table, or null where there is none to ask (Windows, a sandbox). */
export function processCommand(pid) {
  return new Promise(resolve => {
    if (process.platform === 'win32') return resolve(null);
    // A sandbox may refuse to run it at all (it is set-user-ID on macOS): that is "cannot be asked", not a failure.
    // Asked in a UTF-8 locale: without one, ps writes the bytes of a non-ASCII path as escapes.
    try { execFile('/bin/ps', ['-ww', '-p', String(pid), '-o', 'args='], { timeout: 2000, env: { ...process.env, LC_ALL: 'en_US.UTF-8' } }, (error, stdout) => resolve(error ? null : String(stdout).trim() || null)); }
    catch { resolve(null); }
  });
}
// A 0.11 record's process is this state's service when its command line is the one the launcher started
// for that record (startRuntime): the record's Node running the record's runtime, and nothing else.
// Asked only where health cannot tell.
async function recordedService(record, commandOf) {
  if (!isCurrentRecord(record)) return false;
  const node = record.execution?.node;
  if (![node, record.runtime].every(value => typeof value === 'string' && path.isAbsolute(value))) return false;
  const command = await commandOf(record.pid).catch(() => null);
  return command === `${node} ${path.join(record.runtime, 'server/index.mjs')}`;
}

// `wait`: tenths of a second a service told to stop is given. `commandOf`: see processCommand.
async function stop(record, recordFile, codexHome, { locked = false, wait = 100, commandOf = processCommand } = {}) {
  const health = await probe(record.url);
  if (!matches(health, record)) {
    // A stopped 0.11 record names an instance that is gone; its pid may have been reused.
    if (isCurrentRecord(record) && record.status === 'stopped') return { status: 'stopped', message: '此实例已停止。' };
    let alive = false;
    try { process.kill(record.pid, 0); alive = true; } catch {}
    // A service told to stop closes its listener last, and one of 0.11.2 or before then stays for as long
    // as a client keeps a connection in use: alive, answering nobody new, and in the way of every start
    // (real machine, 2026-10-13). Nothing listens at its address and the process is the record's runtime
    // serving: it is that service, past its writes, and is ended here. A listener that is slow, or is
    // something else, is not this case.
    if (alive && await refused(record.url) && await recordedService(record, commandOf)) {
      signal(record.pid, 'SIGTERM');
      if (!await gone(record.pid, 30)) { signal(record.pid, 'SIGKILL'); await gone(record.pid, 30); }
      alive = processAlive(record.pid);
    }
    if (alive) throw new Error('无法核实记录中的进程属于此 SkillDock 实例；未停止任何进程。若刚更新过 SkillDock，可能是上一版本的服务没有退出：关闭所有打开着的 SkillDock 页面（包括 Codex 里的）等几秒再试，或在确认后手动结束该进程。');
    await settle(record, recordFile, codexHome, { locked });
    return { status: 'stopped', message: '此实例已停止。' };
  }
  signal(record.pid, 'SIGTERM');
  if (!await gone(record.pid, wait)) {
    // Verified a moment ago, told to stop, still there. While it listens it is finishing a write, however
    // slowly it answers, and is left to it, as before. A 0.11 service closes its listener after its
    // writes: once nothing listens at its address, what keeps it is a connection a client goes on using
    // (0.11.2 and before set no limit to that), and it is ended here. A 0.10.x service is not presumed to
    // close in that order.
    if (!isCurrentRecord(record) || !await refused(record.url)) throw new Error('服务尚未停止；保留启动记录，请稍后检查状态。');
    signal(record.pid, 'SIGKILL');
    if (!await gone(record.pid, 30)) throw new Error('服务尚未停止；保留启动记录，请稍后检查状态。');
  }
  await settle(record, recordFile, codexHome, { locked });
  return { status: 'stopped', message: 'SkillDock 网页服务已停止。已启用的独立自动更新不受影响，可在更新页关闭计划。' };
}

// Starts the runtime a record names. A 0.10.x record is only started to restore the old
// instance after a failed migration, with 0.10.2's environment and record shape.
async function startRuntime(record, recordFile, { env, projectContext }) {
  const current = isCurrentRecord(record);
  const project = current ? record.actualProject : record.project;
  const fd = openSync(path.join(record.state, 'server.log'), 'a', 0o600);
  // DEC-SDX-024: the service inherits only allowed variables (never Claude or Codex session
  // variables) plus its own settings; it uses the saved Claude root and command lines.
  const childEnv = childEnvironment(env, { PORT: String(new URL(record.url).port), CODEX_HOME: record.codexHome,
    SKILLDOCK_STATE_DIR: record.state, SKILLDOCK_PROJECT_DIR: project,
    SKILLDOCK_SOURCE_DIGEST: record.digest, SKILLDOCK_APP_SOURCE: current ? record.running.appPath : record.source,
    SKILLDOCK_PROJECT_CONTEXT: JSON.stringify((current ? projectContext : record.projectContext) || null),
    ...(record.cli?.available ? { SKILLDOCK_CODEX_BIN: record.cli.path } : {}) });
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
    const detail = await legacyOwnershipDetail(record, plan, { migrateFrom: options.migrateFrom });
    const legacy = detail.owner;
    if (legacy === 'family' || legacy === 'testany-eng') return;
    if (legacy === 'claude-unverified') {
      const message = detail.reason === 'configuration'
        ? `这个数据目录的启动记录来自 ${detail.configDir} 下插件缓存中的 SkillDock，这里看不到它所属的配置目录（常见于 Claude 使用自定义配置目录），无法核实来源，未接管数据。`
        : '这个数据目录的启动记录来自 Claude 中的 SkillDock，但无法核实它的来源（该 marketplace 已不在 Claude 中，或这里看不到 Claude 的配置目录），未接管数据。';
      const steps = [];
      // Deleting the record while that service still runs would skip the first step of
      // the takeover (stop the old instance), so a running one is named first.
      if (typeof record.url === 'string' && matches(await probe(record.url), record)) {
        const oldLauncher = path.resolve(record.source, '../../scripts/launch.sh');
        steps.push(await fs.access(oldLauncher).then(() => true, () => false)
          ? `先停止仍在运行的旧服务（pid ${record.pid}，${record.url}）：运行 SKILLDOCK_STATE_DIR="${state}" /bin/sh "${oldLauncher}" stop。`
          : `先停止仍在运行的旧服务（pid ${record.pid}，${record.url}）：结束进程 ${record.pid}。`);
      }
      steps.push(`若那份 SkillDock 已不再使用，且它的服务已停止：删除 ${path.join(state, 'launcher.json')} 后重新打开。`);
      steps.push(detail.reason === 'configuration'
        ? `若 ${detail.configDir} 是 Claude 的配置目录：从 Claude 一侧打开 SkillDock，或设置 CLAUDE_CONFIG_DIR="${detail.configDir}" 后重新打开。`
        : '或在 Claude 中重新添加原来的 marketplace 后重新打开；Claude 使用自定义配置目录时，从 Claude 一侧打开 SkillDock。');
      steps.push('或用 SKILLDOCK_STATE_DIR 为这个 SkillDock 指定独立的数据目录。');
      throw Object.assign(new Error(message), { code: 'OWNER_UNVERIFIED', exitCode: 1, output: { status: 'owner-unverified', message, steps } });
    }
    if (legacy === 'claude-legacy') {
      const message = detail.unreadable
        ? `无法读取 ${detail.unreadable}，无法确认 Claude 中那份 SkillDock 的版本；它正在使用这个数据目录，0.11 暂不接管数据，旧版本照常工作。`
        : `Claude 中装有 SkillDock ${detail.version}（低于 0.10.3），正在使用这个数据目录；0.11 暂不接管数据，旧版本照常工作。`;
      const steps = [...detail.unreadable ? [`为当前用户开放 ${detail.unreadable} 的读取权限后重试。`] : [],
        '在 Claude 中把 SkillDock 更新到最新版本（或从 Claude 卸载 SkillDock），并重载插件。', '处理后重新打开 SkillDock，会重新检查。'];
      // Exit 4 belongs to the migration gate of start and restart (36b 6.3).
      const gate = ['start', 'restart'].includes(action);
      throw Object.assign(new Error(message), { code: 'MIGRATION_BLOCKED', exitCode: gate ? EXIT_MIGRATION_BLOCKED : 1,
        output: { status: 'migration-blocked', message, blockers: [], unreadable: detail.unreadable ? [{ path: detail.unreadable, error: 'UNREADABLE' }] : [], steps } });
    }
    throw new Error('此数据目录属于另一个源码实例；旧 testany-eng 用户可使用 --migrate-from testany-eng 接续数据，其他来源请使用独立 SKILLDOCK_STATE_DIR。');
  }
  await checkOwner(initial);
  // HLD 3.10: the Node the bootstrap selected is saved only now, in a data directory that
  // belongs to this installation (an unchanged saved selection is not written again).
  if (['start', 'restart'].includes(action) && env.SKILLDOCK_NODE_SOURCE && env.SKILLDOCK_NODE_SOURCE !== 'saved' && absolute(env.SKILLDOCK_SELECTED_NPM_CLI))
    await writeSavedNode(state, { node: process.execPath, nodeVersion: process.version, npmCli: env.SKILLDOCK_SELECTED_NPM_CLI,
      npmVersion: env.SKILLDOCK_SELECTED_NPM_VERSION, source: env.SKILLDOCK_NODE_SOURCE }).catch(error => process.stderr.write(`SkillDock：未能保存所选 Node：${error.message}\n`));
  // 36a §7: the fixed legacy directory is confirmed on every run once migrated.
  if (generation >= CURRENT_GENERATION) await ensureLegacyProject(state);
  if (action === 'status') {
    const health = initial && await probe(initial.url);
    return initial && matches(health, initial)
      ? { status: 'running', url: initial.url, pid: initial.pid, project: health.project, projectContext: health.projectContext,
          state, execution: initial.execution, cli: initial.cli, backgroundService: true, appVersion: health.appVersion }
      : { status: 'stopped', state };
  }
  // For tests: how long a service is given to stop, and how a process's command line is read.
  const halting = { ...(options.stopWait ? { wait: options.stopWait } : {}), ...(options.processCommand ? { commandOf: options.processCommand } : {}) };
  if (action === 'stop') return initial ? stop(initial, recordFile, codexHome, halting) : { status: 'stopped', message: '没有本启动器管理的运行实例。' };

  const projectInfo = await resolveLaunchProject({ projectDir: options.projectDir, env, cwd: process.cwd(), stateDir: state,
    actualProject: isCurrentRecord(initial) ? initial.actualProject : undefined, home });
  const { explicit, skipped = [], ...projectContext } = projectInfo;
  const project = projectInfo.effective;
  // The final directory is printed once it is known: a running instance may keep its own (62 UF-P3-01).
  process.stderr.write(`SkillDock：请求项目目录 ${projectInfo.requested}（${projectInfo.source}）\n`);
  for (const warning of skipped) process.stderr.write(`SkillDock：提示：${warning}\n`);
  // What is only true of the requested project waits for the final directory (r2 UF2-P3-01, r3 UF3-P3-02).
  // The saved-project note needs a caller directory: a 0.10.3 handover and the 0.10.2 native entry run
  // inside the data directory (36b 6.2), which is none. A handover is never a caller, wherever it runs.
  const finalProject = async final => {
    process.stderr.write(`SkillDock：最终扫描目录 ${final}${final !== project ? '（沿用运行实例的项目）' : ''}\n`);
    if (final !== project) return;
    for (const warning of projectInfo.warnings) process.stderr.write(`SkillDock：提示：${warning}\n`);
    const caller = projectInfo.source === 'saved' && env.SKILLDOCK_HANDOVER !== '1' && await validProject(process.cwd(), state);
    if (caller && caller !== project) process.stderr.write('SkillDock：使用界面保存的项目，和本次调用目录不同；可用 --project 明确覆盖。\n');
  };
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
    const ready = leftover?.source === runningAppPath; const completedAt = new Date().toISOString();
    // A job that failed and whose target runs after all (brought up by this start) is ready too, without
    // what it failed with (0.11.3).
    if (!leftover || !(['preparing', 'restarting'].includes(leftover.status) || leftover.status === 'failed' && ready)) return;
    const { message, ...settled } = leftover;
    await writeRestart(state, ready ? { ...settled, status: 'ready', pid, completedAt } : { ...leftover, status: 'failed', message: '重启任务未完成。', completedAt });
  };
  try {
    await options.onLocked?.();
    const generation = await readGeneration(state);
    if (generation > CURRENT_GENERATION) throw newerDataError(generation);
    const migrating = generation < CURRENT_GENERATION;
    // Generation 1: the gate and the fast reject, before anything 0.10.x reads is written.
    if (migrating) {
      const blocked = await migrationCheck({ state, context: plan, restartJob: jobId, env, home, codexHome, commandLines: env.SKILLDOCK_GATE_CHECKED !== '1' });
      if (blocked) throw blocked;
    }
    // DEC-SDX-024 level 2: a Claude session's own directories and command line are saved
    // (files 0.10.2 never reads); the service and background tasks use the saved values.
    if (plan.claudeRoot.origin === 'session' && !plan.claudeRoot.saved) await writeClaudeRoot(state, plan.claudeRoot);
    if (startedFromClaude(env)) {
      await recordSessionCli(state, env.CLAUDE_CODE_EXECPATH).catch(() => {});
      await recordClaudeSessionRoot(state, env, home).catch(() => {});
    }
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
        await finalProject(health.project);
        return { status: 'running', url, pid: current.pid, project: health.project, requestedProject: projectInfo.requested, projectContext: health.projectContext || projectContext, state, reused: true, cli: current.cli, backgroundService: true };
      } catch { /* A damaged generated runtime is rebuilt. */ }
    }
    // 36b 6.3: a project from levels ③–⑤ never changes a running instance's project, also
    // when the instance is replaced by another version.
    const keptProject = live && !explicit && health?.project ? await validProject(health.project, state) : null;
    const runProject = keptProject || project;
    const runContext = keptProject ? (health.projectContext?.effective === keptProject ? health.projectContext
      : { requested: keptProject, effective: keptProject, source: 'record', workingDirectory: process.cwd(), warnings: [] }) : projectContext;
    await finalProject(runProject);
    // Compilation and dependency failures leave a healthy old process running.
    if (!live) {
      if (current) await stop(current, recordFile, codexHome, halting);
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
    const cli = await resolveCodexCli({ codexHome, explicit: options.codexBin || env.SKILLDOCK_CODEX_BIN, env, home });
    for (const attempt of cli.attempts) process.stderr.write(`SkillDock：跳过 CLI ${attempt.path}：${attempt.error}\n`);
    process.stderr.write(cli.available ? `SkillDock：Codex CLI ${cli.path}（${cli.version}）\n` : `SkillDock：${cli.error}\n`);
    // The Claude command line the service will use, when Claude is on this computer (UAT 2026-10-10).
    if (await fs.stat(plan.claudeRoot.configDir).then(stat => stat.isDirectory(), () => false)) {
      const claudeCli = await resolveClaudeCli({ state, env, home, claudeRoot: plan.claudeRoot, save: false });
      for (const attempt of claudeCli.attempts) process.stderr.write(`SkillDock：跳过 Claude 命令行 ${attempt.path}：${attempt.error}\n`);
      process.stderr.write(claudeCli.available ? `SkillDock：Claude 命令行 ${claudeCli.path}（${claudeCli.version}）\n` : `SkillDock：${claudeCli.error}\n`);
    }
    const expected = JSON.stringify(live ? current : await readRecord(state));
    await report('preparing');
    // Dependency installation and build run third-party code: allowed variables and npm's own settings only.
    const runtime = await prepareRuntime(state, snapshot, { log: path.join(state, 'build.log'), environment: childEnvironment(env, {}, { npm: true }) });
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
        // 36b §7.4: a migration that failed after the gate is not retried by restart jobs; nor, on
        // generation 2, a switch to a newer version (5d review P2-01), or the restored instance's
        // self-updater would stop and restore it again at once.
        await writeMigrationFailure(state, { appDir, version: plan.own.version, message: error.message }).catch(() => {});
        return Object.assign(error, { restored: true, note: '；已恢复上一运行版本。' });
      } catch (failure) { return Object.assign(error, { note: `；恢复上一运行版本失败：${failure.message}` }); }
    };
    // HLD 3.7: the instance and Codex locks are taken before the old instance stops and held
    // until the new one is recorded or the old one is back; busy locks fail before stopping.
    const next = await withStateLocks(state, codexHome, async () => {
      if (JSON.stringify(await readRecord(state)) !== expected) throw new Error('运行实例已变化，已取消本次重启。');
      if (live) { await report('restarting'); await stop(current, recordFile, codexHome, { locked: true, ...halting }); stopped = true; }
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
