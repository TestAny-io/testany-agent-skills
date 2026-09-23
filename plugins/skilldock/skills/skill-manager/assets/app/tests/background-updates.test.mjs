import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createService } from '../server/service.mjs';
import { acquireFileLock, operationLock } from '../server/process-lock.mjs';
import { backgroundPaths, createBackgroundManager, launchAgentPlist } from '../server/background.mjs';
import { runBackground, refreshBackgroundRuntime, resolveBackgroundSource } from '../server/background-worker.mjs';
import { captureSource } from '../scripts/source-bundle.mjs';
import { readJson, writeJson } from '../server/files.mjs';

const app = fileURLToPath(new URL('../', import.meta.url)).replace(/\/$/, '');
const adapter = { list: async () => ({ plugins: [], marketplaces: [], diagnostics: [], cli: { available: true } }) };
const act = (service, action, fields = {}) => service.action({ mode: 'local', action, ...fields });
const gate = () => { let resolve; return { promise: new Promise(r => { resolve = r; }), resolve: () => resolve() }; };
async function fixture(t, { configure = true } = {}) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock-background-')));
  const home = path.join(root, 'home'); const codexHome = path.join(home, '.codex'); const projectDir = path.join(root, 'chosen project');
  const stateDir = path.join(root, 'state'); await fs.mkdir(codexHome, { recursive: true }); await fs.mkdir(projectDir);
  const source = path.join(root, 'source'); await fs.mkdir(source);
  await fs.writeFile(path.join(source, 'SKILL.md'), '---\nname: background-fixture\ndescription: Background update fixture\n---\nversion one\n');
  const settings = { home, codexHome, projectDir, stateDir, adapter, background: false, scheduler: false };
  const service = await createService(settings);
  t.after(async () => { await service.close(); await fs.rm(root, { recursive: true, force: true }); });
  const preview = (await act(service, 'skill.previewInstall', { sourceType: 'local', source })).preview;
  await act(service, 'skill.install', { previewId: preview.id });
  const skill = (await service.snapshot('local')).skills.find(item => item.name === 'background-fixture');
  const schedule = { enabled: true, intervalMinutes: 1440, timezone: 'Asia/Shanghai', autoApply: true, targets: [{ kind: 'skill', id: skill.id }] };
  if (configure) await act(service, 'schedule.configure', { schedule });
  await fs.appendFile(path.join(source, 'SKILL.md'), '\nversion two\n');
  const context = { version: 1, home, codexHome, projectDir, stateDir, runtime: app, source: app,
    installation: { kind: 'directory', source: app }, digest: (await captureSource(app)).sourceDigest };
  const paths = backgroundPaths(stateDir, home); await writeJson(paths.context, context);
  const stateFile = path.join(stateDir, 'local/updates.json');
  async function overdue() { const state = await readJson(stateFile); state.schedule.nextRunAt = new Date(Date.now() - 86400000 * 3).toISOString(); await writeJson(stateFile, state); }
  return { root, source, service, settings, context, paths, stateFile, skill, schedule, overdue };
}

test('a headless process catches up one overdue run, updates files, persists results, and exits without a web server', async t => {
  const f = await fixture(t); await f.overdue(); await f.service.close();
  const cli = path.join(f.root, 'codex');
  await fs.writeFile(cli, `#!${process.execPath}\nconst a=process.argv.slice(2); if(a[0]==='--version') console.log('codex fixture 1'); else if(a.includes('--help')) console.log('plugin list add remove marketplace'); else console.log(JSON.stringify(a.includes('marketplace')?{marketplaces:[]}:{installed:[],available:[]}));\n`, { mode: 0o700 });
  await writeJson(f.paths.context, { ...f.context, codexBin: cli });
  await fs.copyFile(path.join(app, 'server/background-entry.mjs'), f.paths.entry);
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [f.paths.entry, f.paths.context], { cwd: '/', env: { HOME: f.context.home, PATH: '/usr/bin:/bin' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = ''; child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
    child.on('error', reject); child.on('exit', code => resolve({ code, output }));
  });
  assert.equal(result.code, 0, result.output);
  assert.match(await fs.readFile(f.skill.path, 'utf8'), /version two/);
  const disk = await readJson(f.stateFile);
  assert.equal(disk.runs.length, 1); assert.equal(disk.runs[0].trigger, 'catch-up'); assert.equal(disk.runs[0].status, 'success');
  assert.equal(disk.schedule.running, false); assert.ok(disk.schedule.lastSuccessAt);
  assert.equal(await fs.stat(path.join(f.context.stateDir, 'launcher.json')).catch(() => null), null);
  const next = await createService(f.settings); t.after(() => next.close());
  assert.equal((await next.snapshot('local')).updateRuns[0].items[0].status, 'updated');
  assert.equal((await readJson(f.paths.status)).outcome, 'success');
});

