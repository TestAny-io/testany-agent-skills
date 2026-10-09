// SPDX-License-Identifier: AGPL-3.0-only
// Phase 4a: Claude plugin and marketplace writes (HLD 3.3, 3.5; API-SDX-001 36c §7–8).
// Claude's lists and its write command are stand-ins that change a temporary world; no
// Claude installed on this machine runs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createService } from '../server/service.mjs';
import { createApp } from '../server/index.mjs';
import { writeGeneration } from '../server/generation.mjs';
import { claudeWriteArgs, claudeWriter } from '../server/claude-writer.mjs';
import { assertTranslated } from './i18n-helper.mjs';

// Every message, native rule and reason the tests below see; checked for translations last.
const seen = new Set();
const see = value => {
  if (!value || typeof value !== 'object') return value;
  for (const text of [value.message, value.reason, ...(value.nativeRules ?? []).map(rule => rule.message)]) if (typeof text === 'string') seen.add(text);
  return value;
};

const write = async (file, value) => { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, typeof value === 'string' ? value : JSON.stringify(value)); };

async function world(t, { management = 'enabled', cli = true, repo = null } = {}) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock-claude-actions-')));
  const home = path.join(root, 'home'); const configDir = path.join(home, '.claude'); const project = path.join(root, 'project');
  await fs.mkdir(project, { recursive: true }); await fs.mkdir(path.join(home, '.codex'), { recursive: true });
  const marketDir = path.join(configDir, 'plugins/marketplaces/m');
  await write(path.join(marketDir, '.claude-plugin/marketplace.json'), { name: 'm', plugins: [{ name: 'demo' }, { name: 'other', version: '2.0.0' }] });
  await write(path.join(configDir, 'plugins/known_marketplaces.json'), { m: { source: { source: 'github', repo: 'o/m' }, installLocation: marketDir } });
  const state = path.join(root, 'state'); await fs.mkdir(state); await writeGeneration(state, 2);
  await write(path.join(state, 'settings/agents.json'), { format: 1, agents: { claude: { management, origin: 'user', changedAt: '2026-10-09T00:00:00.000Z' } } });
  // What Claude's lists report; the stand-in writer changes it the way Claude would.
  const claude = {
    plugins: [{ id: 'demo@m', scope: 'user', enabled: true, version: '1.0.0' }, { id: 'proj@m', scope: 'project', projectPath: project, enabled: true, version: '1.0.0' }],
    marketplaces: [{ name: 'm', source: 'github', repo: 'o/m', installLocation: marketDir }],
    calls: [], noop: false, fail: null,
  };
  const writer = () => async (args, { cwd }) => {
    claude.calls.push({ args, cwd });
    claudeWriteArgs(args);
    if (claude.fail) throw Object.assign(new Error(claude.fail), { status: 502, code: 'CLI_FAILED' });
    if (claude.noop) return { ok: true };
    const [, verb, a, b] = args; const scope = args[args.indexOf('--scope') + 1];
    if (verb === 'enable' || verb === 'disable') { const item = claude.plugins.find(p => p.id === a); item.enabled = verb === 'enable'; if (scope === 'local') await write(path.join(cwd, '.claude/settings.local.json'), '{}'); }
    if (verb === 'install') { claude.plugins.push({ id: a, scope, enabled: true, version: '2.0.0', ...(scope === 'user' ? {} : { projectPath: cwd }) }); if (scope === 'local') await write(path.join(cwd, '.claude/settings.local.json'), '{}'); }
    if (verb === 'uninstall') claude.plugins = claude.plugins.filter(p => !(p.id === a && p.scope === scope));
    if (verb === 'marketplace' && a === 'add') claude.marketplaces.push({ name: 'added', source: 'directory', path: b });
    if (verb === 'marketplace' && a === 'remove') { claude.marketplaces = claude.marketplaces.filter(m => m.name !== b); claude.plugins = claude.plugins.filter(p => !p.id.endsWith(`@${b}`)); }
    return { ok: true };
  };
  const gitCalls = [];
  const git = async (directory, args) => {
    gitCalls.push(args);
    if (!repo) throw new Error('not a repository');
    if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return repo.root;
    if (args[0] === 'check-ignore') { if (repo.ignored) return ''; throw new Error('not ignored'); }
    if (args[0] === 'rev-parse' && args[1] === '--git-path') return '.git/info/exclude';
    throw new Error(`unexpected git ${args.join(' ')}`);
  };
  const options = { home, codexHome: path.join(home, '.codex'), projectDir: project, stateDir: state, background: false, env: { HOME: home },
    adapter: { list: async () => ({ plugins: [], marketplaces: [], diagnostics: [], listed: { plugins: true, marketplaces: true }, cli: { available: true, version: 'codex-cli 0.200.0', path: '/stand-in/codex' } }) },
    claudeCli: async () => cli ? { available: true, version: '2.1.288', path: '/stand-in/claude' } : { available: false, error: 'stand-in: none' },
    claudeCatalog: { managedDir: path.join(root, 'no-managed'), listPlugins: async () => structuredClone(claude.plugins), listMarketplaces: async () => structuredClone(claude.marketplaces) },
    claudeWriter: writer, claudeGit: git };
  const service = await createService(options);
  t.after(async () => { await service.close(); await fs.rm(root, { recursive: true, force: true }); });
  const snapshot = async () => { const value = await service.snapshot('local', true, { multiAgent: true }); for (const item of [...value.plugins, ...value.marketplaces]) if (item.agents?.includes('claude')) see(item); return value; };
  const object = async (list, name) => (await snapshot())[list].find(item => item.agents?.includes('claude') && item.name === name && (list !== 'plugins' || item.installation?.scope !== 'project' || name === 'proj'));
  const act = request => service.action({ mode: 'local', agent: 'claude', ...request }).then(see, see);
  return { root, home, configDir, project, state, claude, gitCalls, options, service, snapshot, object, act };
}

