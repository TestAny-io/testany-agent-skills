import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { AppDirectory, officialAppUrl, savedDirectory, withAppDirectory } from '../server/app-directory.mjs';
import { CodexAdapter } from '../server/cli.mjs';
import { createService } from '../server/service.mjs';
import { createDirectoryIcons } from '../server/directory-icons.mjs';
import { readRoute } from '../server/native-backend.mjs';

const id = 'app-opaque-board@openai-curated-remote';
const app = { id: 'asdk_app_board', name: 'Miro fixture', description: 'Visualize ideas', installUrl: 'https://chatgpt.com/apps/miro/asdk_app_board', iconAssets: { '256_square': 'https://files.openai.com/content?id=fixture' }, isAccessible: false };
function adapterFixture() {
  const state = { installed: false, connected: false, version: '2.0.1', policy: 'AVAILABLE', calls: [], diagnostics: [], pending: false, directory: [] };
  // How each read of the app directory was asked for: 'forced', 'fresh' (an expired list will not do) or 'any'.
  const directory = { list: async (force = false, { stale = true } = {}) => { state.directory.push(force ? 'forced' : stale ? 'any' : 'fresh'); return new Map([['plugin_asdk_app_board', { ...app, isAccessible: state.connected }]]); },
    read: async () => ({ ...app, description: 'Full official description' }) };
  const adapter = new CodexAdapter({ codexHome: '/unused', appDirectory: directory });
  adapter.probe = async () => (adapter.info = { available: true, path: '/fixture/codex' });
  adapter.command = async args => {
    if (args[1] === 'add') { state.calls.push(args); if (!state.pending) state.installed = true; if (state.dropAfterAdd) state.version = '../unsafe'; return { pluginId: id, authPolicy: 'ON_INSTALL' }; }
    if (args[1] === 'marketplace') return { marketplaces: [] };
    const record = { pluginId: id, name: 'app-opaque-board', marketplaceName: 'openai-curated-remote', version: state.version, enabled: state.installed, installPolicy: state.policy, authPolicy: 'ON_INSTALL', source: { source: 'remote', id: 'plugin_asdk_app_board' } };
    return { installed: state.installed ? [record] : [], available: [...(state.installed ? [] : [record]), ...(state.extra || [])] };
  };
  return { state, adapter, directory };
}
async function serviceFixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock-remote-'));
  const home = path.join(root, 'home'), codexHome = path.join(home, '.codex');
  await fs.mkdir(codexHome, { recursive: true });
  const f = adapterFixture();
  const service = await createService({ home, codexHome, projectDir: home, stateDir: path.join(root, 'state'), adapter: f.adapter, scheduler: false, background: false });
  t.after(async () => { await service.close(); await fs.rm(root, { recursive: true, force: true }); });
  return { ...f, service, act: (action, fields = {}) => service.action({ mode: 'local', action, id, ...fields }) };
}

test('app directory follows pagination, shares/cache reads and never calls experimental plugin APIs', async () => {
  const calls = []; let connections = 0;
  const directory = new AppDirectory({ request: async (_binary, _options, operation) => {
    connections++; return operation(async (method, params) => { calls.push([method, params]); return method === 'app/read' ? { apps: [app] } : { data: [app], nextCursor: params.cursor ? null : 'second-page' }; });
  } });
  const [a, b] = await Promise.all([directory.list(), directory.list()]);
  assert.equal(a, b); assert.equal(a.get('plugin_asdk_app_board').name, 'Miro fixture');
  await directory.list(); assert.equal(connections, 1);
  assert.equal((await directory.read(app.id)).id, app.id);
  assert.deepEqual(calls.map(item => item[0]), ['app/list', 'app/list', 'app/read']);
  await directory.list(true); assert.equal(connections, 3);
});

test('repeating cursors fail closed and failed reads are bounded rather than retried on every snapshot', async () => {
  let calls = 0;
  const directory = new AppDirectory({ request: async (_b, _o, operation) => operation(async () => { calls++; return { data: [], nextCursor: 'repeat' }; }) });
  await assert.rejects(directory.list(), /分页/); await assert.rejects(directory.list(), /分页/);
  assert.equal(calls, 2);
});

