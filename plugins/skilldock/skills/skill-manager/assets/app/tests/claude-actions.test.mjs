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
import { localSettingsExposure, excludeLocalSettings } from '../server/local-settings.mjs';
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
    calls: [], noop: false, fail: null, twist: {}, locks: [], listCalls: 0, failFrom: Infinity,
  };
  const writer = () => async (args, { cwd }) => {
    claude.calls.push({ args, cwd });
    claudeWriteArgs(args);
    // Whether the Claude lock was held while the command ran, and whether the root existed.
    claude.locks.push([await fs.stat(path.join(configDir, '.skilldock-operation.lock')).then(() => true, () => false), await fs.stat(configDir).then(() => true, () => false)]);
    if (claude.fail) throw Object.assign(new Error(claude.fail), { status: 502, code: 'CLI_FAILED' });
    if (claude.noop) return { ok: true };
    const [, verb, a, b] = args; const scope = claude.twist.installScope ?? args[args.indexOf('--scope') + 1];
    if (verb === 'marketplace' && a === 'add') await fs.mkdir(configDir, { recursive: true });
    if (verb === 'marketplace' && a === 'add' && claude.twist.addTwo) claude.marketplaces.push({ name: 'added-too', source: 'directory', path: b });
    if (verb === 'marketplace' && a === 'update' && claude.twist.refreshDrops) claude.marketplaces = claude.marketplaces.filter(m => m.name !== b);
    if (verb === 'marketplace' && a === 'remove' && claude.twist.removeKeepsPlugins) { claude.marketplaces = claude.marketplaces.filter(m => m.name !== b); return { ok: true }; }
    if (verb === 'enable' || verb === 'disable') {
      // Like Claude: the entry goes into the settings file of the scope, and the list reports the result.
      const file = scope === 'user' ? path.join(configDir, 'settings.json') : path.join(cwd, '.claude', scope === 'project' ? 'settings.json' : 'settings.local.json');
      const current = JSON.parse(await fs.readFile(file, 'utf8').catch(() => '{}'));
      await write(file, { ...current, enabledPlugins: { ...current.enabledPlugins, [a]: verb === 'enable' } });
      const item = claude.plugins.find(p => p.id === a); item.enabled = verb === 'enable';
    }
    if (verb === 'install') { claude.plugins.push({ id: a, scope, enabled: true, version: '2.0.0', ...(scope === 'user' ? {} : { projectPath: claude.twist.installProject ?? cwd }) }); if (scope === 'local') await write(path.join(cwd, '.claude/settings.local.json'), '{}'); }
    if (verb === 'uninstall') claude.plugins = claude.plugins.filter(p => !(p.id === a && p.scope === scope));
    if (verb === 'marketplace' && a === 'add') claude.marketplaces.push({ name: 'added', source: 'directory', path: b });
    if (verb === 'marketplace' && a === 'remove') {
      claude.marketplaces = claude.marketplaces.filter(m => m.name !== b); claude.plugins = claude.plugins.filter(p => !p.id.endsWith(`@${b}`));
      // Like Claude: the declaration goes from every settings layer (unless a test keeps it).
      if (!claude.twist.keepDeclarations) for (const file of [path.join(configDir, 'settings.json'), path.join(cwd, '.claude/settings.json'), path.join(cwd, '.claude/settings.local.json')]) {
        const current = await fs.readFile(file, 'utf8').then(JSON.parse, () => null);
        if (current?.extraKnownMarketplaces?.[b]) { delete current.extraKnownMarketplaces[b]; await write(file, current); }
      }
    }
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
    claudeCatalog: { managedDir: path.join(root, 'no-managed'), listPlugins: async () => { if (++claude.listCalls >= claude.failFrom) throw new Error('stand-in list failure'); return structuredClone(claude.plugins); }, listMarketplaces: async () => structuredClone(claude.marketplaces) },
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
  // Phase 5b: an update names its scope like the other plugin writes.
  assert.equal(claudeWriteArgs(['plugin', 'update', 'demo@m', '--scope', 'user', '--json']), 'plugin update');
  for (const [args, label] of [
    [['plugin', 'update', 'demo@m', '--json'], '更新也须显式作用域'],
    [['plugin', 'install', 'demo@m', '--scope', 'user', '--json', '-y'], '不代为确认命令'],
    [['plugin', 'install', 'demo@m', '--scope', 'user', '--json', '--accept-command', 'abc'], '不代为确认命令'],
    [['plugin', 'install', 'demo@m', '--json'], '作用域必须显式'],
    [['plugin', 'enable', 'demo@m', '--scope', 'managed', '--json'], '作用域取值'],
    [['plugin', 'enable', 'demo@m', '--scope', 'user'], '必须机器可读'],
    [['plugin', 'enable', 'a@m', 'b@m', '--scope', 'user', '--json'], '恰好一个对象'],
    [['plugin', 'enable', '--scope', 'user', '--json'], '恰好一个对象'],
    [['plugin', 'enable', 'demo@m', '--keep-data', '--scope', 'user', '--json'], '只有卸载可以保留数据'],
    [['plugin', 'marketplace', 'update', '', '--json'], '空名称在 Claude 中意味着全部'],
    [['plugin', 'marketplace', 'update', '../m', '--json'], '名称不合规'],
    [['plugin', 'enable', 'demo', '--scope', 'user', '--json'], '插件须为 名称@marketplace'],
    [['plugin', 'enable', 'demo@m', '--scope', 'user', '--scope', 'project', '--json'], '参数不能重复'],
    [['plugin', 'enable', 'demo@m', '--scope', 'user', '--json', '--json'], '参数不能重复'],
  ]) assert.throws(() => claudeWriteArgs(args), /./, label);
});