test('the command line runs only whitelisted writes, with an explicit scope and machine-readable output', () => {
  assert.equal(claudeWriteArgs(['plugin', 'enable', 'demo@m', '--scope', 'user', '--json']), 'plugin enable');
  assert.equal(claudeWriteArgs(['plugin', 'uninstall', 'demo@m', '--scope', 'local', '--keep-data', '--json']), 'plugin uninstall');
  assert.equal(claudeWriteArgs(['plugin', 'marketplace', 'update', 'm', '--json']), 'plugin marketplace update');
  for (const [args, label] of [
    [['plugin', 'update', 'demo@m', '--scope', 'user', '--json'], '更新随阶段 5'],
    [['plugin', 'install', 'demo@m', '--scope', 'user', '--json', '-y'], '不代为确认命令'],
    [['plugin', 'install', 'demo@m', '--scope', 'user', '--json', '--accept-command', 'abc'], '不代为确认命令'],
    [['plugin', 'install', 'demo@m', '--json'], '作用域必须显式'],
    [['plugin', 'enable', 'demo@m', '--scope', 'managed', '--json'], '作用域取值'],
    [['plugin', 'enable', 'demo@m', '--scope', 'user'], '必须机器可读'],
    [['plugin', 'enable', 'a@m', 'b@m', '--scope', 'user', '--json'], '恰好一个对象'],
    [['plugin', 'enable', '--scope', 'user', '--json'], '恰好一个对象'],
    [['plugin', 'enable', 'demo@m', '--keep-data', '--scope', 'user', '--json'], '只有卸载可以保留数据'],
  ]) assert.throws(() => claudeWriteArgs(args), /./, label);
});

test('a command line that asks to run a marketplace-declared command is refused, never confirmed', async t => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock-claude-writer-')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const stand = path.join(root, 'claude');
  await fs.writeFile(stand, `#!/bin/sh\nif [ "$3" = "asks" ]; then echo '{"shownCommand":{"sha256":"abc"}}'; exit 1; fi\nif [ "$3" = "fails" ]; then echo 'boom' >&2; exit 3; fi\necho 'note'\necho '{"ok":true}'\n`, { mode: 0o700 });
  const run = claudeWriter({ cli: { path: stand }, claudeRoot: { configDir: path.join(root, '.claude') }, env: { HOME: root } });
  assert.deepEqual(await run(['plugin', 'install', 'fine', '--scope', 'user', '--json'], { cwd: root }), { ok: true }, '取最后一行机器可读结果');
  await assert.rejects(run(['plugin', 'install', 'asks', '--scope', 'user', '--json'], { cwd: root }), { code: 'HOST_MANAGED' });
  await assert.rejects(run(['plugin', 'install', 'fails', '--scope', 'user', '--json'], { cwd: root }), error => error.code === 'CLI_FAILED' && /boom/.test(error.message));
});

