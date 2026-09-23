import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createService } from '../server/service.mjs';
import { inspectTree, readJson, writeJson } from '../server/files.mjs';
import { runBackground } from '../server/background-worker.mjs';
import { captureSource } from '../scripts/source-bundle.mjs';

async function fixture(t, { git = false } = {}) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock-reconcile-')));
  const home = path.join(root, 'home'), codexHome = path.join(home, '.codex'), projectDir = path.join(home, 'project'), stateDir = path.join(root, 'state');
  const marketRoot = path.join(root, 'market'), source = path.join(marketRoot, 'plugins/example');
  const id = 'example@fixture-market', target = { kind: 'plugin', id }, key = `plugin:${id}`;
  const installed = path.join(codexHome, 'plugins/cache/fixture-market/example/2.4.1');
  await fs.mkdir(path.join(source, '.codex-plugin'), { recursive: true }); await fs.mkdir(path.join(source, 'skills/example'), { recursive: true }); await fs.mkdir(path.join(source, 'tests'));
  await writeJson(path.join(source, '.codex-plugin/plugin.json'), { name: 'example', version: '2.4.1' });
  await fs.writeFile(path.join(source, 'skills/example/SKILL.md'), '---\nname: example\ndescription: Test fixture\n---\nExample\n');
  await fs.writeFile(path.join(source, 'tests/change.py'), '# original\n');
  await writeJson(path.join(marketRoot, '.claude-plugin/marketplace.json'), { name: 'fixture-market', plugins: [{ name: 'example', source: './plugins/example' }] });
  await fs.mkdir(path.dirname(installed), { recursive: true }); await fs.cp(source, installed, { recursive: true }); await fs.mkdir(projectDir, { recursive: true });
  const config = '[plugins."example@fixture-market"]\nenabled = false\n'; await fs.writeFile(path.join(codexHome, 'config.toml'), config);
  const plugin = { id, name: 'example', marketplace: 'fixture-market', version: '2.4.1', installed: true, enabled: false, sourcePath: installed, _updateSourcePath: source, _componentRoots: ['skills'],
    sourceInfo: { kind: 'plugin', confidence: 'verified', owner: 'Marketplace · fixture-market', sourceType: 'local', source, marketplace: 'fixture-market', pluginId: id } };
  const market = { id: 'fixture-market', name: 'fixture-market', type: git ? 'git' : 'local', source: git ? 'https://example.invalid/fixture.git' : marketRoot, _root: marketRoot, canRefresh: git };
  const hooks = {}, commands = []; let time = Date.parse('2026-09-23T00:00:00Z');
  const adapter = { list: async () => { await hooks.onList?.(); return structuredClone({ plugins: [plugin], marketplaces: [market], diagnostics: [], cli: { available: true } }); },
    command: async args => { commands.push(args); assert.deepEqual(args, ['plugin', 'marketplace', 'upgrade', 'fixture-market', '--json']); await hooks.onRefresh?.(); return {}; } };
  const options = { home, codexHome, projectDir, stateDir, adapter, scheduler: false, background: false, now: () => time };
  const f = { root, source, installed, plugin, market, hooks, commands, config, codexHome, target, key, stateDir, options, service: await createService(options) };
  f.act = (action, fields = {}) => f.service.action({ mode: 'local', action, ...fields });
  f.check = async () => (await f.act('update.check', { target })).updateItem;
  f.registry = () => readJson(path.join(stateDir, 'local/registry.json'));
  f.state = () => readJson(path.join(stateDir, 'local/updates.json'));
  f.configure = () => f.act('schedule.configure', { schedule: { enabled: true, intervalMinutes: 15, timezone: 'UTC', autoApply: true, targets: [target] } });
  f.tick = async () => { time += 16 * 60000; await f.service.tickScheduler(); return (await f.state()).runs[0]; };
  f.restart = async () => { await f.service.close(); f.service = await createService(options); };
  f.synchronize = async () => { await fs.writeFile(path.join(source, 'tests/change.py'), '# upstream changed the same version\n'); await fs.copyFile(path.join(source, 'tests/change.py'), path.join(installed, 'tests/change.py')); };
  t.after(async () => { await f.service.close(); await fs.rm(root, { recursive: true, force: true }); });
  assert.equal((await f.check()).status, 'current'); commands.length = 0;
  return f;
}

