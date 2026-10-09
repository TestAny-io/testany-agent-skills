// SPDX-License-Identifier: AGPL-3.0-only
// Generation 1 → 2 (HLD 3.7, 6.6; API-SDX-001 36a §4–§8, 36b §7.4): the gate, the takeover
// in its fixed order, undo and fast reject after a failure, restart jobs, record restore
// and the background worker's generation rules. Everything runs in temporary directories.
import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { launch, probe } from '../../../scripts/launch.mjs';
import { MARKET, fixture, listen, installedVersion } from './helpers/launcher-fixture.mjs';
import { captureSource } from '../scripts/source-bundle.mjs';
import { prepareRuntime } from '../server/runtime.mjs';
import { backgroundPaths, runScript } from '../server/background.mjs';
import { migrationGate, writeMigrationFailure } from '../server/migration.mjs';
import { agentRoots } from '../server/installs.mjs';
import { runBackground } from '../server/background-worker.mjs';
import { restoreMissingRecord } from '../server/launcher-record.mjs';
import { writeGeneration } from '../server/generation.mjs';
import { createApp } from '../server/index.mjs';
import { acquireFileLock } from '../server/process-lock.mjs';

const exists = file => fs.lstat(file).then(() => true, () => false);
const read = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
async function freePort() { const { server, port } = await listen(); await new Promise(resolve => server.close(resolve)); return port; }

// A running 0.10.x instance: the app built into a runtime, served, with a 0.10.2-shaped record.
async function oldInstance(t, f, { port, appDir = f.appDir, codexHome = path.join(f.home, '.codex'), installation } = {}) {
  await fs.mkdir(f.stateDir, { recursive: true });
  const state = await fs.realpath(f.stateDir); const app = await fs.realpath(appDir); const project = await fs.realpath(f.projectDir);
  const snapshot = await captureSource(app); const runtime = await prepareRuntime(state, snapshot);
  const child = spawn(process.execPath, [path.join(runtime, 'server/index.mjs')], { env: { ...f.env, PORT: String(port), SKILLDOCK_STATE_DIR: state, SKILLDOCK_PROJECT_DIR: project }, detached: true, stdio: 'ignore' });
  child.unref();
  // The launcher may restore the old instance under a new pid: stop whatever the record names too.
  t.after(async () => {
    const last = await read(path.join(state, 'launcher.json')).catch(() => ({}));
    for (const pid of [child.pid, last.pid]) if (Number.isInteger(pid)) { try { process.kill(pid, 'SIGTERM'); } catch { /* exited */ } }
  });
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 80 && !(await probe(url)); i++) await new Promise(resolve => setTimeout(resolve, 100));
  const record = { url, pid: child.pid, state, project, projectContext: null, source: app, installation: installation ?? { kind: 'directory', source: app },
    digest: snapshot.sourceDigest, runtime, codexHome, cli: null, execution: { node: process.execPath, nodeVersion: process.versions.node, source: 'direct' } };
  await fs.writeFile(path.join(state, 'launcher.json'), JSON.stringify(record, null, 2));
  return record;
}

// 0.10.x data around the instance: a version-1 plan and a version-1 background registration.
async function legacyData(f, record) {
  const plan = { version: 1, schedule: { enabled: false, intervalMinutes: 1440, timezone: 'UTC', autoApply: false, targets: [], running: false }, bindings: {}, observations: {}, runs: [], activity: [{ kind: 'kept' }] };
  await fs.mkdir(path.join(record.state, 'local'), { recursive: true });
  await fs.writeFile(path.join(record.state, 'local/updates.json'), JSON.stringify(plan));
  const paths = backgroundPaths(record.state, f.home);
  await fs.mkdir(paths.root, { recursive: true });
  await fs.writeFile(paths.context, JSON.stringify({ version: 1, stateDir: record.state, home: f.home, codexHome: record.codexHome, projectDir: record.project, runtime: record.runtime, source: record.source, installation: record.installation, node: process.execPath, digest: record.digest, environment: {} }));
  await fs.writeFile(paths.entry, '// 0.10.x entry\n');
  await fs.writeFile(paths.script, '#!/bin/sh\nexit 0\n', { mode: 0o700 });
  return paths;
}