test('while Claude is read-only, not installed, unconfirmed or without a command line, writes are refused and nothing runs', async t => {
  const readOnly = await world(t, { management: 'read-only' });
  const demo = await readOnly.object('plugins', 'demo');
  assert.deepEqual([demo.canToggle, demo.canRemove, demo.reason], [false, false, 'Claude 环境当前为只读；在 SkillDock 的“Agent 环境”页启用 Claude 管理后才能修改。']);
  assert.equal((await readOnly.act({ action: 'plugin.toggle', id: demo.id, enabled: false, expectedRevision: demo.revision })).code, 'AGENT_READ_ONLY');
  const noCli = await world(t, { cli: false });
  assert.equal((await noCli.act({ action: 'marketplace.refresh', id: 'claude:marketplace:m', expectedRevision: 'abc' })).code, 'AGENT_UNCONFIRMED', '命令行不可用时 Claude 无法确认');
  const failing = await world(t);
  failing.options.claudeCatalog.listPlugins = async () => { throw new Error('stand-in list failure'); };
  assert.equal((await failing.act({ action: 'plugin.toggle', id: demo.id, enabled: false, expectedRevision: demo.revision })).code, 'AGENT_UNCONFIRMED');
  for (const w of [readOnly, noCli, failing]) assert.deepEqual(w.claude.calls, []);
  // Skill visibility follows Claude management too (phase 4b1).
  assert.equal((await readOnly.act({ action: 'skill.toggle', id: 'claude:skill:user:000000000000', enabled: false })).code, 'AGENT_READ_ONLY');
});

test('enabling and disabling: revision first, the installation scope by default, read back, journaled for Claude only', async t => {
  const w = await world(t);
  const demo = await w.object('plugins', 'demo');
  assert.deepEqual([demo.canToggle, demo.canRemove, demo.reason], [true, true, undefined]);
  assert.equal((await w.act({ action: 'plugin.toggle', id: demo.id, enabled: false })).code, 'SNAPSHOT_STALE', '缺少修订号');
  assert.equal((await w.act({ action: 'plugin.toggle', id: demo.id, enabled: false, expectedRevision: '0123abcd' })).code, 'SNAPSHOT_STALE', '修订号不一致');
  const result = await w.act({ action: 'plugin.toggle', id: demo.id, enabled: false, expectedRevision: demo.revision });
  assert.match(result.message, /已在用户设置中停用 Claude 插件 demo/); assert.deepEqual([result.needsReload, result.agent], [true, 'claude']);
  assert.deepEqual(w.claude.calls.map(call => [call.args.join(' '), call.cwd]), [['plugin disable demo@m --scope user --json', w.project]]);
  assert.equal((await w.object('plugins', 'demo')).enabled, false);
  const multi = await w.snapshot();
  assert.ok(multi.activity.some(item => item.agent === 'claude' && item.action === 'plugin.toggle' && item.status === 'success'));
  assert.equal((await w.service.snapshot('local', true)).activity.some(item => item.agent === 'claude'), false, '1 版快照不显示 Claude 的操作记录');
  // A project installation is switched in that project's local settings unless asked otherwise.
  const proj = await w.object('plugins', 'proj');
  await w.act({ action: 'plugin.toggle', id: proj.id, enabled: false, expectedRevision: proj.revision, gitExclude: false });
  assert.equal(w.claude.calls.at(-1).args.join(' '), 'plugin disable proj@m --scope local --json');
  // Readback: a command that changes nothing is not reported as done.
  w.claude.noop = true; const again = await w.object('plugins', 'demo');
  assert.equal((await w.act({ action: 'plugin.toggle', id: again.id, enabled: true, expectedRevision: again.revision })).code, 'READBACK_FAILED');
  assert.ok((await w.snapshot()).activity.some(item => item.agent === 'claude' && item.status === 'error' && item.reasonCode === 'READBACK_FAILED'));
});

