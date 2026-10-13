import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createService } from '../server/service.mjs';
import { inspectTree, identity } from '../server/files.mjs';
import { parseConfig } from '../server/config.mjs';

async function fixture(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock-backend-')));
  const home = path.join(root, 'home'); const codexHome = path.join(home, '.codex'); const projectDir = path.join(home, 'project');
  await fs.mkdir(codexHome, { recursive: true }); await fs.mkdir(projectDir, { recursive: true });
  await fs.writeFile(path.join(codexHome, 'config.toml'), '# user configuration sentinel\nmodel = "keep-me"\n');
  const adapter = { list: async () => ({ plugins: [], marketplaces: [], diagnostics: [], cli: { available: false, error: 'fixture' } }) };
  const service = await createService({ enableTestSandbox: true, home, codexHome, projectDir, stateDir: path.join(root, 'state'), adapter });
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return { root, service, localConfig: path.join(codexHome, 'config.toml'), codexHome };
}
const act = (service, action, extra = {}) => service.action({ mode: 'sandbox', action, ...extra });

test('sandbox complete lifecycle uses files, previews, config, update and restore without touching local Codex', async t => {
  const { service, localConfig } = await fixture(t); const sentinel = await fs.readFile(localConfig, 'utf8');
  let state = await service.snapshot('sandbox'); assert.equal(state.skills.length, 6);
  const source = state.examples.skillSource;
  const preview = (await act(service, 'skill.previewInstall', { sourceType: 'local', source })).preview;
  assert.equal(await fs.stat(preview.target).catch(() => null), null, 'preview must not install');
  await act(service, 'skill.install', { previewId: preview.id });
  state = await service.snapshot('sandbox'); const installed = state.skills.find(s => s.name === 'release-notes'); assert.ok(installed.canUpdate);
  await act(service, 'skill.toggle', { id: installed.id, enabled: false });
  state = await service.snapshot('sandbox'); assert.equal(state.skills.find(s => s.id === installed.id).enabled, false);
  const config = parseConfig(await fs.readFile(state.paths.config, 'utf8'));
  assert.equal(config.skills.config.find(s => s.path === installed.path).enabled, false); assert.equal(config.model, 'sandbox-fixture');
  await act(service, 'skill.remove', { id: installed.id });
  state = await service.snapshot('sandbox'); assert.ok(!state.skills.some(s => s.id === installed.id));
  const removal = state.activity.find(a => a.action === 'skill.remove' && a.status === 'success'); assert.ok(removal.canRestore);
  await act(service, 'activity.restore', { id: removal.id });
  state = await service.snapshot('sandbox'); assert.equal(state.skills.find(s => s.id === installed.id).enabled, false);
  const writing = state.skills.find(s => s.name === 'writing-assistant'); const before = await inspectTree(path.dirname(writing.path));
  const update = (await act(service, 'skill.checkUpdate', { id: writing.id })).update;
  assert.equal(update.available, true); assert.deepEqual(update.changes.map(c => c.type).sort(), ['added', 'modified']);
  await act(service, 'skill.update', { id: writing.id, previewId: update.id });
  const after = await inspectTree(path.dirname(writing.path)); assert.notEqual(before.fingerprint, after.fingerprint);
  state = await service.snapshot('sandbox'); const updateActivity = state.activity.find(a => a.action === 'skill.update');
  await act(service, 'activity.restore', { id: updateActivity.id });
  assert.equal((await inspectTree(path.dirname(writing.path))).fingerprint, before.fingerprint);
  assert.equal(await fs.readFile(localConfig, 'utf8'), sentinel, 'all sandbox actions leave real-mode fixture config unchanged');
});

