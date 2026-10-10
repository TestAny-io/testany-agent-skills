// SPDX-License-Identifier: AGPL-3.0-only
// Phase 5d2: one-click update of the SkillDock in one Agent (36c 7.2 `agent.updateSkilldock`),
// through that Agent's own command line, read back.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createService } from '../server/service.mjs';
import { updateSkilldockIn } from '../server/skilldock-update.mjs';
import { writeGeneration } from '../server/generation.mjs';
import { assertTranslated } from './i18n-helper.mjs';
import { childEnvironment } from '../server/process-env.mjs';
import { acquireFileLock, operationLock } from '../server/process-lock.mjs';

const MARKET = 'testany-agent-skills';
const SOURCE = 'https://github.com/TestAny-io/testany-agent-skills.git';
const seen = new Set();
const see = value => { if (typeof value?.message === 'string') seen.add(value.message); return value; };

test('the shared update refreshes the marketplace, updates each installation where it is installed, and reads back', async () => {
  const calls = []; let version = '0.11.0';
  const items = () => [{ id: 'skilldock@m', marketplace: 'm', version, scope: 'user' }, { id: 'skilldock@m', marketplace: 'm', version, scope: 'project', cwd: '/p' }];
  const result = await updateSkilldockIn('claude', { list: async () => items(), run: async (args, { cwd }) => { calls.push([args.join(' '), cwd]); if (args[1] === 'update') version = '0.11.1'; } });
  assert.deepEqual(calls, [['plugin marketplace update m --json', undefined], ['plugin update skilldock@m --scope user --json', undefined], ['plugin update skilldock@m --scope project --json', '/p']]);
  assert.deepEqual([result.from, result.to], ['0.11.0', '0.11.1']); assert.match(see(result).message, /需重载插件后生效/);
  // A failure says what happened and, on a line of its own, what to do by hand.
  const codex = [{ id: 'skilldock@m', marketplace: 'm', version: '0.11.0' }];
  const failing = await updateSkilldockIn('codex', { list: async () => codex, run: async () => { throw new Error('network down\nmore'); } }).catch(see);
  assert.equal(failing.code, 'SKILLDOCK_UPDATE_FAILED');
  assert.equal(failing.message, 'Codex 中的 SkillDock 更新失败（network down）。\n在 Codex 的插件页更新 SkillDock，或运行 codex plugin add skilldock@m。');
  const same = await updateSkilldockIn('codex', { list: async () => codex, run: async () => {} }).catch(see);
  assert.equal(same.code, 'SKILLDOCK_UPDATE_FAILED'); assert.match(same.message, /没有更新的 SkillDock（当前 0\.11\.0）/);
  let reads = 0;
  const unread = await updateSkilldockIn('codex', { list: async () => { if (reads++) throw new Error('list failed'); return codex; }, run: async () => {} }).catch(see);
  assert.equal(unread.code, 'READBACK_FAILED'); assert.match(unread.message, /无法读回 SkillDock 的版本（list failed）/);
  const gone = await updateSkilldockIn('codex', { list: async () => (reads++ % 2 ? [] : codex), run: async () => {} }).catch(see);
  assert.equal(gone.code, 'READBACK_FAILED');
  assert.equal((await updateSkilldockIn('claude', { list: async () => [], run: async () => {} }).catch(see)).code, 'NOT_FOUND');
});

