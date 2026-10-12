// SPDX-License-Identifier: AGPL-3.0-only
// Compatibility matrix, 0.10.3 gate (DEC-SDX-027; API-SDX-001 36b Appendix A).
// Real 0.10.2 and released 0.10.3 code come from Git history. 0.11.x is either the
// hand-written sample in fixtures/skilldock-0.11-sample, or the real 0.11 from this
// working tree (kind 'real'; its runtime is built once, offline, from the installed
// dependencies). Everything runs in a temporary HOME with no network access requirements.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import { execFile, execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { absentCommandLines } from './helpers/launcher-fixture.mjs';

const FROZEN_0102 = 'ab6856f6f54fd73e6a420d23e7922e9b8e213d70';
const RELEASED_0103 = '337547aa67831fcb78ba02414cd0c5f2ffbfbc58';
const MARKET = 'testany-agent-skills';
const SOURCE = 'https://github.com/TestAny-io/testany-agent-skills.git';
const pluginRoot = fileURLToPath(new URL('../../../../../', import.meta.url));
const sample = fileURLToPath(new URL('./fixtures/skilldock-0.11-sample/', import.meta.url));
const appRoot = fileURLToPath(new URL('../', import.meta.url));
// Cases whose expectations hold for both 0.11 implementations run against each.
const ELEVEN = ['sample', 'real'];
const named = (label, eleven) => eleven === 'real' ? `${label}（真实 0.11）` : label;
const PLAN = { version: 2, schedule: { enabled: false, intervalMinutes: 1440, timezone: 'UTC', autoApply: false, targets: [], running: false }, bindings: {}, observations: {}, runs: [], activity: [] };
// Installed caches contain the tracked tree; 0.10.2 captureSource requires assets/app/tests.
const COPY_EXCLUDED = new Set(['node_modules', 'dist', 'test-results', 'playwright-report', 'references', '.source-snapshot', '.git']);

let repository;
try { repository = execFileSync('git', ['-C', pluginRoot, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim(); } catch { repository = null; }
const gated = repository ? test : test.skip;
const trees = new Map();
function archived(commit) {
  if (!trees.has(commit)) trees.set(commit, (async () => {
    const target = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), `skilldock-${commit.slice(0, 7)}-`)));
    const archive = execFileSync('git', ['-C', repository, 'archive', commit, 'plugins/skilldock'], { maxBuffer: 256 * 1024 * 1024 });
    await fs.writeFile(path.join(target, 'tree.tar'), archive);
    execFileSync('tar', ['-xf', path.join(target, 'tree.tar'), '-C', target]);
    process.once('exit', () => { try { execFileSync('rm', ['-rf', target]); } catch { /* best effort */ } });
    return path.join(target, 'plugins/skilldock');
  })());
  return trees.get(commit);
}

const filter = source => !COPY_EXCLUDED.has(path.basename(source));

// A runtime built the way prepareRuntime builds it, with `builder`'s own source-bundle and
// runtime modules, but with the working tree's installed dependencies instead of npm ci.
const builds = new Map();
async function builtRuntime(appPath, builder = appPath) {
  const bundle = await import(pathToFileURL(path.join(builder, 'scripts/source-bundle.mjs')).href);
  const runtimeModule = await import(pathToFileURL(path.join(builder, 'server/runtime.mjs')).href);
  const snapshot = await bundle.captureSource(appPath);
  const key = `${snapshot.sourceDigest}:${builder}`;
  if (!builds.has(key)) builds.set(key, (async () => {
    const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock-runtime-')));
    process.once('exit', () => { try { execFileSync('rm', ['-rf', root]); } catch { /* best effort */ } });
    const runtime = path.join(root, 'runtime');
    await bundle.materializeRuntime(snapshot, runtime);
    await fs.symlink(path.join(appRoot, 'node_modules'), path.join(runtime, 'node_modules'));
    // npm reads no user configuration and writes its logs and cache next to the runtime, never in the real home (phase 6 review P3-08).
    const result = await run('npm', ['run', 'build'], { env: { ...process.env, npm_config_update_notifier: 'false', npm_config_userconfig: '/dev/null',
      npm_config_logs_dir: path.join(root, 'npm-logs'), npm_config_cache: path.join(root, 'npm-cache') }, cwd: runtime, timeout: 300000 });
    assert.equal(result.code, 0, result.stderr.slice(-4000));
    await runtimeModule.verifyRuntime(runtime, snapshot.sourceDigest);
    await fs.writeFile(path.join(runtime, '.build-complete'), snapshot.sourceDigest);
    return { runtime, digest: snapshot.sourceDigest };
  })());
  return builds.get(key);
}
// prepareRuntime finds a completed runtime of the same digest and reuses it: no npm.
async function seedRuntime(w, appPath) {
  const { runtime, digest } = await builtRuntime(appPath);
  const target = path.join(w.state, 'runtimes', digest.slice(0, 20));
  if (await exists(target)) return target;
  await fs.mkdir(path.dirname(target), { recursive: true });
  try { execFileSync('cp', ['-cR', runtime, target]); } catch { execFileSync('cp', ['-R', runtime, target]); }
  return target;
}