test('installation refuses conflicts, changed sources, cross-mode previews and unsafe links', async t => {
  const { service, root } = await fixture(t); const state = await service.snapshot('sandbox'); const source = state.examples.skillSource;
  const preview = (await act(service, 'skill.previewInstall', { sourceType: 'local', source })).preview;
  await assert.rejects(service.action({ mode: 'local', action: 'skill.install', previewId: preview.id }), { code: 'STALE_PREVIEW' });
  await fs.appendFile(path.join(source, 'SKILL.md'), '\nSource changed\n');
  await assert.rejects(act(service, 'skill.install', { previewId: preview.id }), { code: 'SOURCE_CHANGED' });
  const fresh = (await act(service, 'skill.previewInstall', { sourceType: 'local', source })).preview;
  await fs.mkdir(fresh.target);
  await assert.rejects(act(service, 'skill.install', { previewId: fresh.id }), { code: 'TARGET_EXISTS' });
  await fs.symlink(root, path.join(source, 'outside'));
  await fs.rm(fresh.target, { recursive: true });
  await assert.rejects(act(service, 'skill.previewInstall', { sourceType: 'local', source }), { code: 'OUTSIDE_SOURCE' });
  await assert.rejects(act(service, 'skill.previewInstall', { sourceType: 'local', source: root }), { code: 'SANDBOX_BOUNDARY' });
});

test('updates reject local changes and recovery rejects occupied targets and modified replacement', async t => {
  const { service } = await fixture(t); let state = await service.snapshot('sandbox'); const writing = state.skills.find(s => s.canUpdate);
  const update = (await act(service, 'skill.checkUpdate', { id: writing.id })).update;
  await fs.appendFile(writing.path, '\nMy edit\n');
  await assert.rejects(act(service, 'skill.update', { id: writing.id, previewId: update.id }), { code: 'LOCAL_CHANGES' });
  await assert.rejects(act(service, 'skill.checkUpdate', { id: writing.id }), { code: 'LOCAL_CHANGES' });
  const removable = state.skills.find(s => s.name === 'test-planner');
  await act(service, 'skill.remove', { id: removable.id }); state = await service.snapshot('sandbox');
  const removal = state.activity.find(a => a.action === 'skill.remove' && a.status === 'success');
  await fs.mkdir(path.dirname(removable.path)); await fs.writeFile(removable.path, 'a new occupant');
  await assert.rejects(act(service, 'activity.restore', { id: removal.id }), { code: 'TARGET_EXISTS' });
  assert.equal(await fs.readFile(removable.path, 'utf8'), 'a new occupant');
  assert.equal((await service.snapshot('sandbox')).activity[0].status, 'error');
});

test('a restore is checked against the record its own update wrote: a source linked later does not vouch for the edits before it', async t => {
  const { service } = await fixture(t); const state = await service.snapshot('sandbox'); const writing = state.skills.find(s => s.canUpdate); const directory = path.dirname(writing.path);
  await act(service, 'skill.update', { id: writing.id, previewId: (await act(service, 'skill.checkUpdate', { id: writing.id })).update.id });
  const applied = (await service.snapshot('sandbox')).activity.find(entry => entry.action === 'skill.update' && entry.status === 'success');
  await fs.writeFile(path.join(directory, 'mine.txt'), 'mine'); await fs.writeFile(path.join(directory, '.DS_Store'), 'finder');
  const linked = (await act(service, 'skill.previewSource', { id: writing.id, sourceType: 'local', source: state.examples.legacySource })).sourcePreview;
  await act(service, 'skill.connectSource', { id: writing.id, previewId: linked.id });
  await assert.rejects(act(service, 'activity.restore', { id: applied.id }), { code: 'LOCAL_CHANGES' });
  assert.equal(await fs.readFile(path.join(directory, 'mine.txt'), 'utf8'), 'mine');
});

test('a restore does not take a link to the same content for what the update installed (75 C12-P3-06 R2)', async t => {
  const { service } = await fixture(t); const state = await service.snapshot('sandbox'); const writing = state.skills.find(s => s.canUpdate); const directory = path.dirname(writing.path);
  await act(service, 'skill.update', { id: writing.id, previewId: (await act(service, 'skill.checkUpdate', { id: writing.id })).update.id });
  const applied = (await service.snapshot('sandbox')).activity.find(entry => entry.action === 'skill.update' && entry.status === 'success');
  const held = `${directory}-held`; await fs.rename(directory, held); await fs.symlink(held, directory);
  await assert.rejects(act(service, 'activity.restore', { id: applied.id }), { code: 'LOCAL_CHANGES' });
  assert.equal((await fs.lstat(directory)).isSymbolicLink(), true);
});

