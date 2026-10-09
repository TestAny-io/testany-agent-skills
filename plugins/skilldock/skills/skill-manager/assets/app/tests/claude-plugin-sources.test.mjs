// SPDX-License-Identifier: AGPL-3.0-only
// Phase 4d: a Claude plugin from a local directory or Git (HLD 3.3, DEC-SDX-025). With a Claude
// manifest it becomes a skills-directory plugin by the file transaction; without one, through a
// marketplace SkillDock writes and registers. Claude's lists and command line are stand-ins.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createService } from '../server/service.mjs';
import { writeGeneration } from '../server/generation.mjs';
import { claudeWriteArgs } from '../server/claude-writer.mjs';
import { claudeDirectLocation } from '../server/direct-plugins.mjs';
import { runProcess } from '../server/cli.mjs';
import { assertTranslated } from './i18n-helper.mjs';

const write = async (file, value) => { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, typeof value === 'string' ? value : JSON.stringify(value)); };
const skillFile = (directory, name) => write(path.join(directory, name, 'SKILL.md'), `---\nname: ${name}\ndescription: ${name} skill.\n---\n`);
const exists = file => fs.lstat(file).then(() => true, () => false);
const seen = new Set();
const see = value => { for (const text of [value?.message, value?.reason, ...(value?.nativeRules ?? []).map(rule => rule.message)]) if (typeof text === 'string') seen.add(text); return value; };

async function world(t, { repo = false, cliAvailable = true, before } = {}) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock-claude-sources-')));
  const home = path.join(root, 'home'); const configDir = path.join(home, '.claude'); const project = path.join(root, 'project');
  await fs.mkdir(project, { recursive: true }); await fs.mkdir(path.join(configDir, 'skills'), { recursive: true });
  // Sources: one with a Claude manifest, one with only a Codex manifest and skills, one with nothing for Claude.
  await write(path.join(root, 'with-manifest/.claude-plugin/plugin.json'), { name: 'tidy', version: '1.0.0', description: 'Tidy plugin.' });
  await skillFile(path.join(root, 'with-manifest/skills'), 'tidy-up');
  await write(path.join(root, 'codex-only/.codex-plugin/plugin.json'), { name: 'helper', version: '2.0.0', description: 'Helper plugin.' });
  await skillFile(path.join(root, 'codex-only/skills'), 'help-me');
  await write(path.join(root, 'nothing/.codex-plugin/plugin.json'), { name: 'empty', version: '1.0.0' });
  // No manifest at all: only skills (4d review P1-01).
  await skillFile(path.join(root, 'bare-tools/skills'), 'bare-skill');
  await before?.({ root, home, configDir, project });
  const state = path.join(root, 'state'); await fs.mkdir(state); await writeGeneration(state, 2);
  await write(path.join(state, 'settings/agents.json'), { format: 1, agents: { claude: { management: 'enabled', origin: 'user', changedAt: '2026-10-09T00:00:00.000Z' } } });
  // Switches: `noopAdd`/`failAdd`, `noopInstall`, `stuck` (marketplace remove leaves it), `listFails`
  // (the plugin list fails), `breakAfterRemove`, `onList` (runs while Claude is read).
  const claude = { plugins: [], marketplaces: [], calls: [], locks: [] };
  const lockHeld = () => fs.stat(path.join(configDir, '.skilldock-operation.lock')).then(() => true, () => false);
  // A repository whose .claude/settings.local.json is not ignored, when asked for.
  const git = async (directory, args) => {
    if (!repo) throw new Error('not a repository');
    if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return project;
    if (args[0] === 'rev-parse' && args[1] === '--git-path') return '.git/info/exclude';
    throw new Error('not ignored');
  };
  // Copies a plugin from its directory marketplace into Claude's cache, under the version Claude computes.
  const cached = async id => {
    const [name, marketName] = id.split('@'); const market = claude.marketplaces.find(item => item.name === marketName);
    const root = market.path.replace(/\/$/, ''); const entry = JSON.parse(await fs.readFile(path.join(root, '.claude-plugin/marketplace.json'), 'utf8')).plugins.find(item => item.name === name);
    const directory = path.resolve(root, entry.source);
    const manifest = JSON.parse(await fs.readFile(path.join(directory, '.claude-plugin/plugin.json'), 'utf8').catch(() => '{}'));
    const version = manifest.version ?? entry.version ?? 'unknown';
    const installPath = path.join(configDir, 'plugins/cache', marketName, name, version);
    await fs.rm(installPath, { recursive: true, force: true }); await fs.cp(directory, installPath, { recursive: true });
    return { version, installPath };
  };
  const writer = () => async (args, { cwd }) => {
    claude.calls.push(args.join(' ')); claudeWriteArgs(args); claude.locks.push(await lockHeld());
    const [, verb, a, b] = args; const scope = args[args.indexOf('--scope') + 1];
    if (verb === 'marketplace' && a === 'add' && claude.failAdd) throw Object.assign(new Error('Claude 命令行 plugin marketplace add 失败：stand-in'), { status: 502, code: 'CLI_FAILED' });
    if (verb === 'marketplace' && a === 'add' && !claude.noopAdd) { const name = JSON.parse(await fs.readFile(path.join(b, '.claude-plugin/marketplace.json'), 'utf8')).name; const shown = claude.slash ? `${b}/` : b; claude.marketplaces.push({ name, source: 'directory', path: shown, installLocation: shown }); }
    // Claude uninstalls what came from a marketplace it removes.
    if (verb === 'marketplace' && a === 'remove' && !claude.stuck) { claude.marketplaces = claude.marketplaces.filter(item => item.name !== b); claude.plugins = claude.plugins.filter(item => !item.id.endsWith(`@${b}`)); if (claude.breakAfterRemove) claude.listFails = true; }
    if (verb === 'install' && !claude.noopInstall) claude.plugins.push({ id: a, scope, enabled: true, ...await cached(a), ...(scope === 'user' ? {} : { projectPath: cwd }) });
    // As Claude does: a new version gets its own directory; an unchanged one is up to date (phase 5c).
    if (verb === 'update') {
      const install = claude.plugins.find(item => item.id === a && item.scope === scope); const next = await cached(a);
      if (next.version !== 'unknown' && next.version === install.version) return { updateOutcome: 'up_to_date' };
      Object.assign(install, next); return { updateOutcome: 'updated' };
    }
    if (verb === 'install' && scope === 'local') await write(path.join(cwd, '.claude/settings.local.json'), { enabledPlugins: { [a]: true } });
    if (verb === 'uninstall') claude.plugins = claude.plugins.filter(item => !(item.id === a && item.scope === scope));
    return { ok: true };
  };
  const service = await createService({ home, codexHome: path.join(home, '.codex'), projectDir: project, stateDir: state, background: false, env: { HOME: home },
    adapter: { list: async () => ({ plugins: [], marketplaces: [], diagnostics: [], listed: { plugins: true, marketplaces: true }, cli: { available: true, version: 'codex-cli 0.200.0', path: '/stand-in/codex' } }) },
    claudeCli: async () => cliAvailable ? { available: true, version: '2.1.288', path: '/stand-in/claude' } : { available: false },
    claudeCatalog: { managedDir: path.join(root, 'no-managed'), listMarketplaces: async () => structuredClone(claude.marketplaces),
      listPlugins: async () => { await claude.onList?.(); if (claude.listFails) throw new Error('Claude 命令行 plugin list 失败：stand-in'); return structuredClone(claude.plugins); } },
    claudeWriter: writer, claudeGit: git });
  t.after(async () => { await service.close(); await fs.rm(root, { recursive: true, force: true }); });
  const act = request => service.action({ mode: 'local', ...request }).then(see, see);
  const snapshot = () => service.snapshot('local', true, { multiAgent: true });
  const registry = async () => JSON.parse(await fs.readFile(service.environments.local.registryFile, 'utf8'));
  const disable = confirm => service.action({ mode: 'local', action: 'agent.setManagement', agent: 'claude', management: 'read-only', ...(confirm ? { confirm } : {}) }).then(see, see);
  const managed = async () => JSON.parse(await fs.readFile(path.join(state, 'settings/agents.json'), 'utf8')).agents.claude.management;
  return { root, home, configDir, project, state, claude, service, act, snapshot, registry, disable, lockHeld, managed };
}
const installHelper = async (w, extra = {}) => {
  const preview = (await w.act({ action: 'plugin.previewInstall', agent: 'claude', sourceType: 'local', source: path.join(w.root, 'codex-only') })).pluginPreview;
  return w.act({ action: 'plugin.installSource', agent: 'claude', previewId: preview.id, ...extra });
};
const marketOf = async w => Object.keys((await w.registry()).claudeDirectPlugins ?? {})[0];
const dirOf = (w, market) => path.join(w.state, 'local', 'claude-direct-plugins', market.slice('skilldock-'.length));