// With a time limit: a read that waits where it should not would otherwise hang the run instead of failing it.
test('an expired app directory is served while the next is read behind it; a read that fails ends that until one succeeds (HLD 9.3 V26)', { timeout: 10000 }, async () => {
  let time = 0, connections = 0, down = false; const gates = [], asked = [], key = `plugin_${app.id}`;
  const directory = new AppDirectory({ now: () => time, request: async (_b, _o, operation) => {
    const number = ++connections; await new Promise(resolve => gates.push(resolve)); if (down) throw new Error('down');
    return operation(async (_method, params) => { asked.push(params.forceRefetch); return { data: [{ ...app, name: `read ${number}` }], nextCursor: null }; });
  } });
  const open = () => gates.shift()(), settle = async () => { for (let turn = 0; turn < 5; turn += 1) await new Promise(resolve => setImmediate(resolve)); };
  const pending = promise => { const state = { done: false }; promise.then(() => { state.done = true; }, () => { state.done = true; }); return state; };
  const expire = () => { time += 10 * 60000 + 1; };
  // A process's first read waits.
  const first = directory.list(), waiting = pending(first); await settle(); assert.equal(waiting.done, false);
  open(); assert.equal((await first).get(key).name, 'read 1');
  // Past the ten minutes: served at once, one read behind it however many ask.
  expire();
  assert.deepEqual([(await directory.list()).get(key).name, (await directory.list()).get(key).name, connections], ['read 1', 'read 1', 2]);
  open(); await settle();
  assert.deepEqual([(await directory.list()).get(key).name, connections], ['read 2', 2]);
  // The read behind fails: the failure shows as it did, bounded, and the next read waits again.
  expire(); down = true;
  assert.deepEqual([(await directory.list()).get(key).name, connections], ['read 2', 3]); open(); await settle();
  await assert.rejects(directory.list(), /down/); assert.equal(connections, 3);
  time += 60001; down = false;
  const again = directory.list(), retried = pending(again); await settle(); assert.deepEqual([retried.done, connections], [false, 4]);
  open(); assert.equal((await again).get(key).name, 'read 4');
  // Once a read has succeeded again, an expired list is served again (77 C13-P3-03 A3).
  expire(); assert.deepEqual([(await directory.list()).get(key).name, connections], ['read 4', 5]); open(); await settle();
  assert.equal((await directory.list()).get(key).name, 'read 5');
  // A caller for whom an expired list will not do waits for the read, as every caller did before.
  expire(); const fresh = directory.list(false, { stale: false }), unstale = pending(fresh); await settle(); assert.deepEqual([unstale.done, connections], [false, 6]);
  open(); assert.equal((await fresh).get(key).name, 'read 6');
  assert.deepEqual(asked, [false, false, false, false, false], 'none of these asked Codex to fetch anew');
  // A forced read asks anew; with an unforced one under way it follows it rather than riding on it (77 C13-P3-01).
  expire(); assert.deepEqual([(await directory.list()).get(key).name, connections], ['read 6', 7]);
  const forced = directory.list(true), also = directory.list(true), forcing = pending(forced); await settle(); assert.equal(connections, 7, 'the forced read waits for the one under way');
  open(); await settle(); assert.deepEqual([forcing.done, connections], [false, 8], 'then reads again, once for both');
  open(); assert.deepEqual([(await forced).get(key).name, (await also).get(key).name, asked.slice(5)], ['read 8', 'read 8', [false, true]]);
  // The unforced read failing does not stop the forced one that follows it.
  expire(); down = true; await directory.list(); const after = directory.list(true); await settle(); open(); await settle(); down = false; open();
  assert.deepEqual([(await after).get(key).name, connections], ['read 10', 10]);
});

