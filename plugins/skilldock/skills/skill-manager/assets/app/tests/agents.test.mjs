// SPDX-License-Identifier: AGPL-3.0-only
// Phase 3a: the Agent environment layer (HLD 3.1, 3.6, 3.8; API-SDX-001 36c §5–8). Command
// lines are stand-in statuses; no Agent installed on this machine is ever run.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createService } from '../server/service.mjs';
import { defaultManagement } from '../server/agents.mjs';
import { recordClaudeSessionRoot } from '../server/claude-root.mjs';
import { readRoute } from '../server/native-backend.mjs';
import { writeGeneration } from '../server/generation.mjs';

async function world(t, { codex = true, claude = true, ...extra } = {}) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock-agents-')));
  const home = path.join(root, 'home'); const codexHome = path.join(home, '.codex'); const claudeConfig = path.join(home, '.claude');
  await fs.mkdir(home);
  if (codex) { await fs.mkdir(path.join(codexHome, 'skills/demo'), { recursive: true }); await fs.writeFile(path.join(codexHome, 'skills/demo/SKILL.md'), '---\nname: demo\ndescription: Demo skill.\n---\n'); }
  if (claude) await fs.mkdir(claudeConfig);
  const status = { codex: codex ? { available: true, version: 'codex-cli 0.200.0', path: '/stand-in/codex' } : { available: false, error: 'stand-in: none' },
    claude: claude ? { available: true, version: '2.1.288', path: '/stand-in/claude' } : { available: false, error: 'stand-in: none' } };
  // A 0.11 service runs on migrated (generation 2) data, where locking never creates the Codex root.
  const state = path.join(root, 'state'); await fs.mkdir(state); await writeGeneration(state, 2);
  const lists = { fail: null };
  const options = { home, codexHome, projectDir: home, stateDir: state, background: false,
    adapter: { list: async () => ({ plugins: [], marketplaces: [], diagnostics: [], cli: status.codex }) },
    claudeCli: async () => status.claude, env: { HOME: home },
    claudeCatalog: { managedDir: path.join(root, 'no-managed'), listPlugins: async () => { if (lists.fail) throw new Error(lists.fail); return []; }, listMarketplaces: async () => [] }, ...extra };
  const service = await createService(options);
  t.after(async () => { await service.close(); await fs.rm(root, { recursive: true, force: true }); });
  const act = request => service.action({ mode: 'local', ...request }).then(result => result, error => error);
  const agents = async () => (await service.snapshot('local', true, { multiAgent: true })).agents;
  const stored = async () => JSON.parse(await fs.readFile(path.join(state, 'settings/agents.json'), 'utf8')).agents;
  return { root, home, codexHome, claudeConfig, state, status, lists, service, act, agents, stored };
}

test('first appearance: the Agent with SkillDock installed is enabled, the other read-only; Codex keeps 0.10.2 behaviour', () => {
  const codex = { agent: 'codex' }; const claude = { agent: 'claude' };
  assert.deepEqual(['codex', 'claude'].map(agent => defaultManagement(agent, [])), ['enabled', 'read-only'], '开发副本');
  assert.deepEqual(['codex', 'claude'].map(agent => defaultManagement(agent, [codex])), ['enabled', 'read-only']);
  assert.deepEqual(['codex', 'claude'].map(agent => defaultManagement(agent, [claude])), ['read-only', 'enabled']);
  assert.deepEqual(['codex', 'claude'].map(agent => defaultManagement(agent, [codex, claude])), ['enabled', 'enabled']);
});