test('a source with a Claude manifest goes into a skills directory, leaves restorably and comes back', async t => {
  const w = await world(t);
  const preview = (await w.act({ action: 'plugin.previewInstall', agent: 'claude', sourceType: 'local', source: path.join(w.root, 'with-manifest') })).pluginPreview;
  assert.deepEqual([preview.agent, preview.name, preview.scopes.join(), preview.manifests.join(), preview.canSelectSkills], ['claude', 'tidy', 'user,project', 'claude', false]);
  assert.equal((await w.act({ action: 'plugin.installSource', agent: 'claude', previewId: preview.id, scope: 'local' })).code, 'INVALID_ACTION');
  w.claude.onList = async () => { w.claude.locks.push(await w.lockHeld()); };
  const installed = await w.act({ action: 'plugin.installSource', agent: 'claude', previewId: preview.id });
  w.claude.onList = undefined;
  // The checks before the lock read Claude too; the readback under it is the last read.
  assert.equal(w.claude.locks.at(-1), true, '读回时持有 Claude 锁');
  assert.match(installed.message, /已把 Claude 插件 tidy 放入个人技能目录/);
  assert.ok(await exists(path.join(w.configDir, 'skills/tidy/.claude-plugin/plugin.json')));
  assert.deepEqual(w.claude.calls, [], '不经命令行，也不写设置');
  const plugin = (await w.snapshot()).plugins.find(item => item.marketplace === 'skills-dir' && item.name === 'tidy');
  assert.deepEqual([plugin.canRemove, plugin.installation.scope], [true, 'user']);
  assert.ok((await w.registry()).claudeSources[await fs.realpath(path.join(w.configDir, 'skills/tidy'))], '来源记录在 Claude 分区');
  const ask = await w.act({ action: 'plugin.remove', agent: 'claude', id: plugin.id, expectedRevision: plugin.revision });
  assert.equal(ask.code, 'CONFIRMATION_REQUIRED');
  const removed = await w.act({ action: 'plugin.remove', agent: 'claude', id: plugin.id, expectedRevision: plugin.revision, confirm: true });
  assert.match(removed.message, /已把 Claude 插件 tidy 移至可恢复区/);
  assert.equal(await exists(path.join(w.configDir, 'skills/tidy')), false);
  assert.deepEqual(Object.keys((await w.registry()).claudeSources ?? {}), [], '来源记录随移除删去');
  const record = (await w.snapshot()).activity.find(item => item.agent === 'claude' && item.action === 'plugin.remove');
  assert.equal(record.canRestore, true);
  assert.match((await w.act({ action: 'activity.restore', id: record.id })).message, /已恢复 Claude 插件 tidy/);
  assert.ok(await exists(path.join(w.configDir, 'skills/tidy/.claude-plugin/plugin.json')));
  assert.ok((await w.registry()).claudeSources[await fs.realpath(path.join(w.configDir, 'skills/tidy'))], '来源记录随恢复还原');
});

