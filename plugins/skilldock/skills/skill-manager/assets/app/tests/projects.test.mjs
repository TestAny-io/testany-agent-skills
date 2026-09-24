import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/index.mjs';
import { readCodexProjects, createProjectIntegration } from '../server/projects.mjs';
import { readJson, writeJson } from '../server/files.mjs';

async function fixture(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock-projects-')));
  const home = path.join(root, 'home'), codexHome = path.join(home, '.codex'), stateDir = path.join(root, 'state'), projectDir = path.join(home, 'existing');
  await fs.mkdir(codexHome, { recursive: true }); await fs.mkdir(projectDir);
  const nativeFile = path.join(codexHome, '.codex-global-state.json');
  await writeJson(nativeFile, { 'local-projects': { existing: { name: 'Existing project', rootPaths: [projectDir] } } });
  let chosen = null;
  const integration = { capabilities: async () => ({ canChooseDirectory: true }), choose: async () => chosen };
  const app = await createApp({ home, codexHome, stateDir, projectDir, scheduler: false, background: false, selfUpdate: false, projectIntegration: integration,
    adapter: { list: async () => ({ plugins: [], marketplaces: [], diagnostics: [], cli: { available: false } }) } });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await app.close(); await fs.rm(root, { recursive: true, force: true }); });
  return { home, projectDir, stateDir, codexHome, nativeFile, app, choose: value => { chosen = value; }, act: (action, fields = {}) => app.service.action({ action, mode: 'local', ...fields }) };
}

test('project catalog reads current and legacy Codex metadata, deduplicates aliases and retains unavailable entries', async t => {
  const f = await fixture(t), alias = path.join(f.home, 'alias'); await fs.symlink(f.projectDir, alias);
  await writeJson(f.nativeFile, { 'local-projects': { a: { name: 'Named project', rootPaths: [f.projectDir, alias] }, b: { name: 'Missing', rootPaths: [path.join(f.home, 'missing')] } }, 'electron-saved-workspace-roots': [f.home] });
  const catalog = await f.app.service.projects(); assert.equal(catalog.entries.length, 2); assert.equal(catalog.entries[0].name, 'Named project'); assert.equal(catalog.entries[1].available, false);
  await writeJson(f.nativeFile, { 'electron-saved-workspace-roots': [f.projectDir], 'electron-workspace-root-labels': { [f.projectDir]: 'Legacy name' } });
  assert.equal((await readCodexProjects(f.codexHome)).entries[0].name, 'Legacy name');
  await fs.writeFile(f.nativeFile, 'invalid'); assert.equal((await f.app.service.projects()).entries[0].path, f.projectDir); assert.ok((await f.app.service.projects()).warning);
});

test('selecting existing folders records recent projects without changing Codex-owned metadata', async t => {
  const f = await fixture(t), directory = path.join(f.home, '另一个项目 with spaces'); await fs.mkdir(directory);
  const nativeBefore = await fs.readFile(f.nativeFile, 'utf8');
  const result = await f.act('project.select', { projectDir: directory });
  assert.equal(result.projectContext.effective, directory); assert.equal(f.app.service.project, directory);
  const saved = await readJson(path.join(f.stateDir, 'project.json')); assert.equal(saved.path, directory); assert.ok(saved.recent.includes(f.projectDir));
  assert.equal((await f.app.service.projects()).entries[0].path, directory);
  assert.equal(await fs.readFile(f.nativeFile, 'utf8'), nativeBefore);
  await assert.rejects(f.act('project.select', { projectDir: path.join(f.home, 'missing') }));
  assert.equal(f.app.service.project, directory);
});

test('folder selection and cancellation do not switch the project until confirmed', async t => {
  const f = await fixture(t);
  assert.equal((await f.act('project.chooseDirectory', { projectDir: f.home })).selectedDirectory, null);
  f.choose(f.home); assert.equal((await f.act('project.chooseDirectory', { projectDir: f.home })).selectedDirectory, f.home);
  assert.equal(f.app.service.project, f.projectDir);
});

test('unauthenticated project changes are rejected; read-only catalog remains accessible', async t => {
  const f = await fixture(t);
  const url = `http://127.0.0.1:${f.app.server.address().port}`;
  for (const action of ['project.select', 'project.chooseDirectory']) {
    const response = await fetch(url + '/api/actions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'local', action, projectDir: f.home }) });
    assert.equal(response.status, 403);
  }
  assert.equal(f.app.service.project, f.projectDir);
  assert.equal((await fetch(url + '/api/state')).status, 200);
});

test('native chooser uses a fixed script and argv, and unsupported platforms never launch a process', async t => {
  const f = await fixture(t), calls = [];
  const bridge = createProjectIntegration({ platform: 'darwin', run: async (binary, args) => { calls.push({ binary, args }); return { stdout: f.home + '\n' }; } });
  assert.equal(await bridge.choose(f.home), f.home); assert.equal(calls[0].binary, '/usr/bin/osascript'); assert.equal(calls[0].args.at(-1), f.home); assert.ok(!calls[0].args[1].includes(f.home));
  const unavailable = createProjectIntegration({ platform: 'linux', run: async () => assert.fail('must not launch') });
  assert.equal((await unavailable.capabilities()).canChooseDirectory, false); await assert.rejects(unavailable.choose(f.home), { code: 'FOLDER_PICKER_UNAVAILABLE' });
});