// The last read is kept in a file for the service's next run, so only a machine's first read waits
// (real machine, 2026-10-13: 30 s on the first open after every restart; HLD 7.1).
test('a later run of the service takes up the saved app directory: served while the next is read, unless it is too old or not this one\'s', { timeout: 30000 }, async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock-saved-directory-')); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const file = path.join(root, 'cache/app-directory.json'), key = `plugin_${app.id}`, minute = 60000, day = 24 * 60 * minute;
  let time = 1000 * day, connections = 0; const gates = [];
  const run = (options = {}) => new AppDirectory({ now: () => time, saved: savedDirectory(file, { codexHome: '/codex' }), request: async (_b, _o, operation) => {
    const number = ++connections; await new Promise(resolve => gates.push(resolve));
    return operation(async () => ({ data: [{ ...app, name: `read ${number}`, tools: [{ secret: 'not kept' }], isAccessible: number === 1 }, { id: 7, name: 'no id' }], nextCursor: null }));
  }, ...options });
  // A read has reached Codex and waits there; `open` lets it answer, and `kept` waits until what it brought is saved.
  const asked = async () => { for (let turn = 0; turn < 200 && !gates.length; turn += 1) await new Promise(resolve => setTimeout(resolve, 10)); assert.equal(gates.length, 1, 'one read reached Codex'); };
  const open = () => gates.shift()(), kept = async directory => { open(); await directory.loading; };
  const pending = promise => { const state = { done: false }; promise.then(() => { state.done = true; }, () => { state.done = true; }); return state; };
  const stored = async () => JSON.parse(await fs.readFile(file, 'utf8'));

  // The first run reads, and waits; what it read is kept, and only what SkillDock uses of an app.
  const first = run().list(), waiting = pending(first); await asked(); assert.equal(waiting.done, false);
  open(); assert.equal((await first).get(key).name, 'read 1');
  const saved = await stored();
  assert.deepEqual([saved.format, saved.codexHome, saved.readAt, saved.apps.length], [1, '/codex', time, 1]);
  assert.deepEqual(saved.apps[0], { id: app.id, name: 'read 1', description: app.description, installUrl: app.installUrl, isAccessible: true, iconAssets: { '256_square': app.iconAssets['256_square'] }, iconDarkAssets: {} });
  assert.equal((await fs.stat(file)).mode & 0o777, 0o600);

  // The next run, within the ten minutes: the saved read is the list, and Codex is not asked.
  time += 5 * minute; const within = await run().list();
  assert.deepEqual([within.get(key).name, within.get(key).isAccessible, connections], ['read 1', true, 1]);
  // A run after them: served at once, the next read behind it, which is kept in its turn.
  time += 3 * day; const later = run();
  assert.deepEqual([(await later.list()).get(key).name, connections], ['read 1', 2]);
  await kept(later);
  assert.deepEqual([(await later.list()).get(key).name, (await stored()).apps[0].name, (await stored()).readAt], ['read 2', 'read 2', time]);
  // A caller for whom an expired list will not do waits, saved read or not.
  time += day; const fresh = run().list(false, { stale: false }), unstale = pending(fresh); await asked(); assert.deepEqual([unstale.done, connections], [false, 3]);
  open(); assert.equal((await fresh).get(key).name, 'read 3');
  // A read a week old or more is not served, in the run that made it or in a later one: the read is waited for.
  const same = run(); time += 2 * day; assert.deepEqual([(await same.list()).get(key).name, connections], ['read 3', 4]); await kept(same);
  time += 7 * day - 1; assert.deepEqual([(await same.list()).get(key).name, connections], ['read 4', 5]); await kept(same);
  time += 7 * day; const old = same.list(), aged = pending(old); await asked(); assert.deepEqual([aged.done, connections], [false, 6]);
  open(); assert.equal((await old).get(key).name, 'read 6');
  time += 7 * day; const older = run().list(), stale = pending(older); await asked(); assert.deepEqual([stale.done, connections], [false, 7]);
  open(); assert.equal((await older).get(key).name, 'read 7');

  // Not this Codex home's, dated after now, of another format, unreadable, not a file, too large: none is
  // taken up (each would be the list at once if it were: it is a minute old), and the read is waited for.
  const good = JSON.parse(await fs.readFile(file, 'utf8')); time += minute;
  const notTaken = async (prepare, options) => {
    await fs.rm(file, { recursive: true, force: true }); await prepare();
    const reading = run(options).list(), state = pending(reading); await asked(); assert.equal(state.done, false);
    open(); assert.equal((await reading).get(key).name, `read ${connections}`);
  };
  const write = value => fs.writeFile(file, typeof value === 'string' ? value : JSON.stringify(value));
  await notTaken(() => write(good), { saved: savedDirectory(file, { codexHome: '/another' }) });
  await notTaken(() => write({ ...good, readAt: time + 1 }));
  await notTaken(() => write({ ...good, format: 2 }));
  await notTaken(() => write({ ...good, apps: 'none' }));
  await notTaken(() => write('{not json'));
  await notTaken(() => fs.mkdir(file));
  await notTaken(async () => { await fs.writeFile(path.join(root, 'elsewhere.json'), JSON.stringify(good)); await fs.symlink(path.join(root, 'elsewhere.json'), file); });
  await notTaken(() => write({ ...good, padding: 'x'.repeat(8 * 1024 * 1024) }));
  // The same file as it was is taken up; entries that are not apps are dropped on the way in, as on the way out.
  await fs.rm(file, { recursive: true, force: true }); await write({ ...good, apps: [null, 'x', { id: 1, name: 'n' }, { id: 'kept', name: 'Kept', description: 5, extra: 'dropped' }] });
  const before = connections, taken = await run().list();
  assert.deepEqual([[...taken.entries()].map(([name, value]) => [name, value.name, value.description, 'extra' in value]), connections], [[['plugin_kept', 'Kept', undefined, false]], before]);

  // Where the data is no longer this service's to write, nothing is written; a write that fails does not fail the read.
  await fs.rm(file, { force: true });
  const answer = async (_b, _o, operation) => operation(async () => ({ data: [app], nextCursor: null }));
  const guarded = new AppDirectory({ now: () => time, saved: savedDirectory(file, { codexHome: '/codex', writable: async () => false }), request: answer });
  assert.equal((await guarded.list()).get(key).name, app.name); await assert.rejects(fs.stat(file), { code: 'ENOENT' });
  const failing = new AppDirectory({ now: () => time, saved: { read: async () => null, write: async () => { throw new Error('disk full'); } }, request: answer });
  assert.equal((await failing.list()).get(key).name, app.name);
});