test('a source without a Claude manifest goes through a marketplace SkillDock writes, and the marketplace leaves with it', async t => {
  const w = await world(t);
  const preview = (await w.act({ action: 'plugin.previewInstall', agent: 'claude', sourceType: 'local', source: path.join(w.root, 'codex-only') })).pluginPreview;
  assert.deepEqual([preview.name, preview.scopes.join(), preview.manifests.join(), preview.skills.join()], ['helper', 'user,local', 'codex', 'help-me']);
  assert.match(preview.nativeRules[0].message, /本地 marketplace/);
  assert.equal((await w.act({ action: 'plugin.installSource', agent: 'claude', previewId: preview.id, scope: 'project' })).code, 'UNSUPPORTED_FOR_AGENT', '项目共享设置会引用只在本机存在的 marketplace');
  const installed = await w.act({ action: 'plugin.installSource', agent: 'claude', previewId: preview.id });
  assert.match(installed.message, /已为当前用户安装 Claude 插件 helper/);
  const [market] = Object.keys((await w.registry()).claudeDirectPlugins);
  assert.match(market, /^skilldock-[a-f0-9]{20}$/);
  assert.deepEqual(w.claude.calls.map(call => call.replace(/ \/\S+/, ' <root>')), [`plugin marketplace add <root> --scope user --json`, `plugin install helper@${market} --scope user --json`]);
  assert.deepEqual(w.claude.locks, [true, true], '命令行运行时持有 Claude 锁');
  const marketJson = JSON.parse(await fs.readFile(path.join(w.state, 'local', 'claude-direct-plugins', market.slice('skilldock-'.length), '.claude-plugin/marketplace.json'), 'utf8'));
  assert.deepEqual([marketJson.name, marketJson.plugins[0].source], [market, './plugins/helper']);
  // The snapshot shows the marketplace as the source it came from.
  const shown = await w.snapshot(); const listed = shown.marketplaces.find(item => item.name === market);
  assert.deepEqual([listed.direct, listed.displayName, listed.source, listed.reason], [true, 'helper', path.join(w.root, 'codex-only'), '由单个插件安装自动登记的来源。']);
  // Uninstalling its last plugin removes the marketplace and its files.
  const plugin = shown.plugins.find(item => item.name === 'helper' && item.installed);
  assert.equal(plugin.sourceInfo.label, '单插件来源');
  const removed = await w.act({ action: 'plugin.remove', agent: 'claude', id: plugin.id, expectedRevision: plugin.revision, confirm: true });
  assert.match(removed.message, /已移除 SkillDock 为它生成的本地 marketplace/);
  assert.equal(w.claude.calls.at(-1), `plugin marketplace remove ${market} --json`);
  assert.equal(await exists(path.join(w.state, 'local', 'claude-direct-plugins', market.slice('skilldock-'.length))), false);
  assert.equal((await w.registry()).claudeDirectPlugins[market], undefined);
});

test('a source with nothing Claude can load is refused; a source already installed is said so', async t => {
  const w = await world(t);
  assert.equal((await w.act({ action: 'plugin.previewInstall', agent: 'claude', sourceType: 'local', source: path.join(w.root, 'nothing') })).code, 'UNSUPPORTED_FOR_AGENT');
  const first = (await w.act({ action: 'plugin.previewInstall', agent: 'claude', sourceType: 'local', source: path.join(w.root, 'codex-only') })).pluginPreview;
  await w.act({ action: 'plugin.installSource', agent: 'claude', previewId: first.id });
  assert.equal((await w.act({ action: 'plugin.previewInstall', agent: 'claude', sourceType: 'local', source: path.join(w.root, 'codex-only') })).code, 'PLUGIN_ALREADY_INSTALLED');
  // A Claude preview is not a Codex one.
  const again = (await w.act({ action: 'plugin.previewInstall', agent: 'claude', sourceType: 'local', source: path.join(w.root, 'with-manifest') })).pluginPreview;
  assert.equal((await w.act({ action: 'plugin.installSource', previewId: again.id })).code, 'STALE_PREVIEW');
});