const changeApp = appDir => fs.appendFile(path.join(appDir, 'README.md'), '\n0.11');

// A stand-in Codex command line: records its arguments, lists SkillDock at `versions`.
async function codexStandIn(f, versions = []) {
  const file = path.join(f.root, 'codex-stand-in'); const calls = path.join(f.root, 'codex-calls');
  const installed = JSON.stringify({ installed: versions.map(version => ({ name: 'skilldock', marketplaceName: MARKET, version })) });
  await fs.writeFile(file, `#!/bin/sh\necho "$*" >> "${calls}"\ncase "$1 $2" in\n"--version ") echo "codex-cli 0.200.0" ;;\n"plugin --help") echo "list marketplace" ;;\n"plugin list") echo '${installed}' ;;\nesac\n`, { mode: 0o755 });
  return { file, calls: async () => (await fs.readFile(calls, 'utf8').catch(() => '')).split('\n').filter(Boolean) };
}

test('gate: an older SkillDock in any Agent stops the takeover before anything 0.10.x reads is written', async t => {
  const f = await fixture(t); const port = await freePort();
  const old = { ...await installedVersion(f, '0.10.2'), port };
  const options = { ...f, port, codexHome: old.codexHome };
  const blocked = await launch('start', options).then(() => null, error => error);
  assert.equal(blocked?.exitCode, 4);
  assert.equal(blocked.output.status, 'migration-blocked');
  assert.deepEqual(blocked.output.blockers.map(item => [item.agent, item.version]), [['codex', '0.10.2']]);
  assert.ok(blocked.output.steps.some(step => step.includes(blocked.output.blockers[0].directory)), '列出构成“已安装”判定的缓存目录');
  for (const name of ['launcher.json', 'project.json', 'restart.json', 'local', 'background', 'generation.json']) assert.equal(await exists(path.join(f.stateDir, name)), false, name);
  // A restart job is not interactive: a plain reason, no guidance object, no restart.json.
  const job = await launch('restart', { ...options, restartJob: 'job' }).then(() => null, error => error);
  assert.deepEqual([job?.exitCode, job.output], [4, undefined]);
  assert.equal(await exists(path.join(f.stateDir, 'restart.json')), false);
  // Codex keeps earlier version directories: the highest of the marketplace counts.
  await installedVersion(f, '0.10.3');
  const started = await launch('start', options);
  try { assert.equal(started.migrated, true); } finally { await launch('stop', options); }
});

