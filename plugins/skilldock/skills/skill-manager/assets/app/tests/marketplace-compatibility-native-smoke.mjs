// Explicit host smoke test. Install only harmless fixtures in a disposable home.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createService } from '../server/service.mjs';
import { CodexAdapter } from '../server/cli.mjs';
import { readJson, writeJson } from '../server/files.mjs';

const cli = process.env.SKILLDOCK_CODEX_BIN;
assert.ok(cli && path.isAbsolute(cli), 'Set SKILLDOCK_CODEX_BIN to an installed Codex CLI.');
const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock-native-compat-')));
const home = path.join(root, 'home'), codexHome = path.join(home, '.codex'), projectDir = path.join(root, 'project');
await fs.mkdir(codexHome, { recursive: true }); await fs.mkdir(projectDir);
const adapter = new CodexAdapter({ codexHome, codexBin: cli, env: { ...process.env, HOME: home, CODEX_HOME: codexHome } });
const service = await createService({ home, codexHome, projectDir, adapter, stateDir: path.join(root, 'state'), scheduler: false, background: false });
try {
  const source = path.join(root, 'market'); await fs.mkdir(path.join(source, '.claude-plugin'), { recursive: true });
  for (const name of ['marketplace.json', 'plugin.json']) await fs.copyFile(new URL(`./fixtures/ui-ux-pro-max/${name}`, import.meta.url), path.join(source, '.claude-plugin', name));
  for (const name of ['banner-design', 'brand', 'design', 'design-system', 'slides', 'ui-styling', 'ui-ux-pro-max']) {
    const directory = path.join(source, '.claude/skills', name); await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, 'SKILL.md'), `---\nname: ${name}\ndescription: Harmless compatibility fixture.\n---\nDo nothing.\n`);
  }
  const act = (action, fields = {}) => service.action({ mode: 'local', action, ...fields });
  const id = 'ui-ux-pro-max@ui-ux-pro-max-skill', target = { kind: 'plugin', id };
  const added = await act('marketplace.add', { sourceType: 'local', source }); assert.equal(added.warnings.length, 1);
  const preview = (await act('plugin.previewMarketplace', { id })).pluginPreview;
  assert.equal(preview.version, '2.13.0'); assert.equal(preview.skillDetails.length, 7); assert.equal(preview.warnings.length, 1);
  await act('plugin.install', { id, previewId: preview.id, enabledSkills: [preview.skillDetails[0].path] });
  const state = await service.snapshot('local', true);
  assert.equal(state.plugins.find(plugin => plugin.id === id).version, '2.13.0');
  assert.equal(state.skills.filter(skill => skill.pluginId === id).length, 7);
  assert.equal(state.skills.filter(skill => skill.pluginId === id && skill.enabled).length, 1);
  const file = path.join(source, '.claude-plugin/plugin.json'), manifest = await readJson(file);
  manifest.version = '2.13.1'; await writeJson(file, manifest);
  const update = (await act('update.check', { target })).updateItem;
  assert.equal(update.availableVersion, '2.13.1'); assert.equal(update.status, 'available'); assert.equal(update.warnings.length, 1);
  await act('update.apply', { target, previewId: update.previewId });
  const updated = await service.snapshot('local', true);
  assert.equal(updated.plugins.find(plugin => plugin.id === id).version, '2.13.1');
  assert.equal(updated.skills.filter(skill => skill.pluginId === id && skill.enabled).length, 1);
  assert.equal((await act('update.check', { target })).updateItem.status, 'current');
  console.log('PASS: native CLI add, preview, seven-skill install, manifest-version update and readback; duplicate entry version retained, skill selection preserved.');
} finally { await service.close(); await fs.rm(root, { recursive: true, force: true }); }