// The whole way, with a stand-in Codex: the service that reads the directory keeps it under its data
// directory, and the service started next on that directory answers with it before Codex has.
test('the service keeps the app directory it read for its next run, and writes none once a newer release manages the data', { timeout: 90000 }, async t => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock-saved-service-'))); const services = [];
  t.after(async () => { for (const service of services) await service.close().catch(() => {}); await fs.rm(root, { recursive: true, force: true }); });
  const home = path.join(root, 'home'), codexHome = path.join(home, '.codex'), stateDir = path.join(root, 'state'), binary = path.join(root, 'codex');
  const control = path.join(root, 'stand-in.json'), answered = path.join(root, 'answered'), file = path.join(stateDir, 'cache/app-directory.json');
  await fs.mkdir(codexHome, { recursive: true }); await fs.writeFile(answered, '');
  const stand = value => fs.writeFile(control, JSON.stringify(value));
  await fs.writeFile(binary, `#!${process.execPath}
import fs from 'node:fs';
import readline from 'node:readline';
const args = process.argv.slice(2); const state = () => JSON.parse(fs.readFileSync(${JSON.stringify(control)}, 'utf8'));
const record = { pluginId: ${JSON.stringify(id)}, name: 'app-opaque-board', marketplaceName: 'openai-curated-remote', version: '2.0.1', enabled: false, installPolicy: 'AVAILABLE', authPolicy: 'ON_INSTALL', source: { source: 'remote', id: 'plugin_asdk_app_board' } };
if (args[0] === '--version') console.log('codex-cli stand-in');
else if (args.includes('--help')) console.log('list add remove marketplace');
else if (args[0] === 'plugin' && args[1] === 'list') console.log(JSON.stringify({ installed: [], available: [record] }));
else if (args[0] === 'plugin' && args[1] === 'marketplace') console.log(JSON.stringify({ marketplaces: [] }));
else if (args[0] === 'app-server') {
  for await (const line of readline.createInterface({ input: process.stdin })) {
    const message = JSON.parse(line); if (!message.id) continue;
    if (message.method !== 'app/list') { console.log(JSON.stringify({ id: message.id, result: {} })); continue; }
    const { name, delay } = state();
    setTimeout(() => { fs.appendFileSync(${JSON.stringify(answered)}, 'x'); console.log(JSON.stringify({ id: message.id, result: { data: [{ ...${JSON.stringify(app)}, name }], nextCursor: null } })); }, delay);
  }
} else { console.error('unexpected arguments'); process.exit(3); }
`, { mode: 0o755 });
  const start = async () => {
    const service = await createService({ home, codexHome, projectDir: home, stateDir, codexBin: binary, scheduler: false, background: false, env: { HOME: home },
      claudeCli: async () => ({ available: false, error: 'stand-in: none' }), claudeCatalog: { managedDir: path.join(root, 'no-managed'), listPlugins: async () => [], listMarketplaces: async () => [] } });
    services.push(service);
    return { service, shown: async () => (await service.snapshot('local')).plugins.find(plugin => plugin.id === id)?.displayName };
  };
  const answers = async () => (await fs.readFile(answered, 'utf8')).length;
  const until = async condition => { for (let turn = 0; turn < 600; turn += 1) { if (await condition()) return; await new Promise(resolve => setTimeout(resolve, 50)); } assert.fail('condition not reached'); };
  const stored = async () => JSON.parse(await fs.readFile(file, 'utf8'));
  const age = async ms => { const saved = await stored(); await fs.writeFile(file, JSON.stringify({ ...saved, readAt: saved.readAt - ms })); };

  // The first run waits for Codex and keeps what it read, readable by this user only.
  await stand({ name: 'First name', delay: 0 }); const first = await start();
  assert.equal(await first.shown(), 'First name'); await first.service.close();
  assert.deepEqual([(await stored()).apps.map(item => item.name), (await stored()).codexHome, (await fs.stat(file)).mode & 0o777, await answers()], [['First name'], codexHome, 0o600, 1]);

  // An hour on, the next run: its first list has the saved names before Codex has answered, and the read behind it is kept.
  await age(3600000); await stand({ name: 'Second name', delay: 8000 }); const second = await start();
  assert.deepEqual([await second.shown(), await answers()], ['First name', 1]);
  await until(async () => (await stored()).apps[0].name === 'Second name'); assert.equal(await answers(), 2); await second.service.close();

  // Eight days on: too old to show, and the list waits for Codex as a first read does.
  await age(8 * 24 * 3600000); await stand({ name: 'Third name', delay: 300 }); const third = await start();
  assert.deepEqual([await third.shown(), await answers()], ['Third name', 3]); await third.service.close();

  // The data passes to a newer release while a read is under way: what that read brings is not written.
  await age(3600000); await stand({ name: 'Fourth name', delay: 8000 }); const fourth = await start();
  assert.deepEqual([await fourth.shown(), await answers()], ['Third name', 3]); const before = await fs.readFile(file, 'utf8');
  await fs.writeFile(path.join(stateDir, 'generation.json'), JSON.stringify({ format: 1, generation: 3, minimumCompatibleGeneration: 3 }));
  await until(async () => await answers() === 4); await new Promise(resolve => setTimeout(resolve, 500));
  assert.equal(await fs.readFile(file, 'utf8'), before);
});

