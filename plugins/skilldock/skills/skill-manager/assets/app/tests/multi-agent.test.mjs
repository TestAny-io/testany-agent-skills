// SPDX-License-Identifier: AGPL-3.0-only
// Phase 3c: the multi-agent snapshot (API-SDX-001 36c §5–6). Claude's command line is a
// stand-in; settings come from a temporary world, never from this machine.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createService } from '../server/service.mjs';
import { mergeClaude, markReadOnly } from '../server/multi-agent.mjs';
import { writeGeneration } from '../server/generation.mjs';

const skillFile = async (directory, name) => { await fs.mkdir(path.join(directory, name), { recursive: true }); await fs.writeFile(path.join(directory, name, 'SKILL.md'), `---\nname: ${name}\ndescription: ${name} skill.\n---\n`); };

test('only standalone skills at the same real path merge; the Codex ID and fields stay on top, both sides in perAgent', () => {
  const codex = { id: 'c1', name: 'shared', path: '/codex/shared/SKILL.md', realPath: '/real/shared/SKILL.md', scope: 'user', enabled: true, canToggle: true, canRemove: true, canUpdate: false };
  const plugin = { id: 'c2', name: 'tool', path: '/codex/cache/p/tool/SKILL.md', realPath: '/real/tool/SKILL.md', scope: 'plugin', pluginId: 'p@m', enabled: true, canToggle: true, canRemove: false, canUpdate: false };
  const claudeShared = { agents: ['claude'], id: 'claude:skill:user:aaa', name: 'shared', path: '/claude/shared/SKILL.md', realPath: '/real/shared/SKILL.md', scope: 'user', enabled: false, visibility: 'disabled', enablement: { decidedBy: 'user' }, canToggle: false, canRemove: false, canUpdate: false, reason: 'r', revision: 'cl1' };
  const claudeTool = { ...claudeShared, id: 'claude:skill:user:bbb', name: 'tool', path: '/claude/tool/SKILL.md', realPath: '/real/tool/SKILL.md' };
  const result = mergeClaude({ skills: [codex, plugin], plugins: [], marketplaces: [], diagnostics: [] }, { skills: [claudeShared, claudeTool], plugins: [{ id: 'claude:plugin:x' }], marketplaces: [], diagnostics: ['d'] });
  assert.deepEqual(result.skills.map(item => [item.id, item.agents.join()]), [['c1', 'codex,claude'], ['c2', 'codex'], ['claude:skill:user:bbb', 'claude']]);
  const shared = result.skills[0];
  assert.deepEqual([shared.path, shared.enabled, 'visibility' in shared, 'enablement' in shared], ['/codex/shared/SKILL.md', true, false, false], '顶层取 Codex 侧');
  assert.deepEqual([shared.perAgent.codex.enabled, shared.perAgent.claude.enabled, shared.perAgent.claude.visibility, shared.perAgent.claude.path], [true, false, 'disabled', '/claude/shared/SKILL.md'], '两侧状态独立');
  assert.ok(shared.revision && shared.perAgent.codex.revision && shared.perAgent.claude.revision === 'cl1');
  assert.deepEqual([result.plugins.map(item => item.id), result.diagnostics], [['claude:plugin:x'], ['d']]);
});

async function world(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock-multi-agent-')));
  const home = path.join(root, 'home'); const codexHome = path.join(home, '.codex'); const configDir = path.join(home, '.claude');
  await skillFile(path.join(codexHome, 'skills'), 'shared'); await skillFile(path.join(codexHome, 'skills'), 'codex-only');
  await skillFile(path.join(configDir, 'skills'), 'claude-only');
  await fs.symlink(path.join(codexHome, 'skills/shared'), path.join(configDir, 'skills/shared'));
  await fs.writeFile(path.join(configDir, 'settings.json'), JSON.stringify({ skillOverrides: { shared: 'off' } }));
  const state = path.join(root, 'state'); await fs.mkdir(state); await writeGeneration(state, 'test');
  const lists = { plugins: [{ id: 'demo@m', scope: 'user', enabled: true, version: '1' }], marketplaces: [{ name: 'm', source: 'github', repo: 'o/m' }] };
  const failure = { plugins: null };
  const service = await createService({ home, codexHome, projectDir: home, stateDir: state, background: false, env: { HOME: home },
    adapter: { list: async () => ({ plugins: [], marketplaces: [], diagnostics: [], cli: { available: true, version: 'codex-cli 0.200.0', path: '/stand-in/codex' } }) },
    claudeCli: async () => ({ available: true, version: '2.1.288', path: '/stand-in/claude' }),
    claudeCatalog: { managedDir: path.join(root, 'no-managed'),
      listPlugins: async () => { if (failure.plugins) throw new Error(failure.plugins); return lists.plugins; }, listMarketplaces: async () => lists.marketplaces } });
  t.after(async () => { await service.close(); await fs.rm(root, { recursive: true, force: true }); });
  return { root, home, codexHome, configDir, service, failure };
}