test('shared project settings need confirmation; a new local settings file asks about .git/info/exclude', async t => {
  const repo = { root: null, ignored: false };
  const w = await world(t, { repo }); repo.root = w.project; await fs.mkdir(path.join(w.project, '.git/info'), { recursive: true });
  const demo = await w.object('plugins', 'demo');
  const shared = await w.act({ action: 'plugin.toggle', id: demo.id, enabled: false, scope: 'project', expectedRevision: demo.revision });
  assert.equal(shared.code, 'CONFIRMATION_REQUIRED'); assert.deepEqual(shared.nativeRules.map(rule => rule.kind), ['scope', 'reload']);
  assert.match(shared.nativeRules[0].message, /协作者共享的 \.claude\/settings\.json/);
  const local = await w.act({ action: 'plugin.toggle', id: demo.id, enabled: false, scope: 'local', expectedRevision: demo.revision });
  assert.equal(local.code, 'CONFIRMATION_REQUIRED'); assert.deepEqual(local.nativeRules[0].items, ['.claude/settings.local.json']);
  assert.deepEqual(w.claude.calls, [], '确认之前什么都不执行');
  const done = await w.act({ action: 'plugin.toggle', id: demo.id, enabled: false, scope: 'local', gitExclude: true, expectedRevision: demo.revision });
  assert.match(done.message, /已把 \.claude\/settings\.local\.json 写入本机的 \.git\/info\/exclude/);
  assert.equal(await fs.readFile(path.join(w.project, '.git/info/exclude'), 'utf8'), '/.claude/settings.local.json\n');
  // The file exists now: no further question.
  const after = await w.object('plugins', 'demo');
  assert.match((await w.act({ action: 'plugin.toggle', id: after.id, enabled: true, scope: 'local', expectedRevision: after.revision })).message, /已在项目本地设置中启用 Claude 插件 demo/);
  const confirmed = await w.object('plugins', 'demo');
  await w.act({ action: 'plugin.toggle', id: confirmed.id, enabled: false, scope: 'project', confirm: true, expectedRevision: confirmed.revision });
  assert.equal(w.claude.calls.at(-1).args.join(' '), 'plugin disable demo@m --scope project --json');
});

test('installing from a marketplace: preview, scope, revision and readback; skills cannot be picked for Claude', async t => {
  const w = await world(t);
  const other = (await w.snapshot()).plugins.find(item => item.id === 'claude:plugin:other@m');
  assert.deepEqual([other.installed, other.canInstall], [false, true]);
  const preview = (await w.act({ action: 'plugin.previewMarketplace', id: other.id })).pluginPreview;
  assert.deepEqual([preview.agent, preview.scopes.join(), preview.defaultScope, preview.canSelectSkills, preview.version], ['claude', 'user,local,project', 'user', false, '2.0.0']);
  assert.equal((await w.act({ action: 'plugin.install', id: other.id, previewId: preview.id, enabledSkills: [], expectedRevision: other.revision })).code, 'UNSUPPORTED_FOR_AGENT');
  assert.equal((await w.act({ action: 'plugin.install', id: other.id, expectedRevision: 'ffff' })).code, 'SNAPSHOT_STALE');
  const result = await w.act({ action: 'plugin.install', id: other.id, expectedRevision: other.revision });
  assert.match(result.message, /已为当前用户安装 Claude 插件 other/);
  assert.equal(w.claude.calls.at(-1).args.join(' '), 'plugin install other@m --scope user --json');
  assert.ok((await w.snapshot()).plugins.some(item => item.name === 'other' && item.installed && item.installation.scope === 'user'));
  // A local installation in the current project, read back by its project.
  w.claude.plugins = w.claude.plugins.filter(item => item.id !== 'other@m');
  const again = (await w.snapshot()).plugins.find(item => item.id === 'claude:plugin:other@m');
  await w.act({ action: 'plugin.install', id: again.id, scope: 'local', gitExclude: false, expectedRevision: again.revision });
  assert.equal(w.claude.calls.at(-1).args.join(' '), 'plugin install other@m --scope local --json'); assert.equal(w.claude.calls.at(-1).cwd, w.project);
});

test('uninstalling asks first, names the data removal, and can keep the data', async t => {
  const w = await world(t);
  const demo = await w.object('plugins', 'demo');
  const ask = await w.act({ action: 'plugin.remove', id: demo.id, expectedRevision: demo.revision });
  assert.equal(ask.code, 'CONFIRMATION_REQUIRED'); assert.deepEqual(ask.nativeRules.map(rule => rule.kind), ['data-removal', 'reload']);
  const keep = await w.act({ action: 'plugin.remove', id: demo.id, expectedRevision: demo.revision, confirm: true, keepData: true });
  assert.match(keep.message, /插件数据已保留/);
  assert.equal(w.claude.calls.at(-1).args.join(' '), 'plugin uninstall demo@m --scope user --keep-data --json');
  assert.equal((await w.snapshot()).plugins.some(item => item.name === 'demo' && item.installed), false);
  // A project installation is removed from its own project, which must still exist.
  const proj = await w.object('plugins', 'proj');
  const shared = await w.act({ action: 'plugin.remove', id: proj.id, expectedRevision: proj.revision });
  assert.deepEqual(shared.nativeRules.map(rule => rule.kind), ['data-removal', 'scope', 'reload']);
  await w.act({ action: 'plugin.remove', id: proj.id, expectedRevision: proj.revision, confirm: true });
  assert.deepEqual([w.claude.calls.at(-1).args.join(' '), w.claude.calls.at(-1).cwd], ['plugin uninstall proj@m --scope project --json', w.project]);
});

