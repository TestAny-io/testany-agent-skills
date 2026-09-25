import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createService } from '../server/service.mjs';
import { readConfig } from '../server/config.mjs';
import { readJson, writeJson } from '../server/files.mjs';

async function fixture(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock-plugin-selection-')));
  let time = Date.parse('2026-09-24T00:00:00Z');
  const options = { stateDir: root, home: root, projectDir: root, codexHome: path.join(root, '.codex'), enableTestSandbox: true, background: false, scheduler: false, now: () => time };
  const service = await createService(options); const env = service.environments.sandbox;
  const market = path.join(env.root, 'selection-market'); const source = path.join(market, 'plugin');
  const manifest = version => writeJson(path.join(source, '.codex-plugin/plugin.json'), { name: 'select-tools', description: 'Choose your workflows', version });
  const skill = async (relative, name, description = `Use ${relative} for useful work`) => { const file = path.join(source, relative, 'SKILL.md'); await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, `---\nname: ${name}\ndescription: ${description}\n---\nA harmless fixture.\n`); };
  await skill('skills/one', 'same-name', 'First workflow'); await skill('skills/two', 'same-name', 'Second workflow'); await skill('skills/group/three', 'nested', 'A nested workflow'); await manifest('1.0.0');
  await writeJson(path.join(market, '.agents/plugins/marketplace.json'), { name: 'selection-market', plugins: [{ name: 'select-tools', source: './plugin' }] });
  const act = (action, fields = {}) => service.action({ mode: 'sandbox', action, ...fields });
  await act('marketplace.add', { sourceType: 'local', source: market });
  const id = 'select-tools@selection-market';
  const preview = async () => (await act('plugin.previewMarketplace', { id })).pluginPreview;
  const install = async enabledSkills => { const p = await preview(); await act('plugin.install', { id, previewId: p.id, enabledSkills }); return p; };
  t.after(async () => { await service.close(); await fs.rm(root, { recursive: true, force: true }); });
  return { root, options, env, service, source, market, id, act, skill, manifest, preview, install, advance: () => { time += 16 * 60000; } };
}

test('both preview routes show every skill, descriptions and paths, including duplicate names and nested folders', async t => {
  const f = await fixture(t); const before = await f.service.snapshot('sandbox'); const config = await readConfig(f.env.config);
  const direct = (await f.act('plugin.previewInstall', { sourceType: 'local', source: f.source })).pluginPreview;
  const market = await f.preview();
  for (const preview of [direct, market]) {
    assert.equal(preview.skillDetails.length, 3); assert.equal(preview.skills.filter(name => name === 'same-name').length, 2);
    assert.equal(preview.skillDetails.find(skill => skill.path === 'skills/two/SKILL.md').description, 'Second workflow');
    assert.ok(preview.skillDetails.some(skill => skill.path === 'skills/group/three/SKILL.md')); assert.equal(preview.canSelectSkills, true);
  }
  assert.deepEqual((await f.service.snapshot('sandbox')).plugins, before.plugins);
  assert.equal((await readConfig(f.env.config)).text, config.text);
});

test('internal aliases resolve to one native config path, without enabling unchecked skills', async t => {
  const f = await fixture(t);
  await fs.symlink('two', path.join(f.source, 'skills/00-alias'));
  await fs.mkdir(path.join(f.source, 'skills/01-file-alias'));
  await fs.symlink('../two/SKILL.md', path.join(f.source, 'skills/01-file-alias/SKILL.md'));
  const preview = await f.preview();
  assert.equal(preview.skillDetails.length, 3);
  assert.ok(preview.skillDetails.some(skill => skill.path === 'skills/two/SKILL.md'));
  assert.ok(preview.skillDetails.every(skill => !skill.path.includes('00-alias')));
  await f.install(['skills/one/SKILL.md']);
  let state = await f.service.snapshot('sandbox');
  const second = state.skills.find(item => item.pluginId === f.id && item.packagePath === 'skills/two/SKILL.md');
  assert.equal(second.enabled, false);
  assert.equal(second.path, await fs.realpath(second.path));
  await f.act('skill.toggle', { id: second.id, enabled: true });
  state = await f.service.snapshot('sandbox');
  assert.equal(state.skills.filter(item => item.pluginId === f.id && item.enabled).length, 2);
  assert.equal((await readConfig(f.env.config)).data.skills.config.find(item => item.path === second.path).enabled, true);
});