test('installations are read back one by one; a gone project is skipped and said so; a timeout stays unknown (5d review P3-01, P3-02)', async () => {
  // A fork at 0.12.0 next to the official 0.10.1: only the official one moves, and that is a success.
  let official = '0.10.1';
  const codex = () => [{ id: 'skilldock@fork', marketplace: 'fork', version: '0.12.0' }, { id: 'skilldock@official', marketplace: 'official', version: official }];
  const both = await updateSkilldockIn('codex', { list: async () => codex(), run: async args => { if (args.join(' ') === 'plugin add skilldock@official --json') official = '0.11.0'; } });
  assert.equal(see(both).message, '已把 Codex 中的 SkillDock 从 0.10.1 更新到 0.11.0。新的 Codex 会话或重载后生效。\n另有 1 处安装的版本没有变化。');
  // A project installation whose project is gone is not run; the others are.
  let user = '0.10.2'; const ran = [];
  const claude = () => [{ id: 'skilldock@m', marketplace: 'm', version: '0.10.2', scope: 'project', cwd: '/gone', missing: true }, { id: 'skilldock@m', marketplace: 'm', version: user, scope: 'user' }];
  const skipped = await updateSkilldockIn('claude', { list: async () => claude(), run: async (args, { cwd }) => { ran.push([args.join(' '), cwd]); if (args[1] === 'update') user = '0.11.0'; } });
  assert.match(see(skipped).message, /\n1 处安装所在的项目目录不存在，没有更新。$/);
  assert.deepEqual(ran.map(([command]) => command), ['plugin marketplace update m --json', 'plugin update skilldock@m --scope user --json']);
  const none = await updateSkilldockIn('claude', { list: async () => [claude()[0]], run: async () => {} }).catch(see);
  assert.equal(none.code, 'PROJECT_PATH_MISSING');
  const timeout = await updateSkilldockIn('codex', { list: async () => codex(), run: async () => { throw Object.assign(new Error('Claude 命令行 plugin update 超时，执行结果尚未确认；请刷新查看实际状态后再决定是否重试。'), { code: 'CLI_TIMEOUT' }); } }).catch(see);
  assert.equal(timeout.code, 'CLI_TIMEOUT', '超时是“结果未确认”，不是失败');
  // The one-time agreement never reaches a long-lived process (P3-04).
  assert.equal(childEnvironment({ HOME: '/h', SKILLDOCK_UPDATE_AGENT: 'claude', SKILLDOCK_STATE_DIR: '/s' }).SKILLDOCK_UPDATE_AGENT, undefined);
});