// The real 0.11 plugin from this tree, stamped with `version`. Its launch.sh records each
// invocation (as the sample does) and then runs the real launcher.
const realTrees = new Map();
async function realTree(version) {
  if (!realTrees.has(version)) realTrees.set(version, (async () => {
    const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), `skilldock-real-${version}-`)));
    process.once('exit', () => { try { execFileSync('rm', ['-rf', root]); } catch { /* best effort */ } });
    const tree = path.join(root, 'skilldock');
    await fs.cp(pluginRoot, tree, { recursive: true, filter });
    const stamp = async (file, edit) => { const value = JSON.parse(await fs.readFile(file, 'utf8')); edit(value); await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`); };
    const app = path.join(tree, 'skills/skill-manager/assets/app');
    await stamp(path.join(app, 'package.json'), value => { value.version = version; });
    await stamp(path.join(app, 'package-lock.json'), value => { value.version = version; if (value.packages?.['']) value.packages[''].version = version; });
    await stamp(path.join(tree, '.codex-plugin/plugin.json'), value => { value.version = version; });
    const scripts = path.join(tree, 'skills/skill-manager/scripts');
    await fs.rename(path.join(scripts, 'launch.sh'), path.join(scripts, 'launch-real.sh'));
    await fs.copyFile(path.join(sample, 'log-invocation.mjs'), path.join(scripts, 'log-invocation.mjs'));
    // The sample's controls (stub-launcher.mjs) around the real launcher, so that a case can make the
    // callee fail while the records and health answers still come from the real 0.11 (HLD 11A condition 3).
    await fs.writeFile(path.join(scripts, 'launch.sh'), `#!/bin/sh
set -eu
script_dir=$(CDPATH='' cd -- "$(/usr/bin/dirname -- "$0")" && pwd -P)
node="\${SKILLDOCK_NODE_BIN:?}"
control="\${SKILLDOCK_STATE_DIR:-$HOME/.local/share/skilldock}/../stub-control.json"
has() { [ -f "$control" ] && /usr/bin/grep -q "\\"$1\\"" "$control"; }
if has waitForSignal; then exec "$node" "$script_dir/log-invocation.mjs" "$@"; fi
"$node" "$script_dir/log-invocation.mjs" "$@"
if has forcePort; then PORT=$("$node" -e 'process.stdout.write(String(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).forcePort))' "$control"); export PORT; fi
if has bigStdout; then /bin/sh "$script_dir/launch-real.sh" "$@"; "$node" -e 'process.stdout.write("x".repeat(70 * 1024) + "\\n")'; exit 0; fi
if has restartThenFail; then /bin/sh "$script_dir/launch-real.sh" "$@"; exit 1; fi
exec /bin/sh "$script_dir/launch-real.sh" "$@"
`);
    return tree;
  })());
  return realTrees.get(version);
}
async function freePort() {
  const server = net.createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address(); await new Promise(resolve => server.close(resolve)); return port;
}
function run(file, args, { env, cwd, timeout = 60000 }) {
  return new Promise(resolve => execFile(file, args, { env, cwd, timeout, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) =>
    resolve({ code: error ? (typeof error.code === 'number' ? error.code : 1) : 0, stdout, stderr })));
}
const sha = async file => crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
const exists = file => fs.access(file).then(() => true, () => false);
async function invocations(w) {
  const text = await fs.readFile(path.join(w.root, 'invocations.jsonl'), 'utf8').catch(() => '');
  return text.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
}

async function world(t, { codexSource = SOURCE, claudeSource = { source: 'git', url: SOURCE }, generation = 2 } = {}) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock-compat-')));
  const home = path.join(root, 'home'); const state = path.join(root, 'state');
  const codexHome = path.join(home, '.codex'); const claudeConfig = path.join(home, '.claude');
  const projectA = path.join(root, 'project-a'); const projectB = path.join(root, 'project-b');
  for (const dir of [codexHome, path.join(claudeConfig, 'plugins/cache'), projectA, projectB, path.join(state, 'local'), path.join(state, 'compat/legacy-project')])
    await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(codexHome, 'config.toml'), `[marketplaces.${MARKET}]\nlast_updated = "2026-10-08T00:00:00Z"\nsource_type = "git"\nsource = "${codexSource}"\n`);
  await fs.writeFile(path.join(claudeConfig, 'plugins/known_marketplaces.json'), JSON.stringify({ [MARKET]: { source: claudeSource, installLocation: path.join(claudeConfig, 'plugins/marketplaces', MARKET) } }));
  // The schedule stays disabled: a real 0.11 service would otherwise register a LaunchAgent.
  await fs.writeFile(path.join(state, 'local/updates.json'), JSON.stringify({ ...PLAN, version: generation >= 2 ? 2 : 1 }));
  if (generation >= 2) await fs.writeFile(path.join(state, 'generation.json'), JSON.stringify({ format: 1, generation: 2, minimumCompatibleGeneration: 2, writtenBy: '0.11.0', writtenAt: new Date().toISOString() }));
  const port = await freePort();
  const env = { HOME: home, PATH: '/usr/bin:/bin', SKILLDOCK_STATE_DIR: state, SKILLDOCK_NODE_BIN: process.execPath, PORT: String(port), npm_config_cache: path.join(root, 'npm-cache'), ...absentCommandLines(home) };
  const w = { root, home, state, codexHome, claudeConfig, claudeCache: path.join(claudeConfig, 'plugins/cache'), projectA, projectB, port, env, installs: {} };
  w.planHash = await sha(path.join(state, 'local/updates.json'));
  t.after(async () => {
    const pids = (await fs.readFile(path.join(root, 'stub-pids'), 'utf8').catch(() => '')).split('\n').filter(Boolean).map(Number);
    let last = {};
    try { last = JSON.parse(await fs.readFile(path.join(state, 'launcher.json'), 'utf8')); } catch { /* absent or deliberately broken */ }
    for (const pid of [...pids, last.pid].filter(Number.isInteger)) { try { process.kill(pid, 'SIGTERM'); } catch { /* exited */ } }
    await fs.rm(root, { recursive: true, force: true });
  });
  return w;
}

async function install(w, agent, kind, version) {
  const name = agent === 'codex' ? version : crypto.createHash('sha1').update(`${kind}:${version}`).digest('hex').slice(0, 12);
  const dest = agent === 'codex' ? path.join(w.codexHome, 'plugins/cache', MARKET, 'skilldock', name) : path.join(w.claudeCache, MARKET, 'skilldock', name);
  if (kind === 'sample') {
    await fs.mkdir(path.join(dest, '.codex-plugin'), { recursive: true });
    await fs.writeFile(path.join(dest, '.codex-plugin/plugin.json'), JSON.stringify({ name: 'skilldock', version }));
    await fs.mkdir(path.join(dest, 'skills/skill-manager/scripts'), { recursive: true });
    await fs.mkdir(path.join(dest, 'skills/skill-manager/assets/app'), { recursive: true });
    for (const file of ['launch.sh', 'stub-launcher.mjs', 'stub-server.mjs']) await fs.copyFile(path.join(sample, file), path.join(dest, 'skills/skill-manager/scripts', file));
    await fs.writeFile(path.join(dest, 'skills/skill-manager/assets/app/package.json'), JSON.stringify({ name: 'skilldock', version }));
  } else if (kind === 'real') {
    await fs.cp(await realTree(version), dest, { recursive: true });
  } else {
    await fs.cp(await archived(kind === 'frozen' ? FROZEN_0102 : RELEASED_0103), dest, { recursive: true, filter });
  }
  const appPath = path.join(dest, 'skills/skill-manager/assets/app');
  if (kind === 'real') await seedRuntime(w, appPath);
  return (w.installs[`${agent}:${version}`] = { agent, dest, skillRoot: path.join(dest, 'skills/skill-manager'), appPath, version });
}

// Runs a sample launcher directly to create a realistic running (or stopped) 0.11.x record.
async function seedInstance(w, sampleInstall, { project = w.projectA, stopped = false, preferred } = {}) {
  const result = await run('/bin/sh', [path.join(sampleInstall.skillRoot, 'scripts/launch.sh'), 'start', '--project', project], { env: w.env, cwd: w.root });
  assert.equal(result.code, 0, result.stderr);
  if (stopped) assert.equal((await run('/bin/sh', [path.join(sampleInstall.skillRoot, 'scripts/launch.sh'), 'stop'], { env: w.env, cwd: w.root })).code, 0);
  if (preferred) {
    const file = path.join(w.state, 'launcher.json'); const record = JSON.parse(await fs.readFile(file, 'utf8'));
    record.preferred = { agent: preferred.agent, marketplace: MARKET, appPath: preferred.appPath, version: preferred.version, sourceKey: 'github.com/testany-io/testany-agent-skills' };
    await fs.writeFile(file, JSON.stringify(record, null, 2));
  }
  await fs.rm(path.join(w.root, 'invocations.jsonl'), { force: true });
  return JSON.parse(await fs.readFile(path.join(w.state, 'launcher.json'), 'utf8'));
}

// Stops a seeded instance and waits until it is gone: a real 0.11 service takes longer than the sample to close.
async function killed(pid) {
  try { process.kill(pid, 'SIGTERM'); } catch { return; }
  for (let i = 0; i < 100; i++) { try { process.kill(pid, 0); } catch { return; } await new Promise(resolve => setTimeout(resolve, 50)); }
  throw new Error(`实例 ${pid} 未退出`);
}
// 36b R-03 (Q8): the 0.10.2 launcher removed the record and started itself; its service stopped on the
// version-2 plan, leaving no record and nothing on the port (phase 6 review P2-02).
async function failedOnPlan(w) {
  assert.equal(await exists(path.join(w.state, 'launcher.json')), false, '不留启动记录');
  assert.match(await fs.readFile(path.join(w.state, 'server.log'), 'utf8').catch(() => ''), /INVALID_UPDATE_STATE/, '服务因计划文件 version 2 退出');
  await assert.rejects(fetch(`http://127.0.0.1:${w.port}/api/health`, { signal: AbortSignal.timeout(1500) }), '端口上没有留下服务');
}
async function record(w) { return JSON.parse(await fs.readFile(path.join(w.state, 'launcher.json'), 'utf8')); }
async function recordBytes(w) { return fs.readFile(path.join(w.state, 'launcher.json'), 'utf8').catch(() => null); }
async function health(rec) { return (await fetch(`${rec.url}/api/health`, { signal: AbortSignal.timeout(2000) })).json(); }

// Invariants asserted by every case (Appendix A preamble).
async function invariants(w) {
  assert.equal(await sha(path.join(w.state, 'local/updates.json')), w.planHash, '计划文件不得改变');
  assert.equal(await exists(path.join(w.home, 'Library/LaunchAgents')), false, '不得注册后台任务');
  assert.equal(await exists(path.join(w.state, 'node')), false, '不得下载 Node');
  assert.equal(await exists(path.join(w.root, 'npm-cache')), false, '不得运行 npm');
}

async function native0102(w, extraEnv = {}) {
  const skillRoot = w.installs['codex:0.10.2'].skillRoot;
  const { createNativeBackend } = await import(pathToFileURL(path.join(skillRoot, 'assets/app/server/native-backend.mjs')).href + `?w=${path.basename(w.root)}`);
  // A Codex MCP process has no PORT; the native entry then follows the launcher record.
  const { PORT, ...env } = w.env;
  return createNativeBackend({ skillRoot, env: { ...env, CODEX_HOME: w.codexHome, ...extraEnv } });
}
const launch0103 = (w, args, extraEnv = {}) => run('/bin/sh', [path.join(w.installs['codex:0.10.3'].skillRoot, 'scripts/launch.sh'), ...args], { env: { ...w.env, ...extraEnv }, cwd: w.projectA });

// ---------- A.1 0.10.2 native entry ----------

for (const eleven of ELEVEN) gated(named('N-01/N-02a Codex 侧有 0.11：已打开与首次打开都代理到运行实例，项目不变', eleven), async t => {
  const w = await world(t);
  await install(w, 'codex', 'frozen', '0.10.2'); await install(w, 'codex', 'released', '0.10.3');
  const codex011 = await install(w, 'codex', eleven, '0.11.0');
  await seedInstance(w, codex011, { project: w.projectA });
  const before = await recordBytes(w);
  const backend = await native0102(w);
  const result = await backend.read('/api/health');
  assert.equal(result.data.appVersion, '0.11.0'); assert.equal(result.data.project, w.projectA);
  const calls = await invocations(w);
  assert.equal(calls.length, 1); assert.equal(calls[0].version, '0.11.0'); assert.equal(calls[0].requested, path.join(w.state, 'compat/legacy-project'));
  assert.equal(JSON.parse(await recordBytes(w)).pid, JSON.parse(before).pid, '沿用实例');
  assert.equal((await backend.read('/api/health')).data.project, w.projectA);
  assert.equal((await invocations(w)).length, 1, '已打开过不再调用启动脚本');
  await invariants(w);
});