test('a command line that asks to run a marketplace-declared command is refused, never confirmed', async t => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock-claude-writer-')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const stand = path.join(root, 'claude');
  await fs.writeFile(stand, `#!/bin/sh\nif [ "$3" = "asks@m" ]; then echo '{"shownCommand":{"sha256":"abc"}}'; exit 1; fi\nif [ "$3" = "fails@m" ]; then echo 'boom https://user:secret@example.com/r.git token=abc' >&2; exit 3; fi\nif [ "$3" = "slow@m" ]; then sleep 5; fi\necho 'note'\necho '{"ok":true}'\n`, { mode: 0o700 });
  const run = claudeWriter({ cli: { path: stand }, claudeRoot: { configDir: path.join(root, '.claude') }, env: { HOME: root } });
  assert.deepEqual(await run(['plugin', 'install', 'fine@m', '--scope', 'user', '--json'], { cwd: root }), { ok: true }, '取最后一行机器可读结果');
  await assert.rejects(run(['plugin', 'install', 'asks@m', '--scope', 'user', '--json'], { cwd: root }), { code: 'HOST_MANAGED' });
  await assert.rejects(run(['plugin', 'install', 'fails@m', '--scope', 'user', '--json'], { cwd: root }), error => error.code === 'CLI_FAILED' && /boom/.test(error.message) && !/secret|token=abc/.test(error.message));
  const slow = claudeWriter({ cli: { path: stand }, claudeRoot: { configDir: path.join(root, '.claude') }, env: { HOME: root }, timeout: 300 });
  await assert.rejects(slow(['plugin', 'install', 'slow@m', '--scope', 'user', '--json'], { cwd: root }), error => error.code === 'CLI_TIMEOUT' && /执行结果尚未确认/.test(error.message));
});