test('gate evidence: non-orphaned Claude directories count, orphaned ones do not, unreadable evidence never passes', async t => {
  const f = await fixture(t);
  const cache = path.join(f.home, '.claude/plugins/cache', MARKET, 'skilldock');
  const add = async (name, version, orphaned) => {
    const app = path.join(cache, name, 'skills/skill-manager/assets/app'); await fs.mkdir(app, { recursive: true });
    await fs.writeFile(path.join(app, 'package.json'), JSON.stringify({ name: 'skilldock', version }));
    if (orphaned) await fs.writeFile(path.join(cache, name, '.orphaned_at'), '1');
  };
  await add('aaa', '0.10.2', true); await add('bbb', '0.11.0', false);
  // Plain files beside marketplaces or version directories are not installations, nor are
  // links to files or links that lead nowhere (all with names a version directory could have).
  await fs.writeFile(path.join(cache, '.DS_Store'), 'x'); await fs.writeFile(path.join(cache, '..', '..', 'notes.txt'), 'x');
  await fs.writeFile(path.join(cache, 'readme'), 'x');
  await fs.symlink(path.join(cache, 'readme'), path.join(cache, 'file-link'));
  await fs.symlink(path.join(cache, 'absent'), path.join(cache, 'dangling'));
  const roots = await agentRoots({ env: {}, home: f.home });
  assert.deepEqual(await migrationGate(roots), { passed: true, blockers: [], unreadable: [] });
  // A link to a version directory counts as that directory.
  const outside = path.join(f.home, 'elsewhere/sha-linked'); await fs.mkdir(path.join(outside, 'skills/skill-manager/assets/app'), { recursive: true });
  await fs.writeFile(path.join(outside, 'skills/skill-manager/assets/app/package.json'), JSON.stringify({ name: 'skilldock', version: '0.10.0' }));
  await fs.symlink(outside, path.join(cache, 'dir-link'));
  assert.deepEqual((await migrationGate(roots)).blockers.map(item => [item.version, path.basename(item.directory)]), [['0.10.0', 'dir-link']]);
  await fs.rm(path.join(cache, 'dir-link'));
  await add('ccc', '0.10.1', false);
  assert.deepEqual((await migrationGate(roots)).blockers.map(item => [item.agent, item.version]), [['claude', '0.10.1']]);
  await fs.rm(path.join(cache, 'ccc'), { recursive: true });
  if (process.getuid?.() !== 0) {
    // A version directory that cannot be read is not an orphaned one.
    await add('ddd', '0.10.2', false); await fs.chmod(path.join(cache, 'ddd'), 0o000);
    let gate = await migrationGate(roots).finally(() => fs.chmod(path.join(cache, 'ddd'), 0o700));
    assert.equal(gate.passed, false); assert.ok(gate.unreadable[0].path.endsWith('ddd'));
    await fs.rm(path.join(cache, 'ddd'), { recursive: true });
    // An unreadable parent of the cache root is not a missing cache.
    const plugins = path.join(f.home, '.claude/plugins');
    await fs.chmod(plugins, 0o000);
    gate = await migrationGate(roots).finally(() => fs.chmod(plugins, 0o700));
    assert.equal(gate.passed, false);
    await fs.chmod(cache, 0o000);
    gate = await migrationGate(roots).finally(() => fs.chmod(cache, 0o700));
    assert.deepEqual([gate.passed, gate.unreadable[0].path], [false, await fs.realpath(path.join(f.home, '.claude/plugins/cache')).then(root => path.join(root, MARKET, 'skilldock'))]);
  }
});

test('migration with a running 0.10.x instance: background, plan, record and generation in order, then the new instance', async t => {
  const f = await fixture(t); const port = await freePort();
  const old = await oldInstance(t, f, { port });
  const paths = await legacyData(f, old);
  await changeApp(f.appDir);
  const result = await launch('start', { ...f, port });
  try {
    assert.equal(result.migrated, true); assert.notEqual(result.pid, old.pid); assert.equal(alive(old.pid), false);
    const state = old.state;
    assert.equal((await read(path.join(state, 'generation.json'))).generation, 2);
    const plan = await read(path.join(state, 'local/updates.json'));
    assert.deepEqual([plan.version, plan.activity], [2, [{ kind: 'kept' }]], '计划内容保留，仅版本改为 2');
    const record = await read(path.join(state, 'launcher.json'));
    assert.deepEqual([record.format, record.status, record.pid], [2, 'running', result.pid]);
    assert.deepEqual(await read(path.join(state, 'compat/launcher-record.json')), record);
    const context = await read(paths.context);
    assert.deepEqual([context.version, context.runtime, context.source, context.digest], [2, record.runtime, await fs.realpath(f.appDir), record.digest]);
    assert.equal(await fs.readFile(paths.entry, 'utf8'), await fs.readFile(path.join(record.runtime, 'server/background-entry.mjs'), 'utf8'));
    assert.equal(await fs.readFile(paths.script, 'utf8'), runScript(paths, state));
    assert.equal((await fs.stat(paths.script)).mode & 0o777, 0o700);
  } finally { await launch('stop', { ...f, port }); }
});