test('a project installation whose project is gone is read-only', async t => {
  const w = await world(t);
  w.claude.plugins.push({ id: 'gone@m', scope: 'local', projectPath: path.join(w.root, 'missing'), enabled: true, version: '1' });
  const gone = (await w.snapshot()).plugins.find(item => item.name === 'gone');
  assert.deepEqual([gone.canToggle, gone.canRemove], [false, false]); assert.match(gone.reason, /不存在，这条安装只读/);
  assert.equal((await w.act({ action: 'plugin.remove', id: gone.id, expectedRevision: gone.revision, confirm: true })).code, 'PROTECTED_PLUGIN');
});

test('marketplaces: add (no ref), refresh, and removal that lists the plugins it uninstalls', async t => {
  const w = await world(t);
  const source = path.join(w.root, 'local-market'); await fs.mkdir(source);
  assert.equal((await w.act({ action: 'marketplace.add', sourceType: 'git', source: 'https://github.com/o/x.git', ref: 'main' })).code, 'UNSUPPORTED_FOR_AGENT');
  const added = await w.act({ action: 'marketplace.add', sourceType: 'local', source });
  assert.match(added.message, /已在 Claude 中添加 marketplace added/);
  assert.equal(w.claude.calls.at(-1).args.join(' '), `plugin marketplace add ${source} --scope user --json`);
  const market = (await w.snapshot()).marketplaces.find(item => item.id === 'claude:marketplace:m');
  assert.deepEqual([market.canRefresh, market.canRemove], [true, true]);
  assert.match((await w.act({ action: 'marketplace.refresh', id: market.id, expectedRevision: market.revision })).message, /已刷新 Claude 的 marketplace m/);
  assert.equal(w.claude.calls.at(-1).args.join(' '), 'plugin marketplace update m --json');
  const ask = await w.act({ action: 'marketplace.remove', id: market.id, expectedRevision: market.revision });
  assert.equal(ask.code, 'CONFIRMATION_REQUIRED'); assert.deepEqual(ask.nativeRules[0].items, ['demo', 'proj']);
  // Installing another plugin from it changes the revision: the confirmed list is stale.
  w.claude.plugins.push({ id: 'other@m', scope: 'user', enabled: true, version: '2.0.0' });
  assert.equal((await w.act({ action: 'marketplace.remove', id: market.id, expectedRevision: market.revision, confirm: true })).code, 'SNAPSHOT_STALE');
  const current = (await w.snapshot()).marketplaces.find(item => item.id === market.id);
  const removed = await w.act({ action: 'marketplace.remove', id: market.id, expectedRevision: current.revision, confirm: true });
  assert.match(removed.message, /并卸载了从它安装的 3 个插件/);
  assert.equal(w.claude.calls.at(-1).args.join(' '), 'plugin marketplace remove m --json');
});

test('the HTTP error body carries the native rules of a confirmation, and only of a confirmation', async t => {
  const w = await world(t);
  const app = await createApp(w.options);
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve)); t.after(() => app.close());
  const url = `http://127.0.0.1:${app.server.address().port}`;
  const demo = await w.object('plugins', 'demo');
  const post = body => fetch(`${url}/api/actions`, { method: 'POST', headers: { 'X-SkillDock-Token': app.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'local', agent: 'claude', ...body }) }).then(response => response.json());
  const ask = await post({ action: 'plugin.remove', id: demo.id, expectedRevision: demo.revision });
  assert.equal(ask.error.code, 'CONFIRMATION_REQUIRED'); assert.deepEqual(ask.error.nativeRules.map(rule => rule.kind), ['data-removal', 'reload']);
  const stale = await post({ action: 'plugin.remove', id: demo.id, expectedRevision: 'abc', confirm: true });
  assert.deepEqual([stale.error.code, 'nativeRules' in stale.error], ['SNAPSHOT_STALE', false]);
  // Version-2 fields need `agent`: a version-1 request keeps the 0.10.2 fields.
  const v1 = await fetch(`${url}/api/actions`, { method: 'POST', headers: { 'X-SkillDock-Token': app.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'local', action: 'plugin.remove', id: 'x', confirm: true }) }).then(response => response.json());
  assert.equal(v1.error.code, 'INVALID_ACTION');
});

test('every message, rule and reason seen above has a whole English and Japanese translation', async () => {
  // Test-only inputs (a stand-in failure, a refused validation) are not product messages.
  const messages = [...seen].filter(text => /[一-鿿]/.test(text) && !/stand-in|不支持参数/.test(text));
  assert.ok(messages.length > 20, `${messages.length}`);
  await assertTranslated(messages);
});
