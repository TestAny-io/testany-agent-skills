import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createService, validateAction } from '../server/service.mjs';
import { emptyRegistry } from '../server/fixtures.mjs';
import { inspectTree, identity } from '../server/files.mjs';

const act = (service, action, fields = {}) => service.action({ mode: 'local', action, ...fields });
async function writeSkill(directory, name = 'same-name', marker = directory) {
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, 'SKILL.md'), `---\nname: ${name}\ndescription: Duplicate selection fixture.\n---\n${marker}\n`);
}
async function fixture(t, options = {}) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock-duplicates-')));
  const home = path.join(root, 'home'); const codexHome = path.join(home, '.codex'); const projectDir = path.join(home, 'project');
  const directories = [path.join(codexHome, 'skills/first'), path.join(home, '.agents/skills/second'), path.join(projectDir, '.agents/skills/third'), path.join(projectDir, '.codex/skills/fourth')];
  for (const directory of directories) await writeSkill(directory);
  const pluginPath = path.join(codexHome, 'plugins/cache/market/bundle/1.0.0');
  await fs.mkdir(path.join(pluginPath, '.codex-plugin'), { recursive: true });
  await fs.writeFile(path.join(pluginPath, '.codex-plugin/plugin.json'), JSON.stringify({ name: 'bundle', version: '1.0.0' }));
  await writeSkill(path.join(pluginPath, 'skills/bundled'));
  await writeSkill(path.join(codexHome, 'skills/.system/builtin'));
  await fs.writeFile(path.join(codexHome, 'config.toml'), '# retained setting\nmodel = "keep"\n');
  const adapter = { list: async () => ({ plugins: [{ id: 'bundle@market', name: 'bundle', marketplace: 'market', version: '1.0.0', installed: true, enabled: true, sourcePath: pluginPath, canToggle: true, canRemove: true }], marketplaces: [], diagnostics: [], cli: { available: true } }) };
  const service = await createService({ home, codexHome, projectDir, stateDir: path.join(root, 'state'), adapter, scheduler: false, ...options });
  t.after(async () => { await service.close(); await fs.rm(root, { recursive: true, force: true }); });
  const state = await service.snapshot('local');
  const owned = directories.map(directory => state.skills.find(skill => skill.id === identity(directory)));
  assert.equal(state.skills.length, 6); assert.ok(owned.every(skill => skill.canRemove));
  const registry = emptyRegistry();
  for (const skill of owned) {
    const directory = path.dirname(skill.path); const tree = await inspectTree(directory);
    registry.sources[skill.id] = { directory, sourceType: 'local', source: directory, fingerprint: tree.fingerprint, files: tree.entries, installedAt: new Date().toISOString() };
  }
  await fs.writeFile(service.environments.local.registryFile, JSON.stringify(registry));
  return { root, home, codexHome, projectDir, service, state, owned, registry };
}
const preview = async (service, skills) => (await act(service, 'skill.previewRemoval', { groupName: 'same-name', ids: skills.map(skill => skill.id) })).removalPreview;

test('selection requests require bounded distinct path identities and a duplicate group', () => {
  const valid = { mode: 'local', action: 'skill.previewRemoval', groupName: 'same-name', ids: ['a'.repeat(24)] };
  assert.equal(validateAction(valid), valid);
  for (const ids of [[], [valid.ids[0], valid.ids[0]], ['/tmp/path'], ['same-name'], Array.from({ length: 101 }, (_, i) => i.toString(16).padStart(24, '0'))]) assert.throws(() => validateAction({ ...valid, ids }), { code: 'INVALID_SELECTION' });
  assert.throws(() => validateAction({ ...valid, groupName: '' }), { code: 'INVALID_SELECTION' });
  assert.throws(() => validateAction({ mode: 'local', action: 'skill.removeSelected', previewId: 'id', ids: valid.ids }), { code: 'INVALID_ACTION' });
});