test('a failed takeover restores every file and the old instance; restart jobs for that target are refused until an interactive retry', async t => {
  if (process.getuid?.() === 0) return t.skip('root ignores directory permissions');
  const f = await fixture(t); const port = await freePort();
  const old = await oldInstance(t, f, { port });
  const paths = await legacyData(f, old);
  const before = { plan: await fs.readFile(path.join(old.state, 'local/updates.json'), 'utf8'), context: await fs.readFile(paths.context, 'utf8') };
  await changeApp(f.appDir);
  await fs.chmod(paths.root, 0o500);
  await assert.rejects(launch('start', { ...f, port }), /接管后台注册失败.*已恢复上一运行版本/).finally(() => fs.chmod(paths.root, 0o700));
  assert.equal(await exists(path.join(old.state, 'generation.json')), false);
  assert.equal(await fs.readFile(path.join(old.state, 'local/updates.json'), 'utf8'), before.plan);
  assert.equal(await fs.readFile(paths.context, 'utf8'), before.context);
  const restored = await read(path.join(old.state, 'launcher.json'));
  assert.equal(restored.format, undefined, '恢复的是 0.10.x 形态的记录');
  assert.equal((await probe(old.url)).pid, restored.pid);
  assert.equal((await read(path.join(old.state, 'compat/migration-failure.json'))).appDir, await fs.realpath(f.appDir));
  // The 0.10.x coordinator retries: refused before the job is accepted, restart.json untouched.
  const job = { id: 'job', source: await fs.realpath(f.appDir), sourceDigest: 'x', previousPid: restored.pid, url: old.url, status: 'preparing' };
  await fs.writeFile(path.join(old.state, 'restart.json'), JSON.stringify(job));
  await assert.rejects(launch('restart', { ...f, port, restartJob: 'job' }), error => error.code === 'MIGRATION_FAILED_BEFORE' && error.exitCode === 4);
  assert.deepEqual(await read(path.join(old.state, 'restart.json')), job);
  assert.equal((await probe(old.url)).pid, restored.pid, '旧实例没有被再次停止');
  const retried = await launch('start', { ...f, port });
  try {
    assert.equal(retried.migrated, true);
    assert.equal(await exists(path.join(old.state, 'compat/migration-failure.json')), false);
  } finally { await launch('stop', { ...f, port }); }
});

test('the command lines confirm what the file evidence lets through; refused jobs and confirmed launches do not ask again (36b 7.4)', async t => {
  const f = await fixture(t); const port = await freePort();
  const next = { ...await installedVersion(f, '0.10.3'), port };
  const options = { ...f, port, codexHome: next.codexHome };
  const codex = await codexStandIn(f, ['0.10.2']); const env = { ...f.env, SKILLDOCK_CODEX_BIN: codex.file };
  t.after(() => launch('stop', { ...options, env }).catch(() => {}));
  // The cache shows 0.10.3 only; Codex itself still reports 0.10.2.
  const blocked = await launch('start', { ...options, env }).then(() => null, error => error);
  assert.equal(blocked?.exitCode, 4);
  assert.deepEqual(blocked.output.blockers.map(item => [item.agent, item.version, item.evidence]), [['codex', '0.10.2', 'Codex 命令行插件清单']]);
  for (const name of ['launcher.json', 'restart.json', 'local', 'background', 'generation.json']) assert.equal(await exists(path.join(f.stateDir, name)), false, name);
  assert.ok((await codex.calls()).includes('plugin list --json'));
  // A restart job after a failed takeover is refused before any command line runs.
  await fs.mkdir(f.stateDir, { recursive: true }); const state = await fs.realpath(f.stateDir);
  await writeMigrationFailure(state, { appDir: await fs.realpath(f.appDir), version: '0.0.0' });
  await fs.rm(path.join(f.root, 'codex-calls'), { force: true });
  await codexStandIn(f, []);
  await assert.rejects(launch('restart', { ...options, env, restartJob: 'job' }), error => error.code === 'MIGRATION_FAILED_BEFORE');
  assert.deepEqual(await codex.calls(), [], '快速拒绝之前不运行任何命令行');
  // Once the bootstrap confirmed (SKILLDOCK_GATE_CHECKED), the launcher reads the files only.
  const started = await launch('start', { ...options, env: { ...env, SKILLDOCK_GATE_CHECKED: '1' } });
  try {
    assert.equal(started.migrated, true);
    assert.equal((await codex.calls()).includes('plugin list --json'), false, '启动器不再运行插件清单');
  } finally { await launch('stop', { ...options, env }); }
});

