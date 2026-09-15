import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createService, validateAction } from '../server/service.mjs';
import { createApp } from '../server/index.mjs';
import { createScheduler } from '../server/scheduler.mjs';
import { normalizeTags } from '../server/tags.mjs';
import { captureDirectoryRoot, readJson, writeJson } from '../server/files.mjs';

const act = (service, action, fields = {}, mode = 'sandbox') => service.action({ mode, action, ...fields });
const label = (service, kind, item, tags) => act(service, 'tags.set', { target: { kind, id: item.id }, tags });
const gate = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
async function options(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock-progress-tags-')));
  const home = path.join(root, 'home'); const codexHome = path.join(home, '.codex'); const projectDir = path.join(home, 'project');
  await fs.mkdir(codexHome, { recursive: true }); await fs.mkdir(projectDir);
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return { home, codexHome, projectDir, stateDir: path.join(root, 'state'), enableTestSandbox: true,
    adapter: { list: async () => ({ plugins: [], marketplaces: [], diagnostics: [], cli: { available: false } }) }, scheduler: false, selfUpdate: false };
}
async function fixture(t) {
  const config = await options(t); const service = await createService(config);
  t.after(() => service.close()); return { config, service };
}

test('tag requests normalize Unicode and whitespace, deduplicate case, and reject invalid targets and limits', () => {
  assert.deepEqual(normalizeTags([' ＡＰＩ ', 'api', '日本語  标签', '研发']), ['API', '日本語 标签', '研发']);
  const request = { mode: 'local', action: 'tags.set', target: { kind: 'skill', id: 'a'.repeat(24) }, tags: [] };
  assert.equal(validateAction(request), request);
  for (const tags of [null, {}, [''], ['x'.repeat(33)], Array(13).fill('x'), [1], ['a\nb'], ['a\u202eb']]) assert.throws(() => validateAction({ ...request, tags }), { code: 'INVALID_TAGS' });
  assert.throws(() => validateAction({ ...request, target: { kind: 'host', id: 'codex' } }), { code: 'INVALID_TARGET' });
  assert.throws(() => validateAction({ ...request, source: '/tmp' }), { code: 'INVALID_ACTION' });
});

test('tags survive restart, distinguish same-name copies, and only change application metadata even on protected skills', async t => {
  const { config, service } = await fixture(t); const env = service.environments.sandbox;
  let state = await service.snapshot('sandbox');
  assert.ok([...state.skills, ...state.plugins].every(item => Array.isArray(item.tags) && !item.tags.length));
  const original = state.skills.find(item => item.name === 'api-notes');
  const duplicateDirectory = path.join(env.project, '.agents/skills/api-copy');
  await fs.mkdir(duplicateDirectory); await fs.copyFile(original.path, path.join(duplicateDirectory, 'SKILL.md'));
  state = await service.snapshot('sandbox'); const duplicate = state.skills.find(item => item.path === path.join(duplicateDirectory, 'SKILL.md'));
  const system = state.skills.find(item => item.scope === 'system'); const plugin = state.plugins[0];
  const configBefore = await fs.readFile(env.config); const contentBefore = await fs.readFile(system.path);
  await label(service, 'skill', original, ['API', ' 常用 ']); await label(service, 'skill', duplicate, ['另一份']);
  await label(service, 'skill', system, ['内置']); await label(service, 'plugin', plugin, ['研发']);
  assert.deepEqual(await fs.readFile(env.config), configBefore); assert.deepEqual(await fs.readFile(system.path), contentBefore);
  await assert.rejects(label(service, 'skill', { id: 'missing' }, ['x']), { code: 'NOT_FOUND' });
  await assert.rejects(label(service, 'plugin', original, ['x']), { code: 'NOT_FOUND' });
  await service.close(); const next = await createService(config); t.after(() => next.close());
  state = await next.snapshot('sandbox');
  assert.deepEqual(state.skills.find(item => item.id === original.id).tags, ['API', '常用']);
  assert.deepEqual(state.skills.find(item => item.id === duplicate.id).tags, ['另一份']);
  assert.deepEqual(state.skills.find(item => item.id === system.id).tags, ['内置']);
  assert.deepEqual(state.plugins.find(item => item.id === plugin.id).tags, ['研发']);
  assert.ok((await next.snapshot('local')).skills.every(item => !item.tags.length));
  await label(next, 'skill', original, []);
  assert.deepEqual((await next.snapshot('sandbox')).skills.find(item => item.id === original.id).tags, []);
});