test('a skills-directory plugin can go into the current project; without Claude\'s command line nothing is written', async t => {
  const w = await world(t);
  const preview = (await w.act({ action: 'plugin.previewInstall', agent: 'claude', sourceType: 'local', source: path.join(w.root, 'with-manifest') })).pluginPreview;
  const installed = await w.act({ action: 'plugin.installSource', agent: 'claude', previewId: preview.id, scope: 'project' });
  assert.match(installed.message, /已把 Claude 插件 tidy 放入当前项目的 \.claude\/skills/);
  assert.ok(await exists(path.join(w.project, '.claude/skills/tidy/.claude-plugin/plugin.json')));
  assert.equal((await w.snapshot()).plugins.find(item => item.marketplace === 'skills-dir' && item.name === 'tidy').installation.scope, 'project');
  // Without the command line Claude cannot be confirmed (HLD 3.2), so no source is installed.
  const offline = await world(t, { cliAvailable: false });
  assert.equal((await offline.act({ action: 'plugin.previewInstall', agent: 'claude', sourceType: 'local', source: path.join(offline.root, 'codex-only') })).code, 'AGENT_UNCONFIRMED');
  assert.deepEqual([offline.claude.calls, (await offline.registry().catch(() => ({}))).claudeDirectPlugins], [[], undefined]);
});

test('a local install asks about .git/info/exclude, and names the file there when the user agrees', async t => {
  const w = await world(t, { repo: true });
  const preview = (await w.act({ action: 'plugin.previewInstall', agent: 'claude', sourceType: 'local', source: path.join(w.root, 'codex-only') })).pluginPreview;
  const ask = await w.act({ action: 'plugin.installSource', agent: 'claude', previewId: preview.id, scope: 'local' });
  assert.deepEqual([ask.code, ask.nativeRules[0].items], ['CONFIRMATION_REQUIRED', ['.claude/settings.local.json']]);
  assert.deepEqual(w.claude.calls, [], '确认之前不登记、不安装');
  const installed = await w.act({ action: 'plugin.installSource', agent: 'claude', previewId: preview.id, scope: 'local', gitExclude: true });
  assert.match(installed.message, /已在当前项目中安装 Claude 插件 helper，只给你自己使用/);
  assert.match(installed.message, /已把 \.claude\/settings\.local\.json 写入本机的 \.git\/info\/exclude/);
  assert.match(await fs.readFile(path.join(w.project, '.git/info/exclude'), 'utf8'), /^\/\.claude\/settings\.local\.json$/m);
  assert.equal(w.claude.plugins[0].projectPath, w.project);
});

test('removing the generated marketplace on its page also deletes its files', async t => {
  const w = await world(t);
  const preview = (await w.act({ action: 'plugin.previewInstall', agent: 'claude', sourceType: 'local', source: path.join(w.root, 'codex-only') })).pluginPreview;
  await w.act({ action: 'plugin.installSource', agent: 'claude', previewId: preview.id });
  const [market] = Object.keys((await w.registry()).claudeDirectPlugins);
  const listed = (await w.snapshot()).marketplaces.find(item => item.name === market);
  const removed = await w.act({ action: 'marketplace.remove', agent: 'claude', id: listed.id, expectedRevision: listed.revision, confirm: true });
  assert.match(removed.message, /并卸载了从它安装的 1 个插件。\nSkillDock 为它生成的本地文件已一并删除。/);
  assert.equal(await exists(path.join(w.state, 'local', 'claude-direct-plugins', market.slice('skilldock-'.length))), false);
  assert.equal((await w.registry()).claudeDirectPlugins[market], undefined);
});

test('turning Claude management off names the generated marketplaces, and with confirmation cleans them up first', async t => {
  const w = await world(t);
  const preview = (await w.act({ action: 'plugin.previewInstall', agent: 'claude', sourceType: 'local', source: path.join(w.root, 'codex-only') })).pluginPreview;
  await w.act({ action: 'plugin.installSource', agent: 'claude', previewId: preview.id });
  const [market] = Object.keys((await w.registry()).claudeDirectPlugins);
  const kept = await w.disable();
  assert.match(kept.message, new RegExp(`仍登记在 Claude 中：${market}（helper）`));
  assert.ok(w.claude.marketplaces.some(item => item.name === market), '不勾选清理时保留');
  // Enabled again, then turned off with the clean-up.
  await w.service.action({ mode: 'local', action: 'agent.setManagement', agent: 'claude', management: 'enabled' });
  const cleaned = await w.disable(true);
  assert.match(cleaned.message, new RegExp(`已清理 SkillDock 生成的本地 marketplace：${market}（helper）`));
  assert.deepEqual([w.claude.marketplaces, w.claude.plugins], [[], []]);
  assert.equal((await w.registry()).claudeDirectPlugins[market], undefined);
  assert.equal((await w.snapshot()).agents.find(item => item.agent === 'claude').management, 'read-only');
  assert.ok((await w.snapshot()).activity.some(item => item.agent === 'claude' && item.action === 'marketplace.remove' && item.target === market), '清理经普通移除流程并留有记录');
});

test('a clean-up that fails leaves Claude management on', async t => {
  const w = await world(t);
  const preview = (await w.act({ action: 'plugin.previewInstall', agent: 'claude', sourceType: 'local', source: path.join(w.root, 'codex-only') })).pluginPreview;
  await w.act({ action: 'plugin.installSource', agent: 'claude', previewId: preview.id });
  // Claude's command line returns but leaves the marketplace in place.
  w.claude.stuck = true;
  const failed = await w.disable(true);
  assert.equal(failed.code, 'READBACK_FAILED');
  assert.equal((await w.snapshot()).agents.find(item => item.agent === 'claude').management, 'enabled');
});

