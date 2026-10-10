// SPDX-License-Identifier: AGPL-3.0-only
// Phase 5a: Claude objects on the updates page and in plans (API-SDX-001 36c §6, HLD 3.3, 3.8).
// A Claude skill and a skills-directory plugin update by the file transaction from their recorded
// source; a target names its side; a plan pauses Claude's targets while Claude is not managed; a
// Claude skill that becomes shared keeps its plan target. Claude's lists are stand-ins.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createService } from '../server/service.mjs';
import { writeGeneration } from '../server/generation.mjs';
import { assertTranslated } from './i18n-helper.mjs';

const write = async (file, value) => { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, typeof value === 'string' ? value : JSON.stringify(value)); };
const skillFile = (directory, name, body = '') => write(path.join(directory, name, 'SKILL.md'), `---\nname: ${name}\ndescription: ${name} skill.\n---\n${body}`);
const seen = new Set();
const see = value => { for (const text of [value?.message, value?.reason, value?.updateItem?.message, ...(value?.run?.items ?? []).map(item => item.message), ...(value?.nativeRules ?? []).map(rule => rule.message)]) if (typeof text === 'string') seen.add(text); return value; };

async function world(t, { claude = 'enabled' } = {}) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock-claude-updates-')));
  const home = path.join(root, 'home'); const configDir = path.join(home, '.claude'); const codexHome = path.join(home, '.codex'); const project = path.join(root, 'project');
  await fs.mkdir(project, { recursive: true }); await fs.mkdir(path.join(configDir, 'skills'), { recursive: true }); await fs.mkdir(path.join(codexHome, 'skills'), { recursive: true });
  await skillFile(path.join(root, 'src'), 'notes', 'v1\n');
  await write(path.join(root, 'plugin-src/.claude-plugin/plugin.json'), { name: 'tidy', version: '1.0.0', description: 'Tidy plugin.' });
  await skillFile(path.join(root, 'plugin-src/skills'), 'tidy-up', 'v1\n');
  const state = path.join(root, 'state'); await fs.mkdir(state); await writeGeneration(state, 2);
  const agents = async management => write(path.join(state, 'settings/agents.json'), { format: 1, agents: { claude: { management, origin: 'user', changedAt: '2026-10-09T00:00:00.000Z' } } });
  await agents(claude);
  const lists = { plugins: [], marketplaces: [] }; let time = Date.parse('2026-10-09T00:00:00Z'); const cli = { available: true };
  const service = await createService({ home, codexHome, projectDir: project, stateDir: state, background: false, env: { HOME: home }, now: () => time,
    adapter: { list: async () => ({ plugins: [], marketplaces: [], diagnostics: [], listed: { plugins: true, marketplaces: true }, cli: { available: true, version: 'codex-cli 0.200.0', path: '/stand-in/codex' } }) },
    claudeCli: async () => cli.available ? { available: true, version: '2.1.288', path: '/stand-in/claude' } : { available: false, error: '未找到可用的 Claude 命令行。' },
    claudeCatalog: { managedDir: path.join(root, 'no-managed'), listPlugins: async () => structuredClone(lists.plugins), listMarketplaces: async () => structuredClone(lists.marketplaces) },
    claudeWriter: () => async () => { throw new Error('no command line'); }, claudeGit: async () => { throw new Error('not a repository'); } });
  t.after(async () => { await service.close(); await fs.rm(root, { recursive: true, force: true }); });
  const act = request => service.action({ mode: 'local', ...request }).then(see, see);
  const snapshot = () => service.snapshot('local', true, { multiAgent: true });
  const item = async id => (await snapshot()).updates.find(entry => entry.target.id === id);
  const advance = minutes => { time += minutes * 60000; };
  return { root, home, configDir, codexHome, project, state, lists, service, act, snapshot, item, agents, advance, cli };
}
// A Claude skill installed from a local source, so that SkillDock records where it came from.
async function installSkill(w) {
  const preview = (await w.act({ action: 'skill.previewInstall', agent: 'claude', sourceType: 'local', source: path.join(w.root, 'src/notes') })).preview;
  await w.act({ action: 'skill.install', agent: 'claude', previewId: preview.id });
  return (await w.snapshot()).skills.find(skill => skill.name === 'notes' && skill.agents.join() === 'claude');
}
async function installPluginDir(w) {
  const preview = (await w.act({ action: 'plugin.previewInstall', agent: 'claude', sourceType: 'local', source: path.join(w.root, 'plugin-src') })).pluginPreview;
  await w.act({ action: 'plugin.installSource', agent: 'claude', previewId: preview.id });
  return (await w.snapshot()).plugins.find(plugin => plugin.marketplace === 'skills-dir' && plugin.name === 'tidy');
}