test('standalone update and remove/restore retain the installation tags', async t => {
  const { service } = await fixture(t);
  const item = (await service.snapshot('sandbox')).skills.find(item => item.name === 'writing-assistant');
  await label(service, 'skill', item, ['Writing']);
  const target = { kind: 'skill', id: item.id };
  const preview = (await act(service, 'update.check', { target })).updateItem;
  await act(service, 'update.apply', { target, previewId: preview.previewId });
  assert.deepEqual((await service.snapshot('sandbox')).skills.find(skill => skill.id === item.id).tags, ['Writing']);
  await act(service, 'skill.remove', { id: item.id });
  const removed = (await service.snapshot('sandbox')).activity.find(item => item.action === 'skill.remove');
  await act(service, 'activity.restore', { id: removed.id });
  assert.deepEqual((await service.snapshot('sandbox')).skills.find(skill => skill.id === item.id).tags, ['Writing']);
});

test('a whole plugin update changes every bundled skill, preserves plugin/component tags across version paths, and leaves independent copies alone', async t => {
  const { service } = await fixture(t); const env = service.environments.sandbox;
  let state = await service.snapshot('sandbox'); const plugin = state.plugins[0]; const source = plugin.sourceInfo.source;
  const second = path.join(source, 'skills/second'); await fs.mkdir(second);
  await fs.writeFile(path.join(second, 'SKILL.md'), '---\nname: starter-tools-review\ndescription: Second component\n---\nVersion 1\n');
  const standalone = path.join(env.skills, 'independent-copy'); await fs.mkdir(standalone);
  await fs.copyFile(path.join(second, 'SKILL.md'), path.join(standalone, 'SKILL.md'));
  await act(service, 'plugin.install', { id: plugin.id });
  state = await service.snapshot('sandbox'); const components = state.skills.filter(item => item.scope === 'plugin' && item.pluginId === plugin.id);
  assert.equal(components.length, 2);
  const other = state.skills.find(item => item.path === path.join(standalone, 'SKILL.md')); const otherBytes = await fs.readFile(other.path);
  await label(service, 'plugin', plugin, ['Bundle']);
  for (const [i, item] of components.entries()) await label(service, 'skill', item, [`Component ${i}`]);
  await label(service, 'skill', other, ['Independent']);
  const manifestFile = path.join(source, '.codex-plugin/plugin.json'); const manifest = await readJson(manifestFile); manifest.version = '2.0.0'; await writeJson(manifestFile, manifest);
  for (const item of components) await fs.appendFile(path.join(source, item.packagePath), '\nVersion 2 marker\n');
  const target = { kind: 'plugin', id: plugin.id }; const preview = (await act(service, 'update.check', { target })).updateItem;
  assert.equal((await service.snapshot('sandbox')).updates.find(item => item.target.id === plugin.id).affectedSkillIds.length, 2);
  await act(service, 'update.apply', { target, previewId: preview.previewId }); state = await service.snapshot('sandbox');
  assert.deepEqual(state.plugins.find(item => item.id === plugin.id).tags, ['Bundle']);
  for (const [i, previous] of components.entries()) {
    const current = state.skills.find(item => item.scope === 'plugin' && item.packagePath === previous.packagePath && item.pluginId === plugin.id);
    assert.notEqual(current.id, previous.id); assert.equal(current.version, '2.0.0');
    assert.deepEqual(current.tags, [`Component ${i}`]); assert.match(await fs.readFile(current.path, 'utf8'), /Version 2 marker/);
  }
  assert.deepEqual(await fs.readFile(other.path), otherBytes);
  assert.deepEqual(state.skills.find(item => item.id === other.id).tags, ['Independent']);
  assert.ok(state.skills.filter(item => item.scope === 'cache').every(item => item.tags.length === 0));
});

test('failed tag persistence retains previous tags and never modifies the skill', async t => {
  const { service } = await fixture(t); const item = (await service.snapshot('sandbox')).skills[0];
  await label(service, 'skill', item, ['Keep']); const bytes = await fs.readFile(item.path); const rename = fs.rename;
  fs.rename = async (from, to) => { if (to === service.environments.sandbox.registryFile) throw new Error('simulated tag persistence failure'); return rename(from, to); };
  try { await assert.rejects(label(service, 'skill', item, ['Lost']), /simulated tag persistence failure/); } finally { fs.rename = rename; }
  assert.deepEqual((await service.snapshot('sandbox')).skills.find(value => value.id === item.id).tags, ['Keep']);
  assert.deepEqual(await fs.readFile(item.path), bytes);
});