test('opaque remote identity gets real branding while installation uses the original identity and policy', async () => {
  const { adapter, state, directory } = adapterFixture();
  const catalog = await adapter.list(), plugin = catalog.plugins[0];
  assert.equal(plugin.id, id); assert.equal(plugin.name, 'app-opaque-board'); assert.equal(plugin.displayName, 'Miro fixture');
  // The app directory was asked: its read is timed with the two lists (75 C12-P3-06 T2).
  assert.deepEqual(Object.keys(adapter.timing).sort(), ['app-directory', 'marketplace-list', 'plugin-list']);
  assert.equal(plugin.description, app.description); assert.equal(plugin.canInstall, true); assert.equal(plugin.canRemove, false);
  assert.equal(plugin.directory.connected, false); assert.deepEqual(plugin.icon, { remote: id });
  assert.equal(catalog.marketplaces[0].displayName, 'Codex Plugin Directory');
  state.policy = 'NOT_AVAILABLE'; assert.equal((await adapter.list()).plugins[0].canInstall, false);
  directory.list = async () => new Map([['plugin_different_identity', app]]);
  assert.equal((await adapter.list()).plugins[0].displayName, undefined, 'do not join by a guessed display name');
  directory.list = async () => { throw new Error('unavailable'); };
  const failed = await adapter.list(); assert.ok(failed.directoryError); assert.equal(failed.plugins.length, 1); assert.equal(failed.diagnostics.length, 0);
});