test('multi-select keeps unselected copies and config intact and restores each exact path independently', async t => {
  const { service, state, owned, registry } = await fixture(t);
  await act(service, 'skill.toggle', { id: owned[2].id, enabled: false });
  const configFile = service.environments.local.config; const config = await fs.readFile(configFile, 'utf8');
  const beforeRegistry = await fs.readFile(service.environments.local.registryFile, 'utf8');
  const beforeFiles = new Map(await Promise.all(state.skills.map(async skill => [skill.id, await fs.readFile(skill.path, 'utf8')])));
  const plan = await preview(service, owned.slice(0, 2));
  assert.deepEqual(plan.remove.map(skill => skill.path), owned.slice(0, 2).map(skill => skill.path));
  assert.equal(plan.keep.length, 4);
  assert.equal(await fs.readFile(service.environments.local.registryFile, 'utf8'), beforeRegistry, 'preview is read-only');
  for (const skill of owned) assert.equal(await fs.readFile(skill.path, 'utf8'), beforeFiles.get(skill.id));
  await act(service, 'skill.removeSelected', { previewId: plan.id });
  for (const skill of owned.slice(0, 2)) assert.equal(await fs.stat(skill.path).catch(() => null), null);
  for (const skill of plan.keep) assert.equal(await fs.readFile(skill.path, 'utf8'), beforeFiles.get(skill.id));
  assert.equal(await fs.readFile(configFile, 'utf8'), config);
  let updated = JSON.parse(await fs.readFile(service.environments.local.registryFile, 'utf8'));
  for (const skill of owned.slice(0, 2)) assert.equal(updated.sources[skill.id], undefined);
  for (const skill of owned.slice(2)) assert.deepEqual(updated.sources[skill.id], registry.sources[skill.id]);
  const removals = (await service.snapshot('local')).activity.filter(item => item.action === 'skill.remove');
  assert.equal(removals.length, 2); assert.ok(removals.every(item => item.canRestore));
  await act(service, 'activity.restore', { id: removals.find(item => item.path === owned[0].path).id });
  assert.equal(await fs.readFile(owned[0].path, 'utf8'), beforeFiles.get(owned[0].id));
  assert.equal(await fs.stat(owned[1].path).catch(() => null), null);
  updated = JSON.parse(await fs.readFile(service.environments.local.registryFile, 'utf8'));
  assert.deepEqual(updated.sources[owned[0].id], registry.sources[owned[0].id]);
  await assert.rejects(act(service, 'skill.removeSelected', { previewId: plan.id }), { code: 'STALE_PREVIEW' });
});

test('single selection keeps multiple copies; multiple selections can keep one removable copy', async t => {
  for (const count of [1, 3]) await t.test(`remove ${count}`, async t => {
    const { service, owned } = await fixture(t);
    const plan = await preview(service, owned.slice(0, count));
    await act(service, 'skill.removeSelected', { previewId: plan.id });
    const current = (await service.snapshot('local')).skills;
    assert.deepEqual(current.filter(skill => skill.canRemove).map(skill => skill.id).sort(), owned.slice(count).map(skill => skill.id).sort());
    assert.ok(current.some(skill => skill.scope === 'plugin')); assert.ok(current.some(skill => skill.scope === 'system'));
  });
});

test('protected, missing or unrelated ids never cause partial deletion', async t => {
  const { service, state, owned, codexHome } = await fixture(t);
  await writeSkill(path.join(codexHome, 'skills/other'), 'other-name');
  for (const scope of ['plugin', 'system']) await assert.rejects(preview(service, [owned[0], state.skills.find(skill => skill.scope === scope)]), { code: 'PROTECTED_SKILL' });
  for (const id of ['f'.repeat(24), identity(path.join(codexHome, 'skills/other'))]) await assert.rejects(preview(service, [owned[0], { id }]), { code: 'REMOVAL_CHANGED' });
  for (const skill of owned) assert.ok(await fs.stat(skill.path));
  assert.equal((await service.snapshot('local')).activity.length, 0);
});

test('changed content, replaced directory or duplicate membership invalidates the whole preview', async t => {
  for (const change of ['content', 'identity', 'member']) await t.test(change, async t => {
    const { service, owned, codexHome } = await fixture(t); const first = await fs.readFile(owned[0].path, 'utf8');
    const plan = await preview(service, owned.slice(0, 2));
    if (change === 'content') await fs.appendFile(owned[1].path, '\nExternal edit');
    if (change === 'identity') { const directory = path.dirname(owned[1].path); await fs.rename(directory, directory + '.original'); await fs.cp(directory + '.original', directory, { recursive: true }); await fs.rm(directory + '.original', { recursive: true }); }
    if (change === 'member') await writeSkill(path.join(codexHome, 'skills/new-copy'));
    await assert.rejects(act(service, 'skill.removeSelected', { previewId: plan.id }), { code: 'REMOVAL_CHANGED' });
    assert.equal(await fs.readFile(owned[0].path, 'utf8'), first); assert.ok(await fs.stat(owned[1].path));
    assert.equal((await service.snapshot('local')).activity.filter(item => item.status === 'success').length, 0);
  });
});