test('progress endpoint stays responsive while the first CLI scan is blocked and enforces the HTTP boundary', async t => {
  const config = await options(t); const entered = gate(); const released = gate(); let calls = 0;
  config.adapter.list = async () => { calls++; entered.resolve(); await released.promise; return { plugins: [], marketplaces: [], diagnostics: [], cli: { available: true } }; };
  const app = await createApp(config); await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close()); const url = `http://127.0.0.1:${app.server.address().port}`;
  const request = fetch(url + '/api/actions', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-SkillDock-Token': app.token }, body: JSON.stringify({ mode: 'local', action: 'updates.run', autoApply: false }) });
  await entered.promise;
  try {
    const response = await fetch(url + '/api/updates/progress', { signal: AbortSignal.timeout(1000) });
    const progress = (await response.json()).progress;
    assert.equal(progress.phase, 'preparing'); assert.equal(progress.total, null); assert.equal(progress.completed, 0);
    assert.equal((await fetch(url + '/api/updates/progress?mode=wrong')).status, 400);
    assert.equal((await fetch(url + '/api/updates/progress', { headers: { Origin: 'https://example.invalid' } })).status, 403);
    assert.equal((await fetch(url + '/api/updates/progress?mode=sandbox').then(res => res.json())).progress, null);
    assert.equal(calls, 1, 'progress does not initiate another CLI scan');
    assert.equal((await fetch(url + '/api/actions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'local', action: 'tags.set', target: { kind: 'skill', id: 'x' }, tags: [] }) })).status, 403);
  } finally { released.resolve(); }
  assert.equal((await request).status, 200);
  const final = (await fetch(url + '/api/updates/progress').then(res => res.json())).progress;
  assert.equal(final.status, 'success'); assert.equal(final.total, 0); assert.equal(final.phase, 'finished');
});

test('live batch progress counts settled targets, exposes apply phase, and keeps partial failures explicit', async t => {
  const config = await options(t); const root = config.stateDir; await fs.mkdir(root);
  const targets = ['one', 'two', 'three', 'four'].map(id => ({ kind: 'skill', id }));
  const updates = targets.map((target, i) => ({ target, name: `Item ${i}`, canCheck: i !== 3, message: 'No source' }));
  const entered = gate(); const released = gate(); const applied = gate(); const releaseApply = gate();
  const scheduler = await createScheduler({ environments: { local: { root, stateBoundary: await captureDirectoryRoot(root) } }, startTimer: false,
    snapshot: async () => ({ skills: [], plugins: [], updates }), signature: async () => ({}), hasPreview: () => true, coreBusy: () => false,
    perform: async request => {
      if (request.target.id === 'one') return { updateItem: { status: 'current', message: 'Current' } };
      if (request.target.id === 'two' && request.action === 'update.check') { entered.resolve(); await released.promise; return { updateItem: { status: 'available', canAutoApply: true, canApply: true } }; }
      if (request.action === 'update.apply') { applied.resolve(); await releaseApply.promise; return {}; }
      throw new Error('Source offline');
    } });
  t.after(() => scheduler.close());
  const running = scheduler.run('local', { targets, autoApply: true });
  await entered.promise;
  const progress = scheduler.progress('local'); assert.equal(progress.total, 4); assert.equal(progress.completed, 1); assert.equal(progress.current.target.id, 'two');
  progress.counts.current = 99; assert.equal(scheduler.progress('local').counts.current, 1, 'public progress is detached from mutable state');
  await assert.rejects(scheduler.run('local', { targets, autoApply: false }), { code: 'BUSY' });
  released.resolve(); await applied.promise; assert.equal(scheduler.progress('local').phase, 'applying'); assert.equal(scheduler.progress('local').completed, 1);
  releaseApply.resolve(); await running;
  const final = scheduler.progress('local'); assert.equal(final.completed, 4); assert.equal(final.status, 'partial'); assert.equal(final.current, undefined);
  assert.deepEqual(final.counts, { current: 1, updated: 1, available: 0, skipped: 1, error: 1 });
});

test('initial scan failure produces a terminal progress error and releases the scheduler', async t => {
  const config = await options(t); await fs.mkdir(config.stateDir);
  const scheduler = await createScheduler({ environments: { local: { root: config.stateDir, stateBoundary: await captureDirectoryRoot(config.stateDir) } }, startTimer: false,
    snapshot: async () => { throw new Error('scan failed'); }, coreBusy: () => false });
  t.after(() => scheduler.close());
  const result = await scheduler.run('local', { autoApply: false });
  assert.equal(result.run.status, 'error'); assert.equal(scheduler.progress('local').completed, 0); assert.equal(scheduler.progress('local').counts.error, 1); assert.equal(scheduler.isRunning(), false);
});