test('local settings: ignored or tracked files are not offered an exclude entry; writing it twice leaves one line', async t => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock-local-settings-')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const state = { ignored: false, tracked: false };
  const git = async (directory, args) => {
    if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return root;
    if (args[0] === 'check-ignore') { if (state.ignored) return ''; throw new Error('not ignored'); }
    if (args[0] === 'ls-files') { if (state.tracked) return '.claude/settings.local.json'; throw new Error('not tracked'); }
    if (args[0] === 'rev-parse' && args[1] === '--git-path') return '.git/info/exclude';
    throw new Error('unexpected');
  };
  const exposure = await localSettingsExposure(root, { git });
  assert.equal(exposure.relative, '.claude/settings.local.json');
  state.ignored = true; assert.equal(await localSettingsExposure(root, { git }), null, '已被忽略');
  state.ignored = false; state.tracked = true; assert.equal(await localSettingsExposure(root, { git }), null, '已被跟踪');
  await write(path.join(root, '.git/info/exclude'), '# existing');
  await excludeLocalSettings(exposure, { git }); await excludeLocalSettings(exposure, { git });
  assert.equal(await fs.readFile(path.join(root, '.git/info/exclude'), 'utf8'), '# existing\n/.claude/settings.local.json\n');
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
  // The local settings decide now: the shared project settings would not take effect.
  const confirmed = await w.object('plugins', 'demo'); const calls = w.claude.calls.length;
  assert.equal((await w.act({ action: 'plugin.toggle', id: confirmed.id, enabled: false, scope: 'project', confirm: true, expectedRevision: confirmed.revision })).code, 'SCOPE_INEFFECTIVE');
  assert.equal(w.claude.calls.length, calls);
  // Where no higher layer decides, a confirmed write to the shared settings runs.
  const proj = await w.object('plugins', 'proj');
  await w.act({ action: 'plugin.toggle', id: proj.id, enabled: false, scope: 'project', confirm: true, expectedRevision: proj.revision });
  assert.equal(w.claude.calls.at(-1).args.join(' '), 'plugin disable proj@m --scope project --json');
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
  assert.equal((await w.act({ action: 'plugin.remove', id: gone.id, expectedRevision: gone.revision, confirm: true })).code, 'PROJECT_PATH_MISSING');
  assert.equal((await w.act({ action: 'plugin.toggle', id: gone.id, enabled: false, expectedRevision: gone.revision })).code, 'PROJECT_PATH_MISSING');
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

test('removing a marketplace that the shared project settings declare, or that project installations came from, names the shared file', async t => {
  const w = await world(t);
  const removalRules = async () => { const market = (await w.snapshot()).marketplaces.find(item => item.id === 'claude:marketplace:m'); return (await w.act({ action: 'marketplace.remove', id: market.id, expectedRevision: market.revision })).nativeRules.map(rule => rule.kind); };
  assert.deepEqual(await removalRules(), ['affected-plugins', 'scope', 'reload'], 'proj 装在项目范围');
  w.claude.plugins = w.claude.plugins.filter(item => item.scope !== 'project');
  assert.deepEqual(await removalRules(), ['affected-plugins', 'reload'], '只剩用户范围的安装');
  await write(path.join(w.project, '.claude/settings.json'), { extraKnownMarketplaces: { m: { source: { source: 'github', repo: 'o/m' } } } });
  assert.deepEqual(await removalRules(), ['affected-plugins', 'scope', 'reload'], '项目共享设置声明了它');
  // Shared project settings that only hold an entry of a plugin from it change too.
  await write(path.join(w.project, '.claude/settings.json'), { enabledPlugins: { 'demo@m': true } });
  assert.deepEqual(await removalRules(), ['affected-plugins', 'scope', 'reload'], '项目共享设置中有从它安装的插件条目');
  // A declaration left behind after the removal is not reported as done.
  await write(path.join(w.project, '.claude/settings.json'), { extraKnownMarketplaces: { m: { source: { source: 'github', repo: 'o/m' } } } });
  w.claude.twist = { keepDeclarations: true };
  let current = (await w.snapshot()).marketplaces.find(item => item.id === 'claude:marketplace:m');
  const left = await w.act({ action: 'marketplace.remove', id: current.id, expectedRevision: current.revision, confirm: true });
  assert.equal(left.code, 'READBACK_FAILED'); assert.match(left.message, /仍有它的声明/);
  w.claude.twist = {}; w.claude.marketplaces.push({ name: 'm', source: 'github', repo: 'o/m', installLocation: path.join(w.configDir, 'plugins/marketplaces/m') });
  current = (await w.snapshot()).marketplaces.find(item => item.id === 'claude:marketplace:m');
  assert.match((await w.act({ action: 'marketplace.remove', id: current.id, expectedRevision: current.revision, confirm: true })).message, /已从 Claude 中移除 marketplace m/);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(w.project, '.claude/settings.json'), 'utf8')).extraKnownMarketplaces, {}, '声明已删除');
  w.claude.marketplaces.push({ name: 'm', source: 'github', repo: 'o/m', installLocation: path.join(w.configDir, 'plugins/marketplaces/m') });
  // Declared by managed settings: not removable here.
  await write(path.join(w.root, 'no-managed/managed-settings.json'), { extraKnownMarketplaces: { m: { source: { source: 'github', repo: 'o/m' } } } });
  const managed = (await w.snapshot()).marketplaces.find(item => item.id === 'claude:marketplace:m');
  assert.deepEqual([managed.canRemove, managed.protection], [false, 'managed']);
  assert.equal((await w.act({ action: 'marketplace.remove', id: managed.id, expectedRevision: managed.revision, confirm: true })).code, 'HOST_MANAGED');
});