test('a Claude skill with a recorded source is checked and updated from the updates page, and restored', async t => {
  const w = await world(t);
  const skill = await installSkill(w);
  const entry = await w.item(skill.id);
  assert.deepEqual([entry.target, entry.route, entry.canCheck, entry.canAutoApply, entry.sourceInfo.kind], [{ kind: 'skill', id: skill.id, agent: 'claude' }, 'skill-source', true, true, 'tracked']);
  assert.equal((await w.act({ action: 'update.check', agent: 'claude', target: entry.target })).updateItem.status, 'current');
  await skillFile(path.join(w.root, 'src'), 'notes', 'v2\n');
  const check = await w.act({ action: 'update.check', agent: 'claude', target: entry.target });
  assert.deepEqual([check.updateItem.status, check.updateItem.canApply], ['available', true]);
  const applied = await w.act({ action: 'update.apply', agent: 'claude', target: entry.target, previewId: check.updateItem.previewId });
  assert.match(applied.message, /已更新 Claude 技能 notes/);
  assert.match(await fs.readFile(path.join(w.configDir, 'skills/notes/SKILL.md'), 'utf8'), /v2/);
  assert.equal((await w.item(skill.id)).status, 'current', '读回确认后记为最新');
  const record = (await w.snapshot()).activity.find(item => item.agent === 'claude' && item.action === 'skill.update');
  assert.match((await w.act({ action: 'activity.restore', id: record.id })).message, /已恢复 Claude 技能 notes/);
  assert.match(await fs.readFile(path.join(w.configDir, 'skills/notes/SKILL.md'), 'utf8'), /v1/);
});

test('a skills-directory plugin with a recorded source updates by the same file transaction; other Claude plugins say why not', async t => {
  const w = await world(t);
  const plugin = await installPluginDir(w);
  const entry = await w.item(plugin.id);
  assert.deepEqual([entry.target.agent, entry.route, entry.canCheck], ['claude', 'plugin-files', true]);
  await skillFile(path.join(w.root, 'plugin-src/skills'), 'tidy-up', 'v2\n');
  const check = await w.act({ action: 'update.check', agent: 'claude', target: entry.target });
  assert.equal(check.updateItem?.status, 'available', `${check.code} ${check.message}`);
  const applied = await w.act({ action: 'update.apply', agent: 'claude', target: entry.target, previewId: check.updateItem.previewId });
  assert.match(applied.message, /已更新 Claude 插件 tidy/);
  assert.match(await fs.readFile(path.join(w.configDir, 'skills/tidy/skills/tidy-up/SKILL.md'), 'utf8'), /v2/);
  const record = (await w.snapshot()).activity.find(item => item.agent === 'claude' && item.action === 'skill.update');
  assert.match((await w.act({ action: 'activity.restore', id: record.id })).message, /已恢复 Claude 插件 tidy/);
  // A plugin from a marketplace, SkillDock-generated ones included (phases 5b, 5c), is checked through
  // Claude's command line; one synced from claude.ai says why not.
  w.lists.plugins = [{ id: 'later@market', scope: 'user', enabled: true, version: '1.0.0' }, { id: 'cloud@synced', scope: 'user', enabled: true, version: '1.0.0' }, { id: 'own@skilldock-0123456789abcdef0123', scope: 'user', enabled: true, version: '1.0.0' }];
  const updates = (await w.snapshot()).updates;
  const of = name => updates.find(item => item.target.id.includes(name));
  assert.deepEqual([of('later@market').route, of('later@market').canCheck, of('cloud@synced').canCheck, of('cloud@synced').reasonCode, of('own@skilldock-').canCheck], ['claude-plugin', true, false, 'HOST_MANAGED', true]);
});