test('a source without any manifest is named after its directory; a name Claude cannot take is refused', async t => {
  const w = await world(t);
  const preview = (await w.act({ action: 'plugin.previewInstall', agent: 'claude', sourceType: 'local', source: path.join(w.root, 'bare-tools') })).pluginPreview;
  assert.deepEqual([preview.name, preview.manifests, preview.scopes.join()], ['bare-tools', [], 'user,local']);
  await w.act({ action: 'plugin.installSource', agent: 'claude', previewId: preview.id });
  const market = await marketOf(w);
  assert.equal(w.claude.calls.at(-1), `plugin install bare-tools@${market} --scope user --json`);
  const json = JSON.parse(await fs.readFile(path.join(dirOf(w, market), '.claude-plugin/marketplace.json'), 'utf8'));
  assert.deepEqual([json.plugins[0].name, json.plugins[0].source], ['bare-tools', './plugins/bare-tools']);
  await skillFile(path.join(w.root, 'bad name/skills'), 'inside');
  const bad = await w.act({ action: 'plugin.previewInstall', agent: 'claude', sourceType: 'local', source: path.join(w.root, 'bad name') });
  assert.equal(bad.code, 'INVALID_NAME'); assert.match(bad.message, /取自来源目录名/);
});

test('the clean-up after an uninstall reads back; when it fails the uninstall stands and the way out is said', async t => {
  const w = await world(t);
  await installHelper(w); const market = await marketOf(w);
  const plugin = (await w.snapshot()).plugins.find(item => item.name === 'helper' && item.installed);
  w.claude.stuck = true;
  const removed = await w.act({ action: 'plugin.remove', agent: 'claude', id: plugin.id, expectedRevision: plugin.revision, confirm: true });
  assert.match(removed.message, /^已卸载 Claude 插件 helper。/);
  assert.match(removed.message, new RegExp(`本地 marketplace ${market} 未能清理：Claude 命令行已返回，但这个 marketplace 仍在清单中`));
  assert.ok(await exists(dirOf(w, market)), '文件保留，以便重试'); assert.ok((await w.registry()).claudeDirectPlugins[market], '登记保留');
  const records = (await w.snapshot()).activity.filter(item => item.agent === 'claude');
  assert.deepEqual(records.slice(0, 2).map(item => [item.action, item.status]), [['plugin.remove', 'success'], ['marketplace.remove', 'error']]);
  w.claude.stuck = false;
  const listed = (await w.snapshot()).marketplaces.find(item => item.name === market);
  await w.act({ action: 'marketplace.remove', agent: 'claude', id: listed.id, expectedRevision: listed.revision, confirm: true });
  assert.equal(await exists(dirOf(w, market)), false);
});

test('a failed install takes back the marketplace it generated; a left-over one is replaced when the source changed', async t => {
  const w = await world(t);
  w.claude.noopInstall = true;
  const failed = await installHelper(w);
  assert.equal(failed.code, 'READBACK_FAILED'); assert.match(failed.message, /\n已撤销这次生成的本地 marketplace。/);
  assert.deepEqual([w.claude.marketplaces, Object.keys((await w.registry()).claudeDirectPlugins)], [[], []]);
  w.claude.noopInstall = false; w.claude.noopAdd = true;
  const unregistered = await installHelper(w);
  assert.equal(unregistered.code, 'READBACK_FAILED'); assert.match(unregistered.message, /未能确认 SkillDock 生成的 marketplace 已登记到 Claude/);
  assert.deepEqual(Object.keys((await w.registry()).claudeDirectPlugins), [], '登记未成也撤销');
  w.claude.noopAdd = false; w.claude.failAdd = true;
  assert.equal((await installHelper(w)).code, 'CLI_FAILED');
  assert.deepEqual(Object.keys((await w.registry()).claudeDirectPlugins), []);
  // Its take-back fails too: the marketplace stays; then the source changes and is installed again.
  w.claude.failAdd = false; w.claude.noopInstall = true; w.claude.stuck = true;
  assert.match((await installHelper(w)).message, /未能清理/);
  const market = await marketOf(w); assert.ok(w.claude.marketplaces.some(item => item.name === market));
  w.claude.noopInstall = false; w.claude.stuck = false;
  await skillFile(path.join(w.root, 'codex-only/skills'), 'help-more');
  assert.match((await installHelper(w)).message, /已为当前用户安装 Claude 插件 helper/);
  assert.ok(await exists(path.join(dirOf(w, market), 'plugins/helper/skills/help-more/SKILL.md')), '换成了新内容');
});