test('a not-due wake performs no CLI scan and does not move the deadline', async t => {
  const f = await fixture(t); const before = await fs.readFile(f.stateFile, 'utf8');
  await runBackground(f.context, { adapter: { list: () => { throw new Error('unexpected scan'); } } });
  assert.equal(await fs.readFile(f.stateFile, 'utf8'), before);
  assert.ok((await readJson(f.paths.status)).lastWakeAt);
  assert.doesNotMatch(await fs.readFile(f.skill.path, 'utf8'), /version two/);
});

test('source failures are visible, retry after five minutes, and retain the selected project', async t => {
  const f = await fixture(t); await f.overdue(); await fs.rm(f.source, { recursive: true });
  const time = Date.now();
  await runBackground(f.context, { adapter, now: () => time });
  const disk = await readJson(f.stateFile); assert.equal(disk.runs[0].status, 'error');
  assert.equal(disk.schedule.failureCount, 1); assert.equal(disk.schedule.nextRunAt, new Date(time + 5 * 60000).toISOString());
  assert.ok((await readJson(f.paths.status)).error);
  assert.equal((await readJson(f.paths.context)).projectDir, f.settings.projectDir);
  assert.doesNotMatch(await fs.readFile(f.skill.path, 'utf8'), /version two/);
});

test('another service reads live progress, cannot mutate concurrently, and can cancel remaining scheduled work', async t => {
  const f = await fixture(t); await f.overdue(); const entered = gate(); const resume = gate();
  const slow = await createService({ ...f.settings, adapter: { list: async () => { entered.resolve(); await resume.promise; return adapter.list(); } } });
  const running = slow.tickScheduler(); await entered.promise;
  const observer = await createService(f.settings); t.after(() => observer.close());
  try {
    assert.equal((await observer.updateProgress('local')).status, 'running');
    await assert.rejects(act(observer, 'skill.toggle', { id: f.skill.id, enabled: false }), { code: 'BUSY' });
    await act(observer, 'schedule.configure', { schedule: { ...f.schedule, enabled: false } });
    assert.equal((await observer.snapshot('local')).schedule.enabled, false);
  } finally { resume.resolve(); await running; await slow.close(); }
  const state = await readJson(f.stateFile); assert.equal(state.schedule.enabled, false); assert.equal(state.runs[0].status, 'partial');
  assert.doesNotMatch(await fs.readFile(f.skill.path, 'utf8'), /version two/);
  await act(observer, 'schedule.configure', { schedule: f.schedule });
  assert.equal((await observer.snapshot('local')).schedule.enabled, true);
});