test('a 0.10.x restart job migrates and is closed as ready with the executor mark (G-08)', async t => {
  const f = await fixture(t); const port = await freePort();
  const old = await oldInstance(t, f, { port });
  await legacyData(f, old); await changeApp(f.appDir);
  await fs.writeFile(path.join(old.state, 'restart.json'), JSON.stringify({ id: 'job', source: await fs.realpath(f.appDir), sourceDigest: 'from-0.10.x', previousPid: old.pid, url: old.url, status: 'preparing', requestedAt: new Date().toISOString() }));
  const result = await launch('restart', { ...f, port, restartJob: 'job' });
  try {
    const job = await read(path.join(old.state, 'restart.json'));
    assert.deepEqual([job.status, job.pid, job.executor.pid, result.migrated], ['ready', result.pid, process.pid, true]);
  } finally { await launch('stop', { ...f, port }); }
});

test('a missing record is written back: running form by the launcher, stopped form by the background check (G-07)', async t => {
  const f = await fixture(t); const port = await freePort();
  const first = await launch('start', { ...f, port });
  const recordFile = path.join(first.state, 'launcher.json');
  try {
    await fs.rm(recordFile);
    const again = await launch('start', { ...f, port });
    assert.deepEqual([again.reused, again.pid], [true, first.pid]);
    assert.equal((await read(recordFile)).status, 'running');
  } finally { await launch('stop', { ...f, port }); }
  await fs.rm(recordFile);
  const restored = await restoreMissingRecord(first.state, path.join(f.home, '.codex'));
  assert.deepEqual([restored.status, (await read(recordFile)).status], ['stopped', 'stopped']);
  assert.equal(await restoreMissingRecord(first.state, path.join(f.home, '.codex')), null, '记录存在时什么都不做');
});

test('background worker: a 0.10.x context works only on generation 1, a 0.11 context only after migration (G-09)', async t => {
  const f = await fixture(t); await fs.mkdir(f.stateDir, { recursive: true });
  const state = await fs.realpath(f.stateDir);
  const context = { stateDir: state, home: f.home, codexHome: path.join(f.home, '.codex'), runtime: state, source: state, installation: { kind: 'directory', source: state } };
  assert.equal((await runBackground({ ...context, version: 2 })).outcome, 'migration-pending');
  await writeGeneration(state, '0.11.0');
  assert.equal((await runBackground({ ...context, version: 1 })).outcome, 'newer-data');
  await fs.writeFile(path.join(state, 'generation.json'), JSON.stringify({ format: 1, generation: 3 }));
  assert.equal((await runBackground({ ...context, version: 2 })).outcome, 'newer-data');
  assert.equal(await exists(path.join(state, 'background/status.json')), false, '不写任何后台状态');
});

test('explicit migration from testany-eng takes over its data; other identities are refused', async t => {
  const f = await fixture(t); const port = await freePort();
  const eng = await installedVersion(f, '2.4.0', { plugin: 'testany-eng' });
  const next = { ...await installedVersion(f, '0.11.0'), port };
  const unrelated = { ...await installedVersion(f, '0.11.0', { plugin: 'different-app' }), port, migrateFrom: 'testany-eng' };
  const codexHome = await fs.realpath(eng.codexHome);
  const old = await oldInstance(t, f, { port, appDir: eng.appDir, codexHome,
    installation: { kind: 'plugin', codexHome, marketplace: MARKET, plugin: 'testany-eng', appPath: 'skills/skill-manager/assets/app' } });
  await legacyData(f, old);
  await assert.rejects(launch('start', next), /--migrate-from/);
  await assert.rejects(launch('start', unrelated), /另一个源码实例/);
  const result = await launch('start', { ...next, migrateFrom: 'testany-eng' });
  try {
    assert.deepEqual([result.migrated, result.state], [true, old.state]);
    const record = await read(path.join(old.state, 'launcher.json'));
    assert.equal(record.installation.plugin, 'skilldock');
    assert.equal((await read(path.join(old.state, 'local/updates.json'))).activity[0].kind, 'kept');
  } finally { await launch('stop', next); }
});