test('the last plugin is judged by Claude\'s own record as well as its list', async t => {
  const w = await world(t);
  await installHelper(w); const market = await marketOf(w);
  // Claude's record also has it in another project, which the list does not show.
  await write(path.join(w.configDir, 'plugins/installed_plugins.json'), { version: 2, plugins: { [`helper@${market}`]: [{ scope: 'local', projectPath: path.join(w.root, 'elsewhere'), version: '2.0.0' }] } });
  const plugin = (await w.snapshot()).plugins.find(item => item.name === 'helper' && item.installed);
  const removed = await w.act({ action: 'plugin.remove', agent: 'claude', id: plugin.id, expectedRevision: plugin.revision, confirm: true });
  assert.match(removed.message, new RegExp(`其他项目中仍有从 SkillDock 生成的本地 marketplace ${market} 安装的插件`));
  assert.ok(w.claude.marketplaces.some(item => item.name === market)); assert.ok(await exists(dirOf(w, market)));
  // Installed for the user and in the project: the marketplace stays for the one left.
  const v = await world(t);
  await installHelper(v); const second = await marketOf(v);
  v.claude.plugins.push({ id: `helper@${second}`, scope: 'local', projectPath: v.project, enabled: true, version: '2.0.0' });
  const user = (await v.snapshot()).plugins.find(item => item.name === 'helper' && item.installation?.scope === 'user');
  const kept = await v.act({ action: 'plugin.remove', agent: 'claude', id: user.id, expectedRevision: user.revision, confirm: true });
  assert.equal(/marketplace/.test(kept.message), false);
  assert.ok(v.claude.marketplaces.some(item => item.name === second));
});

test('a same-named marketplace of the user\'s is never taken for SkillDock\'s, nor is a directory outside its own deleted', async t => {
  const w = await world(t);
  const preview = (await w.act({ action: 'plugin.previewInstall', agent: 'claude', sourceType: 'local', source: path.join(w.root, 'codex-only') })).pluginPreview;
  const { market } = claudeDirectLocation({ root: path.join(w.state, 'local') }, { ...preview, detail: { name: preview.name } });
  const own = path.join(w.root, 'users-own');
  w.claude.marketplaces.push({ name: market, source: 'directory', path: own, installLocation: own });
  assert.equal((await w.act({ action: 'plugin.installSource', agent: 'claude', previewId: preview.id })).code, 'MARKETPLACE_EXISTS');
  assert.equal((await w.snapshot()).marketplaces.find(item => item.name === market).direct, undefined);
  // A record that points elsewhere loses only the record when management is turned off.
  const keep = path.join(w.state, 'local', 'keep-me'); await fs.mkdir(keep, { recursive: true });
  const registry = await w.registry(); registry.claudeDirectPlugins = { [market]: { root: keep, name: 'helper', source: path.join(w.root, 'codex-only'), sourceType: 'local' } };
  await fs.writeFile(w.service.environments.local.registryFile, JSON.stringify(registry));
  w.claude.locks.length = 0; w.claude.onList = async () => { w.claude.locks.push(await w.lockHeld()); };
  const off = await w.disable(true);
  w.claude.onList = undefined;
  assert.equal(w.claude.locks.at(-1), true, '只删文件的一支也在 Claude 锁下重读');
  assert.match(off.message, /已清理 SkillDock 生成的本地 marketplace/);
  assert.ok(await exists(keep), '不删登记目录以外的内容');
  assert.ok(w.claude.marketplaces.some(item => item.path === own), '不动用户的 marketplace');
  assert.equal(w.claude.calls.some(call => call.includes('marketplace remove')), false);
  assert.ok((await w.snapshot()).activity.some(item => item.action === 'marketplace.remove' && /不在 Claude 中，已删除它的本地文件/.test(item.message)), '清理留有记录');
});

test('turning management off cleans up only an enabled Claude, and stays on when a clean-up is left undone', async t => {
  const w = await world(t);
  await installHelper(w);
  await w.disable();
  assert.equal((await w.disable(true)).code, 'AGENT_READ_ONLY');
  assert.equal(w.claude.calls.some(call => call.includes('marketplace remove')), false, '只读时不改 Claude');
  await w.service.action({ mode: 'local', action: 'agent.setManagement', agent: 'claude', management: 'enabled' });
  // Claude's list breaks right after the removal: SkillDock's files cannot be judged, so they stay.
  w.claude.breakAfterRemove = true;
  const failed = await w.disable(true);
  assert.equal(failed.code, 'READBACK_FAILED'); assert.match(failed.message, /管理保持启用/);
  assert.equal(await w.managed(), 'enabled');
});

test('Claude\'s source install refuses a partial skill selection; a plugin it does not read back is a failure', async t => {
  const w = await world(t);
  const plain = (await w.act({ action: 'plugin.previewInstall', agent: 'claude', sourceType: 'local', source: path.join(w.root, 'codex-only') })).pluginPreview;
  assert.equal((await w.act({ action: 'plugin.installSource', agent: 'claude', previewId: plain.id, enabledSkills: ['skills/help-me/SKILL.md'] })).code, 'UNSUPPORTED_FOR_AGENT');
  const preview = (await w.act({ action: 'plugin.previewInstall', agent: 'claude', sourceType: 'local', source: path.join(w.root, 'with-manifest') })).pluginPreview;
  w.claude.onList = async () => { const manifest = path.join(w.configDir, 'skills/tidy/.claude-plugin'); if (await exists(manifest)) await fs.rename(manifest, `${manifest}-hidden`); };
  assert.equal((await w.act({ action: 'plugin.installSource', agent: 'claude', previewId: preview.id })).code, 'READBACK_FAILED');
});