test('a killed lock owner is reclaimed, while a live owner can never be stolen by timeout', async t => {
  const f = await fixture(t); const file = operationLock(f.context.codexHome);
  const module = pathToFileURL(path.join(app, 'server/process-lock.mjs')).href;
  const child = spawn(process.execPath, ['--input-type=module', '-e', `import {acquireFileLock} from ${JSON.stringify(module)}; acquireFileLock(${JSON.stringify(file)}); console.log('ready'); setInterval(()=>{},1000);`], { stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((resolve, reject) => { child.stdout.once('data', resolve); child.once('error', reject); });
  try {
    await fs.utimes(file, new Date(0), new Date(0));
    assert.throws(() => acquireFileLock(file), { code: 'BUSY' });
  } finally { child.kill('SIGKILL'); await new Promise(resolve => child.once('exit', resolve)); }
  const release = acquireFileLock(file); release();
  assert.equal(await fs.stat(file).catch(() => null), null);
});

function systemCommand({ blocked = false, rejectBootstrap = false } = {}) {
  let registered = false; const calls = [];
  return { calls, command: async args => {
    calls.push(args);
    if (args[0] === 'print-disabled') return { stdout: blocked ? `"${calls.label}" => true` : '' };
    if (args[0] === 'print') { if (!registered) throw Object.assign(new Error('Could not find service'), { stderr: 'Could not find service' }); return { stdout: 'state = not running' }; }
    if (args[0] === 'bootstrap') { if (rejectBootstrap) throw new Error('permission denied'); registered = true; }
    if (args[0] === 'bootout') registered = false;
    return { stdout: '' };
  } };
}

test('launchd registers a fixed one-shot entry, verifies it, reports OS disablement, and removes it', async t => {
  const f = await fixture(t, { configure: false }); const fake = systemCommand();
  const manager = createBackgroundManager({ ...f.settings, project: () => f.settings.projectDir, platform: 'darwin', uid: 501, command: fake.command });
  await manager.ensure(); const xml = await fs.readFile(manager.paths.plist, 'utf8');
  const savedContext = await readJson(manager.paths.context);
  assert.ok(path.isAbsolute(savedContext.environment.SKILLDOCK_SELECTED_NPM_CLI), 'persist the validated npm CLI for a clean launchd environment');
  assert.match(xml, /StartCalendarInterval/); assert.match(xml, /RunAtLoad/); assert.doesNotMatch(xml, /KeepAlive/);
  assert.match(xml, /background\/run.sh/); assert.doesNotMatch(xml, /plugins\/cache/);
  assert.equal((await manager.status(true)).status, 'unverified');
  await writeJson(manager.paths.status, { lastWakeAt: new Date().toISOString(), outcome: 'success' });
  assert.equal((await manager.status(true)).status, 'ready');
  await manager.remove(); assert.equal((await manager.status(false)).status, 'off');
  assert.equal(await fs.stat(manager.paths.plist).catch(() => null), null);
  const blocked = systemCommand({ blocked: true }); blocked.calls.label = manager.paths.label;
  const denied = createBackgroundManager({ ...f.settings, project: () => f.settings.projectDir, platform: 'darwin', uid: 501, command: blocked.command });
  await assert.rejects(denied.ensure(), { code: 'BACKGROUND_DISABLED' });
  assert.equal((await denied.status(true)).status, 'blocked');
  assert.ok(!blocked.calls.some(args => args[0] === 'enable' || args[0] === 'bootstrap'));
});

test('failed OS registration leaves a new plan disabled and removes a partial registration', async t => {
  const f = await fixture(t, { configure: false }); const fake = systemCommand({ rejectBootstrap: true });
  const manager = createBackgroundManager({ ...f.settings, project: () => f.settings.projectDir, platform: 'darwin', uid: 501, command: fake.command });
  const service = await createService({ ...f.settings, scheduler: undefined, background: undefined, backgroundManager: manager }); t.after(() => service.close());
  await assert.rejects(act(service, 'schedule.configure', { schedule: f.schedule }), { code: 'BACKGROUND_REGISTRATION_FAILED' });
  assert.equal((await service.snapshot('local')).schedule.enabled, false);
  assert.equal(await fs.stat(manager.paths.plist).catch(() => null), null);
});

test('an already enabled plan migrates without changing its deadline, bindings, or targets', async t => {
  const f = await fixture(t); const before = await fs.readFile(f.stateFile, 'utf8'); const fake = systemCommand();
  const manager = createBackgroundManager({ ...f.settings, project: () => f.settings.projectDir, platform: 'darwin', uid: 501, command: fake.command });
  const service = await createService({ ...f.settings, scheduler: undefined, background: undefined, backgroundManager: manager }); t.after(() => service.close());
  assert.ok(fake.calls.some(args => args[0] === 'bootstrap'));
  assert.equal(await fs.readFile(f.stateFile, 'utf8'), before);
});

test('self-update resolves the installed version instead of retaining a deleted cache path; ambiguous uninstall is not trusted', async t => {
  const f = await fixture(t);
  const identity = { kind: 'plugin', codexHome: f.context.codexHome, marketplace: 'test-market', plugin: 'skilldock', appPath: 'skills/skill-manager/assets/app' };
  const newRoot = path.join(identity.codexHome, 'plugins/cache/test-market/skilldock/0.5.0');
  await fs.mkdir(path.join(newRoot, '.codex-plugin'), { recursive: true }); await writeJson(path.join(newRoot, '.codex-plugin/plugin.json'), { name: 'skilldock', version: '0.5.0' });
  const context = { ...f.context, source: path.join(identity.codexHome, 'plugins/cache/test-market/skilldock/0.4.0', identity.appPath), installation: identity };
  const latest = { list: async () => ({ ...await adapter.list(), plugins: [{ id: 'skilldock@test-market', installed: true, enabled: true, version: '0.5.0' }] }) };
  assert.equal(await resolveBackgroundSource(context, latest), path.join(newRoot, identity.appPath));
  await assert.rejects(resolveBackgroundSource(context, { list: async () => ({ ...await adapter.list(), diagnostics: ['CLI failed'] }) }), /无法确认/);
  assert.equal(await resolveBackgroundSource(context, adapter), null);
});

test('a disabled plan performs no update, and plist values safely quote special characters', async t => {
  const f = await fixture(t); await f.overdue(); await writeJson(f.paths.disabled, { ...f.schedule, enabled: false });
  await runBackground(f.context, { adapter });
  assert.doesNotMatch(await fs.readFile(f.skill.path, 'utf8'), /version two/);
  assert.equal((await readJson(f.paths.status)).outcome, 'disabled');
  const special = backgroundPaths('/tmp/a & <b> "c"', '/tmp/owner');
  assert.match(launchAgentPlist(special, '/tmp/owner'), /a &amp; &lt;b&gt; &quot;c&quot;/);
});

test('a fresh plugin launcher imports before node_modules exists in the installed source', async t => {
  const f = await fixture(t, { configure: false });
  const root = path.join(f.root, 'fresh-skill'); const snapshot = await captureSource(app);
  for (const entry of snapshot.entries) {
    const file = path.join(root, entry.path); await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, entry.bytes, { mode: entry.mode });
  }
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, 'scripts/launch.mjs'), 'status'], {
      cwd: '/', env: { ...process.env, CODEX_HOME: f.context.codexHome, SKILLDOCK_STATE_DIR: f.context.stateDir }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = ''; let stderr = ''; child.stdout.on('data', data => { stdout += data; }); child.stderr.on('data', data => { stderr += data; });
    child.on('error', reject); child.on('exit', code => resolve({ code, stdout, stderr }));
  });
  assert.equal(result.code, 0, result.stderr); assert.equal(JSON.parse(result.stdout).status, 'stopped');
  assert.equal(await fs.stat(path.join(root, 'assets/app/node_modules')).catch(() => null), null);
});

test('overlapping configuration requests cannot acknowledge a disable and then erase it with a concurrent enable', async t => {
  const f = await fixture(t, { configure: false }); const entered = gate(); const resume = gate();
  const manager = { ensure: async () => { entered.resolve(); await resume.promise; }, remove: async () => {}, status: async () => ({ provider: 'launchd', status: 'off' }) };
  const writer = await createService({ ...f.settings, scheduler: undefined, background: undefined, backgroundManager: manager });
  const enabling = act(writer, 'schedule.configure', { schedule: f.schedule }); await entered.promise;
  try { await assert.rejects(act(f.service, 'schedule.configure', { schedule: { ...f.schedule, enabled: false } }), { code: 'BUSY' }); }
  finally { resume.resolve(); await enabling; await writer.close(); }
  await act(f.service, 'schedule.configure', { schedule: { ...f.schedule, enabled: false } });
  assert.equal((await f.service.snapshot('local')).schedule.enabled, false);
});