for (const eleven of ELEVEN) gated(named('N-02b 首次打开且 project.json 与运行项目不同：按显式项目切换（同 0.10.2 自身行为）', eleven), async t => {
  const w = await world(t);
  await install(w, 'codex', 'frozen', '0.10.2'); await install(w, 'codex', 'released', '0.10.3');
  const codex011 = await install(w, 'codex', eleven, '0.11.0');
  await seedInstance(w, codex011, { project: w.projectA });
  await fs.writeFile(path.join(w.state, 'project.json'), JSON.stringify({ path: w.projectB, recent: [] }));
  const result = await (await native0102(w)).read('/api/health');
  assert.equal(result.data.project, w.projectB);
  await invariants(w);
});

for (const eleven of ELEVEN) gated(named('N-03 Codex 侧有 0.11、实例已停止：调用 0.11 启动新实例，项目来自回退而非数据目录', eleven), async t => {
  const w = await world(t);
  await install(w, 'codex', 'frozen', '0.10.2'); await install(w, 'codex', 'released', '0.10.3');
  const codex011 = await install(w, 'codex', eleven, '0.11.0');
  await seedInstance(w, codex011, { project: w.projectA, stopped: true });
  const result = await (await native0102(w)).read('/api/health');
  assert.equal(result.data.project, w.projectA, '取启动记录中保存的实际项目（第④级）');
  await invariants(w);
});

for (const eleven of ELEVEN) gated(named('N-04/N-05 Codex 侧只有 0.10.3、实例运行中、无 project.json：交还，记录逐字节不变', eleven), async t => {
  const w = await world(t);
  await install(w, 'codex', 'frozen', '0.10.2'); await install(w, 'codex', 'released', '0.10.3');
  const claude011 = await install(w, 'claude', eleven, '0.11.0');
  await seedInstance(w, claude011, { project: w.projectA });
  const before = await recordBytes(w);
  const backend = await native0102(w);
  assert.equal((await backend.read('/api/health')).data.appVersion, '0.11.0');
  assert.equal(await recordBytes(w), before);
  assert.equal((await invocations(w)).length, 0, '第 2 步不调用较新启动器');
  assert.equal((await backend.read('/api/health')).data.project, w.projectA);
  await invariants(w);
});

for (const eleven of ELEVEN) gated(named('N-06 project.json 等于运行项目：交还', eleven), async t => {
  const w = await world(t);
  await install(w, 'codex', 'frozen', '0.10.2'); await install(w, 'codex', 'released', '0.10.3');
  const claude011 = await install(w, 'claude', eleven, '0.11.0');
  await seedInstance(w, claude011, { project: w.projectA });
  await fs.writeFile(path.join(w.state, 'project.json'), JSON.stringify({ path: w.projectA, recent: [] }));
  const before = await recordBytes(w);
  await (await native0102(w)).read('/api/health');
  assert.equal(await recordBytes(w), before); assert.equal((await invocations(w)).length, 0);
  await invariants(w);
});

for (const eleven of ELEVEN) gated(named('N-07 project.json 与运行项目不同：第 3 步转发项目并切换', eleven), async t => {
  const w = await world(t);
  await install(w, 'codex', 'frozen', '0.10.2'); await install(w, 'codex', 'released', '0.10.3');
  const claude011 = await install(w, 'claude', eleven, '0.11.0');
  await seedInstance(w, claude011, { project: w.projectA });
  await fs.writeFile(path.join(w.state, 'project.json'), JSON.stringify({ path: w.projectB, recent: [] }));
  const result = await (await native0102(w)).read('/api/health');
  assert.equal(result.data.project, w.projectB);
  const [call] = await invocations(w);
  assert.equal(call.requested, w.projectB); assert.equal(call.handover, '1'); assert.equal(call.handoverAgent, 'codex'); assert.equal(call.cwd, w.state);
  await invariants(w);
});

for (const eleven of ELEVEN) for (const variant of ['preferred', 'fallback']) gated(named(`N-08/N-09 实例未运行，Claude 侧 0.11 为${variant === 'preferred' ? '首选' : '兜底'}：转交并启动`, eleven), async t => {
  const w = await world(t);
  await install(w, 'codex', 'frozen', '0.10.2'); await install(w, 'codex', 'released', '0.10.3');
  const claude011 = await install(w, 'claude', eleven, '0.11.0');
  const gone = variant === 'fallback' ? await install(w, 'claude', 'sample', '0.11.1') : null;
  await seedInstance(w, claude011, { project: w.projectA, stopped: true, preferred: gone ?? claude011 });
  if (gone) await fs.writeFile(path.join(gone.dest, '.orphaned_at'), String(Date.now()));
  const result = await (await native0102(w)).read('/api/health');
  assert.equal(result.data.appVersion, '0.11.0');
  const [call] = await invocations(w);
  assert.equal(call.version, '0.11.0'); assert.equal(call.cwd, w.state); assert.equal(call.handover, '1');
  assert.equal((await record(w)).url, `http://127.0.0.1:${w.port}`);
  await invariants(w);
});

for (const eleven of ELEVEN) gated(named('N-10 没有可用的同源 ≥0.11 安装：0.10.3 退出 3，0.10.2 显示固定错误，不启动任何进程', eleven), async t => {
  const w = await world(t);
  await install(w, 'codex', 'frozen', '0.10.2'); await install(w, 'codex', 'released', '0.10.3');
  const claude011 = await install(w, 'claude', eleven, '0.11.0');
  await seedInstance(w, claude011, { project: w.projectA, stopped: true });
  await fs.writeFile(path.join(claude011.dest, '.orphaned_at'), '1');
  const before = await recordBytes(w);
  await assert.rejects((await native0102(w)).read('/api/health'), /redact is not a function/);
  assert.equal(await recordBytes(w), before); assert.equal((await invocations(w)).length, 0);
  await invariants(w);
});

for (const eleven of ELEVEN) gated(named('N-11 被调用的 0.11 失败：0.10.3 退出 1，0.10.2 显示固定错误，计划数据不变', eleven), async t => {
  const w = await world(t);
  await install(w, 'codex', 'frozen', '0.10.2'); await install(w, 'codex', 'released', '0.10.3');
  const claude011 = await install(w, 'claude', eleven, '0.11.0');
  await seedInstance(w, claude011, { project: w.projectA, stopped: true });
  await fs.writeFile(path.join(w.root, 'stub-control.json'), JSON.stringify({ fail: true }));
  await assert.rejects((await native0102(w)).read('/api/health'), /redact is not a function/);
  assert.equal((await invocations(w)).length, 1);
  await invariants(w);
});

for (const eleven of ELEVEN) gated(named('N-13 新实例换端口：0.10.2 重读记录得到新地址', eleven), async t => {
  const w = await world(t);
  await install(w, 'codex', 'frozen', '0.10.2'); await install(w, 'codex', 'released', '0.10.3');
  const claude011 = await install(w, 'claude', eleven, '0.11.0');
  await seedInstance(w, claude011, { project: w.projectA, stopped: true });
  const moved = await freePort();
  await fs.writeFile(path.join(w.root, 'stub-control.json'), JSON.stringify({ forcePort: moved }));
  const result = await (await native0102(w)).read('/api/health');
  assert.equal(result.data.appVersion, '0.11.0'); assert.equal((await record(w)).url, `http://127.0.0.1:${moved}`);
  await invariants(w);
});

for (const eleven of ELEVEN) gated(named('N-16 原生入口环境有 SKILLDOCK_PROJECT_DIR：以它调用 0.10.3，实例运行中且项目不同则切换', eleven), async t => {
  const w = await world(t);
  await install(w, 'codex', 'frozen', '0.10.2'); await install(w, 'codex', 'released', '0.10.3');
  const claude011 = await install(w, 'claude', eleven, '0.11.0');
  await seedInstance(w, claude011, { project: w.projectA });
  const backend = await native0102(w, { SKILLDOCK_PROJECT_DIR: w.projectB });
  assert.equal((await backend.read('/api/health')).data.project, w.projectB);
  assert.equal((await invocations(w))[0].requested, w.projectB);
  await invariants(w);
});

for (const eleven of ELEVEN) gated(named('N-17 切换项目时较新启动器失败：0.10.3 回落交还，0.10.2 代理到原实例', eleven), async t => {
  const w = await world(t);
  await install(w, 'codex', 'frozen', '0.10.2'); await install(w, 'codex', 'released', '0.10.3');
  const claude011 = await install(w, 'claude', eleven, '0.11.0');
  await seedInstance(w, claude011, { project: w.projectA });
  await fs.writeFile(path.join(w.state, 'project.json'), JSON.stringify({ path: w.projectB, recent: [] }));
  await fs.writeFile(path.join(w.root, 'stub-control.json'), JSON.stringify({ noisyFail: true }));
  const before = await recordBytes(w);
  assert.equal((await (await native0102(w)).read('/api/health')).data.project, w.projectA);
  assert.equal(await recordBytes(w), before);
  await invariants(w);
});

gated('N-12 代号 2、launcher.json 已被删除：0.10.2 原生入口调用自身启动器；回退路径启动失败、脚本不在时，都显示固定错误，计划数据不变（已知残留 Q8）', async t => {
  const w = await world(t);
  const old = await install(w, 'codex', 'frozen', '0.10.2'); await install(w, 'codex', 'released', '0.10.3');
  await seedRuntime(w, old.appPath);
  // Without a record and without PORT, 0.10.2 would use the default port 4771, where the user's own
  // SkillDock may run: this case alone gives the native entry the world's port.
  const entry = () => native0102(w, { PORT: String(w.port) });
  await assert.rejects((await entry()).read('/api/health'), /redact is not a function/, '缓存仍在：0.10.2 回退路径启动失败（同 R-03）');
  await failedOnPlan(w);
  await fs.rm(path.join(old.skillRoot, 'scripts/launch.sh'));
  await assert.rejects((await entry()).read('/api/health'), /redact is not a function/, '自身脚本已不在');
  assert.equal((await invocations(w)).length, 0, '不调用任何 0.11 启动脚本');
  await invariants(w);
});