test('environments are found without creating any Agent root; only multi-agent clients see them, and defaults persist', async t => {
  const w = await world(t, { codex: false });
  const plain = await w.service.snapshot('local', true);
  assert.equal('agents' in plain, false, '1 版客户端看不到 Agent 环境');
  const [claude, ...rest] = await w.agents();
  assert.deepEqual(rest, [], '未安装的 Codex 不显示');
  assert.deepEqual([claude.agent, claude.installed, claude.management, claude.roots.config, claude.roots.origin, claude.cli.available],
    ['claude', true, 'read-only', w.claudeConfig, 'default', true]);
  assert.ok(claude.notes.some(note => note.includes('桌面应用')));
  assert.ok(claude.notes.some(note => note.includes('桌面应用为会话自带的插件')), '桌面应用自带的插件不在此列');
  await assert.rejects(fs.stat(w.codexHome), { code: 'ENOENT' }, '发现过程不创建 Codex 根目录');
  assert.deepEqual([(await w.stored()).claude.management, (await w.stored()).claude.origin, (await w.stored()).codex], ['read-only', 'default', undefined]);
  assert.equal(JSON.parse(await fs.readFile(path.join(w.state, 'agents/claude-root.json'), 'utf8')).configDir, w.claudeConfig, 'Claude 根目录首次发现时保存');
});

test('Codex set read-only: its changes are refused with a standalone message and plan targets pause; enabling restores both', async t => {
  const w = await world(t, { claude: false });
  const snapshot = await w.service.snapshot('local', true, { multiAgent: true });
  assert.deepEqual(snapshot.agents.map(item => [item.agent, item.management]), [['codex', 'enabled']]);
  assert.ok(snapshot.skills.every(item => item.agents.join() === 'codex'), '每个对象显式给出所属 Agent');
  const demo = snapshot.skills.find(item => item.name === 'demo');
  assert.match((await w.act({ action: 'agent.setManagement', agent: 'codex', management: 'read-only' })).message, /只读/);
  assert.deepEqual([(await w.stored()).codex.management, (await w.stored()).codex.origin], ['read-only', 'user']);
  // A 0.10.x interface sends version-1 requests: the refusal must explain itself.
  const refused = await w.act({ action: 'skill.toggle', id: demo.id, enabled: false });
  assert.deepEqual([refused.code, refused.status], ['AGENT_READ_ONLY', 409]); assert.match(refused.message, /Agent 环境.*启用 Codex 管理/);
  const run = (await w.act({ action: 'updates.run', targets: [{ kind: 'skill', id: demo.id }], autoApply: false })).run;
  assert.deepEqual([run.status, run.items.map(item => item.reasonCode)], ['success', ['AGENT_PAUSED']], '暂停不算失败');
  await w.act({ action: 'agent.setManagement', agent: 'codex', management: 'enabled' });
  assert.notEqual((await w.act({ action: 'skill.toggle', id: demo.id, enabled: false })).code, 'AGENT_READ_ONLY');
  assert.notEqual((await w.act({ action: 'updates.run', targets: [{ kind: 'skill', id: demo.id }], autoApply: false })).run.items[0].reasonCode, 'AGENT_PAUSED');
});

test('Claude: an unavailable command line leaves it unconfirmed and enabling needs one; a Codex object has no Claude side', async t => {
  const w = await world(t, { codex: true });
  w.status.claude = { available: false, error: 'stand-in: missing' };
  let claude = (await w.agents()).find(item => item.agent === 'claude');
  assert.equal(claude.management, 'unconfirmed'); assert.match(claude.reason, /Claude 命令行/);
  assert.equal((await w.act({ action: 'agent.setManagement', agent: 'claude', management: 'enabled' })).code, 'CLI_UNAVAILABLE');
  w.status.claude = { available: true, version: '2.1.288', path: '/stand-in/claude' };
  assert.match((await w.act({ action: 'agent.setManagement', agent: 'claude', management: 'enabled' })).message, /已启用 Claude 管理/);
  claude = (await w.agents()).find(item => item.agent === 'claude');
  assert.equal(claude.management, 'enabled');
  const demo = (await w.service.snapshot('local')).skills.find(item => item.name === 'demo');
  assert.equal((await w.act({ action: 'skill.toggle', agent: 'claude', id: demo.id, enabled: false })).code, 'UNSUPPORTED_FOR_AGENT', 'Codex 侧 ID 的 Claude 一侧随 4c');
  assert.equal((await w.act({ action: 'agent.updateSkilldock', agent: 'claude' })).code, 'NOT_FOUND', '这一侧没有 SkillDock（一键更新随 5d2）');
  assert.equal((await w.act({ action: 'agent.setManagement', management: 'enabled' })).code, 'INVALID_ACTION', 'agent.* 必须带 agent');
});