test('.DS_Store is never a standalone skill\'s content: no local change, no update, no bar to a restore; any other file still is (HLD 3.3A; Owner 2026-10-12, widened in 0.11.2)', async t => {
  const { service, root } = await fixture(t); const state = await service.snapshot('sandbox'); const writing = state.skills.find(s => s.canUpdate);
  const directory = path.dirname(writing.path);
  const check = async id => (await act(service, 'skill.checkUpdate', { id })).update;
  const clean = await check(writing.id);
  assert.ok(clean.available);
  // Finder showed the folder and one inside it.
  await fs.writeFile(path.join(directory, '.DS_Store'), 'finder'); await fs.mkdir(path.join(directory, 'shown')); await fs.writeFile(path.join(directory, 'shown/.DS_Store'), 'finder');
  const offered = await check(writing.id);
  assert.deepEqual(offered.changes, clean.changes, '访达的文件不进差异');
  // The update applies to what is on disk, and its restore brings every file back.
  await act(service, 'skill.update', { id: writing.id, previewId: offered.id });
  assert.equal(await fs.stat(path.join(directory, '.DS_Store')).catch(() => null), null);
  assert.equal((await check(writing.id)).available, false);
  const applied = (await service.snapshot('sandbox')).activity.find(entry => entry.action === 'skill.update' && entry.status === 'success');
  // A file of the user's after the update bars the restore; Finder's does not (72 D29-P3-02).
  await fs.writeFile(path.join(directory, 'mine.txt'), 'mine');
  await assert.rejects(act(service, 'activity.restore', { id: applied.id }), { code: 'LOCAL_CHANGES' });
  await fs.rm(path.join(directory, 'mine.txt'));
  await fs.writeFile(path.join(directory, '.DS_Store'), 'finder again');
  assert.equal((await check(writing.id)).available, false, '来源没有变化时不产生只为删掉它的更新');
  await act(service, 'activity.restore', { id: applied.id });
  assert.deepEqual([await fs.readFile(path.join(directory, '.DS_Store'), 'utf8'), await fs.readFile(path.join(directory, 'shown/.DS_Store'), 'utf8')], ['finder', 'finder']);
  assert.ok((await check(writing.id)).available, '恢复后仍按记录比较');
  // Anything else beside it is a local change as before.
  await fs.writeFile(path.join(directory, 'mine.txt'), 'mine');
  await assert.rejects(check(writing.id), { code: 'LOCAL_CHANGES' });
  await fs.rm(path.join(directory, 'mine.txt'));
  // Only Finder's own file: one whose name merely ends or begins alike, or a folder of that name, is content (71 F3, F9; 73 F9b).
  for (const stray of ['x.DS_Store', 'kept/.DS_Store/inside.txt', '.DS_Store-kept', '.DS_Store-kept-too/inside.txt']) {
    await fs.mkdir(path.dirname(path.join(directory, stray)), { recursive: true }); await fs.writeFile(path.join(directory, stray), 'mine');
    await assert.rejects(check(writing.id), { code: 'LOCAL_CHANGES' }, stray);
    await fs.rm(path.join(directory, stray.split('/')[0]), { recursive: true });
  }
  // One that came with the source is in the record, and is no more content than the others: rewritten or
  // removed in the installation, it is neither a local change nor an update.
  const source = state.examples.skillSource; await fs.writeFile(path.join(source, '.DS_Store'), 'from the source');
  const preview = (await act(service, 'skill.previewInstall', { sourceType: 'local', source })).preview;
  await act(service, 'skill.install', { previewId: preview.id });
  const installed = (await service.snapshot('sandbox')).skills.find(skill => skill.path === path.join(preview.target, 'SKILL.md'));
  assert.equal((await check(installed.id)).available, false);
  await fs.writeFile(path.join(preview.target, '.DS_Store'), 'rewritten');
  assert.equal((await check(installed.id)).available, false);
  await fs.rm(path.join(preview.target, '.DS_Store'));
  assert.equal((await check(installed.id)).available, false);
  // Finder showing the source folder is not a new version of the skill (74 D30-P3-03).
  await fs.writeFile(path.join(source, '.DS_Store'), 'rewritten in the source'); await fs.mkdir(path.join(source, 'shown')); await fs.writeFile(path.join(source, 'shown/.DS_Store'), 'finder');
  assert.equal((await check(installed.id)).available, false);
  // A real change in the source is offered without them.
  await fs.writeFile(path.join(source, 'added.md'), 'new');
  assert.deepEqual((await check(installed.id)).changes, [{ path: 'added.md', type: 'added' }]);
  // A record without its file list is compared as it is: there is no telling which files it had (71 IF3-P3-03; 73 N8).
  // The one it counted, untouched, is no change; another appearing is one, Finder's or not.
  const file = path.join(root, 'state/sandbox/registry.json'); const registry = JSON.parse(await fs.readFile(file, 'utf8'));
  assert.ok(registry.sources[installed.id].files['.DS_Store']); delete registry.sources[installed.id].files; await fs.writeFile(file, JSON.stringify(registry));
  await fs.writeFile(path.join(preview.target, '.DS_Store'), 'from the source');
  assert.deepEqual((await check(installed.id)).changes, [{ path: 'added.md', type: 'added' }]);
  await fs.mkdir(path.join(preview.target, 'shown')); await fs.writeFile(path.join(preview.target, 'shown/.DS_Store'), 'finder');
  await assert.rejects(check(installed.id), { code: 'LOCAL_CHANGES' });
});

