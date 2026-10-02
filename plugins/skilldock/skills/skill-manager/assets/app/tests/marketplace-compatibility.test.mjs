import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readMarketplace, discoverSkillRoots, readComponentEntry, CodexAdapter } from '../server/cli.mjs';
import { pluginContents } from '../server/plugin-contents.mjs';
import { createService } from '../server/service.mjs';
import { writeJson, readJson } from '../server/files.mjs';

const upstream = fileURLToPath(new URL('./fixtures/ui-ux-pro-max/', import.meta.url));
const names = ['banner-design', 'brand', 'design', 'design-system', 'slides', 'ui-styling', 'ui-ux-pro-max'];
async function temporary(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock-market-compat-')));
  t.after(() => fs.rm(root, { recursive: true, force: true })); return root;
}
async function skill(root, relative) {
  await fs.mkdir(path.join(root, relative), { recursive: true });
  await fs.writeFile(path.join(root, relative, 'SKILL.md'), `---\nname: ${path.basename(relative)}\ndescription: Harmless compatibility fixture.\n---\nSynthetic test content.\n`);
}
async function configure(root, entry = {}, manifest) {
  await writeJson(path.join(root, '.claude-plugin/marketplace.json'), { name: 'compat-market', plugins: [{ name: 'compat-plugin', source: './', ...entry }] });
  const file = path.join(root, '.claude-plugin/plugin.json');
  if (manifest === undefined) await fs.rm(file, { force: true });
  else await writeJson(file, manifest);
  return { name: 'compat-plugin', source: './', ...entry };
}
async function realMetadataFixture(root) {
  await fs.mkdir(path.join(root, '.claude-plugin'), { recursive: true });
  for (const name of ['marketplace.json', 'plugin.json']) await fs.copyFile(path.join(upstream, name), path.join(root, '.claude-plugin', name));
  for (const name of names) await skill(root, `.claude/skills/${name}`);
}

test('version precedence accepts duplicate declarations, preserves both inputs, and produces nonfatal warnings', async t => {
  const root = await temporary(t);
  for (const [entryVersion, manifestVersion, expected, warnings] of [
    [undefined, undefined, 'local', 0], ['1.0.0', undefined, '1.0.0', 0],
    [undefined, '2.0.0', '2.0.0', 0], ['2.0.0', '2.0.0', '2.0.0', 1],
    ['9.0.0', '2.0.0', '2.0.0', 1], ['1.0.0', '2.0.0', '2.0.0', 1],
  ]) {
    const manifest = { name: 'compat-plugin', ...(manifestVersion === undefined ? {} : { version: manifestVersion }) };
    const entry = await configure(root, entryVersion === undefined ? {} : { version: entryVersion }, manifest);
    const before = await fs.readFile(path.join(root, '.claude-plugin/marketplace.json'));
    const catalog = await readMarketplace(root);
    assert.equal(catalog.plugins[0].version, expected);
    assert.equal(catalog.warnings.length, warnings); assert.deepEqual(catalog.plugins[0].warnings, catalog.warnings);
    if (warnings) { assert.ok(catalog.warnings[0].includes(entryVersion)); assert.ok(catalog.warnings[0].includes(manifestVersion)); }
    assert.deepEqual(await readComponentEntry(root, 'compat-plugin', root), entry);
    assert.deepEqual(await fs.readFile(path.join(root, '.claude-plugin/marketplace.json')), before);
  }
});