test('turning management on or off is listed with the other changes, for a multi-agent client only; a slow read names its parts in the log (UAT 2026-10-10)', async t => {
  const lines = []; const w = await world(t, { log: line => lines.push(line), slowSnapshotMs: 0 });
  await w.act({ action: 'agent.setManagement', agent: 'claude', management: 'enabled' });
  await w.act({ action: 'agent.setManagement', agent: 'claude', management: 'read-only' });
  const listed = (await w.service.snapshot('local', true, { multiAgent: true })).activity.filter(item => item.action === 'agent.setManagement');
  assert.deepEqual(listed.map(item => [item.agent, item.target, item.status, item.canRestore]), [['claude', 'Claude', 'success', false], ['claude', 'Claude', 'success', false]]);
  assert.deepEqual(listed.map(item => item.message.split('\n')[0]).sort(), ['已启用 Claude 管理。', '已把 Claude 设为只读；SkillDock 不再修改其中的技能和插件，计划中的相关项暂停。']);
  assert.equal((await w.service.snapshot('local', true)).activity.some(item => item.action.startsWith('agent.')), false, '1 版客户端不认识 Agent 环境的操作');
  assert.match(lines.findLast(line => line.includes('claude-list')), /读取清单用时 \d+ ms：codex-list \d+，scan \d+，agents \d+，claude-list \d+，其余 -?\d+。$/);
});

test('an Agent that is not installed cannot be enabled; one enabled before stays listed with its state', async t => {
  const w = await world(t, { claude: false });
  assert.equal((await w.act({ action: 'agent.setManagement', agent: 'claude', management: 'enabled' })).code, 'AGENT_NOT_INSTALLED');
  await fs.mkdir(w.claudeConfig); w.status.claude = { available: true, version: '2.1.288', path: '/stand-in/claude' };
  await w.act({ action: 'agent.setManagement', agent: 'claude', management: 'enabled' });
  await fs.rm(w.claudeConfig, { recursive: true }); w.status.claude = { available: false, error: 'stand-in: none' };
  const claude = (await w.agents()).find(item => item.agent === 'claude');
  assert.deepEqual([claude.installed, claude.management], [false, 'enabled']); assert.match(claude.reason, /未找到 Claude/);
});

test('Claude root: a Claude session that used other directories is noted; switching checks the new directories first', async t => {
  const w = await world(t);
  const other = path.join(w.root, 'custom-claude'); await fs.mkdir(path.join(other, 'plugins/cache'), { recursive: true });
  await w.agents();
  await recordClaudeSessionRoot(w.state, { CLAUDECODE: '1', CLAUDE_CONFIG_DIR: other }, w.home);
  let claude = (await w.agents()).find(item => item.agent === 'claude');
  assert.ok(claude.notes.some(note => note.includes(other) && note.includes(w.claudeConfig)));
  const missing = await w.act({ action: 'settings.setClaudeRoot', agent: 'codex', claudeRoot: { configDir: path.join(w.root, 'absent'), pluginCacheDir: path.join(w.root, 'absent/plugins/cache') } });
  assert.equal(missing.code, 'INVALID_PATH');
  assert.equal((await w.act({ action: 'settings.setClaudeRoot', claudeRoot: { configDir: 'relative', pluginCacheDir: '/x' } })).code, 'INVALID_PATH');
  await w.act({ action: 'settings.setClaudeRoot', agent: 'codex', claudeRoot: { configDir: other, pluginCacheDir: path.join(other, 'plugins/cache') } });
  claude = (await w.agents()).find(item => item.agent === 'claude');
  assert.deepEqual([claude.roots.config, claude.roots.origin], [other, 'explicit']);
  assert.equal(claude.notes.some(note => note.includes('不同')), false);
});