test('linking a source compares content without .DS_Store, as the check after it does; what appears after the preview still stops it (75 C12-P3-04)', async t => {
  const { service } = await fixture(t); const state = await service.snapshot('sandbox'); const plain = state.skills.find(skill => skill.name === 'api-notes'); const directory = path.dirname(plain.path);
  const same = path.join(service.environments.sandbox.root, 'sources/same-as-installed'); await fs.cp(directory, same, { recursive: true });
  await fs.writeFile(path.join(directory, '.DS_Store'), 'finder'); await fs.mkdir(path.join(same, 'shown')); await fs.writeFile(path.join(same, 'shown/.DS_Store'), 'finder');
  const preview = async () => (await act(service, 'skill.previewSource', { id: plain.id, sourceType: 'local', source: same })).sourcePreview;
  let linked = await preview(); assert.deepEqual([linked.matchesInstalled, linked.changes], [true, []]);
  await fs.writeFile(path.join(same, 'more.md'), 'new'); linked = await preview();
  assert.deepEqual([linked.matchesInstalled, linked.changes], [false, [{ path: 'more.md', type: 'added' }]]);
  await fs.writeFile(path.join(directory, '.DS_Store'), 'finder again');
  await assert.rejects(act(service, 'skill.connectSource', { id: plain.id, previewId: linked.id }), { code: 'LOCAL_CHANGES' });
  await act(service, 'skill.connectSource', { id: plain.id, previewId: (await preview()).id });
  assert.deepEqual((await act(service, 'skill.checkUpdate', { id: plain.id })).update.changes, [{ path: 'more.md', type: 'added' }]);
});

test('Git source installs a resolved commit from an isolated local repository', async t => {
  const { service } = await fixture(t); const state = await service.snapshot('sandbox'); assert.ok(state.examples.gitSource);
  const preview = (await act(service, 'skill.previewInstall', { sourceType: 'git', source: state.examples.gitSource })).preview;
  await act(service, 'skill.install', { previewId: preview.id });
  const installed = (await service.snapshot('sandbox')).skills.find(s => s.name === 'git-workflow'); assert.ok(installed.canUpdate);
  const registry = JSON.parse(await fs.readFile(service.environments.sandbox.registryFile, 'utf8'));
  assert.match(registry.sources[installed.id].commit, /^[a-f0-9]{40}$/);
  const update = (await act(service, 'skill.checkUpdate', { id: installed.id })).update; assert.equal(update.available, false);
});

