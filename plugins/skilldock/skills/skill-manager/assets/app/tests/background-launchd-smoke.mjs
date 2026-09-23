// Explicit macOS integration test. Uses only disposable skills, state and jobs.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createService } from '../server/service.mjs';
import { createBackgroundManager } from '../server/background.mjs';
import { captureSource } from '../scripts/source-bundle.mjs';
import { prepareRuntime } from '../server/runtime.mjs';
import { readJson, writeJson } from '../server/files.mjs';

if (process.platform !== 'darwin') throw new Error('This integration test requires macOS.');
const execute = promisify(execFile);
const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock-launchd-')));
const home = path.join(root, 'home'); const codexHome = path.join(home, '.codex'); const projectDir = path.join(root, 'project');
const stateDir = path.join(root, 'state');
await fs.mkdir(codexHome, { recursive: true }); await fs.mkdir(projectDir);
const sourceApp = fileURLToPath(new URL('../', import.meta.url));
const testedVersion = (await readJson(path.join(sourceApp, 'package.json'))).version;
const snapshot = await captureSource(sourceApp);
const installed = path.join(root, 'installed-skill');
for (const entry of snapshot.entries) { const file = path.join(installed, entry.path); await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, entry.bytes, { mode: entry.mode }); }
const source = path.join(root, 'skill-source'); await fs.mkdir(source);
await fs.writeFile(path.join(source, 'SKILL.md'), '---\nname: launchd-fixture\ndescription: Disposable macOS scheduler test\n---\nversion one\n');
const codexBin = path.join(root, 'codex-fixture');
await fs.writeFile(codexBin, `#!${process.execPath}\nconst a=process.argv.slice(2); if(a[0]==='--version') console.log('codex fixture 1'); else if(a.includes('--help')) console.log('plugin list add remove marketplace'); else console.log(JSON.stringify(a.includes('marketplace')?{marketplaces:[]}:{installed:[],available:[]}));\n`, { mode: 0o700 });
let manager; let service;
try {
  const runtime = await prepareRuntime(stateDir, snapshot, { environment: { ...process.env, npm_config_cache: path.join(home, '.npm') } });
  service = await createService({ home, codexHome, projectDir, stateDir, codexBin, scheduler: false, background: false });
  const act = (action, fields = {}) => service.action({ mode: 'local', action, ...fields });
  const preview = (await act('skill.previewInstall', { sourceType: 'local', source })).preview;
  await act('skill.install', { previewId: preview.id });
  const skill = (await service.snapshot('local')).skills.find(item => item.name === 'launchd-fixture');
  await act('schedule.configure', { schedule: { enabled: true, intervalMinutes: 1440, autoApply: true, timezone: 'UTC', targets: [{ kind: 'skill', id: skill.id }] } });
  await fs.appendFile(path.join(source, 'SKILL.md'), '\nupdated by launchd\n');
  const stateFile = path.join(stateDir, 'local/updates.json'); const state = await readJson(stateFile);
  state.schedule.nextRunAt = new Date(Date.now() - 2 * 86400000).toISOString(); await writeJson(stateFile, state);
  await service.close(); service = null;
  // A launcher record describes prepared files; there has never been a web server.
  await writeJson(path.join(stateDir, 'launcher.json'), { runtime, state: stateDir, source: path.join(installed, 'assets/app'), digest: snapshot.sourceDigest,
    installation: { kind: 'directory', source: path.join(installed, 'assets/app') }, cli: { available: true, path: codexBin } });
  manager = createBackgroundManager({ stateDir, home, codexHome, project: () => projectDir, appRuntime: runtime });
  await manager.ensure();
  const deadline = Date.now() + 240000; let result;
  while (Date.now() < deadline) {
    result = await readJson(manager.paths.status, null);
    if (result?.finishedAt && ['success', 'error'].includes(result.outcome)) break;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  const log = await fs.readFile(path.join(manager.paths.root, 'launchd.log'), 'utf8').catch(() => '');
  assert.equal(result?.outcome, 'success', JSON.stringify({ result, log }));
  assert.equal(result.version, testedVersion, 'the first system invocation runs the version under test');
  assert.match(await fs.readFile(skill.path, 'utf8'), /updated by launchd/);
  const disk = await readJson(stateFile); assert.equal(disk.runs.length, 1); assert.equal(disk.schedule.running, false);
  let job;
  for (let i = 0; i < 30; i++) {
    job = (await execute('/bin/launchctl', ['print', `gui/${process.getuid()}/${manager.paths.label}`])).stdout;
    if (!/^\s*pid = /m.test(job)) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.doesNotMatch(job, /^\s*pid = /m, 'the scheduled worker must exit');
  assert.match(job, /last exit code = 0/);
  // Publish another fixture version while the panel remains closed. The first
  // run prepares it; the following system invocation must execute that version.
  const newPackage = path.join(installed, 'assets/app/package.json');
  const manifest = await readJson(newPackage); manifest.version = '0.5.0'; await writeJson(newPackage, manifest);
  const lockfile = path.join(installed, 'assets/app/package-lock.json'); const lock = await readJson(lockfile);
  lock.version = '0.5.0'; lock.packages[''].version = '0.5.0'; await writeJson(lockfile, lock);
  for (let round = 2; round <= 3; round++) {
    await fs.appendFile(path.join(source, 'SKILL.md'), `\nround ${round}\n`);
    const pending = await readJson(stateFile); pending.schedule.nextRunAt = new Date(Date.now() - 60000).toISOString(); await writeJson(stateFile, pending);
    await execute('/bin/launchctl', ['kickstart', `gui/${process.getuid()}/${manager.paths.label}`]);
    const until = Date.now() + 240000;
    while (Date.now() < until) {
      result = await readJson(manager.paths.status, null);
      const current = await readJson(stateFile);
      job = (await execute('/bin/launchctl', ['print', `gui/${process.getuid()}/${manager.paths.label}`])).stdout;
      if (current.runs.length === round && result?.finishedAt && !/^\s*pid = /m.test(job)) break;
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    assert.equal((await readJson(stateFile)).runs.length, round);
    assert.equal(result.outcome, 'success', JSON.stringify(result));
    assert.match(await fs.readFile(skill.path, 'utf8'), new RegExp(`round ${round}`));
  }
  assert.equal(result.version, '0.5.0', 'the next scheduled process executes the new runtime');
  const updatedContext = await readJson(manager.paths.context); assert.notEqual(updatedContext.runtime, runtime);
  // Removing the installed source is detected without the web service; the
  // running worker unregisters itself without waiting on its own termination.
  await fs.rm(installed, { recursive: true, force: true });
  const removedPlan = await readJson(stateFile); removedPlan.schedule.nextRunAt = new Date(0).toISOString(); await writeJson(stateFile, removedPlan);
  await execute('/bin/launchctl', ['kickstart', `gui/${process.getuid()}/${manager.paths.label}`]);
  const removalDeadline = Date.now() + 45000;
  while (Date.now() < removalDeadline) {
    if ((await manager.status(false)).status === 'off' && (await readJson(manager.paths.status, {})).outcome === 'uninstalled') break;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert.equal((await readJson(stateFile)).schedule.enabled, false);
  assert.equal((await manager.status(false)).status, 'off');
  assert.equal((await readJson(manager.paths.status)).outcome, 'uninstalled');
  process.stdout.write(JSON.stringify({ result: 'PASS', version: testedVersion, checks: ['real launchd bootstrap', 'overdue catch-up', 'file update', 'worker exit 0', 'self-update prepares a new runtime', 'next system invocation runs 0.5.0', 'worker self-unregisters after source removal'], firstRun: disk.runs[0], finalWorkerVersion: result.version }, null, 2) + '\n');
} finally {
  await service?.close(); await manager?.remove(); await fs.rm(root, { recursive: true, force: true });
}