async function world(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock-self-')));
  const home = path.join(root, 'home'); const codexHome = path.join(home, '.codex'); const claudeConfig = path.join(home, '.claude');
  const state = path.join(root, 'state'); const project = path.join(root, 'project');
  for (const dir of [codexHome, path.join(claudeConfig, 'plugins/cache'), state, project]) await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(codexHome, 'config.toml'), `[marketplaces.${MARKET}]\nsource_type = "git"\nsource = "${SOURCE}"\n`);
  await fs.writeFile(path.join(claudeConfig, 'plugins/known_marketplaces.json'), JSON.stringify({ [MARKET]: { source: { source: 'git', url: SOURCE } } }));
  // A SkillDock installation as each Agent lays it out (installs.mjs).
  const install = async (agent, version) => {
    const base = agent === 'codex' ? path.join(codexHome, 'plugins/cache', MARKET, 'skilldock', version) : path.join(claudeConfig, 'plugins/cache', MARKET, 'skilldock', `sha-${version}`);
    await fs.mkdir(path.join(base, '.codex-plugin'), { recursive: true });
    await fs.writeFile(path.join(base, '.codex-plugin/plugin.json'), JSON.stringify({ name: 'skilldock', version }));
    await fs.mkdir(path.join(base, 'skills/skill-manager/scripts'), { recursive: true });
    await fs.writeFile(path.join(base, 'skills/skill-manager/scripts/launch.sh'), '#!/bin/sh\n');
    await fs.mkdir(path.join(base, 'skills/skill-manager/assets/app'), { recursive: true });
    await fs.writeFile(path.join(base, 'skills/skill-manager/assets/app/package.json'), JSON.stringify({ name: 'skilldock', version }));
    return base;
  };
  const codex = { version: '0.11.0', cli: true }; await install('codex', codex.version);
  const claude = { cli: true, plugins: [{ id: `skilldock@${MARKET}`, scope: 'user', enabled: true, version: 'sha-0.11.1', installPath: await install('claude', '0.11.1') }] };
  const calls = []; let changes = 0;
  await writeGeneration(state, 2);
  // Claude read-only: SkillDock updates itself there all the same.
  await fs.mkdir(path.join(state, 'settings'), { recursive: true });
  await fs.writeFile(path.join(state, 'settings/agents.json'), JSON.stringify({ format: 1, agents: { codex: { management: 'enabled', origin: 'user', changedAt: '2026-10-10T00:00:00.000Z' }, claude: { management: 'read-only', origin: 'user', changedAt: '2026-10-10T00:00:00.000Z' } } }));
  const service = await createService({ home, codexHome, projectDir: project, stateDir: state, background: false, env: { HOME: home }, onInstallationChange: () => { changes++; },
    adapter: {
      list: async () => ({ plugins: [{ id: `skilldock@${MARKET}`, name: 'skilldock', marketplace: MARKET, version: codex.version, installed: true, enabled: true }], marketplaces: [], diagnostics: [], listed: { plugins: true, marketplaces: true },
        cli: codex.cli ? { available: true, version: 'codex-cli 0.200.0', path: '/stand-in/codex' } : { available: false, error: '未找到可用的 Codex CLI。' } }),
      command: async args => { calls.push(['codex', args.join(' ')]); if (args[1] === 'add') { codex.version = codex.next; await install('codex', codex.next); } return {}; },
    },
    claudeCli: async () => claude.cli ? { available: true, version: '2.1.288', path: '/stand-in/claude' } : { available: false, error: '未找到可用的 Claude 命令行。' },
    claudeCatalog: { managedDir: path.join(root, 'no-managed'), listPlugins: async () => structuredClone(claude.plugins), listMarketplaces: async () => [] },
    claudeWriter: () => async (args, { cwd }) => {
      calls.push(['claude', args.join(' '), cwd]);
      if (args[1] === 'update' && !claude.next) throw new Error('marketplace unreachable');
      if (args[1] === 'update') { const base = await install('claude', claude.next); await fs.writeFile(path.join(claude.plugins[0].installPath, '.orphaned_at'), '1'); Object.assign(claude.plugins[0], { version: `sha-${claude.next}`, installPath: base }); }
      return { outcome: 'ok' };
    },
    claudeGit: async () => { throw new Error('not a repository'); } });
  t.after(async () => { await service.close(); await fs.rm(root, { recursive: true, force: true }); });
  const act = request => service.action({ mode: 'local', ...request }).then(see, see);
  const agents = async () => Object.fromEntries((await service.snapshot('local', true, { multiAgent: true })).agents.map(item => [item.agent, item]));
  const activity = async () => (await service.snapshot('local', true, { multiAgent: true })).activity.filter(item => item.action === 'agent.updateSkilldock');
  return { project, codex, claude, calls, install, service, act, agents, activity, changes: () => changes };
}

test('the older side is offered a one-click update; Codex and Claude update through their own command lines (phase 5d2)', async t => {
  const w = await world(t);
  let agents = await w.agents();
  assert.deepEqual([agents.codex.skilldock.canUpdate, agents.claude.skilldock.canUpdate], [true, false], '只为较旧的一侧提供');
  w.codex.next = '0.11.1';
  const codex = await w.act({ action: 'agent.updateSkilldock', agent: 'codex' });
  assert.equal(codex.message, '已把 Codex 中的 SkillDock 从 0.11.0 更新到 0.11.1。新的 Codex 会话或重载后生效。'); assert.equal(codex.needsReload, true);
  assert.deepEqual(w.calls.map(call => call.slice(0, 2)), [['codex', `plugin marketplace upgrade ${MARKET} --json`], ['codex', `plugin add skilldock@${MARKET} --json`]]);
  assert.equal(w.changes(), 1, '通知自更新协调器');
  agents = await w.agents();
  assert.deepEqual([agents.codex.skilldock.canUpdate, agents.claude.skilldock.canUpdate], [false, false]);
  // Codex moves ahead; now Claude's is the older one. A read-only Claude is updated too: SkillDock itself, not what Claude manages.
  await w.install('codex', '0.11.2'); w.codex.version = '0.11.2'; w.calls.length = 0; w.claude.next = '0.11.2';
  agents = await w.agents();
  assert.equal(agents.claude.management, 'read-only'); assert.equal(agents.claude.skilldock.canUpdate, true);
  const claude = await w.act({ action: 'agent.updateSkilldock', agent: 'claude' });
  assert.match(claude.message, /^已把 Claude 中的 SkillDock 从 0\.11\.1 更新到 0\.11\.2。已打开的 Claude 会话需重载插件后生效。$/);
  assert.deepEqual(w.calls.map(call => call.slice(0, 2)), [['claude', `plugin marketplace update ${MARKET} --json`], ['claude', `plugin update skilldock@${MARKET} --scope user --json`]]);
  assert.equal(w.calls[1][2], w.project, '个人范围以当前项目为工作目录');
  assert.deepEqual((await w.activity()).map(item => [item.agent, item.status]), [['claude', 'success'], ['codex', 'success']]);
  // Already the newest: nothing runs.
  w.calls.length = 0;
  assert.match((await w.act({ action: 'agent.updateSkilldock', agent: 'claude' })).message, /已是两侧中最新的版本/); assert.equal(w.calls.length, 0);
});

