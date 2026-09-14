import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { createApp } from '../server/index.mjs';
import { patchToggle, parseConfig, toggleConfig } from '../server/config.mjs';
import { readMarketplace, discoverSkillRoots, validateSource, runProcess, CodexAdapter } from '../server/cli.mjs';
import { validateAction, createService } from '../server/service.mjs';
import { scan } from '../server/scanner.mjs';

async function temporary(t) { const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock-security-'))); t.after(() => fs.rm(root, { recursive: true, force: true })); return root; }
async function writeSkill(directory, name = 'sample') { await fs.mkdir(directory, { recursive: true }); await fs.writeFile(path.join(directory, 'SKILL.md'), `---\nname: ${name}\ndescription: Fixture description\n---\n\n<script>never execute me</script>\n`); }

test('TOML patch preserves CRLF, comments, other array entries, plugin metadata and unrelated settings', () => {
  const text = '# retain\r\nmodel = "keep"\r\n\r\n[[skills.config]]\r\npath = "/a/SKILL.md"\r\nenabled = true # keep comment\r\nextra = "safe"\r\n\r\n[[skills.config]]\r\npath = "/b/SKILL.md"\r\nenabled = false\r\n\r\n[plugins."demo@market"]\r\nenabled = true\r\nextra = "keep"\r\n';
  const changed = patchToggle(text, 'skill', '/a/SKILL.md', false);
  assert.equal(changed, text.replace('enabled = true # keep comment', 'enabled = false # keep comment'));
  const plugin = patchToggle(changed, 'plugin', 'demo@market', false); assert.equal(parseConfig(plugin).plugins['demo@market'].extra, 'keep');
  const appended = patchToggle(plugin, 'skill', '/new/SKILL.md', false); const parsed = parseConfig(appended);
  assert.equal(parsed.skills.config.length, 3); assert.equal(parsed.skills.config[0].extra, 'safe'); assert.equal(parsed.model, 'keep');
});

test('TOML multiline fake headers and inline configuration are explicitly unsupported', () => {
  const source = 'notes = """\n[[skills.config]]\npath = "/a/SKILL.md"\nenabled = false\n"""\n';
  assert.throws(() => patchToggle(source, 'skill', '/a/SKILL.md', true), { code: 'CONFIG_SYNTAX' });
  assert.throws(() => patchToggle('skills = {config=[{path="/a/SKILL.md", enabled=true}]}\n', 'skill', '/a/SKILL.md', false), { code: 'CONFIG_SYNTAX' });
  assert.throws(() => patchToggle('plugins = {"a@b"={enabled=true}}', 'plugin', 'a@b', false), { code: 'CONFIG_SYNTAX' });
});

test('config concurrent change preserves external bytes and backup', async t => {
  const root = await temporary(t); const file = path.join(root, 'config.toml'); await fs.writeFile(file, '# prior\n');
  await assert.rejects(toggleConfig(file, 'skill', '/a/SKILL.md', false, path.join(root, 'backups'), { beforeCommit: () => fs.writeFile(file, '# external writer\n') }), { code: 'CONFIG_CHANGED' });
  assert.equal(await fs.readFile(file, 'utf8'), '# external writer\n'); assert.equal((await fs.readdir(path.join(root, 'backups'))).length, 1);
});

test('marketplace rejects symlinked manifests outside its root and discovers custom skill paths', async t => {
  const root = await temporary(t); const market = path.join(root, 'market'); const plugin = path.join(market, 'plugins/demo');
  await fs.mkdir(path.join(market, '.agents/plugins'), { recursive: true }); await fs.mkdir(path.join(plugin, '.codex-plugin'), { recursive: true });
  await fs.writeFile(path.join(market, '.agents/plugins/marketplace.json'), JSON.stringify({ name: 'market', plugins: [{ name: 'demo', source: './plugins/demo' }] }));
  await fs.writeFile(path.join(root, 'outside.json'), JSON.stringify({ name: 'demo', description: 'outside' }));
  await fs.symlink(path.join(root, 'outside.json'), path.join(plugin, '.codex-plugin/plugin.json'));
  await assert.rejects(readMarketplace(market), { code: 'MARKETPLACE_BOUNDARY' });
  await fs.unlink(path.join(plugin, '.codex-plugin/plugin.json'));
  await fs.writeFile(path.join(plugin, '.codex-plugin/plugin.json'), JSON.stringify({ name: 'demo', skills: './custom-skills' }));
  await writeSkill(path.join(plugin, 'custom-skills/custom'));
  assert.deepEqual(await discoverSkillRoots(plugin), [path.join(plugin, 'custom-skills')]);
});

test('scanner marks invalid config as unknown and custom installed plugin components as managed', async t => {
  const root = await temporary(t); const home = path.join(root, 'home'); const codexHome = path.join(home, '.codex'); const skills = path.join(codexHome, 'skills');
  await writeSkill(path.join(skills, 'sample')); await fs.writeFile(path.join(codexHome, 'config.toml'), '[invalid');
  const pluginPath = path.join(codexHome, 'plugins/cache/market/demo/1'); await fs.mkdir(path.join(pluginPath, '.codex-plugin'), { recursive: true });
  await fs.writeFile(path.join(pluginPath, '.codex-plugin/plugin.json'), JSON.stringify({ name: 'demo', skills: './custom-skills' })); await writeSkill(path.join(pluginPath, 'custom-skills/custom'), 'custom');
  const env = { mode: 'local', root, home, codexHome, project: home, skills, config: path.join(codexHome, 'config.toml') };
  const catalog = { plugins: [{ id: 'demo@market', name: 'demo', marketplace: 'market', version: '1', installed: true, enabled: true, sourcePath: pluginPath, canToggle: true, canRemove: true }], marketplaces: [], diagnostics: [], cli: { available: true } };
  const state = await scan(env, { sources: {}, activity: [] }, catalog); const regular = state.skills.find(s => s.name === 'sample');
  assert.equal(regular.enabled, null); assert.equal(regular.canToggle, false); assert.match(regular.statusEvidence, /失败/);
  const custom = state.skills.find(s => s.name === 'custom'); assert.equal(custom.scope, 'plugin'); assert.equal(custom.canRemove, false); assert.equal(state.plugins[0].skillCount, 1);
});

test('realpath protection prevents a user-root alias from claiming plugin-cache ownership', async t => {
  const root = await temporary(t); const home = path.join(root, 'home'); const storage = path.join(root, 'storage/codex');
  await fs.mkdir(path.join(home, '.agents'), { recursive: true }); await fs.mkdir(storage, { recursive: true }); await fs.symlink(storage, path.join(home, '.codex'));
  const plugin = path.join(storage, 'plugins/cache/market/demo/1'); await writeSkill(path.join(plugin, 'skills/custom'), 'custom');
  await fs.symlink(path.join(plugin, 'skills'), path.join(home, '.agents/skills')); await fs.writeFile(path.join(storage, 'config.toml'), '');
  const env = { mode: 'local', root, home, codexHome: path.join(home, '.codex'), project: home, skills: path.join(home, '.codex/skills'), config: path.join(home, '.codex/config.toml') };
  const state = await scan(env, { sources: {}, activity: [] }, { plugins: [{ id: 'demo@market', name: 'demo', marketplace: 'market', version: '1', installed: true, enabled: true, canToggle: true, canRemove: true }], marketplaces: [], diagnostics: [], cli: { available: true } });
  const custom = state.skills.find(s => s.name === 'custom'); assert.equal(custom.scope, 'plugin'); assert.equal(custom.canRemove, false); assert.equal(custom.managed, true);
});

test('action validation rejects unknown fields, wrong booleans and dangerous Git transports/credentials', () => {
  assert.throws(() => validateAction({ mode: 'sandbox', action: 'skill.toggle', id: 'id', enabled: 'false' }), { code: 'INVALID_ACTION' });
  assert.throws(() => validateAction({ mode: 'sandbox', action: 'skill.remove', id: 'id', source: '/tmp' }), { code: 'INVALID_ACTION' });
  for (const source of ['ext::sh -c touch', 'file:///etc', 'https://user:secret@example.com/repo.git', 'git://example.com/repo']) assert.throws(() => validateSource(source, 'git'));
  assert.equal(validateSource('git@example.com:org/repo.git', 'git'), 'git@example.com:org/repo.git');
});

test('CLI timeouts have unknown outcome message instead of a success result', async () => {
  await assert.rejects(runProcess(process.execPath, ['-e', 'setTimeout(()=>{},10000)'], { timeout: 20 }), error => error.code === 'CLI_TIMEOUT' && /未确认/.test(error.message));
});

test('HTTP binds explicit loopback; API rejects wrong Host/Origin/token, arbitrary reads and non-JSON requests', async t => {
  const root = await temporary(t); const home = path.join(root, 'home'); await fs.mkdir(home);
  const app = await createApp({ enableTestSandbox: true, home, stateDir: path.join(root, 'state'), projectDir: home, adapter: { list: async () => ({ plugins: [], marketplaces: [], diagnostics: [], cli: { available: false } }) } });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve)); t.after(() => app.close());
  const url = `http://127.0.0.1:${app.server.address().port}`;
  assert.equal((await fetch(`${url}/api/health`)).status, 200);
  const session = await (await fetch(`${url}/api/session`)).json(); assert.equal(session.token, app.token);
  assert.equal((await fetch(`${url}/api/session`, { headers: { Origin: 'https://evil.example' } })).status, 403);
  assert.equal((await fetch(`${url}/api/session`, { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
  const badHost = await new Promise(resolve => { const req = http.get(`${url}/api/session`, { headers: { Host: 'evil.example' } }, res => { res.resume(); resolve(res.statusCode); }); }); assert.equal(badHost, 403);
  const body = JSON.stringify({ mode: 'sandbox', action: 'skill.remove', id: 'not-found' });
  assert.equal((await fetch(`${url}/api/actions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })).status, 403);
  assert.equal((await fetch(`${url}/api/actions`, { method: 'POST', headers: { 'X-SkillDock-Token': app.token, 'Content-Type': 'text/plain' }, body })).status, 415);
  assert.equal((await fetch(`${url}/api/skill?mode=sandbox&id=/etc/passwd`)).status, 404);
  const state = await (await fetch(`${url}/api/state?mode=sandbox`)).json();
  const record = state.skills.find(s => s.canToggle); const response = await fetch(`${url}/api/actions`, { method: 'POST', headers: { 'X-SkillDock-Token': app.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'sandbox', action: 'skill.toggle', id: record.id, enabled: false }) });
  assert.equal(response.status, 200, await response.text());
});

test('marketplace identities and versions cannot become directory traversal or object prototype keys', async t => {
  const root = await temporary(t); const plugin = path.join(root, 'plugins/demo');
  await fs.mkdir(path.join(root, '.agents/plugins'), { recursive: true }); await fs.mkdir(path.join(plugin, '.codex-plugin'), { recursive: true });
  const file = path.join(root, '.agents/plugins/marketplace.json');
  const manifest = path.join(plugin, '.codex-plugin/plugin.json');
  await fs.writeFile(manifest, JSON.stringify({ name: 'demo', version: '../../outside' }));
  await fs.writeFile(file, JSON.stringify({ name: 'market', plugins: [{ name: 'demo', source: './plugins/demo' }] }));
  await assert.rejects(readMarketplace(root), { code: 'INVALID_VERSION' });
  await fs.writeFile(manifest, JSON.stringify({ name: 'demo', version: 123 })); await assert.rejects(readMarketplace(root), { code: 'INVALID_VERSION' });
  for (const name of ['.', '..', '-', '__proto__', 'constructor']) { await fs.writeFile(file, JSON.stringify({ name, plugins: [] })); await assert.rejects(readMarketplace(root), { code: 'INVALID_MARKETPLACE' }); }
});

test('Codex executable adapter validates JSON/argv and hides credentials in existing marketplace sources', async t => {
  const root = await temporary(t); const binary = path.join(root, 'codex-fixture.mjs');
  const fixtureState = path.join(root, 'fixture-state.json'); const log = path.join(root, 'argv.jsonl');
  await fs.writeFile(fixtureState, JSON.stringify({ installed: false, failReadback: false }));
  await fs.writeFile(binary, `#!/usr/bin/env node
import fs from 'node:fs';
const args=process.argv.slice(2); const root=process.env.CODEX_HOME;
fs.appendFileSync(root+'/argv.jsonl',JSON.stringify(args)+'\\n');
const f=root+'/fixture-state.json'; const state=JSON.parse(fs.readFileSync(f,'utf8'));
const plugin={pluginId:'demo@market',name:'demo',marketplaceName:'market',version:'1.0.0',installed:state.installed,enabled:true,source:{source:'local',path:root+'/plugin'}};
if(args[0]==='--version') console.log('codex-cli fixture');
else if(args.includes('--help')) console.log('list add remove marketplace');
else if(args[0]==='plugin'&&args[1]==='list') { if(state.failReadback){console.error('fixture unavailable');process.exit(2);} console.log(JSON.stringify({installed:state.installed?[plugin]:[],available:[plugin,plugin]})); }
else if(args[0]==='plugin'&&args[1]==='marketplace'&&args[2]==='list') console.log(JSON.stringify({marketplaces:[{name:'market',root,marketplaceSource:{sourceType:'git',source:'https://example-user:FIXTURE_SECRET@github.com/example/repo.git?token=OTHER_SECRET'}}]}));
else if(args[0]==='plugin'&&['add','remove'].includes(args[1])) {state.installed=args[1]==='add';if(state.failAfterMutation)state.failReadback=true;fs.writeFileSync(f,JSON.stringify(state));console.log(JSON.stringify({ok:true}));}
else {console.error('bad argv');process.exit(3);}
`, { mode: 0o700 });
  const adapter = new CodexAdapter({ codexHome: root, codexBin: binary });
  let state = await adapter.list(); assert.equal(state.plugins.length, 1); assert.equal(state.diagnostics.length, 0);
  assert.equal(state.marketplaces[0].source, 'https://github.com/example/repo.git'); assert.ok(!JSON.stringify(state).includes('FIXTURE_SECRET'));
  await adapter.command(['plugin', 'add', 'demo@market', '--json'], { mutation: true }); state = await adapter.list(); assert.equal(state.plugins[0].installed, true);
  const calls = (await fs.readFile(log, 'utf8')).trim().split('\n').map(JSON.parse); assert.ok(calls.some(args => JSON.stringify(args) === JSON.stringify(['plugin', 'add', 'demo@market', '--json'])));
  await fs.writeFile(fixtureState, JSON.stringify({ installed: true, failReadback: true })); state = await adapter.list(); assert.equal(state.plugins.length, 0); assert.match(state.diagnostics[0], /命令失败/);
  await fs.writeFile(fixtureState, JSON.stringify({ installed: true, failAfterMutation: true }));
  await writeSkill(path.join(root, 'plugin/skills/demo'), 'demo');
  await fs.mkdir(path.join(root, '.agents/plugins'), { recursive: true });
  await fs.writeFile(path.join(root, '.agents/plugins/marketplace.json'), JSON.stringify({ name: 'market', plugins: [{ name: 'demo', source: './plugin' }] }));
  const service = await createService({ home: root, codexHome: root, projectDir: root, stateDir: path.join(root, 'app-state'), adapter });
  await assert.rejects(service.action({ mode: 'local', action: 'plugin.remove', id: 'demo@market' }), { code: 'READBACK_FAILED' });
  assert.equal(JSON.parse(await fs.readFile(fixtureState, 'utf8')).installed, false, 'underlying mutation may have happened before failed verification');
  const journal = JSON.parse(await fs.readFile(service.environments.local.registryFile, 'utf8')); assert.equal(journal.activity[0].status, 'error');
  await fs.rename(path.join(root, 'plugin/skills'), path.join(root, 'plugin/custom-skills'));
  await fs.writeFile(path.join(root, '.agents/plugins/marketplace.json'), JSON.stringify({ name: 'market', plugins: [{ name: 'demo', source: './plugin', strict: false, skills: ['./custom-skills'] }] }));
  await fs.writeFile(fixtureState, JSON.stringify({ installed: true }));
  const declared = await adapter.list(); assert.deepEqual(declared.plugins[0]._componentRoots, ['custom-skills']); assert.equal(declared.plugins[0].canRemove, true);
  const declaredState = await scan(service.environments.local, { sources: {}, activity: [] }, declared);
  assert.equal(declaredState.plugins[0].skillCount, 1); assert.ok(declaredState.skills.some(s => s.name === 'demo' && s.scope === 'plugin'));
  await fs.rm(path.join(root, '.agents/plugins/marketplace.json'));
  const incomplete = await adapter.list(); assert.equal(incomplete.plugins[0].canRemove, false); assert.match(incomplete.plugins[0].reason, /组件范围/);
});