test('a service stops writing once the data moves past the generation it started with (DEC-SDX-009)', async t => {
  const f = await fixture(t); await fs.mkdir(f.stateDir, { recursive: true });
  const state = await fs.realpath(f.stateDir); await writeGeneration(state, '0.11.0');
  const app = await createApp({ enableTestSandbox: true, selfUpdate: false, home: f.home, env: f.env, codexHome: path.join(f.home, '.codex'), stateDir: state, projectDir: f.projectDir,
    adapter: { list: async () => ({ plugins: [], marketplaces: [], diagnostics: [], cli: { available: false } }) } });
  t.after(() => app.close());
  await app.service.tickScheduler();
  await fs.writeFile(path.join(state, 'generation.json'), JSON.stringify({ format: 1, generation: 3 }));
  await assert.rejects(app.service.tickScheduler(), error => error.code === 'DATA_GENERATION_NEWER' && /更新到最新版本/.test(error.message));
  // Turning the plan off has its own fast path; it stops writing too.
  await assert.rejects(app.service.action({ mode: 'local', action: 'schedule.configure', schedule: { enabled: false, intervalMinutes: 1440, timezone: 'UTC', autoApply: false, targets: [] } }), { code: 'DATA_GENERATION_NEWER' });
  assert.equal(await exists(path.join(state, 'background/disabled.json')), false);
});

test('busy locks stop a migration before the old 0.10.x instance stops; nothing changes and it is not a failure', async t => {
  const f = await fixture(t); const port = await freePort();
  const old = await oldInstance(t, f, { port });
  await legacyData(f, old); await changeApp(f.appDir);
  const plan = await fs.readFile(path.join(old.state, 'local/updates.json'), 'utf8');
  const release = acquireFileLock(path.join(old.state, 'instance.lock'));
  try { await assert.rejects(launch('start', { ...f, port, lockWait: 300 }), /未停止现有服务/); } finally { release(); }
  assert.equal((await probe(old.url)).pid, old.pid, '旧实例仍在运行');
  assert.equal(await exists(path.join(old.state, 'generation.json')), false);
  assert.equal(await fs.readFile(path.join(old.state, 'local/updates.json'), 'utf8'), plan);
  assert.equal(await exists(path.join(old.state, 'compat/migration-failure.json')), false, '锁忙不算迁移失败');
  const retried = await launch('start', { ...f, port });
  try { assert.equal(retried.migrated, true); } finally { await launch('stop', { ...f, port }); }
});