for (const eleven of ELEVEN) gated(named('N-14 旧 source 所指 Codex 缓存被删除：已打开过照常代理；首次打开时 0.10.2 启动器无法核实而拒绝，实例不受影响', eleven), async t => {
  const w = await world(t);
  await install(w, 'codex', 'frozen', '0.10.2'); await install(w, 'codex', 'released', '0.10.3');
  const codex011 = await install(w, 'codex', eleven, '0.11.0');
  const seeded = await seedInstance(w, codex011, { project: w.projectA });
  assert.equal(seeded.source, codex011.appPath, '旧 source 指向 Codex 侧 0.11 缓存');
  const opened = await native0102(w);
  assert.equal((await opened.read('/api/health')).data.appVersion, '0.11.0');
  await fs.rm(codex011.dest, { recursive: true });
  const before = await recordBytes(w);
  assert.equal((await opened.read('/api/health')).data.appVersion, '0.11.0', '界面已打开过：照常代理');
  await assert.rejects((await native0102(w)).read('/api/health'), /redact is not a function/, '首次打开：自身 0.10.2 启动器无法核实');
  assert.equal(await recordBytes(w), before);
  assert.equal((await health(await record(w))).pid, seeded.pid, '实例不受影响');
  await invariants(w);
});

for (const eleven of ELEVEN) gated(named('N-14 旧 source 所指 Codex 缓存被删除、实例未运行：0.10.2 走回退路径失败，计划数据不变', eleven), async t => {
  const w = await world(t);
  const old = await install(w, 'codex', 'frozen', '0.10.2'); await install(w, 'codex', 'released', '0.10.3');
  const codex011 = await install(w, 'codex', eleven, '0.11.0');
  await seedRuntime(w, old.appPath);
  await seedInstance(w, codex011, { project: w.projectA, stopped: true });
  await fs.rm(codex011.dest, { recursive: true });
  await assert.rejects((await native0102(w)).read('/api/health'), /redact is not a function/);
  await failedOnPlan(w);
  assert.equal((await invocations(w)).length, 0);
  await invariants(w);
});

for (const eleven of ELEVEN) gated(named('N-15 Codex 侧没有 SkillDock：旧 source 为运行中的安装，installation 为目录形态', eleven), async t => {
  const w = await world(t);
  const claude011 = await install(w, 'claude', eleven, '0.11.0');
  const rec = await seedInstance(w, claude011, { project: w.projectA });
  assert.equal(rec.source, claude011.appPath);
  assert.deepEqual(rec.installation, { kind: 'directory', source: claude011.appPath });
  await invariants(w);
});

// ---------- A.2 0.10.3 own entry ----------

for (const eleven of ELEVEN) gated(named('S-01 本安装有 ≥0.11 缓存：第 1 步转交，转发动作与项目', eleven), async t => {
  const w = await world(t);
  await install(w, 'codex', 'released', '0.10.3'); await install(w, 'codex', eleven, '0.11.0');
  const result = await launch0103(w, ['start', '--project', w.projectB]);
  assert.equal(result.code, 0, result.stderr);
  const [call] = await invocations(w);
  assert.deepEqual([call.version, call.agent, call.action, call.requested, call.cwd], ['0.11.0', 'codex', 'start', w.projectB, w.state]);
  assert.equal(call.handoverFrom, '0.10.3');
  assert.equal((await health(await record(w))).project, w.projectB);
  await invariants(w);
});