test('manual check recovers an old plugin baseline from exact source equality without modifying installed files', async t => {
  const f = await fixture(t); const old = (await f.registry()).pluginBaselines[f.target.id];
  await f.synchronize(); const installed = await inspectTree(f.installed); const stat = await fs.stat(path.join(f.installed, 'tests/change.py'));
  assert.notEqual(installed.fingerprint, old.fingerprint);
  const result = await f.check(); assert.equal(result.status, 'current'); assert.equal(result.reasonCode, 'EXTERNAL_SYNC_VERIFIED');
  assert.equal(result.canApply, false); assert.equal(result.previewId, undefined);
  assert.equal((await f.registry()).pluginBaselines[f.target.id].fingerprint, installed.fingerprint);
  assert.equal((await inspectTree(f.installed)).fingerprint, installed.fingerprint);
  assert.equal((await fs.stat(path.join(f.installed, 'tests/change.py'))).mtimeMs, stat.mtimeMs);
  assert.equal(await fs.readFile(path.join(f.codexHome, 'config.toml'), 'utf8'), f.config);
  assert.deepEqual(f.commands, []); assert.ok((await f.registry()).activity.some(item => item.status === 'success' && item.message.includes('外部同步')));
  await f.restart(); assert.equal((await f.check()).status, 'current');
  await writeJson(path.join(f.source, '.codex-plugin/plugin.json'), { name: 'example', version: '2.4.2' });
  assert.equal((await f.check()).status, 'available', 'recovery must allow a subsequent real update');
});

test('scheduled plugin check recovers stale content bindings and baselines after a restart, then continues normally', async t => {
  const f = await fixture(t, { git: true }); await f.configure(); const before = await f.state();
  await f.synchronize(); await f.restart();
  const run = await f.tick(); assert.equal(run.status, 'success'); assert.equal(run.items[0].status, 'current');
  const after = await f.state(), fingerprint = (await inspectTree(f.installed)).fingerprint;
  assert.deepEqual(after.bindings[f.key], { ...before.bindings[f.key], fingerprint });
  assert.equal((await f.registry()).pluginBaselines[f.target.id].fingerprint, fingerprint);
  assert.equal(after.schedule.autoApply, true); assert.equal(after.schedule.intervalMinutes, 15); assert.deepEqual(after.schedule.targets, before.schedule.targets);
  assert.ok(after.activity.some(item => item.action === 'schedule.reconcile'));
  assert.equal(f.commands.length, 1, 'verification must use cached source data before any CLI marketplace refresh');
  const again = await f.tick(); assert.equal(again.status, 'success'); assert.equal(again.items[0].status, 'current');
});

test('a background worker recovers an overdue plugin plan without a web service', async t => {
  const f = await fixture(t); await f.configure(); await f.synchronize(); await f.service.close();
  const state = await f.state(); state.schedule.nextRunAt = new Date(Date.now() - 60000).toISOString();
  await writeJson(path.join(f.stateDir, 'local/updates.json'), state);
  const source = fileURLToPath(new URL('../', import.meta.url));
  const context = { home: f.options.home, codexHome: f.codexHome, stateDir: f.stateDir, projectDir: f.options.projectDir,
    source, installation: { kind: 'directory', source }, digest: (await captureSource(source)).sourceDigest };
  const result = await runBackground(context, { adapter: f.service.adapter });
  assert.equal(result.outcome, 'success'); assert.equal(result.error, undefined);
  const after = await f.state(), fingerprint = (await inspectTree(f.installed)).fingerprint;
  assert.equal(after.runs[0].items[0].status, 'current'); assert.equal(after.schedule.running, false);
  assert.equal(after.bindings[f.key].fingerprint, fingerprint);
  assert.equal((await f.registry()).pluginBaselines[f.target.id].fingerprint, fingerprint);
  assert.deepEqual(f.commands, []);
});

test('manual reconciliation also repairs the saved schedule without deleting previous update history', async t => {
  const f = await fixture(t); await f.configure(); await f.tick(); const history = (await f.state()).runs;
  await f.synchronize(); assert.equal((await f.check()).status, 'current');
  const fingerprint = (await inspectTree(f.installed)).fingerprint;
  assert.equal((await f.state()).bindings[f.key].fingerprint, fingerprint); assert.deepEqual((await f.state()).runs, history);
  assert.equal((await f.tick()).status, 'success');
});