test('a side that cannot run its command line or cannot be confirmed is not updated, and says what to do by hand (phase 5d2)', async t => {
  const w = await world(t);
  w.codex.cli = false;
  assert.equal((await w.agents()).codex.skilldock.canUpdate, false);
  const codex = await w.act({ action: 'agent.updateSkilldock', agent: 'codex' });
  assert.equal(codex.code, 'CLI_UNAVAILABLE'); assert.match(codex.message, /无法一键更新。\n在 Codex 的插件页更新 SkillDock/);
  // Claude behind, its command line gone: the environment cannot be confirmed.
  w.codex.cli = true; await w.install('codex', '0.11.3'); w.codex.version = '0.11.3'; w.claude.cli = false;
  assert.equal((await w.agents()).claude.skilldock.canUpdate, false);
  const claude = await w.act({ action: 'agent.updateSkilldock', agent: 'claude' });
  assert.equal(claude.code, 'AGENT_UNCONFIRMED'); assert.match(claude.message, /\n在 Claude 中用 \/plugin 更新 SkillDock/);
  assert.equal(w.calls.length, 0);
  // A failed command is recorded.
  w.claude.cli = true; w.claude.next = undefined;
  const failed = await w.act({ action: 'agent.updateSkilldock', agent: 'claude' });
  assert.equal(failed.code, 'SKILLDOCK_UPDATE_FAILED');
  assert.deepEqual((await w.activity()).map(item => [item.agent, item.status, item.reasonCode]), [['claude', 'error', 'SKILLDOCK_UPDATE_FAILED']]);
});

test('the one-click update holds the Claude lock and is not offered while Claude cannot be confirmed (5d review M9, M14)', async t => {
  const w = await world(t);
  await w.install('codex', '0.11.2'); w.codex.version = '0.11.2'; w.claude.next = '0.11.2';
  const configDir = path.join(w.project, '..', 'home', '.claude');
  const held = acquireFileLock(operationLock(configDir));
  try { assert.equal((await w.act({ action: 'agent.updateSkilldock', agent: 'claude' })).code, 'BUSY'); } finally { held(); }
  assert.deepEqual(w.calls, [], '没有运行命令');
  // A settings file Claude cannot read leaves Claude unconfirmed although its command line works.
  await fs.writeFile(path.join(configDir, 'settings.json'), '{ broken');
  const claude = (await w.agents()).claude;
  assert.deepEqual([claude.management, claude.skilldock.canUpdate], ['unconfirmed', false]);
  assert.equal((await w.act({ action: 'agent.updateSkilldock', agent: 'claude' })).code, 'AGENT_UNCONFIRMED');
});

test('every message seen above has a whole English and Japanese translation', async () => {
  const messages = [...seen].filter(text => /[一-鿿]/.test(text));
  assert.ok(messages.length >= 8, `${messages.length}`);
  await assertTranslated([...messages, 'Claude 中没有安装 SkillDock。', '本机未找到 Claude。']);
});