test('switching a user installation that the project decides writes the local settings; the readback names the layer', async t => {
  const w = await world(t);
  await write(path.join(w.project, '.claude/settings.json'), { enabledPlugins: { 'demo@m': true } });
  const demo = await w.object('plugins', 'demo');
  assert.equal(demo.enablement.decidedBy, 'project');
  await w.act({ action: 'plugin.toggle', id: demo.id, enabled: false, expectedRevision: demo.revision, gitExclude: false });
  assert.deepEqual([w.claude.calls.at(-1).args.join(' '), w.claude.calls.at(-1).cwd], ['plugin disable demo@m --scope local --json', w.project]);
  // Writing the user settings explicitly cannot take effect while a project layer decides: refused, nothing runs.
  const again = await w.object('plugins', 'demo'); const calls = w.claude.calls.length;
  assert.equal((await w.act({ action: 'plugin.toggle', id: again.id, enabled: true, scope: 'user', expectedRevision: again.revision })).code, 'SCOPE_INEFFECTIVE');
  assert.equal(w.claude.calls.length, calls);
  // A readback failure names the layer written.
  w.claude.noop = true;
  const failed = await w.act({ action: 'plugin.toggle', id: again.id, enabled: true, expectedRevision: again.revision, gitExclude: false });
  assert.equal(failed.code, 'READBACK_FAILED'); assert.match(failed.message, /已写入项目本地设置/);
});

test('a user installation that the local settings decide is switched there too', async t => {
  const w = await world(t);
  await write(path.join(w.project, '.claude/settings.local.json'), { enabledPlugins: { 'demo@m': false } });
  w.claude.plugins.find(item => item.id === 'demo@m').enabled = false;
  const demo = await w.object('plugins', 'demo');
  assert.deepEqual([demo.enablement.decidedBy, demo.canToggle], ['local', true]);
  await w.act({ action: 'plugin.toggle', id: demo.id, enabled: true, expectedRevision: demo.revision });
  assert.equal(w.claude.calls.at(-1).args.join(' '), 'plugin enable demo@m --scope local --json');
  assert.equal((await w.object('plugins', 'demo')).enabled, true);
});

test('every write reads back what it claims: installs, uninstalls, marketplace additions, refreshes and removals', async t => {
  const w = await world(t);
  const other = async () => (await w.snapshot()).plugins.find(item => item.id === 'claude:plugin:other@m');
  w.claude.noop = true;
  let plugin = await other();
  assert.equal((await w.act({ action: 'plugin.install', id: plugin.id, expectedRevision: plugin.revision })).code, 'READBACK_FAILED', '安装没有发生');
  w.claude.noop = false; w.claude.twist = { installScope: 'user' };
  assert.equal((await w.act({ action: 'plugin.install', id: plugin.id, scope: 'local', gitExclude: false, expectedRevision: plugin.revision })).code, 'READBACK_FAILED', '装到了别的作用域');
  w.claude.plugins = w.claude.plugins.filter(item => item.id !== 'other@m');
  const elsewhere = path.join(w.root, 'elsewhere'); await fs.mkdir(elsewhere);
  w.claude.twist = { installProject: elsewhere }; plugin = await other();
  assert.equal((await w.act({ action: 'plugin.install', id: plugin.id, scope: 'local', gitExclude: false, expectedRevision: plugin.revision })).code, 'READBACK_FAILED', '装到了别的项目');
  w.claude.twist = {}; w.claude.noop = true;
  const demo = await w.object('plugins', 'demo');
  assert.equal((await w.act({ action: 'plugin.remove', id: demo.id, expectedRevision: demo.revision, confirm: true })).code, 'READBACK_FAILED', '卸载没有发生');
  const source = path.join(w.root, 'market-source'); await fs.mkdir(source);
  assert.equal((await w.act({ action: 'marketplace.add', sourceType: 'local', source })).code, 'READBACK_FAILED', '没有新增');
  w.claude.noop = false; w.claude.twist = { addTwo: true };
  assert.equal((await w.act({ action: 'marketplace.add', sourceType: 'local', source })).code, 'READBACK_FAILED', '新增了两个');
  w.claude.twist = { refreshDrops: true };
  let market = (await w.snapshot()).marketplaces.find(item => item.id === 'claude:marketplace:m');
  assert.equal((await w.act({ action: 'marketplace.refresh', id: market.id, expectedRevision: market.revision })).code, 'READBACK_FAILED', '刷新后消失');
  w.claude.marketplaces.push({ name: 'm', source: 'github', repo: 'o/m', installLocation: path.join(w.configDir, 'plugins/marketplaces/m') });
  w.claude.twist = {}; w.claude.noop = true;
  market = (await w.snapshot()).marketplaces.find(item => item.id === 'claude:marketplace:m');
  assert.equal((await w.act({ action: 'marketplace.remove', id: market.id, expectedRevision: market.revision, confirm: true })).code, 'READBACK_FAILED', '移除后仍在');
  // Removed, but its plugins stay: the message says only what happened.
  w.claude.noop = false; w.claude.twist = { removeKeepsPlugins: true };
  const kept = await w.act({ action: 'marketplace.remove', id: market.id, expectedRevision: market.revision, confirm: true });
  assert.match(kept.message, /已从 Claude 中移除 marketplace m。/); assert.match(kept.message, /仍有 3 个从它安装的插件留在 Claude 中/);
});

