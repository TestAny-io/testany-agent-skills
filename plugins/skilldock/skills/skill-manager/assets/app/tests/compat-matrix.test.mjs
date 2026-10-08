// SPDX-License-Identifier: AGPL-3.0-only
// Compatibility matrix, 0.10.3 gate (DEC-SDX-027; API-SDX-001 36b Appendix A).
// Real 0.10.2 code comes from Git history; 0.10.3 is this working tree; 0.11.x is the
// hand-written sample in fixtures/skilldock-0.11-sample. Everything runs in a temporary
// HOME with no network access requirements.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import { execFile, execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const FROZEN_0102 = 'ab6856f6f54fd73e6a420d23e7922e9b8e213d70';
const MARKET = 'testany-agent-skills';
const SOURCE = 'https://github.com/TestAny-io/testany-agent-skills.git';
const pluginRoot = fileURLToPath(new URL('../../../../../', import.meta.url));
const sample = fileURLToPath(new URL('./fixtures/skilldock-0.11-sample/', import.meta.url));
// Installed caches contain the tracked tree; 0.10.2 captureSource requires assets/app/tests.
const COPY_EXCLUDED = new Set(['node_modules', 'dist', 'test-results', 'playwright-report', 'references', '.source-snapshot', '.git']);

let repository;
try { repository = execFileSync('git', ['-C', pluginRoot, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim(); } catch { repository = null; }
const gated = repository ? test : test.skip;
let frozenTree;
async function frozen0102() {
  frozenTree ??= (async () => {
    const target = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock-0.10.2-')));
    const archive = execFileSync('git', ['-C', repository, 'archive', FROZEN_0102, 'plugins/skilldock'], { maxBuffer: 256 * 1024 * 1024 });
    await fs.writeFile(path.join(target, 'tree.tar'), archive);
    execFileSync('tar', ['-xf', path.join(target, 'tree.tar'), '-C', target]);
    process.once('exit', () => { try { execFileSync('rm', ['-rf', target]); } catch { /* best effort */ } });
    return path.join(target, 'plugins/skilldock');
  })();
  return frozenTree;
}

const filter = source => !COPY_EXCLUDED.has(path.basename(source));
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

async function world(t, { codexSource = SOURCE, claudeSource = { source: 'git', url: SOURCE } } = {}) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock-compat-')));
  const home = path.join(root, 'home'); const state = path.join(root, 'state');
  const codexHome = path.join(home, '.codex'); const claudeConfig = path.join(home, '.claude');
  const projectA = path.join(root, 'project-a'); const projectB = path.join(root, 'project-b');
  for (const dir of [codexHome, path.join(claudeConfig, 'plugins/cache'), projectA, projectB, path.join(state, 'local'), path.join(state, 'compat/legacy-project')])
    await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(codexHome, 'config.toml'), `[marketplaces.${MARKET}]\nlast_updated = "2026-10-08T00:00:00Z"\nsource_type = "git"\nsource = "${codexSource}"\n`);
  await fs.writeFile(path.join(claudeConfig, 'plugins/known_marketplaces.json'), JSON.stringify({ [MARKET]: { source: claudeSource, installLocation: path.join(claudeConfig, 'plugins/marketplaces', MARKET) } }));
  await fs.writeFile(path.join(state, 'local/updates.json'), JSON.stringify({ version: 2, schedule: { enabled: true }, bindings: {}, observations: {}, runs: [], activity: [] }));
  await fs.writeFile(path.join(state, 'generation.json'), JSON.stringify({ format: 1, generation: 2, minimumCompatibleGeneration: 2, writtenBy: '0.11.0', writtenAt: new Date().toISOString() }));
  const port = await freePort();
  const env = { HOME: home, PATH: '/usr/bin:/bin', SKILLDOCK_STATE_DIR: state, SKILLDOCK_NODE_BIN: process.execPath, PORT: String(port), npm_config_cache: path.join(root, 'npm-cache') };
  const w = { root, home, state, codexHome, claudeConfig, claudeCache: path.join(claudeConfig, 'plugins/cache'), projectA, projectB, port, env, installs: {} };
  w.planHash = await sha(path.join(state, 'local/updates.json'));
  t.after(async () => {
    const pids = (await fs.readFile(path.join(root, 'stub-pids'), 'utf8').catch(() => '')).split('\n').filter(Boolean).map(Number);
    for (const pid of pids) { try { process.kill(pid, 'SIGTERM'); } catch { /* exited */ } }
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
  } else {
    await fs.cp(kind === 'frozen' ? await frozen0102() : pluginRoot, dest, { recursive: true, filter });
  }
  const appPath = path.join(dest, 'skills/skill-manager/assets/app');
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

gated('N-01/N-02a Codex 侧有 0.11：已打开与首次打开都代理到运行实例，项目不变', async t => {
  const w = await world(t);
  await install(w, 'codex', 'frozen', '0.10.2'); await install(w, 'codex', 'current', '0.10.3');
  const codex011 = await install(w, 'codex', 'sample', '0.11.0');
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

gated('N-02b 首次打开且 project.json 与运行项目不同：按显式项目切换（同 0.10.2 自身行为）', async t => {
  const w = await world(t);
  await install(w, 'codex', 'frozen', '0.10.2'); await install(w, 'codex', 'current', '0.10.3');
  const codex011 = await install(w, 'codex', 'sample', '0.11.0');
  await seedInstance(w, codex011, { project: w.projectA });
  await fs.writeFile(path.join(w.state, 'project.json'), JSON.stringify({ path: w.projectB, recent: [] }));
  const result = await (await native0102(w)).read('/api/health');
  assert.equal(result.data.project, w.projectB);
  await invariants(w);
});

gated('N-03 Codex 侧有 0.11、实例已停止：调用 0.11 启动新实例，项目来自回退而非数据目录', async t => {
  const w = await world(t);
  await install(w, 'codex', 'frozen', '0.10.2'); await install(w, 'codex', 'current', '0.10.3');
  const codex011 = await install(w, 'codex', 'sample', '0.11.0');
  await seedInstance(w, codex011, { project: w.projectA, stopped: true });
  const result = await (await native0102(w)).read('/api/health');
  assert.equal(result.data.project, w.projectA, '取启动记录中保存的实际项目（第④级）');
  await invariants(w);
});

gated('N-04/N-05 Codex 侧只有 0.10.3、实例运行中、无 project.json：交还，记录逐字节不变', async t => {
  const w = await world(t);
  await install(w, 'codex', 'frozen', '0.10.2'); await install(w, 'codex', 'current', '0.10.3');
  const claude011 = await install(w, 'claude', 'sample', '0.11.0');
  await seedInstance(w, claude011, { project: w.projectA });
  const before = await recordBytes(w);
  const backend = await native0102(w);
  assert.equal((await backend.read('/api/health')).data.appVersion, '0.11.0');
  assert.equal(await recordBytes(w), before);
  assert.equal((await invocations(w)).length, 0, '第 2 步不调用较新启动器');
  assert.equal((await backend.read('/api/health')).data.project, w.projectA);
  await invariants(w);
});

gated('N-06 project.json 等于运行项目：交还', async t => {
  const w = await world(t);
  await install(w, 'codex', 'frozen', '0.10.2'); await install(w, 'codex', 'current', '0.10.3');
  const claude011 = await install(w, 'claude', 'sample', '0.11.0');
  await seedInstance(w, claude011, { project: w.projectA });
  await fs.writeFile(path.join(w.state, 'project.json'), JSON.stringify({ path: w.projectA, recent: [] }));
  const before = await recordBytes(w);
  await (await native0102(w)).read('/api/health');
  assert.equal(await recordBytes(w), before); assert.equal((await invocations(w)).length, 0);
  await invariants(w);
});

gated('N-07 project.json 与运行项目不同：第 3 步转发项目并切换', async t => {
  const w = await world(t);
  await install(w, 'codex', 'frozen', '0.10.2'); await install(w, 'codex', 'current', '0.10.3');
  const claude011 = await install(w, 'claude', 'sample', '0.11.0');
  await seedInstance(w, claude011, { project: w.projectA });
  await fs.writeFile(path.join(w.state, 'project.json'), JSON.stringify({ path: w.projectB, recent: [] }));
  const result = await (await native0102(w)).read('/api/health');
  assert.equal(result.data.project, w.projectB);
  const [call] = await invocations(w);
  assert.equal(call.requested, w.projectB); assert.equal(call.handover, '1'); assert.equal(call.handoverAgent, 'codex'); assert.equal(call.cwd, w.state);
  await invariants(w);
});

for (const variant of ['preferred', 'fallback']) gated(`N-08/N-09 实例未运行，Claude 侧 0.11 为${variant === 'preferred' ? '首选' : '兜底'}：转交并启动`, async t => {
  const w = await world(t);
  await install(w, 'codex', 'frozen', '0.10.2'); await install(w, 'codex', 'current', '0.10.3');
  const claude011 = await install(w, 'claude', 'sample', '0.11.0');
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

gated('N-10 没有可用的同源 ≥0.11 安装：0.10.3 退出 3，0.10.2 显示固定错误，不启动任何进程', async t => {
  const w = await world(t);
  await install(w, 'codex', 'frozen', '0.10.2'); await install(w, 'codex', 'current', '0.10.3');
  const claude011 = await install(w, 'claude', 'sample', '0.11.0');
  await seedInstance(w, claude011, { project: w.projectA, stopped: true });
  await fs.writeFile(path.join(claude011.dest, '.orphaned_at'), '1');
  const before = await recordBytes(w);
  await assert.rejects((await native0102(w)).read('/api/health'), /redact is not a function/);
  assert.equal(await recordBytes(w), before); assert.equal((await invocations(w)).length, 0);
  await invariants(w);
});

gated('N-11 被调用的 0.11 失败：0.10.3 退出 1，0.10.2 显示固定错误，计划数据不变', async t => {
  const w = await world(t);
  await install(w, 'codex', 'frozen', '0.10.2'); await install(w, 'codex', 'current', '0.10.3');
  const claude011 = await install(w, 'claude', 'sample', '0.11.0');
  await seedInstance(w, claude011, { project: w.projectA, stopped: true });
  await fs.writeFile(path.join(w.root, 'stub-control.json'), JSON.stringify({ fail: true }));
  await assert.rejects((await native0102(w)).read('/api/health'), /redact is not a function/);
  assert.equal((await invocations(w)).length, 1);
  await invariants(w);
});

gated('N-13 新实例换端口：0.10.2 重读记录得到新地址', async t => {
  const w = await world(t);
  await install(w, 'codex', 'frozen', '0.10.2'); await install(w, 'codex', 'current', '0.10.3');
  const claude011 = await install(w, 'claude', 'sample', '0.11.0');
  await seedInstance(w, claude011, { project: w.projectA, stopped: true });
  const moved = await freePort();
  await fs.writeFile(path.join(w.root, 'stub-control.json'), JSON.stringify({ forcePort: moved }));
  const result = await (await native0102(w)).read('/api/health');
  assert.equal(result.data.appVersion, '0.11.0'); assert.equal((await record(w)).url, `http://127.0.0.1:${moved}`);
  await invariants(w);
});

gated('N-16 原生入口环境有 SKILLDOCK_PROJECT_DIR：以它调用 0.10.3，实例运行中且项目不同则切换', async t => {
  const w = await world(t);
  await install(w, 'codex', 'frozen', '0.10.2'); await install(w, 'codex', 'current', '0.10.3');
  const claude011 = await install(w, 'claude', 'sample', '0.11.0');
  await seedInstance(w, claude011, { project: w.projectA });
  const backend = await native0102(w, { SKILLDOCK_PROJECT_DIR: w.projectB });
  assert.equal((await backend.read('/api/health')).data.project, w.projectB);
  assert.equal((await invocations(w))[0].requested, w.projectB);
  await invariants(w);
});

gated('N-17 切换项目时较新启动器失败：0.10.3 回落交还，0.10.2 代理到原实例', async t => {
  const w = await world(t);
  await install(w, 'codex', 'frozen', '0.10.2'); await install(w, 'codex', 'current', '0.10.3');
  const claude011 = await install(w, 'claude', 'sample', '0.11.0');
  await seedInstance(w, claude011, { project: w.projectA });
  await fs.writeFile(path.join(w.state, 'project.json'), JSON.stringify({ path: w.projectB, recent: [] }));
  await fs.writeFile(path.join(w.root, 'stub-control.json'), JSON.stringify({ noisyFail: true }));
  const before = await recordBytes(w);
  assert.equal((await (await native0102(w)).read('/api/health')).data.project, w.projectA);
  assert.equal(await recordBytes(w), before);
  await invariants(w);
});

// ---------- A.2 0.10.3 own entry ----------

gated('S-01 本安装有 ≥0.11 缓存：第 1 步转交，转发动作与项目', async t => {
  const w = await world(t);
  await install(w, 'codex', 'current', '0.10.3'); await install(w, 'codex', 'sample', '0.11.0');
  const result = await launch0103(w, ['start', '--project', w.projectB]);
  assert.equal(result.code, 0, result.stderr);
  const [call] = await invocations(w);
  assert.deepEqual([call.version, call.agent, call.action, call.requested, call.cwd], ['0.11.0', 'codex', 'start', w.projectB, w.state]);
  assert.equal(call.handoverFrom, '0.10.3');
  assert.equal((await health(await record(w))).project, w.projectB);
  await invariants(w);
});

gated('S-02 实例运行中、项目相同或缺省：第 2 步交还，输出沿用结果，记录不变', async t => {
  const w = await world(t);
  await install(w, 'codex', 'current', '0.10.3'); const claude011 = await install(w, 'claude', 'sample', '0.11.0');
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

gated('S-03/S-04 实例运行中收到不同的有效项目：可转交则切换，否则交还并说明未切换', async t => {
  const w = await world(t);
  await install(w, 'codex', 'current', '0.10.3'); const claude011 = await install(w, 'claude', 'sample', '0.11.0');
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

gated('S-05/S-06 实例未运行：有目标则转交；无任何目标则退出 3 并提示更新本侧', async t => {
  const w = await world(t);
  await install(w, 'codex', 'current', '0.10.3');
  let result = await launch0103(w, ['start']);
  assert.equal(result.code, 3);
  const output = JSON.parse(result.stdout);
  assert.deepEqual([output.status, output.agent, output.requiredVersion], ['update-required', 'codex', '0.11.0']);
  assert.match(result.stderr, /请把 Codex 中的 SkillDock 更新到 0\.11/);
  await install(w, 'claude', 'sample', '0.11.0');
  result = await launch0103(w, ['start']);
  assert.equal(result.code, 0, result.stderr);
  assert.equal((await invocations(w))[0].agent, 'claude');
  await invariants(w);
});

gated('S-07/S-08 第 1 步被调用方失败：有运行实例则回落交还，否则退出 1', async t => {
  const w = await world(t);
  await install(w, 'codex', 'current', '0.10.3'); const codex011 = await install(w, 'codex', 'sample', '0.11.0');
  await seedInstance(w, codex011, { project: w.projectA });
  await fs.writeFile(path.join(w.root, 'stub-control.json'), JSON.stringify({ noisyFail: true }));
  let result = await launch0103(w, ['start']);
  assert.equal(result.code, 0); assert.match(JSON.parse(result.stdout).warning, /较新版本启动失败/);
  const rec = await record(w); process.kill(rec.pid, 'SIGTERM'); await new Promise(resolve => setTimeout(resolve, 300));
  result = await launch0103(w, ['start']);
  assert.equal(result.code, 1); assert.match(result.stderr, /样本启动器按测试要求失败/);
  assert.equal((await invocations(w)).length, 2, '第 1 步失败后不再尝试第 3 步');
  await invariants(w);
});

gated('S-09/S-10 status、stop、restart：转发同一动作；无目标时退出 3', async t => {
  const w = await world(t);
  await install(w, 'codex', 'current', '0.10.3'); const claude011 = await install(w, 'claude', 'sample', '0.11.0');
  await seedInstance(w, claude011, { project: w.projectA });
  assert.equal((await launch0103(w, ['status'])).code, 0);
  assert.equal((await launch0103(w, ['stop'])).code, 0);
  assert.equal((await record(w)).status, 'stopped');
  assert.deepEqual((await invocations(w)).map(call => call.action), ['status', 'stop']);
  await fs.writeFile(path.join(claude011.dest, '.orphaned_at'), '1');
  for (const action of ['status', 'stop', 'restart']) assert.equal((await launch0103(w, [action])).code, 3);
  await invariants(w);
});

gated('S-11/S-12 带 Claude 会话变量调用另一侧：正常完成，变量原样传给被调用方', async t => {
  const w = await world(t);
  await install(w, 'codex', 'current', '0.10.3'); await install(w, 'claude', 'sample', '0.11.0');
  const result = await launch0103(w, ['start'], { CLAUDECODE: '1', CLAUDE_CODE_ENTRYPOINT: 'claude-desktop', SKILLDOCK_RESTART_JOB: 'stale-job' });
  assert.equal(result.code, 0, result.stderr);
  const [call] = await invocations(w);
  assert.equal(call.claudeSession, true); assert.equal(call.restartJob, null, '不传递旧重启任务');
  await invariants(w);
});

gated('S-13 设置了 SKILLDOCK_PROJECT_DIR、未传 --project：新实例取该项目', async t => {
  const w = await world(t);
  await install(w, 'codex', 'current', '0.10.3'); await install(w, 'claude', 'sample', '0.11.0');
  const result = await launch0103(w, ['start'], { SKILLDOCK_PROJECT_DIR: w.projectB });
  assert.equal(result.code, 0, result.stderr);
  assert.equal((await health(await record(w))).project, w.projectB);
  await invariants(w);
});

gated('S-14/S-15 自定义 Claude 目录与废弃目录：按根目录记录找到有效安装，忽略废弃目录', async t => {
  const w = await world(t);
  await install(w, 'codex', 'current', '0.10.3');
  const custom = path.join(w.root, 'custom-claude');
  await fs.mkdir(path.join(custom, 'plugins/cache'), { recursive: true });
  await fs.cp(path.join(w.claudeConfig, 'plugins/known_marketplaces.json'), path.join(custom, 'plugins/known_marketplaces.json'));
  await fs.rm(w.claudeConfig, { recursive: true });
  w.claudeCache = path.join(custom, 'plugins/cache');
  await install(w, 'claude', 'sample', '0.11.0'); const orphan = await install(w, 'claude', 'sample', '0.11.2');
  await fs.writeFile(path.join(orphan.dest, '.orphaned_at'), '1');
  await fs.mkdir(path.join(w.state, 'agents'), { recursive: true });
  await fs.writeFile(path.join(w.state, 'agents/claude-root.json'), JSON.stringify({ format: 1, configDir: custom, pluginCacheDir: path.join(custom, 'plugins/cache'), origin: 'explicit', updatedAt: new Date().toISOString() }));
  const result = await launch0103(w, ['start']);
  assert.equal(result.code, 0, result.stderr);
  assert.equal((await invocations(w))[0].version, '0.11.0');
  await invariants(w);
});

gated('S-16 本侧 marketplace 指向 fork：第 3 步不可用，退出 3', async t => {
  const w = await world(t, { codexSource: 'https://github.com/someone/testany-agent-skills.git' });
  await install(w, 'codex', 'current', '0.10.3'); await install(w, 'claude', 'sample', '0.11.0');
  assert.equal((await launch0103(w, ['start'])).code, 3);
  assert.equal((await invocations(w)).length, 0);
  await invariants(w);
});

gated('S-17a/S-17b 迁移持锁时退出 1；取锁后发现迁移完成则改走转交链，不写文件', async t => {
  const w = await world(t);
  const own = await install(w, 'codex', 'current', '0.10.3'); await install(w, 'claude', 'sample', '0.11.0');
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
  assert.equal(await exists(path.join(w.state, 'launcher.json')), false); assert.equal(await exists(path.join(w.state, 'runtimes')), false);
  await invariants(w);
});

gated('S-19 --project 不存在或是文件：视为无效项目', async t => {
  const w = await world(t);
  await install(w, 'codex', 'current', '0.10.3'); const claude011 = await install(w, 'claude', 'sample', '0.11.0');
  await seedInstance(w, claude011, { project: w.projectA });
  const file = path.join(w.root, 'plain-file'); await fs.writeFile(file, 'x');
  for (const value of [path.join(w.root, 'missing'), file]) {
    const result = await launch0103(w, ['start', '--project', value]);
    assert.equal(result.code, 0); assert.equal(JSON.parse(result.stdout).project, w.projectA); assert.equal(JSON.parse(result.stdout).projectNotSwitched, undefined);
  }
  assert.equal((await invocations(w)).length, 0);
  await invariants(w);
});

gated('S-20 切换项目时较新启动器失败：回落交还，stdout 只有一个 JSON', async t => {
  const w = await world(t);
  await install(w, 'codex', 'current', '0.10.3'); const claude011 = await install(w, 'claude', 'sample', '0.11.0');
  await seedInstance(w, claude011, { project: w.projectA });
  await fs.writeFile(path.join(w.root, 'stub-control.json'), JSON.stringify({ noisyFail: true }));
  const result = await launch0103(w, ['start', '--project', w.projectB]);
  assert.equal(result.code, 0);
  const output = JSON.parse(result.stdout);
  assert.equal(output.projectNotSwitched, w.projectB); assert.match(output.warning, /较新版本启动失败/);
  assert.match(result.stderr, /partial-output-before-failure/, '被调用方的 stdout 转到 stderr');
  await invariants(w);
});

gated('S-21 已带 SKILLDOCK_HANDOVER 的环境：不再转交', async t => {
  const w = await world(t);
  await install(w, 'codex', 'current', '0.10.3'); const claude011 = await install(w, 'claude', 'sample', '0.11.0');
  await seedInstance(w, claude011, { project: w.projectA });
  let result = await launch0103(w, ['start', '--project', w.projectB], { SKILLDOCK_HANDOVER: '1' });
  assert.equal(result.code, 0); assert.equal(JSON.parse(result.stdout).projectNotSwitched, w.projectB);
  process.kill((await record(w)).pid, 'SIGTERM'); await new Promise(resolve => setTimeout(resolve, 300));
  result = await launch0103(w, ['start'], { SKILLDOCK_HANDOVER: '1' });
  assert.equal(result.code, 3); assert.equal((await invocations(w)).length, 0);
  await invariants(w);
});

gated('S-22 运行中的安装与首选启动目标不同：第 2 步交还，记录不变', async t => {
  const w = await world(t);
  await install(w, 'codex', 'current', '0.10.3');
  const claude011 = await install(w, 'claude', 'sample', '0.11.0'); const newer = await install(w, 'claude', 'sample', '0.11.1');
  await seedInstance(w, claude011, { project: w.projectA, preferred: newer });
  const before = await recordBytes(w);
  const result = await launch0103(w, ['start']);
  assert.equal(result.code, 0); assert.equal(JSON.parse(result.stdout).appVersion, '0.11.0');
  assert.equal(await recordBytes(w), before); assert.equal((await invocations(w)).length, 0);
  await invariants(w);
});

gated('S-23 代号 1、启动记录无法解析：不触发转交链，按 0.10.2 报错', async t => {
  const w = await world(t);
  const own = await install(w, 'codex', 'current', '0.10.3');
  await fs.writeFile(path.join(w.state, 'generation.json'), JSON.stringify({ format: 1, generation: 1 }));
  await fs.writeFile(path.join(w.state, 'launcher.json'), '{broken');
  const result = await run(process.execPath, [path.join(own.skillRoot, 'scripts/launch.mjs'), 'start', '--project', w.projectA], { env: w.env, cwd: w.projectA });
  assert.equal(result.code, 1); assert.match(result.stderr, /启动记录不可读/);
  assert.equal(await fs.readFile(path.join(w.state, 'launcher.json'), 'utf8'), '{broken');
  await invariants(w);
});

gated('S-24 被调用方重启实例后失败：回落时重新读取记录，用新实例核实', async t => {
  const w = await world(t);
  await install(w, 'codex', 'current', '0.10.3'); const claude011 = await install(w, 'claude', 'sample', '0.11.0');
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

gated('S-25 被调用方 stdout 超过 64 KiB：视为失败；有运行实例则回落，否则退出 1', async t => {
  const w = await world(t);
  await install(w, 'codex', 'current', '0.10.3'); await install(w, 'claude', 'sample', '0.11.0');
  await fs.writeFile(path.join(w.root, 'stub-control.json'), JSON.stringify({ bigStdout: true }));
  let result = await launch0103(w, ['start', '--project', w.projectA]);
  assert.equal(result.code, 1); assert.equal(result.stdout, ''); assert.match(result.stderr, /超过 64 KiB/);
  result = await launch0103(w, ['start', '--project', w.projectB]);
  assert.equal(result.code, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.handover, 'running-instance'); assert.match(output.warning, /较新版本启动失败/);
  await invariants(w);
});

gated('S-27 判定点 1 触发后收到 SIGTERM：转发给被调用的 0.11 启动脚本', async t => {
  const w = await world(t);
  const own = await install(w, 'codex', 'current', '0.10.3'); await install(w, 'claude', 'sample', '0.11.0');
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

// ---------- A.3 0.10.3 background and native entry ----------

for (const [label, generation, plan] of [['B-01 代号 2', 2, 2], ['B-02 代号 1、计划文件 version 2', 1, 2]]) gated(`${label}：后台本次直接结束，不写任何文件`, async t => {
  const w = await world(t);
  const own = await install(w, 'codex', 'current', '0.10.3');
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
  const own = await install(w, 'codex', 'current', '0.10.3');
  const { createNativeBackend } = await import(pathToFileURL(path.join(own.appPath, 'server/native-backend.mjs')).href + `?w=${path.basename(w.root)}`);
  const backend = createNativeBackend({ skillRoot: own.skillRoot, env: { ...w.env, CODEX_HOME: w.codexHome, SKILLDOCK_PROJECT_DIR: w.projectA } });
  await assert.rejects(backend.read('/api/health'), error => /SkillDock 后台启动未完成。/.test(error.message) && /更新到 0\.11/.test(error.message));
  await invariants(w);
});

gated('B-04 0.10.3 原生入口、代号 2、无启动记录：调用自身启动脚本，经兜底启动 0.11 并代理', async t => {
  const w = await world(t);
  const own = await install(w, 'codex', 'current', '0.10.3'); await install(w, 'claude', 'sample', '0.11.0');
  const { createNativeBackend } = await import(pathToFileURL(path.join(own.appPath, 'server/native-backend.mjs')).href + `?b04=${path.basename(w.root)}`);
  const backend = createNativeBackend({ skillRoot: own.skillRoot, env: { ...w.env, CODEX_HOME: w.codexHome, SKILLDOCK_PROJECT_DIR: w.projectA } });
  const result = await backend.read('/api/health');
  assert.equal(result.data.appVersion, '0.11.0'); assert.equal(result.data.project, w.projectA);
  await invariants(w);
});

// ---------- A.4 0.10.2 rollback ----------

gated('R-01/R-02 0.11 实例运行中执行 0.10.2 启动器：start、restart、stop 拒绝，status 报已停止，实例不受影响', async t => {
  const w = await world(t);
  const old = await install(w, 'codex', 'frozen', '0.10.2'); await install(w, 'codex', 'current', '0.10.3');
  const codex011 = await install(w, 'codex', 'sample', '0.11.0');
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