test('Node settings: a path that cannot build is refused and nothing is saved', async t => {
  const w = await world(t);
  const fake = path.join(w.root, 'not-node'); await fs.writeFile(fake, '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  assert.equal((await w.act({ action: 'settings.setNodePath', nodePath: fake })).code, 'NODE_UNAVAILABLE');
  await assert.rejects(fs.stat(path.join(w.state, 'settings/runtime.json')), { code: 'ENOENT' });
  const chosen = await w.act({ action: 'settings.setNodePath', nodePath: process.execPath });
  assert.match(chosen.message, /下次启动/);
  assert.equal(JSON.parse(await fs.readFile(path.join(w.state, 'settings/runtime.json'), 'utf8')).source, 'manual');
});

test('the native entry passes multiAgent=1 and agent=codex|claude only (36c §9)', () => {
  assert.equal(readRoute('/api/state?mode=local&multiAgent=1'), '/api/state?mode=local&multiAgent=1');
  assert.equal(readRoute('/api/skill?mode=local&id=x&agent=claude'), '/api/skill?mode=local&id=x&agent=claude');
  assert.equal(readRoute('/api/updates/progress?mode=local&agent=codex'), '/api/updates/progress?mode=local&agent=codex');
  for (const route of ['/api/state?multiAgent=true', '/api/skill?id=x&agent=other', '/api/health?agent=codex']) assert.throws(() => readRoute(route), route);
});

test('a read-only Codex refuses every host change, but not SkillDock\'s own data; the multi-agent snapshot shows it', async t => {
  const w = await world(t, { claude: false });
  const demo = (await w.service.snapshot('local', true)).skills.find(item => item.name === 'demo');
  await w.act({ action: 'agent.setManagement', agent: 'codex', management: 'read-only' });
  const writes = [
    { action: 'skill.toggle', id: demo.id, enabled: false }, { action: 'skill.install', previewId: 'p' }, { action: 'skill.update', id: demo.id, previewId: 'p' },
    { action: 'skill.remove', id: demo.id }, { action: 'skill.removeSelected', previewId: 'p' }, { action: 'activity.restore', id: 'a' },
    { action: 'plugin.install', id: 'x@m' }, { action: 'plugin.installSource', previewId: 'p' }, { action: 'plugin.remove', id: 'x@m' },
    { action: 'plugin.toggle', id: 'x@m', enabled: false }, { action: 'marketplace.add', sourceType: 'git', source: 'https://github.com/o/r' },
    { action: 'marketplace.refresh', id: 'm' }, { action: 'marketplace.remove', id: 'm' }, { action: 'update.apply', target: { kind: 'skill', id: demo.id }, previewId: 'p' },
  ];
  for (const request of writes) assert.equal((await w.act(request)).code, 'AGENT_READ_ONLY', request.action);
  assert.notEqual((await w.act({ action: 'tags.set', target: { kind: 'skill', id: demo.id }, tags: ['x'] })).code, 'AGENT_READ_ONLY', '标签是 SkillDock 自己的数据');
  const multi = (await w.service.snapshot('local', true, { multiAgent: true })).skills.find(item => item.name === 'demo');
  assert.deepEqual([multi.canToggle, multi.canRemove, multi.canUpdate], [false, false, false]); assert.match(multi.reason, /只读/);
  const plain = (await w.service.snapshot('local', true)).skills.find(item => item.name === 'demo');
  assert.equal(plain.canToggle, true, '1 版快照保持 0.10.2 行为');
});

test('Claude-side requests: later-phase actions are not offered yet; the others follow Claude management', async t => {
  const w = await world(t);
  const demo = (await w.service.snapshot('local', true)).skills.find(item => item.name === 'demo');
  // Tags are not offered for Claude; an update's side is its target's (phase 5a), so a Codex
  // target stays Codex's whatever the request's flag says.
  assert.equal((await w.act({ action: 'tags.set', target: { kind: 'skill', id: demo.id }, tags: ['x'], agent: 'claude' })).code, 'UNSUPPORTED_FOR_AGENT');
  assert.notEqual((await w.act({ action: 'update.check', target: { kind: 'skill', id: demo.id }, agent: 'claude' })).code, 'UNSUPPORTED_FOR_AGENT');
  // Phases 4a, 4b, 4d: Claude is read-only here (its management was never enabled).
  for (const request of [{ action: 'marketplace.add', sourceType: 'git', source: 'https://github.com/o/r' }, { action: 'skill.previewInstall', sourceType: 'local', source: w.root },
    { action: 'plugin.previewInstall', sourceType: 'local', source: w.root },
    { action: 'skill.previewSource', id: demo.id, sourceType: 'local', source: w.root }])
    assert.equal((await w.act({ ...request, agent: 'claude' })).code, 'AGENT_READ_ONLY', request.action);
  assert.notEqual((await w.act({ action: 'updates.run', agent: 'claude', targets: [], autoApply: false })).code, 'UNSUPPORTED_FOR_AGENT');
});

test('Codex without a command line keeps its state with a note, still writable; with Claude managed its plugin targets pause', async t => {
  const w = await world(t);
  w.status.codex = { available: false, error: 'stand-in: none' };
  // Shown, not enforced (MR-SDX-001): its state, its writes and the switch that turns them off stay (4c review P2-05).
  const codex = (await w.agents()).find(item => item.agent === 'codex');
  assert.equal(codex.management, 'enabled'); assert.equal(codex.reason, undefined); assert.match(codex.notes[0], /Codex 命令行不可用.*技能照常管理/);
  const demo = (await w.service.snapshot('local', true)).skills.find(item => item.name === 'demo');
  assert.notEqual((await w.act({ action: 'skill.toggle', id: demo.id, enabled: false })).code, 'AGENT_UNCONFIRMED', '技能照常管理（MR-SDX-001）');
  const reasons = async () => (await w.act({ action: 'updates.run', targets: [{ kind: 'skill', id: demo.id }, { kind: 'plugin', id: 'gone@market' }], autoApply: false })).run.items.map(item => item.reasonCode);
  assert.equal((await reasons()).includes('AGENT_PAUSED'), false, 'Claude 未启用管理时保持 0.10.2 行为');
  await w.act({ action: 'agent.setManagement', agent: 'claude', management: 'enabled' }).catch(() => {});
  await fs.writeFile(path.join(w.state, 'settings/agents.json'), JSON.stringify({ format: 1, agents: { ...(await w.stored()), claude: { management: 'enabled', origin: 'user', changedAt: '2026-10-09T00:00:00.000Z' } } }));
  const paused = await reasons();
  assert.notEqual(paused[0], 'AGENT_PAUSED', '技能目标不需要 Codex 命令行');
  assert.equal(paused[1], 'AGENT_PAUSED', '插件目标暂停');
});

test('with Claude managed and Codex gone, every Codex target pauses', async t => {
  const w = await world(t, { codex: false });
  await fs.mkdir(path.join(w.state, 'settings'), { recursive: true });
  await fs.writeFile(path.join(w.state, 'settings/agents.json'), JSON.stringify({ format: 1, agents: { claude: { management: 'enabled', origin: 'user', changedAt: '2026-10-09T00:00:00.000Z' } } }));
  const run = await w.act({ action: 'updates.run', targets: [{ kind: 'skill', id: 'a'.repeat(24) }, { kind: 'plugin', id: 'gone@market' }], autoApply: false });
  assert.deepEqual(run.run.items.map(item => item.reasonCode), ['AGENT_PAUSED', 'AGENT_PAUSED']);
});

test('enabling needs readable main evidence; an uninstalled environment can be turned off, a never-enabled one is not listed', async t => {
  const w = await world(t);
  w.lists.fail = 'Claude 命令行 plugin list 失败：stand-in';
  const refused = await w.act({ action: 'agent.setManagement', agent: 'claude', management: 'enabled' });
  assert.equal(refused.code, 'AGENT_UNCONFIRMED'); assert.match(refused.message, /stand-in/);
  assert.equal((await w.stored()).claude.management, 'read-only', '没有写入启用');
  w.lists.fail = null;
  await w.act({ action: 'agent.setManagement', agent: 'claude', management: 'enabled' });
  await fs.rm(w.claudeConfig, { recursive: true }); w.status.claude = { available: false, error: 'stand-in: none' };
  assert.match((await w.act({ action: 'agent.setManagement', agent: 'claude', management: 'read-only' })).message, /只读/);
  assert.deepEqual((await w.agents()).map(item => item.agent), ['codex'], '已卸载且只读的环境不再列出');
});