test('real service previews without installing, then installs the exact plugin and distinguishes authorization', async t => {
  const f = await serviceFixture(t);
  const snapshot = await f.service.snapshot('local');
  assert.equal(snapshot.plugins[0].displayName, 'Miro fixture'); assert.equal(snapshot.plugins[0]._remote, undefined); assert.equal(snapshot.plugins[0]._remoteIcon, undefined);
  const preview = (await f.act('plugin.previewMarketplace')).pluginPreview;
  assert.equal(preview.sourceType, 'remote'); assert.equal(preview.remote.name, app.name); assert.equal(preview.canSelectSkills, false); assert.equal(f.state.calls.length, 0);
  assert.deepEqual([...new Set(f.state.directory)], ['any'], 'a snapshot and a preview take the app directory as it is held');
  const result = await f.act('plugin.install', { previewId: preview.id });
  assert.deepEqual(f.state.calls, [['plugin', 'add', id, '--json']]);
  assert.equal(result.remoteInstall.installed, true); assert.equal(result.remoteInstall.connected, false); assert.equal(result.needsReload, false);
  // What the result says of the connection is not read from an expired app directory (77 C13-P3-02).
  assert.equal(f.state.directory.at(-1), 'fresh');
  f.state.connected = true; f.state.directory.length = 0;
  const status = await f.act('plugin.connectionStatus'); assert.equal(status.remoteInstall.connected, true); assert.equal(status.needsReload, true); assert.equal(f.state.calls.length, 1);
  assert.ok(f.state.directory.includes('forced'), 'checking the connection asks Codex anew');
});

test('remote install requires a current preview, preserves policy restrictions and rejects path selections', async t => {
  const f = await serviceFixture(t);
  await assert.rejects(f.act('plugin.install'), { code: 'STALE_PREVIEW' });
  const preview = (await f.act('plugin.previewMarketplace')).pluginPreview;
  await assert.rejects(f.act('plugin.install', { previewId: preview.id, enabledSkills: [] }), { code: 'INVALID_SELECTION' });
  f.state.version = '2.0.2';
  await assert.rejects(f.act('plugin.install', { previewId: preview.id }), { code: 'SOURCE_CHANGED' });
  f.state.policy = 'NOT_AVAILABLE';
  await assert.rejects(f.act('plugin.previewMarketplace'), { code: 'PROTECTED_PLUGIN' });
  assert.equal(f.state.calls.length, 0);
});

test('a successful CLI return without confirmed installation is not reported as installed', async t => {
  const f = await serviceFixture(t); f.state.pending = true;
  const preview = (await f.act('plugin.previewMarketplace')).pluginPreview;
  const result = await f.act('plugin.install', { previewId: preview.id });
  assert.equal(result.remoteInstall.installed, false); assert.equal(result.needsReload, false);
  assert.match(result.message, /尚未确认/);
  const snapshot = await f.service.snapshot('local');
  assert.equal(snapshot.activity.find(item => item.action === 'plugin.install').status, 'error');
});