test('marketplace preview includes marketplace-declared skills and refuses incomplete or unsafe lists', async t => {
  const f = await fixture(t); await f.skill('extra/custom', 'custom');
  await writeJson(path.join(f.market, '.agents/plugins/marketplace.json'), { name: 'selection-market', plugins: [{ name: 'select-tools', source: './plugin', skills: './extra/' }] });
  assert.equal((await f.preview()).skillDetails.length, 4);
  await fs.writeFile(path.join(f.source, 'extra/custom/SKILL.md'), 'malformed');
  await assert.rejects(f.preview(), { code: 'INVALID_SKILL' });
  await fs.rm(path.join(f.source, 'extra'), { recursive: true });
  await fs.symlink(f.root, path.join(f.source, 'skills/external'));
  await assert.rejects(f.preview(), { code: 'PLUGIN_BOUNDARY' });
});

test('installing a subset keeps the whole package but enables only the selected paths; toggles never affect siblings', async t => {
  const f = await fixture(t); await f.install(['skills/one/SKILL.md']);
  let state = await f.service.snapshot('sandbox'); const plugin = state.plugins.find(item => item.id === f.id);
  assert.equal(plugin.installed, true); assert.equal(plugin.enabled, true); assert.equal(plugin.skillCount, 3);
  const included = state.skills.filter(item => item.pluginId === f.id);
  assert.deepEqual(included.filter(item => item.enabled).map(item => item.packagePath), ['skills/one/SKILL.md']);
  const second = included.find(item => item.packagePath === 'skills/two/SKILL.md');
  await f.act('skill.toggle', { id: second.id, enabled: true });
  state = await f.service.snapshot('sandbox');
  assert.equal(state.plugins.find(item => item.id === f.id).enabled, true);
  assert.equal(state.skills.filter(item => item.pluginId === f.id && item.enabled).length, 2);
  assert.equal(state.skills.find(item => item.packagePath === 'skills/group/three/SKILL.md').enabled, false);
  await f.act('plugin.toggle', { id: f.id, enabled: false });
  await assert.rejects(f.act('skill.toggle', { id: second.id, enabled: true }), { code: 'PROTECTED_SKILL' });
  await f.act('plugin.toggle', { id: f.id, enabled: true });
  assert.equal((await f.service.snapshot('sandbox')).skills.filter(item => item.pluginId === f.id && item.enabled).length, 2);
  assert.equal((await readConfig(f.env.config)).data.model, 'sandbox-fixture');
});

test('disabling one skill in a previously installed plugin keeps its siblings and parent enabled', async t => {
  const f = await fixture(t);
  await f.act('plugin.install', { id: f.id });
  const original = (await f.service.snapshot('sandbox')).skills.filter(item => item.pluginId === f.id);
  assert.equal(original.length, 3); assert.ok(original.every(item => item.enabled));
  const target = original.find(item => item.packagePath === 'skills/two/SKILL.md');
  await f.act('skill.toggle', { id: target.id, enabled: false });
  const state = await f.service.snapshot('sandbox');
  assert.equal(state.plugins.find(item => item.id === f.id).enabled, true);
  assert.equal(state.skills.find(item => item.id === target.id).enabled, false);
  assert.ok(state.skills.filter(item => item.pluginId === f.id && item.id !== target.id).every(item => item.enabled));
  assert.equal((await readConfig(f.env.config)).data.plugins?.[f.id]?.enabled, undefined);
});