test('previews expire, cannot cross modes, and are cleared when switching projects', async t => {
  let clock = Date.now();
  const { service, owned, projectDir } = await fixture(t, { now: () => clock, enableTestSandbox: true });
  const plan = await preview(service, owned.slice(0, 1));
  await assert.rejects(service.action({ mode: 'sandbox', action: 'skill.removeSelected', previewId: plan.id }), { code: 'STALE_PREVIEW' });
  clock += 30 * 60000 + 1;
  await assert.rejects(act(service, 'skill.removeSelected', { previewId: plan.id }), { code: 'STALE_PREVIEW' });
  const next = await preview(service, owned.slice(0, 1));
  await act(service, 'project.select', { projectDir });
  await assert.rejects(act(service, 'skill.removeSelected', { previewId: next.id }), { code: 'STALE_PREVIEW' });
  assert.ok(await fs.stat(owned[0].path));
});

test('mid-batch move failure and registry write failure roll back all removed copies', async t => {
  for (const failure of ['move', 'registry']) await t.test(failure, async t => {
    const { service, owned } = await fixture(t); const registryFile = service.environments.local.registryFile;
    const originalRegistry = JSON.parse(await fs.readFile(registryFile, 'utf8'));
    const fingerprints = await Promise.all(owned.map(skill => inspectTree(path.dirname(skill.path)).then(tree => tree.fingerprint)));
    const plan = await preview(service, owned.slice(0, 2)); const rename = fs.rename;
    fs.rename = async (from, to) => {
      if (failure === 'move' ? from === path.dirname(owned[1].path) : to === registryFile) throw Object.assign(new Error('simulated write failure'), { code: 'EACCES' });
      return rename(from, to);
    };
    try { await assert.rejects(act(service, 'skill.removeSelected', { previewId: plan.id }), /simulated write failure/); }
    finally { fs.rename = rename; }
    for (const [index, skill] of owned.entries()) assert.equal((await inspectTree(path.dirname(skill.path))).fingerprint, fingerprints[index]);
    const registry = JSON.parse(await fs.readFile(registryFile, 'utf8'));
    assert.deepEqual(registry.sources, originalRegistry.sources);
    assert.equal(registry.activity.filter(item => item.status === 'success').length, 0);
  });
});

test('a selected alias moves only that link and does not delete its physical skill or other copies', async t => {
  const { service, owned, codexHome } = await fixture(t);
  const link = path.join(codexHome, 'skills/a-link'); await fs.symlink('first', link);
  const linked = (await service.snapshot('local')).skills.find(skill => skill.id === identity(link));
  assert.ok(linked.isLink); assert.ok(linked.aliases.includes(owned[0].path));
  const original = await fs.readFile(owned[0].path, 'utf8');
  const plan = await preview(service, [linked]); await act(service, 'skill.removeSelected', { previewId: plan.id });
  assert.equal(await fs.lstat(link).catch(() => null), null); assert.equal(await fs.readFile(owned[0].path, 'utf8'), original);
  for (const skill of owned.slice(1)) assert.ok(await fs.stat(skill.path));
  const removal = (await service.snapshot('local')).activity.find(item => item.path === linked.path);
  await act(service, 'activity.restore', { id: removal.id }); assert.ok((await fs.lstat(link)).isSymbolicLink());
});

test('removing a directory cannot also remove another discovered skill nested inside it', async t => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock-nested-')));
  const home = path.join(root, 'home'); const codexHome = path.join(home, '.codex');
  const outer = path.join(home, '.agents/skills/outer'); const projectDir = path.join(outer, 'project');
  const inner = path.join(projectDir, '.agents/skills/inner');
  await writeSkill(outer); await writeSkill(path.join(codexHome, 'skills/peer')); await writeSkill(inner, 'different-name');
  const service = await createService({ home, codexHome, projectDir, stateDir: path.join(root, 'state'), scheduler: false, adapter: { list: async () => ({ plugins: [], marketplaces: [], diagnostics: [], cli: { available: false } }) } });
  t.after(async () => { await service.close(); await fs.rm(root, { recursive: true, force: true }); });
  await assert.rejects(preview(service, [{ id: identity(outer) }]), { code: 'REMOVAL_OVERLAP' });
  assert.ok(await fs.stat(path.join(inner, 'SKILL.md')));
});