test('removing a skills-directory plugin names the Codex skills that point into it', async t => {
  const w = await world(t);
  const preview = (await w.act({ action: 'plugin.previewInstall', agent: 'claude', sourceType: 'local', source: path.join(w.root, 'with-manifest') })).pluginPreview;
  await w.act({ action: 'plugin.installSource', agent: 'claude', previewId: preview.id });
  await fs.mkdir(path.join(w.home, '.codex/skills'), { recursive: true });
  await fs.symlink(path.join(w.configDir, 'skills/tidy/skills/tidy-up'), path.join(w.home, '.codex/skills/tidy-up'));
  const plugin = (await w.snapshot()).plugins.find(item => item.marketplace === 'skills-dir' && item.name === 'tidy');
  const ask = await w.act({ action: 'plugin.remove', agent: 'claude', id: plugin.id, expectedRevision: plugin.revision });
  const rule = ask.nativeRules.find(item => /Codex 中的这些技能/.test(item.message));
  assert.ok(rule?.items.some(item => item.includes(path.join('.codex/skills/tidy-up'))), JSON.stringify(ask.nativeRules));
});

test('a skills-directory plugin under a protected root is not removed; a project one hidden by a personal one is said so', async t => {
  const w = await world(t, { before: async ({ configDir }) => {
    const area = path.join(configDir, 'plugins/cache/area');
    await fs.rm(path.join(configDir, 'skills'), { recursive: true }); await fs.mkdir(area, { recursive: true });
    await fs.symlink(area, path.join(configDir, 'skills'));
    await write(path.join(area, 'held/.claude-plugin/plugin.json'), { name: 'held', version: '1.0.0' });
  } });
  const held = (await w.snapshot()).plugins.find(item => item.marketplace === 'skills-dir' && item.name === 'held');
  assert.equal((await w.act({ action: 'plugin.remove', agent: 'claude', id: held.id, expectedRevision: held.revision, confirm: true })).code, 'TARGET_BOUNDARY');
  assert.ok(await exists(path.join(w.configDir, 'plugins/cache/area/held')));
  const v = await world(t);
  const first = (await v.act({ action: 'plugin.previewInstall', agent: 'claude', sourceType: 'local', source: path.join(v.root, 'with-manifest') })).pluginPreview;
  await v.act({ action: 'plugin.installSource', agent: 'claude', previewId: first.id });
  const second = (await v.act({ action: 'plugin.previewInstall', agent: 'claude', sourceType: 'local', source: path.join(v.root, 'with-manifest') })).pluginPreview;
  const hidden = await v.act({ action: 'plugin.installSource', agent: 'claude', previewId: second.id, scope: 'project' });
  assert.match(hidden.message, /个人技能目录中有同名插件，它会遮蔽这一个，这一个不会加载/);
});

test('a Git source without any manifest is named after the subpath or the repository, however they are written', async t => {
  const w = await world(t);
  const repo = path.join(w.root, 'gitrepo');
  await skillFile(path.join(repo, 'skills'), 'top'); await skillFile(path.join(repo, 'plugins/foo/skills'), 'inner');
  const git = args => runProcess('git', ['-C', repo, ...args]);
  await git(['init', '-b', 'main']); await git(['config', 'user.name', 'Test']); await git(['config', 'user.email', 'test@example.invalid']); await git(['add', '.']); await git(['commit', '-m', 'initial']);
  const name = async request => (await w.act({ action: 'plugin.previewInstall', agent: 'claude', sourceType: 'git', ...request })).pluginPreview?.name;
  assert.equal(await name({ source: repo, subpath: './' }), 'gitrepo');
  assert.equal(await name({ source: repo, subpath: 'plugins/foo/' }), 'foo');
  assert.equal(await name({ source: path.join(repo, '.git') }), 'gitrepo');
});

test('a generated marketplace Claude lists under another spelling is still SkillDock\'s; a same-named one elsewhere is said so', async t => {
  const w = await world(t);
  w.claude.slash = true;
  await installHelper(w); const market = await marketOf(w);
  assert.equal((await w.snapshot()).marketplaces.find(item => item.name === market).direct, true, '结尾斜杠不影响身份');
  let plugin = (await w.snapshot()).plugins.find(item => item.name === 'helper' && item.installed);
  await w.act({ action: 'plugin.remove', agent: 'claude', id: plugin.id, expectedRevision: plugin.revision, confirm: true });
  assert.equal(w.claude.calls.at(-1), `plugin marketplace remove ${market} --json`);
  // Claude's marketplace of that name now points elsewhere: left alone, said as it is.
  const v = await world(t);
  await installHelper(v); const second = await marketOf(v);
  const listed = v.claude.marketplaces.find(item => item.name === second); listed.path = listed.installLocation = path.join(v.root, 'users-own');
  plugin = (await v.snapshot()).plugins.find(item => item.name === 'helper' && item.installed);
  const removed = await v.act({ action: 'plugin.remove', agent: 'claude', id: plugin.id, expectedRevision: plugin.revision, confirm: true });
  assert.match(removed.message, new RegExp(`Claude 中同名的 marketplace ${second} 指向别处，未改动；已删除 SkillDock 自己的文件`));
  assert.equal(v.claude.calls.some(call => call.startsWith('plugin marketplace remove')), false);
});

test('a declaration left in the settings after the removal is a failed clean-up that keeps the files', async t => {
  const w = await world(t);
  await installHelper(w); const market = await marketOf(w);
  await write(path.join(w.configDir, 'settings.json'), { extraKnownMarketplaces: { [market]: { source: { source: 'directory', path: dirOf(w, market) } } } });
  const plugin = (await w.snapshot()).plugins.find(item => item.name === 'helper' && item.installed);
  const removed = await w.act({ action: 'plugin.remove', agent: 'claude', id: plugin.id, expectedRevision: plugin.revision, confirm: true });
  assert.match(removed.message, /未能清理：marketplace 已从清单中移除，但设置中仍有它的声明/);
  assert.ok(await exists(dirOf(w, market))); assert.ok((await w.registry()).claudeDirectPlugins[market]);
});

