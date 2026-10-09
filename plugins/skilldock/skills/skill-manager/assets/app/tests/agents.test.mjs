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

async function world(t, { codex = true, claude = true } = {}) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock-agents-')));
  const home = path.join(root, 'home'); const codexHome = path.join(home, '.codex'); const claudeConfig = path.join(home, '.claude');
  await fs.mkdir(home);
  if (codex) { await fs.mkdir(path.join(codexHome, 'skills/demo'), { recursive: true }); await fs.writeFile(path.join(codexHome, 'skills/demo/SKILL.md'), '---\nname: demo\ndescription: Demo skill.\n---\n'); }
  if (claude) await fs.mkdir(claudeConfig);
  const status = { codex: codex ? { available: true, version: 'codex-cli 0.200.0', path: '/stand-in/codex' } : { available: false, error: 'stand-in: none' },
    claude: claude ? { available: true, version: '2.1.288', path: '/stand-in/claude' } : { available: false, error: 'stand-in: none' } };
  // A 0.11 service runs on migrated (generation 2) data, where locking never creates the Codex root.
  const state = path.join(root, 'state'); await fs.mkdir(state); await writeGeneration(state, 2);
  const options = { home, codexHome, projectDir: home, stateDir: state, background: false,
    adapter: { list: async () => ({ plugins: [], marketplaces: [], diagnostics: [], cli: status.codex }) },
    claudeCli: async () => status.claude, env: { HOME: home },
    claudeCatalog: { managedDir: path.join(root, 'no-managed'), listPlugins: async () => [], listMarketplaces: async () => [] } };
  const service = await createService(options);
  t.after(async () => { await service.close(); await fs.rm(root, { recursive: true, force: true }); });
  const act = request => service.action({ mode: 'local', ...request }).then(result => result, error => error);
  const agents = async () => (await service.snapshot('local', true, { multiAgent: true })).agents;
  const stored = async () => JSON.parse(await fs.readFile(path.join(state, 'settings/agents.json'), 'utf8')).agents;
  return { root, home, codexHome, claudeConfig, state, status, service, act, agents, stored };
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

test('Claude: an unavailable command line leaves it unconfirmed and enabling needs one; Claude objects cannot be changed yet', async t => {
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
  assert.equal((await w.act({ action: 'skill.toggle', agent: 'claude', id: demo.id, enabled: false })).code, 'UNSUPPORTED_FOR_AGENT');
  assert.equal((await w.act({ action: 'agent.updateSkilldock', agent: 'claude' })).code, 'UNSUPPORTED_FOR_AGENT');
  assert.equal((await w.act({ action: 'agent.setManagement', management: 'enabled' })).code, 'INVALID_ACTION', 'agent.* 必须带 agent');
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