test('plans and batches take Claude targets; while Claude is not managed they pause and its items are not checked', async t => {
  const w = await world(t);
  const skill = await installSkill(w); const target = { kind: 'skill', id: skill.id, agent: 'claude' };
  await skillFile(path.join(w.root, 'src'), 'notes', 'v2\n');
  const batch = await w.act({ action: 'updates.run', agent: 'codex', targets: [target], autoApply: true });
  assert.deepEqual(batch.run.items.map(item => [item.target.agent, item.status]), [['claude', 'updated']]);
  assert.match(await fs.readFile(path.join(w.configDir, 'skills/notes/SKILL.md'), 'utf8'), /v2/);
  // A plan with the Claude target applies on schedule.
  await w.act({ action: 'schedule.configure', agent: 'codex', schedule: { enabled: true, intervalMinutes: 15, timezone: 'UTC', autoApply: true, targets: [target] } });
  assert.deepEqual((await w.snapshot()).schedule.targets, [target], '计划目标带侧别');
  await skillFile(path.join(w.root, 'src'), 'notes', 'v3\n');
  w.advance(16); await w.service.tickScheduler();
  assert.equal((await w.snapshot()).updateRuns[0].items[0].status, 'updated');
  assert.match(await fs.readFile(path.join(w.configDir, 'skills/notes/SKILL.md'), 'utf8'), /v3/);
  // Claude read-only: its target pauses, its item is neither checked nor applied.
  await w.agents('read-only');
  w.advance(16); await w.service.tickScheduler();
  const paused = (await w.snapshot()).updateRuns[0].items[0];
  assert.deepEqual([paused.status, paused.reasonCode], ['skipped', 'AGENT_PAUSED']);
  assert.deepEqual([(await w.item(skill.id)).canCheck, (await w.item(skill.id)).canApply], [false, false]);
  assert.equal((await w.act({ action: 'update.check', agent: 'claude', target })).code, 'AGENT_READ_ONLY');
});

test('a Claude skill that becomes shared keeps its place in the plan; the Codex item gives way when Claude leads', async t => {
  const w = await world(t);
  const skill = await installSkill(w); const target = { kind: 'skill', id: skill.id, agent: 'claude' };
  await w.act({ action: 'schedule.configure', agent: 'codex', schedule: { enabled: true, intervalMinutes: 15, timezone: 'UTC', autoApply: false, targets: [target] } });
  // Codex now sees it through a link: it is shared, Claude leads (Codex's side is a link).
  await fs.symlink(path.join(w.configDir, 'skills/notes'), path.join(w.codexHome, 'skills/notes'));
  const shared = (await w.snapshot()).skills.find(item => item.name === 'notes');
  assert.deepEqual([shared.agents.join(), shared.perAgent.claude.canUpdate], ['codex,claude', true]);
  const updates = (await w.snapshot()).updates.filter(item => item.target.id === shared.id);
  assert.deepEqual(updates.map(item => item.target.agent), ['claude'], '只列 Claude 一侧');
  w.advance(16); await w.service.tickScheduler();
  const state = await w.snapshot();
  assert.deepEqual(state.schedule.targets, [{ kind: 'skill', id: shared.id, agent: 'claude' }]);
  assert.equal(state.updateRuns[0].items[0].status, 'current');
  assert.ok(state.activity.some(item => item.action === 'schedule.migrate'), '迁移留有记录');
});

test('a shared skill Claude leads, updated by an applying plan, stays shared under its ID; the run is updated, the next current (5a/5b review P1-01)', async t => {
  const w = await world(t);
  await installSkill(w);
  await fs.symlink(path.join(w.configDir, 'skills/notes'), path.join(w.codexHome, 'skills/notes'));
  const shared = (await w.snapshot()).skills.find(item => item.name === 'notes'); const target = { kind: 'skill', id: shared.id, agent: 'claude' };
  await w.act({ action: 'schedule.configure', agent: 'claude', schedule: { enabled: true, intervalMinutes: 15, timezone: 'UTC', autoApply: true, targets: [target] } });
  await skillFile(path.join(w.root, 'src'), 'notes', 'v2\n');
  w.advance(16); await w.service.tickScheduler();
  let state = await w.snapshot();
  assert.deepEqual([state.updateRuns[0].items[0].status, state.updateRuns[0].items[0].reasonCode], ['updated', undefined]);
  assert.match(await fs.readFile(path.join(w.configDir, 'skills/notes/SKILL.md'), 'utf8'), /v2/);
  const after = state.skills.find(item => item.name === 'notes');
  assert.deepEqual([after.id, after.agents.join()], [shared.id, 'codex,claude'], 'Codex 一侧仍看得到它，对象 ID 不变');
  assert.ok((await w.service.snapshot('local', true)).skills.some(item => item.name === 'notes'), '1 版快照也列出');
  w.advance(16); await w.service.tickScheduler();
  state = await w.snapshot();
  assert.equal(state.updateRuns[0].items[0].status, 'current'); assert.deepEqual(state.schedule.targets, [target]);
});

