import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createSelfUpdater } from '../server/self-update.mjs';
import { createService } from '../server/service.mjs';
import { captureSource } from '../scripts/source-bundle.mjs';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate) { for (let i = 0; i < 100; i++) { if (await predicate()) return; await delay(10); } assert.fail('condition not reached'); }
async function fixture(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock-self-update-')));
  const codexHome = path.join(root, 'codex'); const stateDir = path.join(root, 'state'); const project = path.join(root, 'project');
  const runtime = path.join(root, 'runtime');
  for (const directory of [codexHome, stateDir, project, runtime]) await fs.mkdir(directory, { recursive: true });
  const sourceRoot = fileURLToPath(new URL('../../../', import.meta.url));
  const versions = {};
  for (const version of ['2.4.0', '2.5.0']) {
    const plugin = path.join(codexHome, 'plugins/cache/testany-agent-skills/testany-eng', version);
    const skill = path.join(plugin, 'skills/skill-manager');
    await fs.cp(sourceRoot, skill, { recursive: true, filter: input => !input.split(path.sep).some(part => ['node_modules', 'dist', '.source-snapshot', '.state', 'test-results', 'playwright-report'].includes(part)) });
    await fs.mkdir(path.join(plugin, '.claude-plugin'), { recursive: true });
    await fs.writeFile(path.join(plugin, '.claude-plugin/plugin.json'), JSON.stringify({ name: 'testany-eng', version }));
    versions[version] = path.join(skill, 'assets/app');
    await fs.appendFile(path.join(versions[version], 'README.md'), `\n${version}`);
  }
  const digest = (await captureSource(versions['2.4.0'])).sourceDigest;
  await fs.writeFile(path.join(stateDir, 'launcher.json'), JSON.stringify({ pid: process.pid, state: stateDir, project, source: versions['2.4.0'], digest, runtime, url: 'http://127.0.0.1:4771' }));
  let busy = false; let paused = false; let installedVersion = '2.5.0';
  const service = { stateDir, project,
    snapshot: async () => ({ plugins: [{ id: 'testany-eng@testany-agent-skills', installed: true, version: installedVersion }] }),
    isBusy: () => busy || paused,
    pauseForRestart: () => { if (busy || paused) return false; paused = true; return true; },
    resumeAfterRestart: () => { paused = false; },
  };
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return { root, codexHome, stateDir, runtime, service, versions, setBusy: value => { busy = value; }, setVersion: value => { installedVersion = value; }, isPaused: () => paused };
}

test('self restart waits for a whole busy batch, coalesces updates, and launches the installed version once', async t => {
  const f = await fixture(t); const calls = []; let finish;
  const updater = createSelfUpdater({ ...f, startTimer: false, worker: job => { calls.push(job); return new Promise(resolve => { finish = resolve; }); } });
  t.after(() => updater.close());
  f.setBusy(true); updater.request(); await updater.tick(); assert.equal(calls.length, 0);
  updater.request(); f.setBusy(false); await updater.tick();
  assert.equal(calls.length, 1); assert.equal(calls[0].source, f.versions['2.5.0']); assert.equal(calls[0].previousPid, process.pid);
  assert.equal(f.isPaused(), true); assert.equal((await updater.status()).status, 'preparing');
  updater.request(); await updater.tick(); assert.equal(calls.length, 1);
  // Closing the old server must not wait on the child which is trying to stop it.
  await updater.close(); finish();
});

test('worker failure records a visible error and releases the old service for further actions', async t => {
  const f = await fixture(t);
  const updater = createSelfUpdater({ ...f, startTimer: false, worker: async () => { throw new Error('fixture build unavailable'); } });
  t.after(() => updater.close()); updater.request(); await updater.tick();
  await until(async () => (await updater.status())?.status === 'failed' && !f.isPaused());
  assert.match((await updater.status()).message, /fixture build unavailable/);
});

test('unchanged installations and foreign ownership records never trigger a restart', async t => {
  const f = await fixture(t); let calls = 0;
  const updater = createSelfUpdater({ ...f, startTimer: false, worker: async () => { calls++; } }); t.after(() => updater.close());
  f.setVersion('2.4.0'); updater.request(); await updater.tick(); assert.equal(calls, 0);
  f.setVersion('2.5.0'); const recordFile = path.join(f.stateDir, 'launcher.json');
  const record = JSON.parse(await fs.readFile(recordFile, 'utf8')); record.pid = process.pid + 1;
  await fs.writeFile(recordFile, JSON.stringify(record)); updater.request(); await updater.tick();
  assert.equal(calls, 0); assert.equal(f.isPaused(), false); assert.equal(await updater.status(), undefined);
});

test('service notifies after a local update and prevents new writes while paused for restart', async t => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock-restart-service-')));
  const codexHome = path.join(root, 'codex'); const source = path.join(root, 'source');
  await fs.mkdir(codexHome); await fs.mkdir(source);
  const sourceFile = path.join(source, 'SKILL.md'); await fs.writeFile(sourceFile, '---\nname: managed-example\ndescription: example\n---\nVersion one\n');
  let service; const notifications = [];
  service = await createService({ home: root, codexHome, projectDir: root, stateDir: path.join(root, 'state'), scheduler: false,
    adapter: { list: async () => ({ plugins: [], marketplaces: [], diagnostics: [], cli: { available: false } }) },
    onInstallationChange: () => notifications.push(service.isBusy()) });
  t.after(async () => { await service.close(); await fs.rm(root, { recursive: true, force: true }); });
  const action = (action, fields) => service.action({ mode: 'local', action, ...fields });
  const preview = (await action('skill.previewInstall', { sourceType: 'local', source })).preview;
  await action('skill.install', { previewId: preview.id });
  const skill = (await service.snapshot('local')).skills.find(item => item.name === 'managed-example');
  await fs.appendFile(sourceFile, '\nVersion two\n');
  const update = (await action('skill.checkUpdate', { id: skill.id })).update;
  await action('skill.update', { id: skill.id, previewId: update.id });
  assert.deepEqual(notifications, [true]); assert.equal(service.isBusy(), false);
  assert.equal(service.pauseForRestart(), true);
  await assert.rejects(action('skill.toggle', { id: skill.id, enabled: false }), { code: 'APP_RESTARTING' });
  service.resumeAfterRestart(); assert.equal(service.isBusy(), false);
});
