import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createApp } from '../server/index.mjs';
import { createNativeBackend, readRoute, localOrigin } from '../server/native-backend.mjs';
import { installationIdentity } from '../server/installation.mjs';

const skillRoot = fileURLToPath(new URL('../../../', import.meta.url));
async function fixture(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock-native-')));
  const home = path.join(root, 'home'), state = path.join(root, 'state'), project = path.join(root, 'project');
  const codexHome = path.join(home, '.codex');
  await fs.mkdir(project, { recursive: true }); await fs.mkdir(state);
  await fs.mkdir(path.join(codexHome, 'skills/native-sentinel'), { recursive: true });
  await fs.writeFile(path.join(codexHome, 'skills/native-sentinel/SKILL.md'), '---\nname: native-sentinel\ndescription: Native fixture\n---\n');
  const probe = net.createServer(); await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
  const env = { CODEX_HOME: codexHome, SKILLDOCK_STATE_DIR: state, SKILLDOCK_PROJECT_DIR: project, PORT: String(port) };
  let app; let starts = 0;
  const startImpl = async ({ project: selected }) => {
    starts++;
    if (app?.server.listening) return;
    await new Promise(resolve => setTimeout(resolve, 100));
    app = await createApp({ home, codexHome, projectDir: selected, stateDir: state, codexBin: path.join(root, 'no-cli') });
    await new Promise(resolve => app.server.listen(port, '127.0.0.1', resolve));
    await fs.writeFile(path.join(state, 'launcher.json'), JSON.stringify({ pid: process.pid, state, source: path.join(skillRoot, 'assets/app'), project: selected, url: 'http://127.0.0.1:' + port }));
  };
  t.after(async () => { await app?.close(); await fs.rm(root, { recursive: true, force: true }); });
  return { env, state, project, root, startImpl, starts: () => starts, close: () => app.close(), url: 'http://127.0.0.1:' + port };
}

test('native route boundary rejects arbitrary hosts, paths and query keys', () => {
  for (const url of ['http://localhost:4771', 'https://127.0.0.1:4771', 'http://user:secret@127.0.0.1:4771', 'http://127.0.0.1:4771/api/actions']) assert.throws(() => localOrigin(url));
  for (const route of ['https://evil.invalid/api/state', '//evil.invalid/api/state', '/api/actions', '/api/session?token=x', '/api/state?mode=local&mode=sandbox', '/api/skill?id=x&path=/etc/passwd']) assert.throws(() => readRoute(route));
  assert.equal(readRoute('/api/skill?mode=local&id=abc'), '/api/skill?mode=local&id=abc');
});

test('cold open coalesces starts, preserves the project, and reads/writes through the existing API', async t => {
  const f = await fixture(t);
  const backend = createNativeBackend({ skillRoot, ...f });
  const [session, snapshot, health] = await Promise.all([backend.read('/api/session'), backend.read('/api/state?mode=local'), backend.read('/api/health')]);
  assert.equal(f.starts(), 1); assert.equal(health.data.project, f.project);
  const realSession = await (await fetch(f.url + '/api/session')).json();
  assert.notEqual(session.data.token, realSession.token);
  assert.equal(session.data.token, health.data.instanceId);
  const skill = snapshot.data.skills.find(item => item.name === 'native-sentinel'); assert.ok(skill);
  const body = { mode: 'local', action: 'tags.set', target: { kind: 'skill', id: skill.id }, tags: ['native'] };
  assert.equal((await backend.action(body, session.data.token)).status, 200);
  const next = await backend.read('/api/state?mode=local');
  assert.deepEqual(next.data.skills.find(item => item.id === skill.id).tags, ['native']);
  assert.equal((await backend.action({ ...body, tags: ['wrong'] }, 'old-instance')).status, 409);
  await assert.rejects(backend.action({ ...body, extra: 'x'.repeat(32768) }, session.data.token), /body/);
  await f.close();
  const recovered = await backend.read('/api/session');
  assert.equal(f.starts(), 2); assert.notEqual(recovered.data.token, session.data.token);
  assert.equal((await backend.action(body, session.data.token)).status, 409);
  assert.deepEqual((await backend.read('/api/state?mode=local')).data.skills.find(item => item.id === skill.id).tags, ['native']);
});

test('separate MCP instances share the startup lock', async t => {
  const f = await fixture(t);
  const a = createNativeBackend({ skillRoot, ...f }), b = createNativeBackend({ skillRoot, ...f });
  const results = await Promise.all([a.read('/api/health'), b.read('/api/health')]);
  assert.equal(results[0].data.instanceId, results[1].data.instanceId); assert.equal(f.starts(), 1);
});