test('an unrelated unusable record does not block a confirmed install; a dropped target record does', async t => {
  const f = await serviceFixture(t);
  f.state.extra = [{ pluginId: 'bad@elsewhere', name: '../bad', marketplaceName: 'elsewhere' }];
  const result = await f.act('plugin.install', { previewId: (await f.act('plugin.previewMarketplace')).pluginPreview.id });
  assert.equal(result.remoteInstall.installed, true);
  assert.ok((await f.service.snapshot('local')).diagnostics.includes('CLI 返回了无法安全使用的插件记录 bad@elsewhere，已忽略。'), '提示指名被忽略的记录');
  const g = await serviceFixture(t); g.state.dropAfterAdd = true;
  await assert.rejects(g.act('plugin.install', { previewId: (await g.act('plugin.previewMarketplace')).pluginPreview.id }), { code: 'READBACK_FAILED' });
  // The target installed and listed normally, but a dropped record without identity could be it.
  const h = await serviceFixture(t);
  const previewId = (await h.act('plugin.previewMarketplace')).pluginPreview.id; h.state.extra = [null];
  await assert.rejects(h.act('plugin.install', { previewId }), { code: 'READBACK_FAILED' });
});

test('CLI failures do not retry installation and leave a status-check path', async t => {
  const f = await serviceFixture(t); const command = f.adapter.command.bind(f.adapter);
  f.adapter.command = async args => { if (args[1] !== 'add') return command(args); f.state.installed = true; f.state.calls.push(args); throw new Error('disconnected after mutation'); };
  const preview = (await f.act('plugin.previewMarketplace')).pluginPreview;
  await assert.rejects(f.act('plugin.install', { previewId: preview.id }), { code: 'REMOTE_INSTALL_UNCONFIRMED' });
  assert.equal((await f.act('plugin.connectionStatus')).remoteInstall.installed, true); assert.equal(f.state.calls.length, 1);
});

test('official authorization links and native image routes cannot become arbitrary navigation/proxy requests', () => {
  assert.equal(officialAppUrl(app.installUrl), app.installUrl);
  for (const url of ['https://evil.invalid/apps/miro', 'https://chatgpt.com.evil.invalid/apps/m', 'javascript:alert(1)', 'https://x@chatgpt.com/apps/m', 'https://chatgpt.com:999/apps/m', 'https://chatgpt.com/other']) assert.equal(officialAppUrl(url), undefined);
  assert.equal(readRoute('/api/plugin-icon?id=app%40market&theme=dark'), '/api/plugin-icon?id=app%40market&theme=dark');
  assert.throws(() => readRoute('/api/plugin-icon?url=https://evil.invalid'));
});

test('logos are cached, credentials-free, size-limited images from approved hosts only', async () => {
  let calls = 0;
  const logos = createDirectoryIcons({ fetchImpl: async (url, options) => { calls++; assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'manual'); return new Response('<svg xmlns="http://www.w3.org/2000/svg"><rect width="20" height="20"/></svg>'); } });
  assert.match(await logos.get(app.iconAssets['256_square']), /^data:image\/svg\+xml;base64,/);
  await logos.get(app.iconAssets['256_square']); assert.equal(calls, 1);
  assert.equal(await logos.get('http://127.0.0.1/private'), null); assert.equal(calls, 1);
  assert.equal(await createDirectoryIcons({ fetchImpl: async () => new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/private' } }) }).get('https://files.openai.com/redirect'), null);
  assert.equal(await createDirectoryIcons({ fetchImpl: async () => new Response('<svg><script>bad()</script></svg>') }).get('https://files.openai.com/active'), null);
  assert.equal(await createDirectoryIcons({ fetchImpl: async () => new Response('x'.repeat(512 * 1024 + 1)) }).get('https://files.openai.com/large'), null);
});

test('stdio client initializes, reads metadata, exits and bounds an unresponsive host', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock-directory-rpc-')); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const binary = path.join(root, 'codex');
  await fs.writeFile(binary, `#!${process.execPath}\nimport readline from 'node:readline';\nfor await (const line of readline.createInterface({input:process.stdin})) {const m=JSON.parse(line); if(m.id && m.method !== 'app/read') console.log(JSON.stringify({id:m.id,result:m.method==='initialize'?{}:{data:[],nextCursor:null}}));}\n`, { mode: 0o755 });
  const result = await withAppDirectory(binary, { timeout: 15000 }, request => request('app/list', { limit: 10 }));
  assert.deepEqual(result.data, []);
  await assert.rejects(withAppDirectory(binary, { timeout: 200 }, request => request('app/read', { appIds: ['missing'] })), { code: 'DIRECTORY_UNAVAILABLE' });
});
