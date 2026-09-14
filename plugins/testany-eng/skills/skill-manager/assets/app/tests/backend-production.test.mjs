import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/index.mjs';
import { createService } from '../server/service.mjs';
import { inspectTree } from '../server/files.mjs';

async function fixture(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock-production-')));
  const home = path.join(root, 'home'); const codexHome = path.join(home, '.codex'); await fs.mkdir(codexHome, { recursive: true });
  await fs.writeFile(path.join(codexHome, 'config.toml'), '# real-mode fixture sentinel\n');
  const options = { home, codexHome, projectDir: home, stateDir: path.join(root, 'state'), scheduler: false,
    adapter: { list: async () => ({ plugins: [], marketplaces: [], diagnostics: [], cli: { available: false, error: 'isolated test adapter' } }) } };
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return { root, options };
}

test('production creates no sandbox and rejects every sandbox API without mapping requests onto local files', async t => {
  const { options } = await fixture(t); const app = await createApp(options); t.after(() => app.close());
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve)); const base = `http://127.0.0.1:${app.server.address().port}`;
  const config = await fs.readFile(path.join(options.codexHome, 'config.toml'), 'utf8');
  assert.deepEqual(Object.keys(app.service.environments), ['local']); assert.equal(app.service.defaultMode, 'local');
  const session = await (await fetch(`${base}/api/session?mode=sandbox&enableTestSandbox=true`)).json(); assert.equal(session.defaultMode, 'local');
  for (const route of ['/api/state?mode=sandbox', '/api/skill?mode=sandbox&id=sample']) {
    const response = await fetch(`${base}${route}`); assert.equal(response.status, 403); assert.equal((await response.json()).error.code, 'MODE_DISABLED');
  }
  const requests = [
    { action: 'skill.remove', id: 'sample' }, { action: 'skill.toggle', id: 'sample', enabled: false },
    { action: 'plugin.install', id: 'demo@market' }, { action: 'updates.run', autoApply: true },
    { action: 'schedule.configure', schedule: { enabled: false, intervalMinutes: 15, timezone: 'UTC', autoApply: false, targets: [] } },
  ];
  for (const fields of requests) {
    const response = await fetch(`${base}/api/actions`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-SkillDock-Token': session.token }, body: JSON.stringify({ mode: 'sandbox', ...fields }) });
    assert.equal(response.status, 403, fields.action); assert.equal((await response.json()).error.code, 'MODE_DISABLED');
  }
  const injection = await fetch(`${base}/api/actions`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-SkillDock-Token': session.token }, body: JSON.stringify({ mode: 'local', action: 'updates.run', autoApply: false, enableTestSandbox: true }) });
  assert.equal(injection.status, 400);
  assert.equal(await fs.stat(path.join(options.stateDir, 'sandbox')).catch(() => null), null);
  assert.equal(await fs.readFile(path.join(options.codexHome, 'config.toml'), 'utf8'), config);
  assert.equal((await (await fetch(`${base}/api/state`)).json()).mode, 'local');
});

test('only an explicit boolean programmatic opt-in enables test fixtures and exposes test defaultMode', async t => {
  const { options } = await fixture(t);
  const denied = await createService({ ...options, enableTestSandbox: 'true' }); t.after(() => denied.close());
  assert.equal(denied.defaultMode, 'local'); assert.equal(await fs.stat(path.join(options.stateDir, 'sandbox')).catch(() => null), null);
  const app = await createApp({ ...options, enableTestSandbox: true }); t.after(() => app.close());
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const session = await (await fetch(`http://127.0.0.1:${app.server.address().port}/api/session`)).json(); assert.equal(session.defaultMode, 'sandbox');
  assert.equal((await app.service.snapshot('sandbox')).skills.length, 6);
});

test('production ignores previous sandbox schedules and files while retaining and executing the saved local schedule', async t => {
  let time = Date.now(); const { root, options } = await fixture(t); const settings = { ...options, now: () => time };
  const previous = await createService({ ...settings, enableTestSandbox: true });
  const source = path.join(root, 'local-source'); await fs.mkdir(source); const sourceFile = path.join(source, 'SKILL.md');
  await fs.writeFile(sourceFile, '---\nname: retained-local-skill\ndescription: Isolated local fixture\n---\nversion one\n');
  const preview = (await previous.action({ mode: 'local', action: 'skill.previewInstall', sourceType: 'local', source })).preview;
  await previous.action({ mode: 'local', action: 'skill.install', previewId: preview.id });
  const localSkill = (await previous.snapshot('local')).skills.find(skill => skill.name === 'retained-local-skill');
  const sandboxSkill = (await previous.snapshot('sandbox')).skills.find(skill => skill.name === 'writing-assistant');
  for (const [mode, skill] of [['local', localSkill], ['sandbox', sandboxSkill]]) await previous.action({ mode, action: 'schedule.configure', schedule: { enabled: true, intervalMinutes: 15, timezone: 'UTC', autoApply: true, targets: [{ kind: 'skill', id: skill.id }] } });
  await fs.appendFile(sourceFile, '\nversion two\n'); await previous.close();
  const sandboxRoot = path.join(options.stateDir, 'sandbox'); const sandboxBefore = await inspectTree(sandboxRoot);
  const production = await createService(settings); t.after(() => production.close());
  assert.deepEqual(Object.keys(production.environments), ['local']); assert.equal((await production.snapshot('local')).schedule.enabled, true);
  await assert.rejects(production.snapshot('sandbox'), { code: 'MODE_DISABLED' });
  time += 16 * 60000; await production.tickScheduler();
  const state = await production.snapshot('local'); assert.equal(state.updateRuns[0].items[0].status, 'updated');
  assert.match(await fs.readFile(localSkill.path, 'utf8'), /version two/); assert.equal((await inspectTree(sandboxRoot)).fingerprint, sandboxBefore.fingerprint, 'old sandbox schedule, config, skills and source bytes remain untouched');
  assert.equal(state.schedule.enabled, true); assert.deepEqual(state.schedule.targets, [{ kind: 'skill', id: localSkill.id }]);
});

test('malformed retired sandbox state cannot prevent production startup', async t => {
  const { options } = await fixture(t); const retired = path.join(options.stateDir, 'sandbox'); await fs.mkdir(retired, { recursive: true });
  await fs.writeFile(path.join(retired, 'updates.json'), '{not-valid-json');
  const service = await createService(options); t.after(() => service.close()); await service.tickScheduler();
  assert.equal(service.defaultMode, 'local'); assert.equal(await fs.readFile(path.join(retired, 'updates.json'), 'utf8'), '{not-valid-json');
});