test('a stale 0.10.x record left by Claude-side SkillDock no longer blocks once that side is updated', async t => {
  const f = await fixture(t); const port = await freePort();
  const next = { ...await installedVersion(f, '0.11.0'), port };
  const claudeConfig = path.join(f.home, '.claude');
  await fs.mkdir(path.join(claudeConfig, 'plugins'), { recursive: true });
  await fs.writeFile(path.join(claudeConfig, 'plugins/known_marketplaces.json'), JSON.stringify({ [MARKET]: { source: { source: 'git', url: 'https://github.com/TestAny-io/testany-agent-skills.git' } } }));
  const oldDir = path.join(claudeConfig, 'plugins/cache', MARKET, 'skilldock/sha-old');
  const oldApp = path.join(oldDir, 'skills/skill-manager/assets/app');
  await fs.mkdir(oldApp, { recursive: true }); await fs.writeFile(path.join(oldApp, 'package.json'), JSON.stringify({ name: 'skilldock', version: '0.10.2' }));
  await fs.mkdir(f.stateDir, { recursive: true }); const state = await fs.realpath(f.stateDir); const real = await fs.realpath(oldApp);
  await fs.writeFile(path.join(state, 'launcher.json'), JSON.stringify({ url: `http://127.0.0.1:${port}`, pid: 2 ** 22 + 4321, state, project: await fs.realpath(f.projectDir), projectContext: null,
    source: real, installation: { kind: 'directory', source: real }, digest: 'old', runtime: path.join(state, 'runtimes/old'), codexHome: path.join(f.home, '.codex'), cli: null, execution: null }));
  // Still in use and older than 0.10.3: the gate stops here with guidance.
  await assert.rejects(launch('start', next), error => error.exitCode === 4);
  // The user updated Claude-side SkillDock: Claude marked the old directory orphaned.
  await fs.writeFile(path.join(oldDir, '.orphaned_at'), '1');
  const started = await launch('start', next);
  try {
    assert.equal(started.migrated, true);
    assert.equal((await read(path.join(state, 'launcher.json'))).format, 2);
  } finally { await launch('stop', next); }
});

// A Claude-side 0.10.x instance whose installation was since updated (its directory orphaned).
async function staleClaudeInstance(t, f, port) {
  const claudeConfig = path.join(f.home, '.claude');
  await fs.mkdir(path.join(claudeConfig, 'plugins'), { recursive: true });
  await fs.writeFile(path.join(claudeConfig, 'plugins/known_marketplaces.json'), JSON.stringify({ [MARKET]: { source: { source: 'git', url: 'https://github.com/TestAny-io/testany-agent-skills.git' } } }));
  const versionDir = path.join(claudeConfig, 'plugins/cache', MARKET, 'skilldock/sha-old');
  await fs.cp(f.sourceRoot, path.join(versionDir, 'skills/skill-manager'), { recursive: true });
  const old = await oldInstance(t, f, { port, appDir: path.join(versionDir, 'skills/skill-manager/assets/app') });
  await fs.writeFile(path.join(versionDir, '.orphaned_at'), '1');
  return old;
}

test('a live stale Claude-side 0.10.x instance is stopped under the locks and migrated; busy locks leave it running', async t => {
  const f = await fixture(t); const port = await freePort();
  const next = { ...await installedVersion(f, '0.11.0'), port };
  const old = await staleClaudeInstance(t, f, port);
  const release = acquireFileLock(path.join(old.state, 'instance.lock'));
  try { await assert.rejects(launch('start', { ...next, lockWait: 300 }), /未停止现有服务/); } finally { release(); }
  assert.equal((await probe(old.url)).pid, old.pid, '锁忙时不停止旧实例');
  const started = await launch('start', next);
  try {
    assert.equal(started.migrated, true); assert.notEqual(started.pid, old.pid);
    assert.equal(alive(old.pid), false, '旧实例先被停止');
  } finally { await launch('stop', next); }
});

test('stop on a stale Claude-side 0.10.x record stops that instance and removes the record', async t => {
  const f = await fixture(t); const port = await freePort();
  const next = { ...await installedVersion(f, '0.11.0'), port };
  const old = await staleClaudeInstance(t, f, port);
  assert.equal((await launch('stop', next)).status, 'stopped');
  assert.equal(await probe(old.url), null);
  assert.equal(await exists(path.join(old.state, 'launcher.json')), false, '0.10.x 记录按 0.10.2 的做法删除');
});