test('strict matrix uses manifest existence and the six entry component fields, including empty declarations', async t => {
  const root = await temporary(t); await skill(root, 'skills/default-skill'); await skill(root, 'custom/manifest-skill'); await skill(root, 'extra/entry-skill');
  for (const strict of [undefined, true, false]) for (const hasManifest of [false, true]) {
    for (const field of [undefined, 'commands', 'agents', 'skills', 'hooks', 'outputStyles', 'themes']) {
      const entry = await configure(root, { ...(strict === undefined ? {} : { strict }), ...(field ? { [field]: field === 'skills' ? './extra' : [] } : {}) }, hasManifest ? { name: 'compat-plugin', skills: './custom' } : undefined);
      const conflict = strict === false && hasManifest && field;
      if (conflict) {
        for (const run of [() => readMarketplace(root), () => discoverSkillRoots(root, { entry }), () => pluginContents(root, { entry })]) await assert.rejects(run(), { code: 'STRICT_CONFLICT' });
      } else {
        const catalog = await readMarketplace(root); const contents = await pluginContents(root, { entry });
        assert.equal(catalog.plugins.length, 1);
        // Root-source explicit entry skills retain the existing subset exception.
        const expected = field === 'skills' ? ['entry-skill'] : hasManifest ? ['default-skill', 'manifest-skill'] : ['default-skill'];
        assert.deepEqual(contents.skills.sort(), expected.sort());
      }
    }
  }
  const entry = await configure(root, { strict: false, skills: [] }, {});
  await assert.rejects(discoverSkillRoots(root, { entry }), { code: 'STRICT_CONFLICT' });
});

test('entry MCP fields apply only without a manifest; unrelated fields do not create strict conflicts', async t => {
  const root = await temporary(t);
  for (const hasManifest of [false, true]) {
    const entry = await configure(root, { strict: false, mcpServers: { example: { command: 'never-run' } }, lspServers: {}, userConfig: {}, channels: {} }, hasManifest ? { name: 'compat-plugin' } : undefined);
    const result = await pluginContents(root, { entry });
    assert.equal(result.components.includes('mcp'), !hasManifest);
  }
  const entry = await configure(root, { strict: false }, { name: 'compat-plugin', mcpServers: { actual: {} }, hooks: {} });
  assert.deepEqual((await pluginContents(root, { entry })).components, ['hooks', 'mcp']);
});

test('strict true/default append entry skills to manifest and default roots for a subdirectory plugin', async t => {
  const root = await temporary(t), plugin = path.join(root, 'plugin'); await fs.mkdir(plugin);
  for (const location of ['skills/default-skill', 'custom/manifest-skill', 'extra/entry-skill']) await skill(plugin, location);
  await writeJson(path.join(plugin, '.claude-plugin/plugin.json'), { name: 'compat-plugin', skills: './custom' });
  for (const strict of [undefined, true]) {
    const entry = { name: 'compat-plugin', source: './plugin', skills: './extra', ...(strict === undefined ? {} : { strict }) };
    await writeJson(path.join(root, '.claude-plugin/marketplace.json'), { name: 'compat-market', plugins: [entry] });
    assert.equal((await readMarketplace(root)).plugins.length, 1);
    assert.deepEqual((await pluginContents(plugin, { marketRoot: root, entry })).skills.sort(), ['default-skill', 'entry-skill', 'manifest-skill']);
  }
});

test('version, source identity and path protections remain enforced with compatible declarations', async t => {
  const root = await temporary(t), outside = await temporary(t);
  await configure(root, { version: '../unsafe', strict: false }, { name: 'compat-plugin', version: '2.0.0' });
  await assert.rejects(readMarketplace(root), { code: 'INVALID_VERSION' });
  await configure(root, { strict: false }, { name: 'compat-plugin', skills: '../escape' });
  await assert.rejects(readMarketplace(root), { code: 'UNSUPPORTED_COMPONENTS' });
  await configure(root, { strict: false }, { name: 'compat-plugin', skills: './linked' });
  await fs.symlink(outside, path.join(root, 'linked')); await assert.rejects(readMarketplace(root), { code: 'PLUGIN_BOUNDARY' });
  await fs.unlink(path.join(root, 'linked')); await fs.symlink(path.join(root, 'missing'), path.join(root, 'linked'));
  await assert.rejects(readMarketplace(root));
  await fs.unlink(path.join(root, 'linked'));
  await configure(root, { strict: false, version: '2.0.0' }, { name: 'compat-plugin', version: '2.0.0' });
  await assert.rejects(readComponentEntry(root, 'compat-plugin', outside), { code: 'COMPONENT_SOURCE_MISMATCH' });
  await fs.unlink(path.join(root, '.claude-plugin/plugin.json'));
  await writeJson(path.join(outside, 'plugin.json'), { name: 'compat-plugin' });
  await fs.symlink(path.join(outside, 'plugin.json'), path.join(root, '.claude-plugin/plugin.json'));
  await assert.rejects(readMarketplace(root), { code: 'MARKETPLACE_BOUNDARY' });
});