test('version-1 snapshots are unchanged; multi-agent snapshots add Claude objects, shared skills and environments', async t => {
  const w = await world(t);
  const plain = await w.service.snapshot('local', true);
  assert.deepEqual(plain.skills.map(item => item.name).sort(), ['codex-only', 'shared']);
  assert.ok(plain.skills.every(item => !('agents' in item) && !('perAgent' in item)) && !('agents' in plain), '1 版快照不变');
  const multi = await w.service.snapshot('local', true, { multiAgent: true });
  const byName = name => multi.skills.find(item => item.name === name);
  assert.deepEqual(['shared', 'codex-only', 'claude-only'].map(name => byName(name).agents.join()), ['codex,claude', 'codex', 'claude']);
  assert.equal(byName('shared').id, plain.skills.find(item => item.name === 'shared').id, '共用对象取 Codex 侧 ID');
  assert.deepEqual([byName('shared').perAgent.codex.enabled, byName('shared').perAgent.claude.visibility], [true, 'disabled']);
  assert.match(byName('claude-only').id, /^claude:skill:user:/);
  assert.deepEqual(multi.plugins.map(item => [item.name, item.agents.join()]), [['demo', 'claude']]);
  assert.deepEqual(multi.marketplaces.map(item => [item.name, item.agents.join()]), [['m', 'claude']]);
  assert.deepEqual(multi.agents.map(item => [item.agent, item.management]), [['codex', 'enabled'], ['claude', 'read-only']]);
  // Skill details find Claude objects by their ID.
  assert.equal((await w.service.skill('local', byName('claude-only').id)).skill.name, 'claude-only');
});

test('a failing Claude list makes Claude unconfirmed in the multi-agent snapshot, without failing it', async t => {
  const w = await world(t);
  w.failure.plugins = 'claude plugin list 失败：stand-in';
  const multi = await w.service.snapshot('local', true, { multiAgent: true });
  const claude = multi.agents.find(item => item.agent === 'claude');
  assert.equal(claude.management, 'unconfirmed'); assert.match(claude.reason, /stand-in/);
  assert.ok(multi.skills.some(item => item.name === 'claude-only'), '文件证据照常显示');
});

test('a read-only Agent in a multi-agent snapshot: no changes offered, updates not applicable, nothing restorable', () => {
  const result = markReadOnly({
    skills: [{ agents: ['codex'], canToggle: true, canRemove: true, canUpdate: true }, { agents: ['codex', 'claude'], canToggle: true, canRemove: true, canUpdate: false, perAgent: { codex: { canToggle: true }, claude: { canToggle: false } } }, { agents: ['claude'], canToggle: false, canRemove: false, canUpdate: false, reason: 'claude' }],
    plugins: [{ agents: ['codex'], canToggle: true, canRemove: true, canInstall: true }], marketplaces: [{ canRemove: true, canRefresh: true }],
    updates: [{ target: { kind: 'skill', id: 'a' }, canApply: true, canAutoApply: true }, { target: { kind: 'plugin', id: 'b', agent: 'claude' }, canApply: false }],
    activity: [{ id: 'x', canRestore: true }, { id: 'y', agent: 'claude', canRestore: false }] }, 'codex', 'read-only reason');
  assert.deepEqual(result.skills.map(item => [item.canToggle, item.canRemove, item.canUpdate, item.reason]), [[false, false, false, 'read-only reason'], [false, false, false, 'read-only reason'], [false, false, false, 'claude']]);
  assert.equal(result.skills[1].perAgent.codex.canToggle, false);
  assert.deepEqual([result.plugins[0].canToggle, result.plugins[0].canInstall, result.marketplaces[0].canRefresh], [false, false, false]);
  assert.deepEqual(result.updates.map(item => item.canApply), [false, false]);
  assert.deepEqual(result.activity.map(item => item.canRestore), [false, false]);
});