test('a skills-directory plugin whose removal cannot be recorded is moved back', async t => {
  const w = await world(t);
  const preview = (await w.act({ action: 'plugin.previewInstall', agent: 'claude', sourceType: 'local', source: path.join(w.root, 'with-manifest') })).pluginPreview;
  await w.act({ action: 'plugin.installSource', agent: 'claude', previewId: preview.id });
  const plugin = (await w.snapshot()).plugins.find(item => item.marketplace === 'skills-dir' && item.name === 'tidy');
  const local = path.join(w.state, 'local'); await fs.mkdir(path.join(local, 'quarantine'), { recursive: true });
  await fs.chmod(local, 0o500);
  t.after(() => fs.chmod(local, 0o700).catch(() => {}));
  const failed = await w.act({ action: 'plugin.remove', agent: 'claude', id: plugin.id, expectedRevision: plugin.revision, confirm: true });
  await fs.chmod(local, 0o700);
  assert.ok(failed.code, '记录写不进时操作失败');
  assert.ok(await exists(path.join(w.configDir, 'skills/tidy/.claude-plugin/plugin.json')), '插件目录移回原处');
  assert.deepEqual(await fs.readdir(path.join(local, 'quarantine')), [], '可恢复区没有残留');
});

test('a plugin from a marketplace SkillDock generated updates from its original source (phase 5c)', async t => {
  const w = await world(t);
  await installHelper(w); const market = await marketOf(w); const copy = path.join(dirOf(w, market), 'plugins/helper');
  const target = (await w.snapshot()).updates.find(item => item.name === 'helper').target;
  const check = async () => (await w.act({ action: 'update.check', agent: 'claude', target })).updateItem;
  assert.equal((await check()).status, 'current');
  // Changed content under the same version: Claude would not update it.
  await skillFile(path.join(w.root, 'codex-only/skills'), 'help-more');
  const same = await check();
  assert.deepEqual([same.status, same.reasonCode], ['blocked', 'VERSION_UNCHANGED']);
  assert.equal(await exists(path.join(copy, 'skills/help-more')), false, '检查不改动 SkillDock 的副本');
  // A new version: checked, applied, and SkillDock's copy and record follow.
  await write(path.join(w.root, 'codex-only/.codex-plugin/plugin.json'), { name: 'helper', version: '2.1.0', description: 'Helper plugin.' });
  const available = await check();
  assert.deepEqual([available.status, available.availableVersion], ['available', '2.1.0']);
  const before = (await w.registry()).claudeDirectPlugins[market].fingerprint;
  const applied = await w.act({ action: 'update.apply', agent: 'claude', target, previewId: available.previewId });
  assert.match(applied.message, /已更新 Claude 插件 helper（2\.0\.0 → 2\.1\.0）/);
  assert.deepEqual(w.claude.calls.slice(-2), [`plugin marketplace update ${market} --json`, `plugin update helper@${market} --scope user --json`]);
  assert.ok(await exists(path.join(copy, 'skills/help-more/SKILL.md')));
  assert.notEqual((await w.registry()).claudeDirectPlugins[market].fingerprint, before, '登记随之更新');
  assert.equal((await check()).status, 'current');
  // A source changed after the preview stops it; SkillDock's copy stays as it was.
  await write(path.join(w.root, 'codex-only/.codex-plugin/plugin.json'), { name: 'helper', version: '2.2.0', description: 'Helper plugin.' });
  const next = await check();
  await skillFile(path.join(w.root, 'codex-only/skills'), 'late');
  assert.equal((await w.act({ action: 'update.apply', agent: 'claude', target, previewId: next.previewId })).code, 'SOURCE_CHANGED');
  assert.equal(await exists(path.join(copy, 'skills/late')), false);
  // A source that renamed its plugin cannot update this one.
  await write(path.join(w.root, 'codex-only/.codex-plugin/plugin.json'), { name: 'renamed', version: '3.0.0' });
  assert.equal((await w.act({ action: 'update.check', agent: 'claude', target })).code, 'SOURCE_CHANGED');
});

// New messages the cases above do not reach (4d review P3-09).
const UNREACHED = ['同名安装目录已存在，不能覆盖。', '只能移除个人技能目录或当前项目 .claude/skills 中的技能目录插件。', '插件目录的实际位置越出 Claude 的技能根。',
  '未找到可用的 Claude 命令行，暂不能修改 Claude。', '之前为 Claude 生成的同一来源目录仍然存在且内容不同，请先核对；不再需要时，可在 Marketplace 页移除这个 marketplace 后重试。',
  'SkillDock 生成的本地 marketplace skilldock-0a 不在 Claude 中，已删除它的本地文件。', '这个技能目录插件不在个人技能目录或当前项目的 .claude/skills 中，不能在这里移除。',
  'marketplace 已从清单中移除，但设置中仍有它的声明，以后可能被重新添加；请刷新核实。', '这次生成的本地 marketplace 仍有从它安装的插件，已保留。'];

test('every message seen above, and the new ones they do not reach, has a whole English and Japanese translation', async () => {
  const messages = [...seen].filter(text => /[一-鿿]/.test(text));
  assert.ok(messages.length > 20, `${messages.length}`);
  await assertTranslated([...messages, ...UNREACHED]);
});