test('upstream metadata works through add, preview, install, rediscovery and update, retaining warnings and version priority', async t => {
  const root = await temporary(t);
  const options = { stateDir: root, home: root, projectDir: root, codexHome: path.join(root, '.codex'), enableTestSandbox: true, scheduler: false, background: false };
  let service = await createService(options); t.after(() => service.close());
  const env = service.environments.sandbox, market = path.join(env.root, 'upstream'); await realMetadataFixture(market);
  const act = (action, fields = {}) => service.action({ mode: 'sandbox', action, ...fields });
  const id = 'ui-ux-pro-max@ui-ux-pro-max-skill', target = { kind: 'plugin', id };
  const added = await act('marketplace.add', { sourceType: 'local', source: market }); assert.equal(added.warnings.length, 1);
  const preview = (await act('plugin.previewMarketplace', { id })).pluginPreview;
  assert.equal(preview.version, '2.13.0'); assert.equal(preview.skillDetails.length, 7); assert.equal(preview.warnings.length, 1);
  assert.equal((await service.snapshot('sandbox')).plugins.find(p => p.id === id).installed, false);
  await act('plugin.install', { id, previewId: preview.id, enabledSkills: [preview.skillDetails[0].path] });
  let state = await service.snapshot('sandbox'); assert.equal(state.plugins.find(p => p.id === id).skillCount, 7);
  assert.equal(state.marketplaces.find(m => m.id === 'ui-ux-pro-max-skill').warnings.length, 1);
  const file = path.join(market, '.claude-plugin/plugin.json'), manifest = await readJson(file); manifest.version = '2.13.1'; await writeJson(file, manifest);
  const check = (await act('update.check', { target })).updateItem;
  assert.equal(check.availableVersion, '2.13.1'); assert.equal(check.status, 'available'); assert.equal(check.warnings.length, 1);
  await act('update.apply', { target, previewId: check.previewId });
  await service.close(); service = await createService(options);
  state = await service.snapshot('sandbox'); const installed = state.plugins.find(p => p.id === id);
  assert.equal(installed.version, '2.13.1'); assert.equal(installed.skillCount, 7); assert.equal(installed.warnings.length, 1);
  assert.equal(state.skills.filter(s => s.pluginId === id && s.enabled).length, 1);
  assert.equal((await act('update.check', { target })).updateItem.status, 'current');
  assert.equal((await readJson(path.join(market, '.claude-plugin/marketplace.json'))).plugins[0].version, '2.13.0');
});

test('CLI catalog rediscovery retains nonfatal warnings for both available and installed plugins', async t => {
  const root = await temporary(t); await realMetadataFixture(root);
  const adapter = new CodexAdapter({ codexHome: path.join(root, '.codex') }); let installed = false;
  adapter.probe = async () => (adapter.info = { available: true });
  adapter.command = async args => {
    if (args[1] === 'marketplace') return { marketplaces: [{ name: 'ui-ux-pro-max-skill', root, marketplaceSource: { sourceType: 'local', source: root } }] };
    const plugin = { name: 'ui-ux-pro-max', pluginId: 'ui-ux-pro-max@ui-ux-pro-max-skill', marketplaceName: 'ui-ux-pro-max-skill', version: '2.13.0', enabled: true, source: { source: 'local', path: root } };
    return { installed: installed ? [plugin] : [], available: installed ? [] : [plugin] };
  };
  for (const value of [false, true]) {
    installed = value; const catalog = await adapter.list();
    assert.equal(catalog.plugins[0].warnings.length, 1); assert.equal(catalog.marketplaces[0].warnings.length, 1); assert.deepEqual(catalog.diagnostics, []);
    if (value) assert.deepEqual(catalog.plugins[0]._componentRoots, ['.claude/skills']);
  }
});