for (const linked of [false, true]) test(`an open MCP session restarts the newer installation after self-update removes its old cache (linked cache: ${linked})`, async t => {
  const f = await fixture(t);
  if (linked) {
    const storage = path.join(f.root, 'relocated cache'); await fs.mkdir(storage);
    await fs.mkdir(path.join(f.env.CODEX_HOME, 'plugins'), { recursive: true });
    await fs.symlink(storage, path.join(f.env.CODEX_HOME, 'plugins/cache'));
  }
  const installed = async version => {
    const root = path.join(f.env.CODEX_HOME, 'plugins/cache/local/skilldock', version);
    const skill = path.join(root, 'skills/skill-manager');
    await fs.mkdir(path.join(root, '.codex-plugin'), { recursive: true });
    await fs.mkdir(path.join(skill, 'assets/app'), { recursive: true });
    await fs.writeFile(path.join(root, '.codex-plugin/plugin.json'), JSON.stringify({ name: 'skilldock', version }));
    await fs.writeFile(path.join(skill, 'assets/app/package.json'), JSON.stringify({ version }));
    return { root, skill };
  };
  const first = await installed('0.8.0');
  const recordSource = async skill => {
    const file = path.join(f.state, 'launcher.json');
    const record = JSON.parse(await fs.readFile(file, 'utf8'));
    record.source = path.join(skill, 'assets/app');
    record.installation = await installationIdentity(record.source, f.env.CODEX_HOME);
    await fs.writeFile(file, JSON.stringify(record));
  };
  const launched = [];
  const backend = createNativeBackend({ skillRoot: first.skill, env: f.env, startImpl: async options => {
    launched.push(options.skillRoot);
    await f.startImpl(options);
    await recordSource(options.skillRoot);
  } });
  await backend.read('/api/health');
  const next = await installed('0.9.0');
  await f.close();
  await recordSource(next.skill);
  await fs.rm(first.root, { recursive: true });
  const recovered = await backend.read('/api/health');
  assert.equal(recovered.data.project, f.project);
  assert.deepEqual(launched, [first.skill, next.skill]);
});

test('lost write response is never automatically replayed', async t => {
  const f = await fixture(t); let writes = 0;
  const backend = createNativeBackend({ skillRoot, ...f, fetchImpl: async (url, options) => {
    const response = await fetch(url, options);
    if (options.method === 'POST') { writes++; await response.text(); throw new TypeError('response lost'); }
    return response;
  } });
  const session = await backend.read('/api/session');
  const skill = (await backend.read('/api/state?mode=local')).data.skills.find(item => item.name === 'native-sentinel');
  await assert.rejects(backend.action({ mode: 'local', action: 'tags.set', target: { kind: 'skill', id: skill.id }, tags: ['once'] }, session.data.token), /结果尚未确认/);
  assert.equal(writes, 1);
  assert.deepEqual((await backend.read('/api/state?mode=local')).data.skills.find(item => item.id === skill.id).tags, ['once']);
});

test('an unrelated listener is preserved and no launcher is invoked', async t => {
  const f = await fixture(t);
  const listener = http.createServer((req, res) => { res.setHeader('Content-Type', 'application/json'); res.end('{"app":"other"}'); });
  await new Promise(resolve => listener.listen(Number(f.env.PORT), '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => listener.close(resolve)));
  const backend = createNativeBackend({ skillRoot, ...f });
  await assert.rejects(backend.read('/api/session'), /不匹配/);
  assert.equal(f.starts(), 0); assert.equal(listener.listening, true);
});

test('a start the migration gate stopped names the Agents to update; the update the user agreed to runs the launcher with that Agent (HLD 3.7, G-01)', async t => {
  const f = await fixture(t); const runs = [];
  const execImpl = async (file, args, options) => {
    runs.push(options.env.SKILLDOCK_UPDATE_AGENT);
    if (!options.env.SKILLDOCK_UPDATE_AGENT) throw Object.assign(new Error('exit 4'), { code: 4, stderr: 'SkillDock：SkillDock 0.11 暂不接管数据：Claude 中装有 SkillDock 0.10.2，低于 0.10.3。\n' });
    await f.startImpl({ project: f.project });
  };
  const backend = createNativeBackend({ skillRoot, env: f.env, execImpl, gateCheck: async () => ['claude'] });
  const error = await backend.read('/api/health').catch(failure => failure);
  assert.match(error.message, /^SKILLDOCK_ERROR:/);
  const detail = JSON.parse(error.message.slice('SKILLDOCK_ERROR:'.length));
  assert.deepEqual([detail.code, detail.agents], ['MIGRATION_BLOCKED', ['claude']]); assert.match(detail.message, /^SkillDock 后台启动未完成。.*低于 0\.10\.3/s);
  await assert.rejects(backend.updateAtGate('other'), /Invalid agent/);
  assert.deepEqual(await backend.updateAtGate('claude'), { status: 200, data: { ok: true } }, '不必等上次失败的 10 秒');
  assert.deepEqual(runs, [undefined, 'claude']);
  assert.equal((await backend.read('/api/health')).status, 200);
  // Any other failure stays a plain message.
  const plain = createNativeBackend({ skillRoot, env: { ...f.env, PORT: '1' }, execImpl: async () => { throw Object.assign(new Error('exit 1'), { code: 1, stderr: 'broken' }); }, gateCheck: async () => ['claude'] });
  assert.match((await plain.read('/api/health').catch(failure => failure)).message, /^SkillDock 后台启动未完成。broken$/);
});
