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
const marketplace = path.join(repository, '.claude-plugin/marketplace.json');
const json = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const authority = async () => (await json(path.join(plugin, '.codex-plugin/plugin.json'))).version;
// An installed copy or an exported plugin tree has no marketplace beside it.
const inRepository = await fs.access(marketplace).then(() => true, () => false);

test('the Codex manifest, the application package and its lockfile state one version', async () => {
  const version = await authority();
  assert.match(version, /^\d+\.\d+\.\d+$/);
  assert.equal((await json(path.join(app, 'package.json'))).version, version, 'package.json');
  const lock = await json(path.join(app, 'package-lock.json'));
  assert.equal(lock.version, version, 'package-lock.json'); assert.equal(lock.packages[''].version, version, 'package-lock.json packages[""]');
  assert.match(await fs.readFile(path.join(app, 'README.md'), 'utf8'), new RegExp(`当前版本为 ${version.replaceAll('.', '\\.')}（`), '应用 README');
});

test('the marketplace entry Claude reads and the READMEs repeat the manifest version', { skip: !inRepository && '不在仓库中' }, async () => {
  const version = await authority();
  const entry = (await json(marketplace)).plugins.find(item => item.name === 'skilldock');
  // Claude never reads the Codex manifest: without this the desktop app cannot see an update (0.11.1).
  assert.equal(entry.version, version, 'marketplace 条目');
  for (const [file, pattern] of [
    [path.join(repository, 'README.md'), /当前版本为 SkillDock \*\*(\d+\.\d+\.\d+)\*\*/],
    [path.join(repository, 'README.en.md'), /Current version: \*\*(\d+\.\d+\.\d+)\*\*/],
    [path.join(plugin, 'README.md'), /当前版本为 \*\*(\d+\.\d+\.\d+)\*\*/],
    [path.join(plugin, 'README.en.md'), /Current version: \*\*(\d+\.\d+\.\d+)\*\*/],
  ]) assert.equal((await fs.readFile(file, 'utf8')).match(pattern)?.[1], version, path.relative(repository, file));
});