for (const eleven of ELEVEN) gated(named('S-02 实例运行中、项目相同或缺省：第 2 步交还，输出沿用结果，记录不变', eleven), async t => {
  const w = await world(t);
  await install(w, 'codex', 'released', '0.10.3'); const claude011 = await install(w, 'claude', eleven, '0.11.0');
  await seedInstance(w, claude011, { project: w.projectA });
  const before = await recordBytes(w);
  for (const args of [['start'], ['start', '--project', w.projectA], ['start', '--project', path.join(w.state, 'compat/legacy-project')]]) {
    const result = await launch0103(w, args);
    assert.equal(result.code, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.deepEqual([output.status, output.reused, output.handover, output.project], ['running', true, 'running-instance', w.projectA]);
  }
  assert.equal(await recordBytes(w), before); assert.equal((await invocations(w)).length, 0);
  await invariants(w);
});

for (const eleven of ELEVEN) gated(named('S-03/S-04 实例运行中收到不同的有效项目：可转交则切换，否则交还并说明未切换', eleven), async t => {
  const w = await world(t);
  await install(w, 'codex', 'released', '0.10.3'); const claude011 = await install(w, 'claude', eleven, '0.11.0');
  await seedInstance(w, claude011, { project: w.projectA });
  let result = await launch0103(w, ['start', '--project', w.projectB]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal((await health(await record(w))).project, w.projectB);
  await fs.writeFile(path.join(claude011.dest, '.orphaned_at'), '1');
  const before = await recordBytes(w);
  result = await launch0103(w, ['start', '--project', w.projectA]);
  assert.equal(result.code, 0);
  const output = JSON.parse(result.stdout);
  assert.equal(output.projectNotSwitched, w.projectA); assert.match(result.stderr, /未能切换到所请求的项目/);
  assert.equal(await recordBytes(w), before);
  await invariants(w);
});

for (const eleven of ELEVEN) gated(named('S-05/S-06 实例未运行：有目标则转交；无任何目标则退出 3 并提示更新本侧', eleven), async t => {
  const w = await world(t);
  await install(w, 'codex', 'released', '0.10.3');
  let result = await launch0103(w, ['start']);
  assert.equal(result.code, 3);
  const output = JSON.parse(result.stdout);
  assert.deepEqual([output.status, output.agent, output.requiredVersion], ['update-required', 'codex', '0.11.0']);
  assert.match(result.stderr, /请把 Codex 中的 SkillDock 更新到 0\.11/);
  await install(w, 'claude', eleven, '0.11.0');
  result = await launch0103(w, ['start']);
  assert.equal(result.code, 0, result.stderr);
  assert.equal((await invocations(w))[0].agent, 'claude');
  await invariants(w);
});

for (const eleven of ELEVEN) gated(named('S-07/S-08 第 1 步被调用方失败：有运行实例则回落交还，否则退出 1', eleven), async t => {
  const w = await world(t);
  await install(w, 'codex', 'released', '0.10.3'); const codex011 = await install(w, 'codex', eleven, '0.11.0');
  await seedInstance(w, codex011, { project: w.projectA });
  await fs.writeFile(path.join(w.root, 'stub-control.json'), JSON.stringify({ noisyFail: true }));
  let result = await launch0103(w, ['start']);
  assert.equal(result.code, 0); assert.match(JSON.parse(result.stdout).warning, /较新版本启动失败/);
  const rec = await record(w); await killed(rec.pid);
  result = await launch0103(w, ['start']);
  assert.equal(result.code, 1); assert.match(result.stderr, /样本启动器按测试要求失败/);
  assert.equal((await invocations(w)).length, 2, '第 1 步失败后不再尝试第 3 步');
  await invariants(w);
});

for (const eleven of ELEVEN) gated(named('S-09/S-10 status、stop、restart：转发同一动作；无目标时退出 3', eleven), async t => {
  const w = await world(t);
  await install(w, 'codex', 'released', '0.10.3'); const claude011 = await install(w, 'claude', eleven, '0.11.0');
  await seedInstance(w, claude011, { project: w.projectA });
  assert.equal((await launch0103(w, ['status'])).code, 0);
  assert.equal((await launch0103(w, ['stop'])).code, 0);
  assert.equal((await record(w)).status, 'stopped');
  assert.deepEqual((await invocations(w)).map(call => call.action), ['status', 'stop']);
  await fs.writeFile(path.join(claude011.dest, '.orphaned_at'), '1');
  for (const action of ['status', 'stop', 'restart']) assert.equal((await launch0103(w, [action])).code, 3);
  await invariants(w);
});

for (const eleven of ELEVEN) gated(named('S-11/S-12 带 Claude 会话变量调用另一侧：正常完成，变量原样传给被调用方', eleven), async t => {
  const w = await world(t);
  await install(w, 'codex', 'released', '0.10.3'); await install(w, 'claude', eleven, '0.11.0');
  const result = await launch0103(w, ['start'], { CLAUDECODE: '1', CLAUDE_CODE_ENTRYPOINT: 'claude-desktop', SKILLDOCK_RESTART_JOB: 'stale-job' });
  assert.equal(result.code, 0, result.stderr);
  const [call] = await invocations(w);
  assert.equal(call.claudeSession, true); assert.equal(call.restartJob, null, '不传递旧重启任务');
  await invariants(w);
});

for (const eleven of ELEVEN) gated(named('S-13 设置了 SKILLDOCK_PROJECT_DIR、未传 --project：新实例取该项目', eleven), async t => {
  const w = await world(t);
  await install(w, 'codex', 'released', '0.10.3'); await install(w, 'claude', eleven, '0.11.0');
  const result = await launch0103(w, ['start'], { SKILLDOCK_PROJECT_DIR: w.projectB });
  assert.equal(result.code, 0, result.stderr);
  assert.equal((await health(await record(w))).project, w.projectB);
  await invariants(w);
});

for (const eleven of ELEVEN) gated(named('S-14/S-15 自定义 Claude 目录与废弃目录：按根目录记录找到有效安装，忽略废弃目录', eleven), async t => {
  const w = await world(t);
  await install(w, 'codex', 'released', '0.10.3');
  const custom = path.join(w.root, 'custom-claude');
  await fs.mkdir(path.join(custom, 'plugins/cache'), { recursive: true });
  await fs.cp(path.join(w.claudeConfig, 'plugins/known_marketplaces.json'), path.join(custom, 'plugins/known_marketplaces.json'));
  await fs.rm(w.claudeConfig, { recursive: true });
  w.claudeCache = path.join(custom, 'plugins/cache');
  await install(w, 'claude', eleven, '0.11.0'); const orphan = await install(w, 'claude', 'sample', '0.11.2');
  await fs.writeFile(path.join(orphan.dest, '.orphaned_at'), '1');
  await fs.mkdir(path.join(w.state, 'agents'), { recursive: true });
  await fs.writeFile(path.join(w.state, 'agents/claude-root.json'), JSON.stringify({ format: 1, configDir: custom, pluginCacheDir: path.join(custom, 'plugins/cache'), origin: 'explicit', updatedAt: new Date().toISOString() }));
  const result = await launch0103(w, ['start']);
  assert.equal(result.code, 0, result.stderr);
  assert.equal((await invocations(w))[0].version, '0.11.0');
  await invariants(w);
});

for (const eleven of ELEVEN) gated(named('S-16 本侧 marketplace 指向 fork：第 3 步不可用，退出 3', eleven), async t => {
  const w = await world(t, { codexSource: 'https://github.com/someone/testany-agent-skills.git' });
  await install(w, 'codex', 'released', '0.10.3'); await install(w, 'claude', eleven, '0.11.0');
  assert.equal((await launch0103(w, ['start'])).code, 3);
  assert.equal((await invocations(w)).length, 0);
  await invariants(w);
});

for (const eleven of ELEVEN) gated(named('S-17a/S-17b 迁移持锁时退出 1；取锁后发现迁移完成则改走转交链，不写文件', eleven), async t => {
  const w = await world(t);
  const own = await install(w, 'codex', 'released', '0.10.3'); await install(w, 'claude', eleven, '0.11.0');
  // A real 0.11 comes with its runtime already built (seedRuntime): what matters is that 0.10.3 adds nothing.
  const runtimes = async () => (await fs.readdir(path.join(w.state, 'runtimes')).catch(() => [])).sort();
  const seeded = await runtimes();
  await fs.writeFile(path.join(w.state, 'generation.json'), JSON.stringify({ format: 1, generation: 1 }));
  const { acquireFileLock } = await import(pathToFileURL(path.join(own.appPath, 'server/process-lock.mjs')).href);
  const release = acquireFileLock(path.join(w.state, 'launcher.lock'));
  const busy = await run(process.execPath, [path.join(own.skillRoot, 'scripts/launch.mjs'), 'start', '--project', w.projectA], { env: w.env, cwd: w.projectA });
  release();
  assert.equal(busy.code, 1); assert.match(busy.stderr, /另一个启动操作正在运行/);
  const { launch } = await import(pathToFileURL(path.join(own.skillRoot, 'scripts/launch.mjs')).href + `?w=${path.basename(w.root)}`);
  await assert.rejects(launch('start', { projectDir: w.projectA, stateDir: w.state, codexHome: w.codexHome, port: w.port,
    onLocked: () => fs.writeFile(path.join(w.state, 'generation.json'), JSON.stringify({ format: 1, generation: 2 })) }), { code: 'SKILLDOCK_HANDOVER' });
  const again = acquireFileLock(path.join(w.state, 'launcher.lock')); again();
  assert.equal(await exists(path.join(w.state, 'launcher.json')), false); assert.deepEqual(await runtimes(), seeded);
  await invariants(w);
});

for (const eleven of ELEVEN) gated(named('S-19 --project 不存在或是文件：视为无效项目', eleven), async t => {
  const w = await world(t);
  await install(w, 'codex', 'released', '0.10.3'); const claude011 = await install(w, 'claude', eleven, '0.11.0');
  await seedInstance(w, claude011, { project: w.projectA });
  const file = path.join(w.root, 'plain-file'); await fs.writeFile(file, 'x');
  for (const value of [path.join(w.root, 'missing'), file]) {
    const result = await launch0103(w, ['start', '--project', value]);
    assert.equal(result.code, 0); assert.equal(JSON.parse(result.stdout).project, w.projectA); assert.equal(JSON.parse(result.stdout).projectNotSwitched, undefined);
  }
  assert.equal((await invocations(w)).length, 0);
  await invariants(w);
});

for (const eleven of ELEVEN) gated(named('S-20 切换项目时较新启动器失败：回落交还，stdout 只有一个 JSON', eleven), async t => {
  const w = await world(t);
  await install(w, 'codex', 'released', '0.10.3'); const claude011 = await install(w, 'claude', eleven, '0.11.0');
  await seedInstance(w, claude011, { project: w.projectA });
  await fs.writeFile(path.join(w.root, 'stub-control.json'), JSON.stringify({ noisyFail: true }));
  const result = await launch0103(w, ['start', '--project', w.projectB]);
  assert.equal(result.code, 0);
  const output = JSON.parse(result.stdout);
  assert.equal(output.projectNotSwitched, w.projectB); assert.match(output.warning, /较新版本启动失败/);
  assert.match(result.stderr, /partial-output-before-failure/, '被调用方的 stdout 转到 stderr');
  await invariants(w);
});

for (const eleven of ELEVEN) gated(named('S-21 已带 SKILLDOCK_HANDOVER 的环境：不再转交', eleven), async t => {
  const w = await world(t);
  await install(w, 'codex', 'released', '0.10.3'); const claude011 = await install(w, 'claude', eleven, '0.11.0');
  await seedInstance(w, claude011, { project: w.projectA });
  let result = await launch0103(w, ['start', '--project', w.projectB], { SKILLDOCK_HANDOVER: '1' });
  assert.equal(result.code, 0); assert.equal(JSON.parse(result.stdout).projectNotSwitched, w.projectB);
  await killed((await record(w)).pid);
  result = await launch0103(w, ['start'], { SKILLDOCK_HANDOVER: '1' });
  assert.equal(result.code, 3); assert.equal((await invocations(w)).length, 0);
  await invariants(w);
});

for (const eleven of ELEVEN) gated(named('S-22 运行中的安装与首选启动目标不同：第 2 步交还，记录不变', eleven), async t => {
  const w = await world(t);
  await install(w, 'codex', 'released', '0.10.3');
  const claude011 = await install(w, 'claude', eleven, '0.11.0'); // A real 0.11 moves to a higher preferred installation by itself (phase 5d): its preferred target here is
  // another installation of the same version.
  const newer = await install(w, 'claude', 'sample', eleven === 'real' ? '0.11.0' : '0.11.1');
  await seedInstance(w, claude011, { project: w.projectA, preferred: newer });
  const before = await recordBytes(w);
  const result = await launch0103(w, ['start']);
  assert.equal(result.code, 0); assert.equal(JSON.parse(result.stdout).appVersion, '0.11.0');
  assert.equal(await recordBytes(w), before); assert.equal((await invocations(w)).length, 0);
  await invariants(w);
});

gated('S-23 代号 1、启动记录无法解析：不触发转交链，按 0.10.2 报错', async t => {
  const w = await world(t);
  const own = await install(w, 'codex', 'released', '0.10.3');
  await fs.writeFile(path.join(w.state, 'generation.json'), JSON.stringify({ format: 1, generation: 1 }));
  await fs.writeFile(path.join(w.state, 'launcher.json'), '{broken');
  const result = await run(process.execPath, [path.join(own.skillRoot, 'scripts/launch.mjs'), 'start', '--project', w.projectA], { env: w.env, cwd: w.projectA });
  assert.equal(result.code, 1); assert.match(result.stderr, /启动记录不可读/);
  assert.equal(await fs.readFile(path.join(w.state, 'launcher.json'), 'utf8'), '{broken');
  await invariants(w);
});

for (const eleven of ELEVEN) gated(named('S-24 被调用方重启实例后失败：回落时重新读取记录，用新实例核实', eleven), async t => {
  const w = await world(t);
  await install(w, 'codex', 'released', '0.10.3'); const claude011 = await install(w, 'claude', eleven, '0.11.0');
  const old = await seedInstance(w, claude011, { project: w.projectA });
  const moved = await freePort();
  await fs.writeFile(path.join(w.root, 'stub-control.json'), JSON.stringify({ restartThenFail: true, forcePort: moved }));
  const result = await launch0103(w, ['start', '--project', w.projectB]);
  assert.equal(result.code, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.url, `http://127.0.0.1:${moved}`); assert.notEqual(output.pid, old.pid);
  assert.equal(output.project, w.projectB); assert.equal(output.projectNotSwitched, undefined); assert.match(output.warning, /较新版本启动失败/);
  await invariants(w);
});

for (const eleven of ELEVEN) gated(named('S-25 被调用方 stdout 超过 64 KiB：视为失败；有运行实例则回落，否则退出 1', eleven), async t => {
  const w = await world(t);
  await install(w, 'codex', 'released', '0.10.3'); await install(w, 'claude', eleven, '0.11.0');
  await fs.writeFile(path.join(w.root, 'stub-control.json'), JSON.stringify({ bigStdout: true }));
  let result = await launch0103(w, ['start', '--project', w.projectA]);
  assert.equal(result.code, 1); assert.equal(result.stdout, ''); assert.match(result.stderr, /超过 64 KiB/);
  result = await launch0103(w, ['start', '--project', w.projectB]);
  assert.equal(result.code, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.handover, 'running-instance'); assert.match(output.warning, /较新版本启动失败/);
  await invariants(w);
});

for (const eleven of ELEVEN) gated(named('S-27 判定点 1 触发后收到 SIGTERM：转发给被调用的 0.11 启动脚本', eleven), async t => {
  const w = await world(t);
  const own = await install(w, 'codex', 'released', '0.10.3'); await install(w, 'claude', eleven, '0.11.0');
  await fs.writeFile(path.join(w.root, 'stub-control.json'), JSON.stringify({ waitForSignal: true }));
  const child = (await import('node:child_process')).spawn('/bin/sh', [path.join(own.skillRoot, 'scripts/launch.sh'), 'start'], { env: w.env, cwd: w.projectA, stdio: 'ignore' });
  const exited = new Promise(resolve => child.once('exit', resolve));
  for (let i = 0; i < 100 && (await invocations(w)).length === 0; i++) await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal((await invocations(w)).length, 1);
  child.kill('SIGTERM');
  for (let i = 0; i < 50 && !(await exists(path.join(w.root, 'sigterm-received'))); i++) await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(await exists(path.join(w.root, 'sigterm-received')), true);
  await exited;
  await invariants(w);
});

// 36b 4.2: launch.mjs runs the chain itself at decision points 2 (run directly) and 3 (after taking the
// lock, once a migration has finished meanwhile); bootstrap.mjs at point 1. Point 3 is reached by a
// driver that repeats launch.mjs's own entry code around the released launch() and runHandover().
const POINT_3 = `const [launchFile, handoverFile, appDir, state, project] = process.argv.slice(1);
const { pathToFileURL } = await import('node:url'); const fs = await import('node:fs/promises');
const { launch } = await import(pathToFileURL(launchFile).href); const { runHandover } = await import(pathToFileURL(handoverFile).href);
try { await launch('start', { projectDir: project, onLocked: () => fs.writeFile(state + '/generation.json', JSON.stringify({ format: 1, generation: 2 })) }); }
catch (error) { if (error.code !== 'SKILLDOCK_HANDOVER') throw error; process.exitCode = (await runHandover({ action: 'start', projectDir: project, appDir })) ?? 1; }`;
for (const eleven of ELEVEN) for (const [point, signal] of [[1, 'SIGINT'], [2, 'SIGINT'], [2, 'SIGTERM'], [3, 'SIGINT'], [3, 'SIGTERM']]) gated(named(`S-28 判定点 ${point} 触发后收到 ${signal}：转发给被调用的 0.11 启动脚本`, eleven), async t => {
  const w = await world(t, point === 3 ? { generation: 1 } : {});
  const own = await install(w, 'codex', 'released', '0.10.3'); await install(w, 'claude', eleven, '0.11.0');
  await fs.writeFile(path.join(w.root, 'stub-control.json'), JSON.stringify({ waitForSignal: true }));
  const { spawn } = await import('node:child_process');
  const options = { env: w.env, cwd: w.projectA, stdio: 'ignore' };
  const child = point === 1 ? spawn('/bin/sh', [path.join(own.skillRoot, 'scripts/launch.sh'), 'start'], options)
    : point === 2 ? spawn(process.execPath, [path.join(own.skillRoot, 'scripts/launch.mjs'), 'start', '--project', w.projectA], options)
    : spawn(process.execPath, ['--input-type=module', '-e', POINT_3, path.join(own.skillRoot, 'scripts/launch.mjs'), path.join(own.appPath, 'server/handover.mjs'), own.appPath, w.state, w.projectA], options);
  const exited = new Promise(resolve => child.once('exit', resolve));
  for (let i = 0; i < 100 && (await invocations(w)).length === 0; i++) await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal((await invocations(w)).length, 1, '已调用 0.11 启动脚本');
  child.kill(signal);
  const mark = path.join(w.root, `${signal.toLowerCase()}-received`);
  for (let i = 0; i < 50 && !(await exists(mark)); i++) await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(await exists(mark), true, `${signal} 已转发`);
  await exited;
  await invariants(w);
});

gated('S-26 未触发转交链时，原生入口超时结束 bootstrap.mjs：launch.mjs 照常完成启动（与 0.10.2 相同）', async t => {
  const w = await world(t, { generation: 1 });
  const own = await install(w, 'codex', 'released', '0.10.3');
  await seedRuntime(w, own.appPath);
  const { spawn } = await import('node:child_process');
  // What the native entry's 600-second timeout does: SIGTERM to the process it started (bootstrap.mjs, which launch.sh execs).
  const child = spawn('/bin/sh', [path.join(own.skillRoot, 'scripts/launch.sh'), 'start', '--project', w.projectA], { env: w.env, cwd: w.projectA, stdio: 'ignore' });
  const exited = new Promise(resolve => child.once('exit', resolve));
  // launch.mjs is running once it holds the launcher lock (bootstrap.mjs never takes it).
  for (let i = 0; i < 400 && !(await exists(path.join(w.state, 'launcher.lock'))); i++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(await exists(path.join(w.state, 'launcher.lock')), true, 'bootstrap.mjs 已启动 launch.mjs');
  child.kill('SIGTERM'); await exited;
  for (let i = 0; i < 200 && !(await exists(path.join(w.state, 'launcher.json'))); i++) await new Promise(resolve => setTimeout(resolve, 100));
  const rec = await record(w);
  assert.equal((await health(rec)).pid, rec.pid, 'launch.mjs 照常完成，实例可用');
  await invariants(w);
});

// ---------- A.3 0.10.3 background and native entry ----------

for (const [label, generation, plan] of [['B-01 代号 2', 2, 2], ['B-02 代号 1、计划文件 version 2', 1, 2]]) gated(`${label}：后台本次直接结束，不写任何文件`, async t => {
  const w = await world(t);
  const own = await install(w, 'codex', 'released', '0.10.3');
  await fs.writeFile(path.join(w.state, 'generation.json'), JSON.stringify({ format: 1, generation }));
  await fs.mkdir(path.join(w.state, 'background'), { recursive: true });
  const context = path.join(w.state, 'background/context.json');
  await fs.writeFile(context, JSON.stringify({ version: 1, stateDir: w.state, home: w.home, codexHome: w.codexHome, runtime: own.appPath }));
  const listing = async () => (await fs.readdir(w.state, { recursive: true })).sort();
  const before = await listing(); const contextHash = await sha(context);
  const result = await run(process.execPath, [path.join(own.appPath, 'server/background-entry.mjs'), context], { env: w.env, cwd: w.root });
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(await listing(), before); assert.equal(await sha(context), contextHash);
  assert.equal(plan, 2); await invariants(w);
});

gated('B-03 0.10.3 原生入口得到退出 3：显示启动未完成与更新提示（修正 redact 缺陷）', async t => {
  const w = await world(t);
  const own = await install(w, 'codex', 'released', '0.10.3');
  const { createNativeBackend } = await import(pathToFileURL(path.join(own.appPath, 'server/native-backend.mjs')).href + `?w=${path.basename(w.root)}`);
  const backend = createNativeBackend({ skillRoot: own.skillRoot, env: { ...w.env, CODEX_HOME: w.codexHome, SKILLDOCK_PROJECT_DIR: w.projectA } });
  await assert.rejects(backend.read('/api/health'), error => /SkillDock 后台启动未完成。/.test(error.message) && /更新到 0\.11/.test(error.message));
  await invariants(w);
});

for (const eleven of ELEVEN) gated(named('B-04 0.10.3 原生入口、代号 2、无启动记录：调用自身启动脚本，经兜底启动 0.11 并代理', eleven), async t => {
  const w = await world(t);
  const own = await install(w, 'codex', 'released', '0.10.3'); await install(w, 'claude', eleven, '0.11.0');
  const { createNativeBackend } = await import(pathToFileURL(path.join(own.appPath, 'server/native-backend.mjs')).href + `?b04=${path.basename(w.root)}`);
  const backend = createNativeBackend({ skillRoot: own.skillRoot, env: { ...w.env, CODEX_HOME: w.codexHome, SKILLDOCK_PROJECT_DIR: w.projectA } });
  const result = await backend.read('/api/health');
  assert.equal(result.data.appVersion, '0.11.0'); assert.equal(result.data.project, w.projectA);
  await invariants(w);
});

// ---------- A.4 0.10.2 rollback ----------

for (const eleven of ELEVEN) gated(named('R-01/R-02 0.11 实例运行中执行 0.10.2 启动器：start、restart、stop 拒绝，status 报已停止，实例不受影响', eleven), async t => {
  const w = await world(t);
  const old = await install(w, 'codex', 'frozen', '0.10.2'); await install(w, 'codex', 'released', '0.10.3');
  const codex011 = await install(w, 'codex', eleven, '0.11.0');
  await seedInstance(w, codex011, { project: w.projectA });
  const before = await recordBytes(w);
  for (const action of ['start', 'restart', 'stop']) {
    const args = action === 'stop' ? ['stop'] : [action, '--project', w.projectA];
    const result = await run(process.execPath, [path.join(old.skillRoot, 'scripts/launch.mjs'), ...args], { env: w.env, cwd: w.projectA });
    assert.equal(result.code, 1, action); assert.match(result.stderr, /无法核实|另一个源码实例/, action);
  }
  const status = await run(process.execPath, [path.join(old.skillRoot, 'scripts/launch.mjs'), 'status'], { env: w.env, cwd: w.projectA });
  assert.equal(JSON.parse(status.stdout).status, 'stopped');
  assert.equal(await recordBytes(w), before);
  assert.equal((await health(await record(w))).appVersion, '0.11.0');
  await invariants(w);
});

for (const eleven of ELEVEN) gated(named('R-03 0.11 实例未运行时执行 0.10.2 的 start：删除记录后启动自己，服务因计划文件 version 2 启动失败，计划不变（已知残留 Q8）', eleven), async t => {
  const w = await world(t);
  const old = await install(w, 'codex', 'frozen', '0.10.2'); await install(w, 'codex', 'released', '0.10.3');
  const codex011 = await install(w, 'codex', eleven, '0.11.0');
  await seedRuntime(w, old.appPath);
  await seedInstance(w, codex011, { project: w.projectA, stopped: true });
  const result = await run(process.execPath, [path.join(old.skillRoot, 'scripts/launch.mjs'), 'start', '--project', w.projectA], { env: w.env, cwd: w.projectA, timeout: 120000 });
  assert.notEqual(result.code, 0, result.stdout); assert.match(result.stderr, /未能启动/);
  await failedOnPlan(w);
  await invariants(w);
});

for (const eleven of ELEVEN) gated(named('R-04 Claude 侧仍加载 0.10.2 代码的旧会话：归属不符而拒绝，实例不受影响（已知残留 Q9）', eleven), async t => {
  const w = await world(t);
  const old = await install(w, 'claude', 'frozen', '0.10.2'); await install(w, 'codex', 'released', '0.10.3');
  const codex011 = await install(w, 'codex', eleven, '0.11.0');
  await seedInstance(w, codex011, { project: w.projectA });
  const before = await recordBytes(w);
  for (const action of ['start', 'restart', 'stop']) {
    const args = action === 'stop' ? ['stop'] : [action, '--project', w.projectA];
    const result = await run(process.execPath, [path.join(old.skillRoot, 'scripts/launch.mjs'), ...args], { env: w.env, cwd: w.projectA });
    assert.equal(result.code, 1, action); assert.match(result.stderr, /无法核实|另一个源码实例/, action);
  }
  assert.equal(await recordBytes(w), before);
  assert.equal((await health(await record(w))).appVersion, '0.11.0');
  await invariants(w);
});

// ---------- A.5 0.11.0 gate with the real 0.11 ----------

const launchOf = (w, install, args, { extraEnv = {}, cwd = w.projectA } = {}) =>
  run('/bin/sh', [path.join(install.skillRoot, 'scripts/launch.sh'), ...args], { env: { ...w.env, ...extraEnv }, cwd, timeout: 120000 });
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };

gated('G-01/G-02/G-03 门槛：另一侧有低于 0.10.3 的安装时不接管；交互入口给出步骤，重启任务只给原因', async t => {
  const w = await world(t, { generation: 1 });
  const stale = await install(w, 'claude', 'frozen', '0.10.2'); const real = await install(w, 'codex', 'real', '0.11.0');
  let result = await launchOf(w, real, ['start', '--project', w.projectA]);
  assert.deepEqual([result.code, result.stdout], [4, ''], '非 0 退出不写 stdout（36b 6.3）');
  assert.match(result.stderr, /Claude 中装有 SkillDock 0\.10\.2/); assert.match(result.stderr, /处理步骤/);
  assert.ok(result.stderr.includes(stale.dest), 'G-03：列出构成“已安装”判定的缓存目录');
  result = await launchOf(w, real, ['restart'], { extraEnv: { SKILLDOCK_RESTART_JOB: 'job' } });
  assert.deepEqual([result.code, result.stdout], [4, '']); assert.match(result.stderr, /低于 0\.10\.3/);
  for (const name of ['launcher.json', 'project.json', 'restart.json', 'background', 'generation.json']) assert.equal(await exists(path.join(w.state, name)), false, name);
  await invariants(w);
});

// V18 (HLD 9.3): the gate's combinations of environments, through the real 0.11.0 launcher.
gated('V18-a 只有 Codex 装着 SkillDock，Claude 配置目录存在但 Claude 无法确认：门槛照常通过并接管（MR-SDX-001）', async t => {
  const w = await world(t, { generation: 1 });
  await install(w, 'codex', 'released', '0.10.3'); const real = await install(w, 'codex', 'real', '0.11.0');
  assert.equal(await exists(w.claudeConfig), true, 'Claude 配置目录存在');
  const result = await launchOf(w, real, ['start', '--project', w.projectA]);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stderr, /Claude 命令行不可用，改用安装记录/, '门槛走的是“无法确认”分支');
  assert.equal(JSON.parse(await fs.readFile(path.join(w.state, 'generation.json'), 'utf8')).generation, 2);
  assert.equal((await record(w)).running.appPath, real.appPath);
});

gated('V18-b 只有 Claude 装着 SkillDock，残留 ~/.codex 中没有 SkillDock：门槛通过并接管', async t => {
  const w = await world(t, { generation: 1 });
  await install(w, 'claude', 'released', '0.10.3'); const real = await install(w, 'claude', 'real', '0.11.0');
  assert.equal(await exists(path.join(w.codexHome, 'config.toml')), true, '残留的 Codex 配置');
  const result = await launchOf(w, real, ['start', '--project', w.projectA]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(JSON.parse(await fs.readFile(path.join(w.state, 'generation.json'), 'utf8')).generation, 2);
  assert.equal((await record(w)).running.appPath, real.appPath);
});

gated('V18-c/d 只有 Claude 装着 SkillDock，残留 ~/.codex 中有 0.10.2：不接管，列出残留位置；一键更新不可执行时给出原因与手动步骤', async t => {
  const w = await world(t, { generation: 1 });
  const stale = await install(w, 'codex', 'frozen', '0.10.2'); const real = await install(w, 'claude', 'real', '0.11.0');
  let result = await launchOf(w, real, ['start', '--project', w.projectA]);
  assert.deepEqual([result.code, result.stdout], [4, '']);
  assert.ok(result.stderr.includes(`缓存目录 ${stale.dest}`), '列出构成“已安装”判定的缓存目录');
  assert.ok(result.stderr.includes(`${path.join(w.codexHome, 'config.toml')} 中 skilldock@${MARKET} 的条目`), '列出配置条目');
  assert.doesNotMatch(result.stderr, /跳过/, '不提供跳过');
  result = await launchOf(w, real, ['start', '--project', w.projectA], { extraEnv: { SKILLDOCK_UPDATE_AGENT: 'codex' } });
  assert.deepEqual([result.code, result.stdout], [4, '']);
  assert.match(result.stderr, /未找到可用的 Codex 命令行，无法一键更新/);
  assert.match(result.stderr, /处理步骤/);
  for (const name of ['launcher.json', 'generation.json', 'background']) assert.equal(await exists(path.join(w.state, name)), false, name);
  await invariants(w);
});

gated('G-05 0.11 停止实例：记录改为“已停止”形态而不删除；0.10.3 不走第 2 步', async t => {
  const w = await world(t);
  await install(w, 'codex', 'released', '0.10.3'); const real = await install(w, 'claude', 'real', '0.11.0');
  const stopped = await seedInstance(w, real, { project: w.projectA, stopped: true });
  assert.deepEqual([stopped.format, stopped.status], [2, 'stopped']);
  const result = await launch0103(w, ['start']);
  assert.equal(result.code, 0, result.stderr);
  assert.equal((await invocations(w)).length, 1, '第 3 步调用 0.11 启动新实例');
  const next = await record(w);
  assert.equal(next.status, 'running'); assert.notEqual(next.pid, stopped.pid);
  await invariants(w);
});

gated('G-06 真实 0.11 写下的记录与健康检查满足 36a 5.2 与 36c 4', async t => {
  const w = await world(t);
  const codex = await install(w, 'codex', 'real', '0.11.0'); const claude = await install(w, 'claude', 'real', '0.11.0');
  await seedInstance(w, claude, { project: w.projectA });
  const rec = JSON.parse(await recordBytes(w)); const h = await health(rec);
  const legacy = path.join(w.state, 'compat/legacy-project');
  assert.match(rec.url, /^http:\/\/127\.0\.0\.1:\d+$/); assert.equal(rec.state, w.state);
  assert.equal(rec.project, legacy); assert.equal(rec.projectContext, null);
  assert.notEqual(h.project, legacy); assert.notEqual(h.launchProject, legacy);
  assert.equal(rec.source, codex.appPath, '旧来源取 Codex 侧同源最高版本');
  assert.equal(JSON.stringify(rec.installation), JSON.stringify({ kind: 'plugin', codexHome: w.codexHome, marketplace: MARKET, plugin: 'skilldock', appPath: 'skills/skill-manager/assets/app' }), 'installation 键顺序');
  assert.deepEqual([rec.format, rec.generation, rec.status, rec.running.appPath, rec.preferred.appPath, rec.actualProject], [2, 2, 'running', claude.appPath, claude.appPath, w.projectA]);
  assert.deepEqual([h.app, h.pid, h.state, h.sourceDigest, typeof h.instanceId], ['skilldock', rec.pid, w.state, rec.digest, 'string']);
  assert.deepEqual([h.appVersion, h.apiVersion, h.dataGeneration, h.minimumCompatibleGeneration], ['0.11.0', 2, 2, 2]);
  assert.ok(h.restart == null);
  assert.equal(JSON.stringify(h.installations).includes(w.root), false, 'installations 不含路径');
  await invariants(w);
});

gated('G-07 代号 2、launcher.json 被删除：0.11 服务补写反映实际状态的记录', async t => {
  const w = await world(t);
  const real = await install(w, 'codex', 'real', '0.11.0');
  const seeded = await seedInstance(w, real, { project: w.projectA });
  await fs.rm(path.join(w.state, 'launcher.json'));
  // Health requests trigger the check (at most every 2 seconds); a 10-second timer is the fallback.
  for (let i = 0; i < 60 && !(await exists(path.join(w.state, 'launcher.json'))); i++) { await health(seeded); await new Promise(resolve => setTimeout(resolve, 250)); }
  const restored = await record(w);
  assert.deepEqual([restored.status, restored.pid, restored.url], ['running', seeded.pid, seeded.url]);
  await invariants(w);
});

gated('G-01 一键更新（阶段 5d2b）：交互入口经用户同意后，启动器经该侧命令行更新被门槛拦下的 SkillDock，读回后重新检查并接管', async t => {
  const w = await world(t, { generation: 1 });
  const stale = await install(w, 'claude', 'frozen', '0.10.2'); const real = await install(w, 'codex', 'real', '0.11.0');
  const next = await install(w, 'claude', 'sample', '0.10.3');
  const listed = path.join(w.root, 'claude-listed.json'); const calls = path.join(w.root, 'claude-calls');
  const entry = (version, installPath) => JSON.stringify([{ id: `skilldock@${MARKET}`, scope: 'user', enabled: true, version, installPath }]);
  await fs.writeFile(listed, entry('0.10.2', stale.dest));
  // A stand-in Claude command line: updating marks the replaced version orphaned, as Claude does.
  const cli = path.join(w.root, 'claude-stand-in');
  await fs.writeFile(cli, `#!${process.execPath}
const fs = require('node:fs'); const a = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(calls)}, a.join(' ') + '\\n');
if (a[0] === '--version') console.log('2.1.288 (Claude Code)');
else if (a[0] === 'plugin' && a[1] === 'list') console.log(fs.readFileSync(${JSON.stringify(listed)}, 'utf8'));
else if (a[0] === 'plugin' && a[1] === 'update') { fs.writeFileSync(${JSON.stringify(path.join(stale.dest, '.orphaned_at'))}, '1'); fs.writeFileSync(${JSON.stringify(listed)}, ${JSON.stringify(entry('0.10.3', next.dest))}); console.log('{"outcome":"ok"}'); }
else console.log('{"outcome":"ok"}');
`, { mode: 0o755 });
  const result = await launchOf(w, real, ['start', '--project', w.projectA], { extraEnv: { SKILLDOCK_UPDATE_AGENT: 'claude', SKILLDOCK_CLAUDE_BIN: cli } });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stderr, /已把 Claude 中的 SkillDock 从 0\.10\.2 更新到 0\.10\.3/);
  const ran = (await fs.readFile(calls, 'utf8')).split('\n').filter(line => / (update|marketplace) /.test(` ${line} `) && !line.startsWith('plugin list'));
  assert.deepEqual(ran.slice(0, 2), [`plugin marketplace update ${MARKET} --json`, `plugin update skilldock@${MARKET} --scope user --json`]);
  assert.equal(JSON.parse(await fs.readFile(path.join(w.state, 'generation.json'), 'utf8')).generation, 2, '门槛通过后接管');
  assert.deepEqual([(await record(w)).status, (await record(w)).running.appPath], ['running', real.appPath]);
});

gated('G-08 0.10.x 自更新以重启任务调用 0.11：门槛通过后按固定顺序迁移，任务记为 ready', async t => {
  const w = await world(t, { generation: 1 });
  const old = await install(w, 'codex', 'frozen', '0.10.2'); await install(w, 'codex', 'released', '0.10.3');
  const real = await install(w, 'codex', 'real', '0.11.0');
  await seedRuntime(w, old.appPath);
  const started = await run(process.execPath, [path.join(old.skillRoot, 'scripts/launch.mjs'), 'start', '--project', w.projectA], { env: w.env, cwd: w.projectA, timeout: 120000 });
  assert.equal(started.code, 0, started.stderr);
  const v1 = await record(w);
  assert.equal(v1.format, undefined); assert.equal((await health(v1)).pid, v1.pid);
  // 36b 7.1: what the 0.10.x coordinator writes and how it runs the new launcher.
  const job = { id: crypto.randomUUID(), source: real.appPath, sourceDigest: 'from-0.10.2', previousPid: v1.pid, url: v1.url, status: 'preparing', requestedAt: new Date().toISOString() };
  await fs.writeFile(path.join(w.state, 'restart.json'), JSON.stringify(job));
  const result = await launchOf(w, real, ['restart'], { extraEnv: { CODEX_HOME: w.codexHome, SKILLDOCK_PROJECT_DIR: w.projectA, SKILLDOCK_RESTART_JOB: job.id } });
  assert.equal(result.code, 0, result.stderr);
  const done = JSON.parse(await fs.readFile(path.join(w.state, 'restart.json'), 'utf8'));
  const next = await record(w);
  assert.deepEqual([done.status, done.pid, typeof done.executor.pid], ['ready', next.pid, 'number']);
  assert.deepEqual([next.format, next.status, next.running.appPath], [2, 'running', real.appPath]);
  assert.equal(JSON.parse(await fs.readFile(path.join(w.state, 'generation.json'), 'utf8')).generation, 2);
  assert.equal(JSON.parse(await fs.readFile(path.join(w.state, 'local/updates.json'), 'utf8')).version, 2);
  assert.equal(alive(v1.pid), false, '旧实例已停止');
  assert.deepEqual([(await health(next)).appVersion, (await health(next)).dataGeneration], ['0.11.0', 2]);
  assert.equal(await exists(path.join(w.home, 'Library/LaunchAgents')), false);
});

gated('G-09 0.10.2 后台入口以 1 版上下文加载 0.11 工作进程（代号 1）：按代号 1 工作，不迁移、不写新格式文件', async t => {
  const w = await world(t, { generation: 1 });
  const old = await install(w, 'codex', 'frozen', '0.10.2'); const real = await install(w, 'codex', 'real', '0.11.0');
  const runtime = await seedRuntime(w, real.appPath);
  const context = path.join(w.state, 'background/context.json');
  await fs.mkdir(path.dirname(context), { recursive: true });
  await fs.writeFile(context, JSON.stringify({ version: 1, stateDir: w.state, home: w.home, codexHome: w.codexHome, projectDir: w.projectA, runtime, source: real.appPath,
    installation: { kind: 'plugin', codexHome: w.codexHome, marketplace: MARKET, plugin: 'skilldock', appPath: 'skills/skill-manager/assets/app' }, node: process.execPath, environment: {} }));
  const contextHash = await sha(context);
  const result = await run(process.execPath, [path.join(old.appPath, 'server/background-entry.mjs'), context], { env: w.env, cwd: w.root });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(JSON.parse(await fs.readFile(path.join(w.state, 'background/status.json'), 'utf8')).outcome, 'disabled');
  for (const name of ['generation.json', 'compat/launcher-record.json', 'compat/migration-failure.json', 'instance.lock', 'launcher.json']) assert.equal(await exists(path.join(w.state, name)), false, name);
  assert.equal(await sha(context), contextHash);
  await invariants(w);
});

gated('G-10 0.11 源码布局：0.10.2 冻结代码的快照、运行目录与核验都能通过', async t => {
  const w = await world(t);
  const old = await install(w, 'codex', 'frozen', '0.10.2'); const real = await install(w, 'codex', 'real', '0.11.0');
  const { runtime } = await builtRuntime(real.appPath, old.appPath);
  const worker = await fs.readFile(path.join(runtime, 'server/background-worker.mjs'), 'utf8');
  assert.match(worker, /export async function runBackground\(context/);
});
