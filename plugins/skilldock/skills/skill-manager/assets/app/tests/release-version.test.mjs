// One version everywhere a release states it. The Codex manifest is the authority; the application
// package, its lockfile, the marketplace entry Claude reads and the READMEs repeat it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = fileURLToPath(new URL('../', import.meta.url));
const plugin = path.resolve(app, '../../../..');
const repository = path.resolve(plugin, '../..');
const json = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const optional = file => json(file).catch(() => null);
// A downloaded source bundle holds only the skill, without the Codex manifest above it.
const manifest = await optional(path.join(plugin, '.codex-plugin/plugin.json'));
// Only this repository's marketplace lists this plugin directory; an installed copy, an exported
// plugin tree or another marketplace that happens to hold the plugin does not.
const entry = (await optional(path.join(repository, '.claude-plugin/marketplace.json')))?.plugins?.find?.(item =>
  item?.name === 'skilldock' && typeof item.source === 'string' && path.resolve(repository, item.source) === plugin);

test('the application package, its lockfile and README state one version, the Codex manifest\'s', async () => {
  const { version } = await json(path.join(app, 'package.json'));
  assert.match(version, /^\d+\.\d+\.\d+$/);
  if (manifest) assert.equal(manifest.version, version, 'Codex manifest');
  const lock = await json(path.join(app, 'package-lock.json'));
  assert.equal(lock.version, version, 'package-lock.json'); assert.equal(lock.packages[''].version, version, 'package-lock.json packages[""]');
  assert.match(await fs.readFile(path.join(app, 'README.md'), 'utf8'), new RegExp(`当前版本为 ${version.replaceAll('.', '\\.')}（`), '应用 README');
});

test('the marketplace entry Claude reads and the READMEs repeat the manifest version', { skip: !entry && '不在仓库中' }, async () => {
  const { version } = manifest;
  // Claude never reads the Codex manifest: this is the version it shows and updates by (0.11.1).
  assert.equal(entry.version, version, 'marketplace 条目');
  for (const [file, pattern] of [
    [path.join(repository, 'README.md'), /当前版本为 SkillDock \*\*(\d+\.\d+\.\d+)\*\*/],
    // The root README covers several plugins: the sentence after the version is SkillDock's.
    [path.join(repository, 'README.en.md'), /Current version: \*\*(\d+\.\d+\.\d+)\*\*\. One local instance manages/],
    [path.join(plugin, 'README.md'), /当前版本为 \*\*(\d+\.\d+\.\d+)\*\*/],
    [path.join(plugin, 'README.en.md'), /Current version: \*\*(\d+\.\d+\.\d+)\*\*/],
  ]) assert.equal((await fs.readFile(file, 'utf8')).match(pattern)?.[1], version, path.relative(repository, file));
});