test('direct installs support zero selected skills and reject forged selections before installing', async t => {
  const f = await fixture(t); const p = (await f.act('plugin.previewInstall', { sourceType: 'local', source: f.source })).pluginPreview;
  await assert.rejects(f.act('plugin.installSource', { previewId: p.id, enabledSkills: ['skills/forged/SKILL.md'] }), { code: 'INVALID_SELECTION' });
  await assert.rejects(f.act('plugin.installSource', { previewId: p.id, enabledSkills: ['../outside/SKILL.md'] }), { code: 'INVALID_SELECTION' });
  await f.act('plugin.installSource', { previewId: p.id, enabledSkills: [] });
  const state = await f.service.snapshot('sandbox'); const plugin = state.plugins.find(item => item.name === 'select-tools' && item.installed);
  assert.equal(plugin.enabled, true); assert.equal(plugin.skillCount, 3);
  assert.ok(state.skills.filter(item => item.pluginId === plugin.id).every(item => item.enabled === false));
});

test('marketplace install rejects stale or mismatched previews and changed skill contents without side effects', async t => {
  const f = await fixture(t); const p = await f.preview();
  await assert.rejects(f.act('plugin.install', { id: f.id, enabledSkills: [] }), { code: 'INVALID_ACTION' });
  await assert.rejects(f.act('plugin.install', { id: f.id, previewId: p.id, enabledSkills: ['skills/one/SKILL.md', 'skills/one/SKILL.md'] }), { code: 'INVALID_SELECTION' });
  await assert.rejects(f.act('plugin.install', { id: f.id, previewId: p.id, enabledSkills: ['skills/missing/SKILL.md'] }), { code: 'INVALID_SELECTION' });
  await f.skill('skills/two', 'changed');
  await assert.rejects(f.act('plugin.install', { id: f.id, previewId: p.id, enabledSkills: [] }), { code: 'SOURCE_CHANGED' });
  const fresh = await f.preview(); f.advance(); f.advance();
  await assert.rejects(f.act('plugin.install', { id: f.id, previewId: fresh.id, enabledSkills: [] }), { code: 'STALE_PREVIEW' });
  assert.equal((await f.service.snapshot('sandbox')).plugins.find(item => item.id === f.id).installed, false);
});

test('scheduled updates and restarts preserve selected skills, while newly added skills start disabled', async t => {
  const f = await fixture(t); await f.install(['skills/one/SKILL.md']); const target = { kind: 'plugin', id: f.id };
  await f.act('schedule.configure', { schedule: { enabled: true, intervalMinutes: 15, timezone: 'UTC', autoApply: true, targets: [target] } });
  await f.manifest('1.1.0'); await f.skill('skills/new', 'new-workflow'); f.advance();
  await f.service.tickScheduler();
  let state = await f.service.snapshot('sandbox');
  assert.equal(state.updateRuns[0].status, 'success'); assert.equal(state.plugins.find(item => item.id === f.id).version, '1.1.0');
  assert.deepEqual(state.skills.filter(item => item.pluginId === f.id && item.enabled).map(item => item.packagePath), ['skills/one/SKILL.md']);
  await f.service.close(); const restarted = await createService(f.options);
  try {
    state = await restarted.snapshot('sandbox');
    assert.equal(state.skills.filter(item => item.pluginId === f.id && item.scope === 'plugin').length, 4);
    assert.deepEqual(state.skills.filter(item => item.pluginId === f.id && item.enabled).map(item => item.packagePath), ['skills/one/SKILL.md']);
  } finally { await restarted.close(); }
});

test('checking an externally refreshed installation restores saved skill choices for the new cache path', async t => {
  const f = await fixture(t); await f.install(['skills/one/SKILL.md']);
  await f.manifest('1.1.0'); await f.skill('skills/new', 'new-workflow');
  const registry = await readJson(f.env.registryFile); const plugin = registry.plugins[f.id];
  const next = path.join(path.dirname(plugin.directory), '1.1.0'); await fs.cp(f.source, next, { recursive: true });
  registry.plugins[f.id] = { ...plugin, directory: next, version: '1.1.0' }; await writeJson(f.env.registryFile, registry);
  assert.equal((await f.act('update.check', { target: { kind: 'plugin', id: f.id } })).updateItem.status, 'current');
  const state = await f.service.snapshot('sandbox');
  assert.deepEqual(state.skills.filter(item => item.pluginId === f.id && item.enabled).map(item => item.packagePath), ['skills/one/SKILL.md']);
});