test('sandbox marketplace and plugin lifecycle preserves installation when market removed', async t => {
  const { service } = await fixture(t); let state = await service.snapshot('sandbox');
  await act(service, 'marketplace.add', { sourceType: 'local', source: state.examples.marketplaceSource });
  state = await service.snapshot('sandbox'); const plugin = state.plugins.find(p => p.marketplace === 'community-market'); assert.ok(plugin.canInstall);
  await act(service, 'plugin.install', { id: plugin.id }); state = await service.snapshot('sandbox');
  assert.equal(state.plugins.find(p => p.id === plugin.id).installed, true); assert.equal(state.plugins.find(p => p.id === plugin.id).skillCount, 1);
  const attached = state.skills.find(s => s.pluginId === plugin.id); assert.equal(attached.canRemove, false);
  await act(service, 'plugin.toggle', { id: plugin.id, enabled: false }); state = await service.snapshot('sandbox');
  assert.equal(state.skills.find(s => s.pluginId === plugin.id).enabled, false);
  await act(service, 'marketplace.remove', { id: 'community-market' }); state = await service.snapshot('sandbox');
  assert.equal(state.plugins.find(p => p.id === plugin.id).installed, true);
  await act(service, 'plugin.remove', { id: plugin.id }); state = await service.snapshot('sandbox'); assert.ok(!state.plugins.some(p => p.id === plugin.id));
});

test('system skills reject writes and corrupted registry does not leave service permanently busy', async t => {
  const { service } = await fixture(t); const state = await service.snapshot('sandbox'); const system = state.skills.find(s => s.scope === 'system');
  await assert.rejects(act(service, 'skill.remove', { id: system.id }), { code: 'PROTECTED_SKILL' });
  await assert.rejects(act(service, 'skill.toggle', { id: system.id, enabled: false }), { code: 'PROTECTED_SKILL' });
  const file = service.environments.sandbox.registryFile; const original = await fs.readFile(file, 'utf8');
  await fs.writeFile(file, '{broken');
  await assert.rejects(act(service, 'skill.toggle', { id: system.id, enabled: false }), { code: 'INVALID_STATE' });
  await fs.writeFile(file, original);
  const regular = state.skills.find(s => s.canToggle);
  await act(service, 'skill.toggle', { id: regular.id, enabled: false });
});

test('removing a same-root symlink only moves the link and retains its target', async t => {
  const { service } = await fixture(t); const env = service.environments.sandbox; const target = path.join(env.skills, 'test-planner');
  const link = path.join(env.skills, 'a-shortcut'); await fs.symlink('test-planner', link);
  const state = await service.snapshot('sandbox'); const record = state.skills.find(s => s.id === identity(link));
  assert.ok(record); assert.ok(record.aliases?.some(alias => alias.includes('test-planner')));
  const before = await inspectTree(target); await act(service, 'skill.remove', { id: record.id });
  assert.equal((await inspectTree(target)).fingerprint, before.fingerprint); assert.equal(await fs.lstat(link).catch(() => null), null);
  const removal = (await service.snapshot('sandbox')).activity.find(a => a.action === 'skill.remove'); await act(service, 'activity.restore', { id: removal.id });
  assert.equal((await fs.lstat(link)).isSymbolicLink(), true);
});

