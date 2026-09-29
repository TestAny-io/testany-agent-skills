import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createIconCatalog } from '../server/provider-icons.mjs';
import { createService } from '../server/service.mjs';

const svg = color => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="${color}"/></svg>`;
async function fixture(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock-icons-')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const write = async (relative, value) => {
    const file = path.join(root, relative); await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value));
  };
  return { root, write };
}

test('reads declared plugin small/large/dark artwork, deduplicates it, and never guesses filenames', async t => {
  const { root, write } = await fixture(t);
  await write('assets/logo.svg', svg('#147efb'));
  const icons = createIconCatalog();
  assert.equal(await icons.plugin(root), undefined);
  await write('.codex-plugin/plugin.json', { name: 'sample', interface: { composerIcon: './assets/logo.svg', logo: './assets/logo.svg', logoDark: './assets/dark.svg' } });
  await write('assets/dark.svg', svg('#fff'));
  const fresh = createIconCatalog(); const icon = await fresh.plugin(root);
  assert.equal(icon.small, icon.large); assert.notEqual(icon.small, icon.dark);
  assert.equal(Object.keys(fresh.assets).length, 2);
  assert.equal(Buffer.from(fresh.assets[icon.small].split(',')[1], 'base64').toString(), svg('#147efb'));
});

test('portable inline metadata replaces the compatibility overlay, and absent inline metadata uses it', async t => {
  const { root, write } = await fixture(t);
  await write('assets/overlay.svg', svg('red')); await write('assets/inline.svg', svg('blue'));
  await write('.codex-plugin/plugin.json', { interface: { logo: './assets/overlay.svg' } });
  await write('plugin.json', { extensions: { 'com.openai': { interface: { logo: './assets/inline.svg' } } } });
  const icons = createIconCatalog(); const icon = await icons.plugin(root);
  assert.match(Buffer.from(icons.assets[icon.large].split(',')[1], 'base64').toString(), /blue/);
  await write('plugin.json', { extensions: { 'com.openai': {} } });
  assert.equal(await createIconCatalog().plugin(root), undefined);
  await write('plugin.json', { name: 'sample' });
  assert.ok((await createIconCatalog().plugin(root)).large);
});

test('skill declarations take priority over the plugin, with malformed metadata or missing files falling back', async t => {
  const { root, write } = await fixture(t);
  await write('assets/skill.svg', svg('purple'));
  await write('agents/openai.yaml', 'interface:\n  icon_small: assets/skill.svg\n  icon_large: ./assets/missing.png\n');
  const fallback = { small: 'plugin' };
  assert.notDeepEqual(await createIconCatalog().skill(root, fallback), fallback);
  await write('agents/openai.yaml', 'interface:\n  icon_small: ./missing.svg\n');
  assert.deepEqual(await createIconCatalog().skill(root, fallback), fallback);
  await write('agents/openai.yaml', 'interface: [broken');
  assert.deepEqual(await createIconCatalog().skill(root, fallback), fallback);
});

test('rejects escaping assets, metadata symlinks, URLs, directories, oversized images and active SVG', async t => {
  const { root, write } = await fixture(t); const packageRoot = path.join(root, 'package');
  await write('outside.svg', svg('red')); await write('package/assets/good.svg', svg('blue'));
  await fs.symlink(path.join(root, 'outside.svg'), path.join(packageRoot, 'assets/escape.svg'));
  await write('package/assets/huge.svg', svg('blue') + ' '.repeat(512 * 1024));
  await write('package/assets/script.svg', '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  await write('package/assets/foreign.svg', '<svg><foreignObject><div>unsafe</div></foreignObject></svg>');
  await write('package/assets/remote.svg', '<svg><image href="https://example.invalid/icon.png"/></svg>');
  await write('package/assets/entity.svg', '<!DOCTYPE svg [<!ENTITY secret SYSTEM "file:///etc/passwd">]><svg>&secret;</svg>');
  for (const declaration of ['../outside.svg', path.join(root, 'outside.svg'), 'https://example.invalid/image.svg', 'file:///etc/passwd', './assets/escape.svg', './assets/huge.svg', './assets/script.svg', './assets/foreign.svg', './assets/remote.svg', './assets/entity.svg', './assets']) {
    await write('package/.codex-plugin/plugin.json', { interface: { logo: declaration } });
    const icons = createIconCatalog(); assert.equal(await icons.plugin(packageRoot), undefined, declaration); assert.deepEqual(icons.assets, {});
  }
  await write('outside.yaml', 'interface:\n  icon_small: ./assets/good.svg\n');
  await fs.mkdir(path.join(packageRoot, 'agents'));
  await fs.symlink(path.join(root, 'outside.yaml'), path.join(packageRoot, 'agents/openai.yaml'));
  assert.equal(await createIconCatalog().skill(packageRoot), undefined);
});

test('allows self-contained SVG gradients, bounds snapshot image bytes, and refreshes changed artwork', async t => {
  const { root, write } = await fixture(t);
  const image = '<svg xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g"><stop stop-color="red"/></linearGradient></defs><rect width="20" height="20" fill="url(\'#g\')"/></svg>';
  await write('assets/logo.svg', image);
  await write('.claude-plugin/plugin.json', { interface: { logo: './assets/logo.svg' } });
  const before = await createIconCatalog().plugin(root); assert.ok(before.large);
  const limited = createIconCatalog({ budget: 20 }); assert.equal(await limited.plugin(root), undefined); assert.deepEqual(limited.assets, {});
  await write('assets/logo.svg', svg('orange'));
  assert.notEqual((await createIconCatalog().plugin(root)).large, before.large);
});

test('real library and install previews preserve skill overrides and use the installed package’s icons', async t => {
  const { root, write } = await fixture(t);
  const home = path.join(root, 'home'), codexHome = path.join(home, '.codex'), projectDir = path.join(root, 'project');
  const source = path.join(root, 'market/plugins/branded'); const installed = path.join(codexHome, 'plugins/cache/brand-market/branded/1.0.0');
  await fs.mkdir(projectDir); await fs.mkdir(codexHome, { recursive: true });
  const manifest = { name: 'branded', version: '1.0.0', description: 'Brand fixture', interface: { logo: './assets/logo.svg', logoDark: './assets/dark.svg' } };
  await write('market/.agents/plugins/marketplace.json', { name: 'brand-market', plugins: [{ name: 'branded', source: './plugins/branded' }] });
  await write('market/plugins/branded/.codex-plugin/plugin.json', manifest);
  await write('market/plugins/branded/assets/logo.svg', svg('blue')); await write('market/plugins/branded/assets/dark.svg', svg('white'));
  for (const name of ['own-icon', 'inherited-icon']) await write(`market/plugins/branded/skills/${name}/SKILL.md`, `---\nname: ${name}\ndescription: Icon fixture\n---\n`);
  await write('market/plugins/branded/skills/own-icon/agents/openai.yaml', 'interface:\n  icon_small: ./assets/mark.svg\n');
  await write('market/plugins/branded/skills/own-icon/assets/mark.svg', svg('purple'));
  await fs.cp(source, installed, { recursive: true });
  await write('market/plugins/branded/assets/logo.svg', svg('orange'));
  const service = await createService({ home, codexHome, projectDir, stateDir: path.join(root, 'state'), background: false, scheduler: false,
    adapter: { list: async () => ({ plugins: [{ id: 'branded@brand-market', name: 'branded', marketplace: 'brand-market', version: '1.0.0', installed: true, enabled: true, sourcePath: source }], marketplaces: [{ id: 'brand-market', name: 'brand-market', _root: path.join(root, 'market') }], diagnostics: [], cli: { available: true } }) } });
  t.after(() => service.close());
  const snapshot = await service.snapshot('local'); const plugin = snapshot.plugins[0];
  assert.match(Buffer.from(snapshot.iconAssets[plugin.icon.large].split(',')[1], 'base64').toString(), /blue/);
  assert.deepEqual(snapshot.skills.find(skill => skill.name === 'inherited-icon').icon, plugin.icon);
  assert.notEqual(snapshot.skills.find(skill => skill.name === 'own-icon').icon.small, plugin.icon.large);
  assert.equal(snapshot.marketplaces[0].icon, undefined, 'A marketplace is not branded with an arbitrary child plugin');
  const preview = (await service.action({ mode: 'local', action: 'plugin.previewInstall', sourceType: 'local', source })).pluginPreview;
  assert.match(Buffer.from(preview.iconAssets[preview.icon.large].split(',')[1], 'base64').toString(), /orange/);
  assert.deepEqual(preview.skillDetails.find(skill => skill.name === 'inherited-icon').icon, preview.icon);
});