test('a shared skill whose Codex link goes away continues in the plan as Claude\'s own (5a/5b review P3-03)', async t => {
  const w = await world(t);
  await installSkill(w);
  await fs.symlink(path.join(w.configDir, 'skills/notes'), path.join(w.codexHome, 'skills/notes'));
  const shared = (await w.snapshot()).skills.find(item => item.name === 'notes');
  await w.act({ action: 'schedule.configure', agent: 'claude', schedule: { enabled: true, intervalMinutes: 15, timezone: 'UTC', autoApply: false, targets: [{ kind: 'skill', id: shared.id, agent: 'claude' }] } });
  await fs.rm(path.join(w.codexHome, 'skills/notes'));
  const own = (await w.snapshot()).skills.find(item => item.name === 'notes');
  assert.deepEqual([own.agents.join(), own.id === shared.id], ['claude', false]);
  w.advance(16); await w.service.tickScheduler();
  const state = await w.snapshot();
  assert.deepEqual(state.schedule.targets, [{ kind: 'skill', id: own.id, agent: 'claude' }]);
  assert.equal(state.updateRuns[0].items[0].status, 'current');
});

test('a Claude target\'s side is its own, whatever the request names; it pauses while Claude cannot be confirmed or is gone (5a/5b review M35, M30, M31)', async t => {
  const w = await world(t);
  const skill = await installSkill(w); const target = { kind: 'skill', id: skill.id, agent: 'claude' };
  await w.agents('read-only');
  assert.equal((await w.act({ action: 'update.check', agent: 'codex', target })).code, 'AGENT_READ_ONLY', '侧别取自目标，不取请求的 agent');
  await w.agents('enabled');
  await w.act({ action: 'schedule.configure', agent: 'claude', schedule: { enabled: true, intervalMinutes: 15, timezone: 'UTC', autoApply: false, targets: [target] } });
  w.cli.available = false;
  w.advance(16); await w.service.tickScheduler();
  let run = (await w.snapshot()).updateRuns[0].items[0];
  assert.deepEqual([run.status, run.reasonCode], ['skipped', 'AGENT_PAUSED']); assert.match(run.message, /无法确认 Claude 环境/);
  await fs.rm(w.configDir, { recursive: true });
  w.advance(16); await w.service.tickScheduler();
  run = (await w.snapshot()).updateRuns[0].items[0];
  assert.deepEqual([run.status, run.reasonCode], ['skipped', 'AGENT_PAUSED']); assert.match(run.message, /本机未找到 Claude/);
});

test('a Codex link into a skill of a Claude skills-directory plugin still lists after the plugin updates (phase 5 re-review P3-01)', async t => {
  const w = await world(t);
  const plugin = await installPluginDir(w);
  await fs.symlink(path.join(w.configDir, 'skills/tidy/skills/tidy-up'), path.join(w.codexHome, 'skills/tidy-up'));
  assert.ok((await w.service.snapshot('local', true)).skills.some(item => item.name === 'tidy-up'));
  await skillFile(path.join(w.root, 'plugin-src/skills'), 'tidy-up', 'v2\n');
  const entry = await w.item(plugin.id);
  const check = await w.act({ action: 'update.check', agent: 'claude', target: entry.target });
  await w.act({ action: 'update.apply', agent: 'claude', target: entry.target, previewId: check.updateItem.previewId });
  const codex = await w.service.snapshot('local', true);
  assert.ok(codex.skills.some(item => item.name === 'tidy-up'), 'Codex 一侧仍列出');
  assert.equal(codex.diagnostics.some(text => /运行中发生变化/.test(text)), false);
});

test('every message seen above has a whole English and Japanese translation', async () => {
  const messages = [...seen].filter(text => /[一-鿿]/.test(text));
  assert.ok(messages.length > 5, `${messages.length}`);
  await assertTranslated([...messages, '这个技能不在个人技能目录或当前项目的 .claude/skills 中，属于仓库或其他项目；SkillDock 不在这里更新它。', '由组织托管设置管理；SkillDock 不代为更新。',
    '此技能通过链接接入；更新请在真实来源目录进行。', '这个技能目录插件通过链接接入；更新请在真实来源目录进行。', '这个技能目录插件没有 SkillDock 记录的来源；请在它的来源处更新。', '由组织托管设置安装；SkillDock 不代为更新。',
    '本机未找到 Claude，计划中的这一项暂停；恢复后继续。', '技能的共用状态已变化，计划中的这一项已随对象 ID 迁移。', '检查已追踪来源的文件变化；更新时替换技能目录中的插件文件。']);
});