test('update restore rejects a swapped skills parent and does not modify the external copy', async t => {
  const { service, root } = await fixture(t); const env = service.environments.sandbox;
  const writing = (await service.snapshot('sandbox')).skills.find(s => s.canUpdate);
  const update = (await act(service, 'skill.checkUpdate', { id: writing.id })).update;
  await act(service, 'skill.update', { id: writing.id, previewId: update.id });
  const activity = (await service.snapshot('sandbox')).activity.find(a => a.action === 'skill.update');
  const held = `${env.skills}-held`; const outside = path.join(root, 'outside-skills');
  await fs.rename(env.skills, held); await fs.cp(held, outside, { recursive: true }); await fs.symlink(outside, env.skills);
  const externalFile = path.join(outside, 'writing-assistant/SKILL.md'); const original = await fs.readFile(externalFile, 'utf8');
  await assert.rejects(act(service, 'activity.restore', { id: activity.id }), { code: 'RESTORE_BOUNDARY' });
  assert.equal(await fs.readFile(externalFile, 'utf8'), original);
});

test('plugin reinstall respects the existing persistent disabled state', async t => {
  const { service } = await fixture(t); const id = 'starter-tools@starter-market';
  await act(service, 'plugin.install', { id }); await act(service, 'plugin.toggle', { id, enabled: false });
  await act(service, 'plugin.remove', { id }); await act(service, 'plugin.install', { id });
  const state = await service.snapshot('sandbox'); assert.equal(state.plugins.find(p => p.id === id).enabled, false);
  const config = parseConfig(await fs.readFile(state.paths.config, 'utf8')); assert.equal(config.plugins[id].enabled, false);
});

test('all skill mutations reject a replaced managed root while ordinary in-root mutations remain valid', async t => {
  const { service, root } = await fixture(t); const env = service.environments.sandbox;
  let state = await service.snapshot('sandbox'); const writing = state.skills.find(s => s.canUpdate);
  await act(service, 'skill.toggle', { id: writing.id, enabled: false });
  await act(service, 'skill.toggle', { id: writing.id, enabled: true });
  const update = (await act(service, 'skill.checkUpdate', { id: writing.id })).update;
  const install = (await act(service, 'skill.previewInstall', { sourceType: 'local', source: state.examples.skillSource })).preview;
  const held = `${env.skills}-held`; const outside = path.join(root, 'outside');
  await fs.rename(env.skills, held); await fs.cp(held, outside, { recursive: true }); await fs.symlink(outside, env.skills);
  const before = await inspectTree(outside); state = await service.snapshot('sandbox');
  assert.ok(!state.skills.some(skill => skill.path.includes('/writing-assistant/'))); assert.ok(state.diagnostics.some(message => /隔离范围|身份/.test(message)));
  for (const [action, fields] of [['skill.toggle', { id: writing.id, enabled: false }], ['skill.remove', { id: writing.id }], ['skill.checkUpdate', { id: writing.id }], ['skill.update', { id: writing.id, previewId: update.id }], ['skill.install', { previewId: install.id }]]) {
    await assert.rejects(act(service, action, fields), error => [403, 404, 409].includes(error.status));
    assert.equal((await inspectTree(outside)).fingerprint, before.fingerprint, `${action} changed external data`);
  }
});

test('installation checks stable Codex parent before creating skills directories', async t => {
  const { service, root } = await fixture(t); const env = service.environments.sandbox;
  const state = await service.snapshot('sandbox'); const preview = (await act(service, 'skill.previewInstall', { sourceType: 'local', source: state.examples.skillSource })).preview;
  const outside = path.join(root, 'outside-empty'); await fs.mkdir(outside); await fs.rename(env.codexHome, `${env.codexHome}-held`); await fs.symlink(outside, env.codexHome);
  await assert.rejects(act(service, 'skill.install', { previewId: preview.id }), { code: 'ROOT_BOUNDARY' });
  assert.deepEqual(await fs.readdir(outside), [], 'boundary check must precede mkdir');
});

test('local mode also freezes canonical managed roots against runtime symlink replacement', async t => {
  const { service, root } = await fixture(t); const env = service.environments.local;
  const directory = path.join(env.skills, 'local-sample'); await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, 'SKILL.md'), '---\nname: local-sample\ndescription: Local fixture\n---\n');
  const record = (await service.snapshot('local')).skills.find(s => s.name === 'local-sample'); assert.ok(record.canRemove);
  const outside = path.join(root, 'outside-local'); await fs.rename(env.skills, `${env.skills}-held`); await fs.cp(`${env.skills}-held`, outside, { recursive: true }); await fs.symlink(outside, env.skills);
  await assert.rejects(service.action({ mode: 'local', action: 'skill.remove', id: record.id }), error => [403, 404, 409].includes(error.status));
  assert.ok(await fs.stat(path.join(outside, 'local-sample/SKILL.md')));
});

