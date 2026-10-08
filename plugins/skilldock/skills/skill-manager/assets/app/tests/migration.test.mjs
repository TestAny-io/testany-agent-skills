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
import { migrationGate } from '../server/migration.mjs';
import { agentRoots } from '../server/installs.mjs';
import { runBackground } from '../server/background-worker.mjs';
import { restoreMissingRecord } from '../server/launcher-record.mjs';
import { writeGeneration } from '../server/generation.mjs';
import { createApp } from '../server/index.mjs';

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
  const roots = await agentRoots({ env: {}, home: f.home });
  assert.equal((await migrationGate(roots)).passed, true);
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
});
