import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { AppDirectory, officialAppUrl, withAppDirectory } from '../server/app-directory.mjs';
import { CodexAdapter } from '../server/cli.mjs';
import { createService } from '../server/service.mjs';
import { createDirectoryIcons } from '../server/directory-icons.mjs';
import { readRoute } from '../server/native-backend.mjs';

const id = 'app-opaque-board@openai-curated-remote';
const app = { id: 'asdk_app_board', name: 'Miro fixture', description: 'Visualize ideas', installUrl: 'https://chatgpt.com/apps/miro/asdk_app_board', iconAssets: { '256_square': 'https://files.openai.com/content?id=fixture' }, isAccessible: false };
function adapterFixture() {
  const state = { installed: false, connected: false, version: '2.0.1', policy: 'AVAILABLE', calls: [], diagnostics: [], pending: false };
  const directory = { list: async () => new Map([['plugin_asdk_app_board', { ...app, isAccessible: state.connected }]]), read: async () => ({ ...app, description: 'Full official description' }) };
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

test('opaque remote identity gets real branding while installation uses the original identity and policy', async () => {
  const { adapter, state, directory } = adapterFixture();
  const catalog = await adapter.list(), plugin = catalog.plugins[0];
  assert.equal(plugin.id, id); assert.equal(plugin.name, 'app-opaque-board'); assert.equal(plugin.displayName, 'Miro fixture');
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
  const result = await f.act('plugin.install', { previewId: preview.id });
  assert.deepEqual(f.state.calls, [['plugin', 'add', id, '--json']]);
  assert.equal(result.remoteInstall.installed, true); assert.equal(result.remoteInstall.connected, false); assert.equal(result.needsReload, false);
  f.state.connected = true;
  const status = await f.act('plugin.connectionStatus'); assert.equal(status.remoteInstall.connected, true); assert.equal(status.needsReload, true); assert.equal(f.state.calls.length, 1);
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
  const result = await withAppDirectory(binary, { timeout: 2000 }, request => request('app/list', { limit: 10 }));
  assert.deepEqual(result.data, []);
  await assert.rejects(withAppDirectory(binary, { timeout: 200 }, request => request('app/read', { appIds: ['missing'] })), { code: 'DIRECTORY_UNAVAILABLE' });
});