test('marketplace-only custom skill declarations survive installation and marketplace removal', async t => {
  const { service } = await fixture(t); const env = service.environments.sandbox; const market = path.join(env.root, 'sources/custom-market');
  const customSkill = path.join(market, 'plugins/demo/custom-skills/sample'); await fs.mkdir(customSkill, { recursive: true });
  await fs.writeFile(path.join(customSkill, 'SKILL.md'), '---\nname: custom-entry-skill\ndescription: Declared only in marketplace entry\n---\n');
  await fs.mkdir(path.join(market, '.agents/plugins'), { recursive: true });
  await fs.writeFile(path.join(market, '.agents/plugins/marketplace.json'), JSON.stringify({ name: 'custom-market', plugins: [{ name: 'demo', source: './plugins/demo', strict: false, skills: ['./custom-skills'] }] }));
  await act(service, 'marketplace.add', { sourceType: 'local', source: market }); await act(service, 'plugin.install', { id: 'demo@custom-market' });
  for (const removed of [false, true]) {
    if (removed) await act(service, 'marketplace.remove', { id: 'custom-market' });
    const state = await service.snapshot('sandbox'); const plugin = state.plugins.find(p => p.id === 'demo@custom-market');
    assert.equal(plugin.installed, true); assert.equal(plugin.skillCount, 1); assert.ok(plugin.canRemove);
    assert.equal(state.skills.find(s => s.name === 'custom-entry-skill').scope, 'plugin'); assert.deepEqual(state.diagnostics, []);
  }
});

test('plugin installation rejects existing ancestor links before creating any external directories', async t => {
  for (const prefix of ['plugins', 'plugins/cache', 'plugins/cache/starter-market']) await t.test(prefix, async subtest => {
    const { service, root } = await fixture(subtest); const env = service.environments.sandbox;
    const outside = path.join(root, 'outside-plugin'); await fs.mkdir(outside);
    const link = path.join(env.codexHome, prefix); await fs.mkdir(path.dirname(link), { recursive: true }); await fs.symlink(outside, link);
    await assert.rejects(act(service, 'plugin.install', { id: 'starter-tools@starter-market' }), error => ['ROOT_BOUNDARY', 'PLUGIN_BOUNDARY'].includes(error.code));
    assert.deepEqual(await fs.readdir(outside), [], 'denied install must have zero external mkdir/copy effects');
  });
});

test('staging, quarantine and configuration backup directories cannot redirect writes outside app state', async t => {
  const { service, root } = await fixture(t); const env = service.environments.sandbox; const state = await service.snapshot('sandbox');
  const outside = path.join(root, 'outside-state'); await fs.mkdir(outside);
  for (const folder of ['staging', 'quarantine', 'config-backups']) await fs.symlink(outside, path.join(env.root, folder));
  await assert.rejects(act(service, 'skill.previewInstall', { sourceType: 'local', source: state.examples.skillSource }), { code: 'ROOT_BOUNDARY' });
  const record = state.skills.find(s => s.name === 'test-planner'); const prior = await fs.readFile(record.path, 'utf8');
  await assert.rejects(act(service, 'skill.remove', { id: record.id }), { code: 'ROOT_BOUNDARY' });
  assert.equal(await fs.readFile(record.path, 'utf8'), prior);
  const config = await fs.readFile(env.config, 'utf8'); await assert.rejects(act(service, 'skill.toggle', { id: record.id, enabled: false }), { code: 'ROOT_BOUNDARY' });
  assert.equal(await fs.readFile(env.config, 'utf8'), config); assert.deepEqual(await fs.readdir(outside), []);
});