test('the Claude lock is held while a command runs, released after, and never creates the Claude root', async t => {
  const w = await world(t);
  const demo = await w.object('plugins', 'demo');
  await w.act({ action: 'plugin.toggle', id: demo.id, enabled: false, expectedRevision: demo.revision });
  assert.deepEqual(w.claude.locks.at(-1), [true, true]);
  assert.equal(await fs.stat(path.join(w.configDir, '.skilldock-operation.lock')).then(() => true, () => false), false, '结束后释放');
  await fs.rm(w.configDir, { recursive: true, force: true });
  const source = path.join(w.root, 'market-source'); await fs.mkdir(source);
  await w.act({ action: 'marketplace.add', sourceType: 'local', source });
  assert.deepEqual(w.claude.locks.at(-1), [false, false], '根不存在时不取锁、不创建根');
  // An unconfirmed Claude seen under the lock is never written, even when the check before it passed.
  const v = await world(t);
  const item = await v.object('plugins', 'demo');
  v.claude.failFrom = v.claude.listCalls + 2;
  assert.equal((await v.act({ action: 'plugin.toggle', id: item.id, enabled: false, expectedRevision: item.revision })).code, 'AGENT_UNCONFIRMED');
  assert.deepEqual(v.claude.calls, []);
});

test('capabilities: managed installations and enablement decided beyond the settings files cannot be changed', async t => {
  const w = await world(t);
  w.claude.plugins.push({ id: 'org@m', scope: 'managed', enabled: true, version: '1' });
  await write(path.join(w.configDir, 'settings.json'), { enabledPlugins: { 'demo@m': false } });
  const plugins = (await w.snapshot()).plugins;
  const org = plugins.find(item => item.name === 'org'); const demo = plugins.find(item => item.name === 'demo' && item.installation?.scope === 'user');
  assert.deepEqual([org.canToggle, org.canRemove, org.protection], [false, false, 'managed']);
  assert.equal((await w.act({ action: 'plugin.toggle', id: org.id, enabled: false, expectedRevision: org.revision })).code, 'HOST_MANAGED');
  assert.deepEqual([demo.enabled, demo.canToggle], [true, false]); assert.match(demo.reason, /设置文件中是停用，但 Claude 实际启用了它/);
});

test('a project installation in another project is changed from that project; nothing is journaled for a confirmation or a stale page', async t => {
  const w = await world(t);
  const other = path.join(w.root, 'other-project'); await fs.mkdir(other);
  w.claude.plugins.push({ id: 'far@m', scope: 'local', projectPath: other, enabled: true, version: '1' });
  const far = (await w.snapshot()).plugins.find(item => item.name === 'far');
  await w.act({ action: 'plugin.toggle', id: far.id, enabled: false, expectedRevision: far.revision, gitExclude: false });
  assert.equal(w.claude.calls.at(-1).cwd, other);
  const after = (await w.snapshot()).plugins.find(item => item.name === 'far');
  const before = (await w.snapshot()).activity.length;
  await w.act({ action: 'plugin.remove', id: after.id, expectedRevision: after.revision });
  await w.act({ action: 'plugin.remove', id: after.id, expectedRevision: 'abcd', confirm: true });
  assert.equal((await w.snapshot()).activity.length, before, '确认与过期不记为失败');
  await w.act({ action: 'plugin.remove', id: after.id, expectedRevision: after.revision, confirm: true });
  assert.deepEqual([w.claude.calls.at(-1).args.join(' '), w.claude.calls.at(-1).cwd], ['plugin uninstall far@m --scope local --json', other]);
  assert.equal((await w.service.action({ mode: 'sandbox', agent: 'claude', action: 'plugin.toggle', id: far.id, enabled: true }).catch(error => error)).code, 'MODE_DISABLED');
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