test('a record from an unseen Claude configuration is refused with its reason; a live old service is named first; nothing changes', async t => {
  const f = await fixture(t); const port = await freePort();
  const next = { ...await installedVersion(f, '0.11.0'), port };
  // The bootstrap's Node selection is not saved into a data directory that is refused (HLD 3.10).
  next.env = { ...next.env, SKILLDOCK_NODE_SOURCE: 'nvm', SKILLDOCK_SELECTED_NPM_CLI: path.join(f.root, 'npm-cli.js'), SKILLDOCK_SELECTED_NPM_VERSION: '11.0.0' };
  // Claude with a custom configuration directory, seen from the Codex side.
  const custom = path.join(f.home, 'custom-claude');
  const versionDir = path.join(custom, 'plugins/cache', MARKET, 'skilldock/sha-old');
  await fs.cp(f.sourceRoot, path.join(versionDir, 'skills/skill-manager'), { recursive: true });
  const old = await oldInstance(t, f, { port: await freePort(), appDir: path.join(versionDir, 'skills/skill-manager/assets/app') });
  const listing = async () => (await fs.readdir(old.state, { recursive: true })).sort();
  const before = await listing(); const bytes = await fs.readFile(path.join(old.state, 'launcher.json'));
  const realCustom = await fs.realpath(custom);
  t.after(() => launch('stop', { ...next, env: { ...next.env, CLAUDE_CONFIG_DIR: custom } }).catch(() => {}));
  let refused = await launch('start', next).then(() => null, error => error);
  assert.deepEqual([refused?.exitCode, refused.output.status], [1, 'owner-unverified']);
  assert.ok(refused.message.includes(realCustom));
  assert.ok(refused.output.steps[0].includes(`pid ${old.pid}`) && refused.output.steps[0].includes('launch.sh" stop'), '旧服务仍在运行时先给出停止步骤');
  assert.ok(refused.output.steps.some(step => step.includes(`CLAUDE_CONFIG_DIR="${realCustom}"`)));
  assert.equal((await probe(old.url))?.pid, old.pid, '不停止旧服务');
  assert.deepEqual([await listing(), await fs.readFile(path.join(old.state, 'launcher.json'))], [before, bytes]);
  // Once that service is gone the first step is the record itself.
  process.kill(old.pid, 'SIGTERM');
  for (let i = 0; i < 50 && await probe(old.url); i++) await new Promise(resolve => setTimeout(resolve, 100));
  refused = await launch('status', next).then(() => null, error => error);
  assert.ok(refused.output.steps[0].startsWith('若那份 SkillDock 已不再使用，且它的服务已停止'));
  // With CLAUDE_CONFIG_DIR the installation is visible: an old one still in use, named by version.
  await fs.writeFile(path.join(custom, 'plugins/known_marketplaces.json'), JSON.stringify({ [MARKET]: { source: { source: 'git', url: 'https://github.com/TestAny-io/testany-agent-skills.git' } } }));
  refused = await launch('start', { ...next, env: { ...next.env, CLAUDE_CONFIG_DIR: custom } }).then(() => null, error => error);
  assert.deepEqual([refused?.exitCode, refused.output.status], [4, 'migration-blocked']);
  assert.match(refused.message, /SkillDock 0\.0\.0（低于 0\.10\.3）/);
  assert.deepEqual([await listing(), await fs.readFile(path.join(old.state, 'launcher.json'))], [before, bytes]);
  // A package that cannot be read: its version is unknown, and the first step is the permission.
  if (process.getuid?.() !== 0) {
    const pkg = path.join(realCustom, 'plugins/cache', MARKET, 'skilldock/sha-old/skills/skill-manager/assets/app/package.json');
    await fs.chmod(pkg, 0o000);
    refused = await launch('status', { ...next, env: { ...next.env, CLAUDE_CONFIG_DIR: custom } }).then(() => null, error => error).finally(() => fs.chmod(pkg, 0o600));
    assert.deepEqual([refused?.exitCode, refused.output.unreadable], [1, [{ path: pkg, error: 'UNREADABLE' }]]);
    assert.ok(refused.message.startsWith(`无法读取 ${pkg}`));
    assert.equal(refused.output.steps[0], `为当前用户开放 ${pkg} 的读取权限后重试。`);
    assert.deepEqual([await listing(), await fs.readFile(path.join(old.state, 'launcher.json'))], [before, bytes]);
  }
});
