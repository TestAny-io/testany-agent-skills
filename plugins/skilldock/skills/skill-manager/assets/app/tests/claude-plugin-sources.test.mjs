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
import { assertTranslated } from './i18n-helper.mjs';

const write = async (file, value) => { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, typeof value === 'string' ? value : JSON.stringify(value)); };
const skillFile = (directory, name) => write(path.join(directory, name, 'SKILL.md'), `---\nname: ${name}\ndescription: ${name} skill.\n---\n`);
const exists = file => fs.lstat(file).then(() => true, () => false);
const seen = new Set();
const see = value => { for (const text of [value?.message, value?.reason, ...(value?.nativeRules ?? []).map(rule => rule.message)]) if (typeof text === 'string') seen.add(text); return value; };

async function world(t, { repo = false, cliAvailable = true } = {}) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock-claude-sources-')));
  const home = path.join(root, 'home'); const configDir = path.join(home, '.claude'); const project = path.join(root, 'project');
  await fs.mkdir(project, { recursive: true }); await fs.mkdir(path.join(configDir, 'skills'), { recursive: true });
  // Sources: one with a Claude manifest, one with only a Codex manifest and skills, one with nothing for Claude.
  await write(path.join(root, 'with-manifest/.claude-plugin/plugin.json'), { name: 'tidy', version: '1.0.0', description: 'Tidy plugin.' });
  await skillFile(path.join(root, 'with-manifest/skills'), 'tidy-up');
  await write(path.join(root, 'codex-only/.codex-plugin/plugin.json'), { name: 'helper', version: '2.0.0', description: 'Helper plugin.' });
  await skillFile(path.join(root, 'codex-only/skills'), 'help-me');
  await write(path.join(root, 'nothing/.codex-plugin/plugin.json'), { name: 'empty', version: '1.0.0' });
  const state = path.join(root, 'state'); await fs.mkdir(state); await writeGeneration(state, 2);
  await write(path.join(state, 'settings/agents.json'), { format: 1, agents: { claude: { management: 'enabled', origin: 'user', changedAt: '2026-10-09T00:00:00.000Z' } } });
  const claude = { plugins: [], marketplaces: [], calls: [] };
  // A repository whose .claude/settings.local.json is not ignored, when asked for.
  const git = async (directory, args) => {
    if (!repo) throw new Error('not a repository');
    if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return project;
    if (args[0] === 'rev-parse' && args[1] === '--git-path') return '.git/info/exclude';
    throw new Error('not ignored');
  };
  const writer = () => async (args, { cwd }) => {
    claude.calls.push(args.join(' ')); claudeWriteArgs(args);
    const [, verb, a, b] = args; const scope = args[args.indexOf('--scope') + 1];
    if (verb === 'marketplace' && a === 'add') { const name = JSON.parse(await fs.readFile(path.join(b, '.claude-plugin/marketplace.json'), 'utf8')).name; claude.marketplaces.push({ name, source: 'directory', path: b, installLocation: b }); }
    // Claude uninstalls what came from a marketplace it removes.
    if (verb === 'marketplace' && a === 'remove' && !claude.stuck) { claude.marketplaces = claude.marketplaces.filter(item => item.name !== b); claude.plugins = claude.plugins.filter(item => !item.id.endsWith(`@${b}`)); }
    if (verb === 'install') claude.plugins.push({ id: a, scope, enabled: true, version: '2.0.0', ...(scope === 'user' ? {} : { projectPath: cwd }) });
    if (verb === 'install' && scope === 'local') await write(path.join(cwd, '.claude/settings.local.json'), { enabledPlugins: { [a]: true } });
    if (verb === 'uninstall') claude.plugins = claude.plugins.filter(item => !(item.id === a && item.scope === scope));
    return { ok: true };
  };
  const service = await createService({ home, codexHome: path.join(home, '.codex'), projectDir: project, stateDir: state, background: false, env: { HOME: home },
    adapter: { list: async () => ({ plugins: [], marketplaces: [], diagnostics: [], listed: { plugins: true, marketplaces: true }, cli: { available: true, version: 'codex-cli 0.200.0', path: '/stand-in/codex' } }) },
    claudeCli: async () => cliAvailable ? { available: true, version: '2.1.288', path: '/stand-in/claude' } : { available: false },
    claudeCatalog: { managedDir: path.join(root, 'no-managed'), listPlugins: async () => structuredClone(claude.plugins), listMarketplaces: async () => structuredClone(claude.marketplaces) },
    claudeWriter: writer, claudeGit: git });
  t.after(async () => { await service.close(); await fs.rm(root, { recursive: true, force: true }); });
  const act = request => service.action({ mode: 'local', ...request }).then(see, see);
  const snapshot = () => service.snapshot('local', true, { multiAgent: true });
  const registry = async () => JSON.parse(await fs.readFile(service.environments.local.registryFile, 'utf8'));
  const disable = confirm => service.action({ mode: 'local', action: 'agent.setManagement', agent: 'claude', management: 'read-only', ...(confirm ? { confirm } : {}) }).then(see, see);
  return { root, home, configDir, project, state, claude, service, act, snapshot, registry, disable };
}

test('a source with a Claude manifest goes into a skills directory, leaves restorably and comes back', async t => {
  const w = await world(t);
  const preview = (await w.act({ action: 'plugin.previewInstall', agent: 'claude', sourceType: 'local', source: path.join(w.root, 'with-manifest') })).pluginPreview;
  assert.deepEqual([preview.agent, preview.name, preview.scopes.join(), preview.manifests.join(), preview.canSelectSkills], ['claude', 'tidy', 'user,project', 'claude', false]);
  assert.equal((await w.act({ action: 'plugin.installSource', agent: 'claude', previewId: preview.id, scope: 'local' })).code, 'INVALID_ACTION');
  const installed = await w.act({ action: 'plugin.installSource', agent: 'claude', previewId: preview.id });
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
  const record = (await w.snapshot()).activity.find(item => item.agent === 'claude' && item.action === 'plugin.remove');
  assert.equal(record.canRestore, true);
  assert.match((await w.act({ action: 'activity.restore', id: record.id })).message, /已恢复 Claude 插件 tidy/);
  assert.ok(await exists(path.join(w.configDir, 'skills/tidy/.claude-plugin/plugin.json')));
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

test('every message seen above has a whole English and Japanese translation', async () => {
  const messages = [...seen].filter(text => /[一-鿿]/.test(text));
  assert.ok(messages.length > 5, `${messages.length}`);
  await assertTranslated(messages);
});