test('a same-version synchronization performed by marketplace refresh repairs the binding during that check', async t => {
  const f = await fixture(t, { git: true }); await f.configure();
  f.hooks.onRefresh = async () => { delete f.hooks.onRefresh; await f.synchronize(); };
  const run = await f.tick(); assert.equal(run.status, 'success'); assert.equal(run.items[0].reasonCode, 'EXTERNAL_SYNC_VERIFIED');
  const fingerprint = (await inspectTree(f.installed)).fingerprint;
  assert.equal((await f.state()).bindings[f.key].fingerprint, fingerprint);
  assert.equal((await f.registry()).pluginBaselines[f.target.id].fingerprint, fingerprint);
  assert.equal(f.commands.length, 1);
});

test('a saved binding can recover even when the plugin baseline was already refreshed independently', async t => {
  const f = await fixture(t); await f.configure(); await f.synchronize();
  const registry = await f.registry(); registry.pluginBaselines[f.target.id].fingerprint = (await inspectTree(f.installed)).fingerprint;
  await writeJson(path.join(f.stateDir, 'local/registry.json'), registry);
  assert.equal((await f.tick()).status, 'success');
});

test('same-version source-only changes and genuine local edits keep their protections', async t => {
  const f = await fixture(t, { git: true }); await f.configure(); const binding = (await f.state()).bindings[f.key], baseline = (await f.registry()).pluginBaselines[f.target.id];
  await fs.writeFile(path.join(f.source, 'tests/change.py'), '# upstream only\n');
  assert.equal((await f.check()).reasonCode, 'VERSION_UNCHANGED');
  await fs.writeFile(path.join(f.installed, 'tests/change.py'), '# private local edit\n');
  await assert.rejects(f.check(), { code: 'LOCAL_CHANGES' }); f.commands.length = 0;
  assert.equal((await f.tick()).items[0].reasonCode, 'TARGET_BINDING_CHANGED');
  assert.deepEqual(f.commands, [], 'unverified content must not invoke a potentially mutating marketplace refresh');
  assert.deepEqual((await f.state()).bindings[f.key], binding); assert.deepEqual((await f.registry()).pluginBaselines[f.target.id], baseline);
  await writeJson(path.join(f.source, '.codex-plugin/plugin.json'), { name: 'example', version: '2.4.2' });
  await assert.rejects(f.check(), { code: 'LOCAL_CHANGES' });
});

test('an externally synchronized package cannot silently adopt a different marketplace source or owner', async t => {
  const f = await fixture(t, { git: true }); await f.configure(); const binding = (await f.state()).bindings[f.key]; await f.synchronize();
  f.market.source = 'https://example.invalid/replacement.git';
  assert.equal((await f.tick()).items[0].reasonCode, 'TARGET_BINDING_CHANGED'); assert.deepEqual(f.commands, []);
  assert.equal((await f.check()).status, 'current', 'an explicit manual check may inspect the new source');
  assert.deepEqual((await f.state()).bindings[f.key], binding, 'the existing schedule still needs explicit selection');
});

test('equal source content does not authorize a replaced installation directory', async t => {
  const f = await fixture(t, { git: true }); await f.configure(); const binding = (await f.state()).bindings[f.key]; await f.synchronize();
  await fs.rename(f.installed, `${f.installed}-held`); await fs.cp(f.source, f.installed, { recursive: true });
  assert.equal((await f.tick()).items[0].reasonCode, 'TARGET_BINDING_CHANGED'); assert.deepEqual(f.commands, []);
  assert.deepEqual((await f.state()).bindings[f.key], binding);
});

for (const changed of ['source', 'installed']) test(`reconciliation stops if ${changed} content changes while equality is being verified`, async t => {
  const f = await fixture(t); await f.configure(); const baseline = (await f.registry()).pluginBaselines[f.target.id], binding = (await f.state()).bindings[f.key];
  await f.synchronize(); let raced = false;
  f.hooks.onList = async () => {
    const staged = await fs.readdir(path.join(f.stateDir, 'local/staging')).catch(() => []);
    if (!raced && staged.length) { raced = true; await fs.appendFile(path.join(f[changed], 'tests/change.py'), '# changed during verification\n'); }
  };
  const run = await f.tick(); assert.equal(raced, true, 'the race must exercise verification readback');
  assert.equal(run.items[0].reasonCode, 'TARGET_BINDING_CHANGED');
  assert.deepEqual((await f.registry()).pluginBaselines[f.target.id], baseline); assert.deepEqual((await f.state()).bindings[f.key], binding);
  assert.deepEqual(await fs.readdir(path.join(f.stateDir, 'local/staging')), [], 'failed verification must clean its staging data');
});
