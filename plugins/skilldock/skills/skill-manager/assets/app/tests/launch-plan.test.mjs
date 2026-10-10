// SPDX-License-Identifier: AGPL-3.0-only
// 0.11 launch planning: project fallback (36b §6.3), 0.10.x record ownership (HLD 3.7),
// delegation (DEC-SDX-008) and the version-2 health check (36c §4).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { resolveLaunchProject } from '../server/project-context.mjs';
import { installationContext, delegationTarget, legacyOwnership, legacyOwnershipDetail, planLaunch, refreshInstallations, migrationCheck, backgroundFamily } from '../server/launch-plan.mjs';
import { resolveFamilySource, refreshBackgroundRuntime } from '../server/background-worker.mjs';
import { gateUpdate } from '../server/gate-cli.mjs';
import { fileURLToPath } from 'node:url';
import { buildRecord, legacyFields, ensureLegacyProject, writeRecord, readRecord } from '../server/launcher-record.mjs';
import { writeRestart } from '../server/installation.mjs';
import { writeMigrationFailure } from '../server/migration.mjs';
import { acquireFileLock } from '../server/process-lock.mjs';
import { absentCommandLines } from './helpers/launcher-fixture.mjs';
import { createApp } from '../server/index.mjs';

const MARKET = 'testany-agent-skills';
const SOURCE = 'https://github.com/TestAny-io/testany-agent-skills.git';

async function world(t, { claudeSource = SOURCE } = {}) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'skilldock-plan-')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const home = path.join(root, 'home'); const codexHome = path.join(home, '.codex'); const claudeConfig = path.join(home, '.claude');
  const state = path.join(root, 'state'); const project = path.join(root, 'project');
  for (const dir of [codexHome, path.join(claudeConfig, 'plugins/cache'), state, project]) await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(codexHome, 'config.toml'), `[marketplaces.${MARKET}]\nsource_type = "git"\nsource = "${SOURCE}"\n`);
  await fs.writeFile(path.join(claudeConfig, 'plugins/known_marketplaces.json'), JSON.stringify({ [MARKET]: { source: { source: 'git', url: claudeSource } } }));
  const install = async (agent, version, { plugin = 'skilldock' } = {}) => {
    const base = agent === 'codex' ? path.join(codexHome, 'plugins/cache', MARKET, plugin, version) : path.join(claudeConfig, 'plugins/cache', MARKET, plugin, `sha-${version}`);
    await fs.mkdir(path.join(base, '.codex-plugin'), { recursive: true });
    await fs.writeFile(path.join(base, '.codex-plugin/plugin.json'), JSON.stringify({ name: plugin, version }));
    await fs.mkdir(path.join(base, 'skills/skill-manager/scripts'), { recursive: true });
    await fs.writeFile(path.join(base, 'skills/skill-manager/scripts/launch.sh'), '#!/bin/sh\n');
    await fs.mkdir(path.join(base, 'skills/skill-manager/assets/app'), { recursive: true });
    await fs.writeFile(path.join(base, 'skills/skill-manager/assets/app/package.json'), JSON.stringify({ name: plugin === 'skilldock' ? 'skilldock' : plugin, version }));
    return path.join(base, 'skills/skill-manager/assets/app');
  };
  return { root, home, codexHome, claudeConfig, state, project, install, env: { HOME: home, ...absentCommandLines(home) } };
}

test('project fallback: never the working directory, explicit levels flagged, skipped values reported', async t => {
  const w = await world(t);
  const legacy = path.join(w.state, 'compat/legacy-project'); await fs.mkdir(legacy, { recursive: true });
  const other = path.join(w.root, 'other'); await fs.mkdir(other);
  const base = { stateDir: w.state, cwd: w.state, home: w.home };
  // A 0.10.3 handover without any project goes to home, never to its working directory (the state).
  let info = await resolveLaunchProject({ ...base, env: { SKILLDOCK_HANDOVER: '1' } });
  assert.deepEqual([info.effective, info.source, info.explicit], [w.home, 'home', false]);
  // The fixed legacy directory is not a project; the environment value is explicit.
  info = await resolveLaunchProject({ ...base, projectDir: legacy, env: { SKILLDOCK_PROJECT_DIR: other } });
  assert.deepEqual([info.effective, info.source, info.explicit], [other, 'environment', true]);
  assert.match(info.warnings[0], /--project/);
  // project.json comes before the record's actual project.
  await fs.writeFile(path.join(w.state, 'project.json'), JSON.stringify({ path: w.project }));
  info = await resolveLaunchProject({ ...base, env: { SKILLDOCK_HANDOVER: '1' }, actualProject: other });
  assert.deepEqual([info.effective, info.source, info.explicit], [w.project, 'saved', false]);
  await fs.rm(path.join(w.state, 'project.json'));
  info = await resolveLaunchProject({ ...base, env: { SKILLDOCK_HANDOVER: '1' }, actualProject: other });
  assert.deepEqual([info.effective, info.source], [other, 'record']);
  await assert.rejects(resolveLaunchProject({ ...base, env: { SKILLDOCK_HANDOVER: '1' }, home: path.join(w.root, 'absent') }), { code: 'PROJECT_UNAVAILABLE' });
  // Outside a handover with a valid --project, 0.10.2's order applies and the argument is explicit.
  info = await resolveLaunchProject({ ...base, projectDir: w.project, env: {} });
  assert.deepEqual([info.effective, info.source, info.explicit], [w.project, 'argument', true]);
});

test('0.10.x record ownership: same family, explicit testany-eng, pre-0.10.3 Claude directory form, others refused', async t => {
  const w = await world(t);
  const codex = await w.install('codex', '0.11.0'); await w.install('codex', '0.10.3');
  const context = await installationContext({ env: w.env, home: w.home, state: w.state, appDir: codex });
  const old = path.join(w.codexHome, 'plugins/cache', MARKET, 'skilldock/0.10.3/skills/skill-manager/assets/app');
  const pluginRecord = { source: old, installation: { kind: 'plugin', codexHome: w.codexHome, marketplace: MARKET, plugin: 'skilldock', appPath: 'skills/skill-manager/assets/app' } };
  assert.equal(await legacyOwnership(pluginRecord, context), 'family');
  // Codex may have removed the old cache; the recorded identity still identifies it.
  const removed = { ...pluginRecord, source: path.join(w.codexHome, 'plugins/cache', MARKET, 'skilldock/0.10.1/skills/skill-manager/assets/app') };
  assert.equal(await legacyOwnership(removed, context), 'family');
  const eng = await w.install('codex', '2.4.0', { plugin: 'testany-eng' });
  const engRecord = { source: eng, installation: { ...pluginRecord.installation, plugin: 'testany-eng' } };
  assert.equal(await legacyOwnership(engRecord, context), null);
  assert.equal(await legacyOwnership(engRecord, context, { migrateFrom: 'testany-eng' }), 'testany-eng');
  // A directory-form record in the Claude cache blocks only while that installation is
  // still in use and older than 0.10.3; afterwards it is a stale record of the family.
  const dirRecord = source => ({ source, installation: { kind: 'directory', source } });
  const claudeOld = await w.install('claude', '0.10.2');
  assert.equal(await legacyOwnership(dirRecord(claudeOld), context), 'claude-legacy');
  await fs.writeFile(path.join(claudeOld, '../../../../.orphaned_at'), '1');
  assert.equal(await legacyOwnership(dirRecord(claudeOld), context), 'family', '更新后旧目录带废弃标记');
  await fs.rm(path.resolve(claudeOld, '../../../..'), { recursive: true });
  assert.equal(await legacyOwnership(dirRecord(claudeOld), context), 'family', '旧目录已删除');
  assert.equal(await legacyOwnership(dirRecord(await w.install('claude', '0.10.3')), context), 'family', '0.10.3 写下的目录形态记录');
  const otherMarket = path.join(w.claudeConfig, 'plugins/cache/elsewhere/skilldock/sha-x/skills/skill-manager/assets/app');
  assert.equal(await legacyOwnership(dirRecord(otherMarket), context), null, '其他 marketplace 的记录仍拒绝');
  assert.deepEqual(await legacyOwnershipDetail(dirRecord(await w.install('claude', '0.10.0')), context), { owner: 'claude-legacy', version: '0.10.0' });
  // As in the gate, a package that is not JSON is not an installation: the record is stale.
  const notJson = await w.install('claude', '0.9.0'); await fs.writeFile(path.join(notJson, 'package.json'), 'not json');
  assert.equal(await legacyOwnership(dirRecord(notJson), context), 'family', '与门槛口径一致');
  // A package that cannot be read counts as an old installation still in use.
  if (process.getuid?.() !== 0) {
    const unreadable = await w.install('claude', '0.10.1'); await fs.chmod(path.join(unreadable, 'package.json'), 0o000);
    const result = await legacyOwnershipDetail(dirRecord(unreadable), context).finally(() => fs.chmod(path.join(unreadable, 'package.json'), 0o600));
    assert.deepEqual(result, { owner: 'claude-legacy', unreadable: path.join(await fs.realpath(unreadable), 'package.json') });
  }
  // The same marketplace name from a fork is refused; a marketplace gone from Claude cannot be verified.
  const stale = path.join(w.claudeConfig, 'plugins/cache', MARKET, 'skilldock/sha-gone/skills/skill-manager/assets/app');
  const known = path.join(w.claudeConfig, 'plugins/known_marketplaces.json');
  await fs.writeFile(known, JSON.stringify({ [MARKET]: { source: { source: 'git', url: 'https://github.com/someone/testany-agent-skills.git' } } }));
  assert.equal(await legacyOwnership(dirRecord(stale), context), null);
  await fs.writeFile(known, JSON.stringify({}));
  assert.deepEqual(await legacyOwnershipDetail(dirRecord(stale), context), { owner: 'claude-unverified', reason: 'marketplace' });
  // The cache of a Claude configuration directory not visible from here (custom location).
  const custom = path.join(w.root, 'custom-claude');
  const unseen = path.join(custom, 'plugins/cache', MARKET, 'skilldock/sha-a/skills/skill-manager/assets/app');
  assert.deepEqual(await legacyOwnershipDetail(dirRecord(unseen), context), { owner: 'claude-unverified', reason: 'configuration', configDir: await fs.realpath(w.root).then(root => path.join(root, 'custom-claude')) });
  assert.equal(await legacyOwnership(dirRecord(path.join(custom, 'plugins/cache/elsewhere/skilldock/sha-a/skills/skill-manager/assets/app')), context), null, '其他 marketplace');
  assert.equal(await legacyOwnership(dirRecord(path.join(custom, 'plugins/cache', MARKET, 'other/sha-a/skills/skill-manager/assets/app')), context), null, '其他插件');
  assert.equal(await legacyOwnership(dirRecord(path.join(w.codexHome, 'plugins/cache', MARKET, 'skilldock/0.10.2/skills/skill-manager/assets/app')), context), null, 'Codex 缓存中的目录形态记录不算 Claude 安装');
  assert.equal(await legacyOwnership({ source: w.project, installation: { kind: 'directory', source: w.project } }, context), null);
  // A Claude installation registered from a fork does not own Codex data of the original source.
  const fork = await world(t, { claudeSource: 'https://github.com/someone/testany-agent-skills.git' });
  await fork.install('codex', '0.10.3');
  const forkContext = await installationContext({ env: fork.env, home: fork.home, state: fork.state, appDir: await fork.install('claude', '0.11.0') });
  const forkRecord = { source: path.join(fork.codexHome, 'plugins/cache', MARKET, 'skilldock/0.10.3/skills/skill-manager/assets/app'), installation: { ...pluginRecord.installation, codexHome: fork.codexHome } };
  assert.equal(await legacyOwnership(forkRecord, forkContext), null);
});

test('delegation: only start and restart, never a restart job, never twice, only to a strictly newer family member', async t => {
  const w = await world(t);
  const codex = await w.install('codex', '0.11.0'); await w.install('claude', '0.11.2'); await w.install('claude', '0.12.0', { plugin: 'other' });
  const context = await installationContext({ env: w.env, home: w.home, state: w.state, appDir: codex });
  assert.equal(delegationTarget(context, { action: 'start', env: {} }).version, '0.11.2');
  assert.equal(delegationTarget(context, { action: 'restart', env: {} }).agent, 'claude');
  for (const action of ['status', 'stop']) assert.equal(delegationTarget(context, { action, env: {} }), null);
  assert.equal(delegationTarget(context, { action: 'restart', env: { SKILLDOCK_RESTART_JOB: 'j' } }), null);
  assert.equal(delegationTarget(context, { action: 'start', env: { SKILLDOCK_DELEGATED: '1' } }), null);
  const newest = await installationContext({ env: w.env, home: w.home, state: w.state, appDir: path.join(w.claudeConfig, 'plugins/cache', MARKET, 'skilldock/sha-0.11.2/skills/skill-manager/assets/app') });
  assert.equal(delegationTarget(newest, { action: 'start', env: {} }), null);
  // Bootstrap planning: newer data stops before any toolchain work.
  await fs.writeFile(path.join(w.state, 'generation.json'), JSON.stringify({ format: 1, generation: 3 }));
  const plan = await planLaunch({ action: 'start', env: { ...w.env, SKILLDOCK_STATE_DIR: w.state }, home: w.home, appDir: codex });
  assert.deepEqual([plan.kind, plan.error.exitCode, plan.error.output.status], ['error', 3, 'update-required']);
  assert.equal((await planLaunch({ action: 'doctor', env: { ...w.env, SKILLDOCK_STATE_DIR: w.state }, home: w.home, appDir: codex })).kind, 'continue');
});

test('health version 2: frozen fields, installation summary without paths, restart derived from restart.json only', async t => {
  const w = await world(t);
  const codex = await w.install('codex', '0.11.0'); await w.install('claude', '0.11.1');
  const app = await createApp({ enableTestSandbox: true, selfUpdate: false, home: w.home, env: w.env, codexHome: w.codexHome, appSource: codex, stateDir: w.state, projectDir: w.project,
    adapter: { list: async () => ({ plugins: [], marketplaces: [], diagnostics: [], cli: { available: false } }) } });
  t.after(() => app.close());
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${app.server.address().port}`;
  const read = async () => (await fetch(`${url}/api/health`)).json();
  let health = await read();
  assert.equal(health.apiVersion, 2); assert.match(health.appVersion, /^\d+\.\d+\.\d+$/);
  assert.equal(health.dataGeneration, 1, '未迁移的数据目录如实报告代号'); assert.equal(health.minimumCompatibleGeneration, 2);
  assert.deepEqual(health.installations, [{ agent: 'claude', marketplace: MARKET, version: '0.11.1', running: false }, { agent: 'codex', marketplace: MARKET, version: '0.11.0', running: true }]);
  assert.equal(JSON.stringify(health.installations).includes(w.root), false, '不含路径');
  assert.equal(health.project, await fs.realpath(w.project));
  // A matching digest no longer means ready; an accepted job whose executor is gone is closed.
  const job = { id: 'j', source: codex, sourceDigest: process.env.SKILLDOCK_SOURCE_DIGEST ?? 'x', previousPid: 1, status: 'restarting' };
  await writeRestart(w.state, job);
  assert.deepEqual((await read()).restart, { id: 'j', status: 'restarting' });
  const gone = { pid: 2 ** 22 + 12345, startedAt: new Date().toISOString() };
  await writeRestart(w.state, { ...job, executor: { pid: process.pid, startedAt: gone.startedAt } });
  await fs.writeFile(path.join(w.state, 'launcher.lock'), JSON.stringify({ pid: process.pid, token: 't' }));
  assert.equal((await read()).restart.status, 'restarting', '执行进程存活且持有启动锁时如实报告');
  await fs.rm(path.join(w.state, 'launcher.lock'));
  assert.equal((await read()).restart.status, 'ready', '进程存活但已不持有启动锁（pid 被复用）时按终态报告');
  await writeRestart(w.state, { ...job, executor: gone });
  assert.deepEqual((await read()).restart, { id: 'j', status: 'ready' });
  await writeRestart(w.state, { ...job, source: path.join(w.root, 'elsewhere'), executor: gone });
  assert.equal((await read()).restart.status, 'failed');
});

test('bootstrap planning stops generation-1 data at the gate and refuses a failed target for restart jobs, before any toolchain work', async t => {
  const w = await world(t);
  const codex = await w.install('codex', '0.11.0'); await w.install('claude', '0.10.2');
  const env = { ...w.env, SKILLDOCK_STATE_DIR: w.state };
  let plan = await planLaunch({ action: 'start', env, home: w.home, appDir: codex });
  assert.deepEqual([plan.kind, plan.error.exitCode, plan.error.output.status], ['error', 4, 'migration-blocked']);
  plan = await planLaunch({ action: 'restart', env: { ...env, SKILLDOCK_RESTART_JOB: 'j' }, home: w.home, appDir: codex });
  assert.deepEqual([plan.kind, plan.error.exitCode, plan.error.output], ['error', 4, undefined], '非交互入口只给原因');
  assert.equal((await planLaunch({ action: 'status', env, home: w.home, appDir: codex })).kind, 'continue', 'status 不受门槛限制');
  await fs.rm(path.join(w.claudeConfig, 'plugins/cache', MARKET), { recursive: true });
  assert.equal((await planLaunch({ action: 'start', env, home: w.home, appDir: codex })).kind, 'continue');
  await writeMigrationFailure(w.state, { appDir: codex, version: '0.11.0', message: 'x' });
  plan = await planLaunch({ action: 'restart', env: { ...env, SKILLDOCK_RESTART_JOB: 'j' }, home: w.home, appDir: codex });
  assert.equal(plan.error.code, 'MIGRATION_FAILED_BEFORE');
  assert.equal((await planLaunch({ action: 'start', env, home: w.home, appDir: codex })).kind, 'continue', '交互入口不受快速拒绝限制');
  await writeMigrationFailure(w.state, { appDir: codex, version: '0.10.9', message: 'x' });
  assert.equal((await planLaunch({ action: 'restart', env: { ...env, SKILLDOCK_RESTART_JOB: 'j' }, home: w.home, appDir: codex })).kind, 'continue', '目标版本变化后解除');
});

test('the gate notes which command line confirmed each Agent, or that the install record was used (HLD 3.7)', async t => {
  const w = await world(t);
  const codex = await w.install('codex', '0.11.0');
  const cli = path.join(w.root, 'codex-stand-in');
  await fs.writeFile(cli, '#!/bin/sh\ncase "$1 $2" in\n"--version ") echo "codex-cli 0.200.0" ;;\n"plugin --help") echo "list marketplace" ;;\n"plugin list") echo \'{"installed":[]}\' ;;\nesac\n', { mode: 0o755 });
  const env = { ...w.env, SKILLDOCK_CODEX_BIN: cli };
  const context = await installationContext({ env, home: w.home, state: w.state, appDir: codex });
  const notes = [];
  assert.equal(await migrationCheck({ state: w.state, context, env, home: w.home, codexHome: w.codexHome, log: note => notes.push(note) }), null);
  assert.deepEqual(notes, [`已用 Codex 命令行 ${cli}（codex-cli 0.200.0）确认插件清单。`, 'Claude 命令行不可用，改用安装记录。']);
});

test('installation changes refresh the preferred target and legacy fields, never the running installation (HLD 3.7)', async t => {
  const w = await world(t);
  const codex = await w.install('codex', '0.11.0');
  let context = await installationContext({ env: w.env, home: w.home, state: w.state, appDir: codex });
  const record = buildRecord({ state: w.state, url: 'http://127.0.0.1:1', pid: 1, digest: 'd', runtime: '/r', codexHome: w.codexHome, legacyProject: await ensureLegacyProject(w.state),
    legacy: await legacyFields({ codexHome: w.codexHome, installs: context.installs, running: context.ownReference }), running: context.ownReference, preferred: context.preferred, actualProject: w.project });
  await writeRecord(w.state, record);
  assert.equal(await refreshInstallations({ state: w.state, codexHome: w.codexHome, env: w.env, home: w.home, appDir: codex }), null, '没有变化时不写');
  const claude = await w.install('claude', '0.11.1'); const newer = await w.install('codex', '0.11.2');
  await refreshInstallations({ state: w.state, codexHome: w.codexHome, env: w.env, home: w.home, appDir: codex });
  const refreshed = await readRecord(w.state);
  assert.equal(refreshed.preferred.appPath, newer); assert.equal(refreshed.source, newer, 'Codex 侧变化时刷新旧来源');
  assert.deepEqual(refreshed.running, record.running);
  assert.ok(claude);
  // A launch in progress compares the record; the refresh waits for the next round.
  const newest = await w.install('codex', '0.11.3');
  const launching = acquireFileLock(path.join(w.state, 'launcher.lock'));
  try { assert.equal(await refreshInstallations({ state: w.state, codexHome: w.codexHome, env: w.env, home: w.home, appDir: codex }), null); }
  finally { launching(); }
  assert.equal((await readRecord(w.state)).preferred.appPath, newer);
  // The running instance's project switch reaches the record (36a §5.3).
  const other = path.join(w.root, 'other'); await fs.mkdir(other);
  await refreshInstallations({ state: w.state, codexHome: w.codexHome, env: w.env, home: w.home, appDir: codex, instance: { pid: 1, project: other } });
  const synced = await readRecord(w.state);
  assert.deepEqual([synced.preferred.appPath, synced.actualProject], [newest, other]);
});

// HLD 3.8 (phase 5d): on generation 2 the background follows the running family on either side.
async function familyRecord(w, appDir) {
  const context = await installationContext({ env: w.env, home: w.home, state: w.state, appDir });
  await writeRecord(w.state, buildRecord({ state: w.state, url: 'http://127.0.0.1:1', pid: 1, digest: 'd', runtime: '/r', codexHome: w.codexHome, legacyProject: await ensureLegacyProject(w.state),
    legacy: await legacyFields({ codexHome: w.codexHome, installs: context.installs, running: context.ownReference }), running: context.ownReference, preferred: context.preferred, actualProject: w.project }));
}
const unexpectedScan = { list: async () => { throw new Error('unexpected scan'); } };

test('generation 2: the background follows the highest installation of the family on either side that reads the current data (HLD 3.8)', async t => {
  const w = await world(t);
  const codex = await w.install('codex', '0.11.0'); await familyRecord(w, codex);
  const family = () => backgroundFamily({ state: w.state, codexHome: w.codexHome, home: w.home, env: w.env });
  assert.equal((await family()).best.appPath, codex);
  const claude = await w.install('claude', '0.11.1');
  assert.equal((await family()).best.appPath, claude, '另一侧更高的版本');
  const context = { version: 2, stateDir: w.state, codexHome: w.codexHome, home: w.home, source: codex, installation: { kind: 'directory', source: codex } };
  assert.equal(await resolveFamilySource(context, unexpectedScan), claude, '不再只看 Codex 一侧');
  // Claude keeps a replaced version for 14 days with .orphaned_at, then removes it (HLD 9.3).
  const newer = await w.install('claude', '0.11.2'); await fs.writeFile(path.join(claude, '../../../../.orphaned_at'), '1');
  assert.equal(await resolveFamilySource({ ...context, source: claude }, unexpectedScan), newer);
  await fs.rm(path.join(claude, '../../../..'), { recursive: true });
  assert.equal(await resolveFamilySource({ ...context, source: claude }, unexpectedScan), newer, '旧目录被清理不算卸载');
  // A version 1 context keeps the 0.10.2 check.
  assert.equal(await resolveFamilySource({ ...context, version: 1 }, unexpectedScan), codex);
});

test('generation 2: the background never runs a version below the current data, and only an empty family goes to the 0.10.2 check (HLD 3.7, 3.8)', async t => {
  const w = await world(t);
  const old = await w.install('codex', '0.10.3'); await familyRecord(w, old);
  const context = { version: 2, stateDir: w.state, codexHome: w.codexHome, home: w.home, source: old, installation: { kind: 'directory', source: old } };
  await assert.rejects(resolveFamilySource(context, unexpectedScan), /都低于 0\.11\.0，不能使用当前数据；计划暂停/);
  // Neither side has the family: the 0.10.2 check decides (here: the directory is gone, so uninstalled).
  await fs.rm(path.join(old, '../../../..'), { recursive: true });
  assert.equal(await resolveFamilySource(context, unexpectedScan), null);
  // A development copy names no installed family.
  const copy = path.join(w.root, 'copy'); await fs.mkdir(copy); await fs.writeFile(path.join(copy, 'package.json'), JSON.stringify({ name: 'skilldock', version: '0.11.0' }));
  await familyRecord(w, copy);
  assert.equal(await backgroundFamily({ state: w.state, codexHome: w.codexHome, home: w.home, env: w.env }), null);
  assert.equal(await resolveFamilySource({ ...context, source: copy, installation: { kind: 'directory', source: copy } }, unexpectedScan), copy);
});

test('generation 2: a background moved to the other side takes that installation\'s identity (HLD 3.8)', async t => {
  const w = await world(t);
  const tree = fileURLToPath(new URL('../../../', import.meta.url));
  const real = async (agent, version) => {
    const app = await w.install(agent, version); const skill = path.join(app, '../..');
    await fs.cp(tree, skill, { recursive: true, filter: input => !input.split(path.sep).some(part => ['node_modules', 'dist', '.source-snapshot', '.state', 'test-results', 'playwright-report'].includes(part)) });
    const file = path.join(app, 'package.json'); await fs.writeFile(file, JSON.stringify({ ...JSON.parse(await fs.readFile(file, 'utf8')), version }));
    return app;
  };
  const codex = await real('codex', '0.11.0'); await familyRecord(w, codex); const claude = await real('claude', '0.11.1');
  const { captureSource } = await import('../scripts/source-bundle.mjs');
  const context = { version: 2, stateDir: w.state, codexHome: w.codexHome, home: w.home, source: codex, runtime: '/old-runtime',
    installation: { kind: 'plugin', codexHome: w.codexHome, marketplace: MARKET, plugin: 'skilldock', appPath: 'skills/skill-manager/assets/app' }, digest: (await captureSource(codex)).sourceDigest };
  const next = await refreshBackgroundRuntime(context, unexpectedScan, { prepare: async () => '/new-runtime' });
  assert.deepEqual([next.source, next.runtime, next.installation], [claude, '/new-runtime', { kind: 'directory', source: claude }]);
});

// HLD 3.7 (G-01, phase 5d2b): the gate's one-click update, run by the launcher.
test('with the user\'s agreement the gate updates the Agent it stopped at and checks again; never for another Agent or a restart job', async t => {
  const w = await world(t);
  const codex = await w.install('codex', '0.11.0'); await w.install('claude', '0.10.2');
  const env = { ...w.env, SKILLDOCK_STATE_DIR: w.state };
  const updates = []; const notes = [];
  const replace = async version => { await fs.rm(path.join(w.claudeConfig, 'plugins/cache', MARKET, 'skilldock', 'sha-0.10.2'), { recursive: true }); await w.install('claude', version); };
  const update = async request => { updates.push(request); await replace('0.11.0'); return { message: '已更新。' }; };
  const plan = options => planLaunch({ action: 'start', home: w.home, appDir: codex, update, log: note => notes.push(note), ...options, env: { ...env, ...options.env } });
  assert.equal((await plan({ env: { SKILLDOCK_UPDATE_AGENT: 'codex' } })).kind, 'error', '只更新被门槛拦下的一侧');
  assert.equal((await plan({ action: 'restart', env: { SKILLDOCK_UPDATE_AGENT: 'claude', SKILLDOCK_RESTART_JOB: 'j' } })).kind, 'error', '重启任务不更新');
  assert.equal(updates.length, 0);
  const passed = await plan({ env: { SKILLDOCK_UPDATE_AGENT: 'claude' } });
  assert.deepEqual([passed.kind, passed.gateChecked], ['continue', true]);
  assert.deepEqual([updates[0].agent, updates[0].marketplace, updates[0].state, updates[0].claudeRoot.configDir], ['claude', MARKET, w.state, w.claudeConfig]);
  assert.deepEqual(notes, ['已更新。']);
});

test('a gate update that brings a newer member runs it instead; a failed one says why, with the steps (G-01)', async t => {
  const w = await world(t);
  const codex = await w.install('codex', '0.11.0'); await w.install('claude', '0.10.2');
  const env = { ...w.env, SKILLDOCK_STATE_DIR: w.state, SKILLDOCK_UPDATE_AGENT: 'claude' };
  const newer = async () => { await fs.rm(path.join(w.claudeConfig, 'plugins/cache', MARKET, 'skilldock', 'sha-0.10.2'), { recursive: true }); await w.install('claude', '0.11.1'); return { message: 'ok' }; };
  const failed = await planLaunch({ action: 'start', env, home: w.home, appDir: codex, log() {}, update: async () => { throw Object.assign(new Error('Claude 中的 SkillDock 更新失败（offline）。\n手动步骤'), { code: 'SKILLDOCK_UPDATE_FAILED' }); } });
  assert.deepEqual([failed.kind, failed.error.exitCode, failed.error.output.status], ['error', 4, 'migration-blocked']);
  assert.match(failed.error.message, /^一键更新没有完成：Claude 中的 SkillDock 更新失败（offline）。\n手动步骤$/); assert.ok(failed.error.output.steps.length > 1, '仍附处理步骤');
  const delegated = await planLaunch({ action: 'start', env, home: w.home, appDir: codex, log() {}, update: newer });
  assert.deepEqual([delegated.kind, delegated.target.agent, delegated.target.version], ['delegate', 'claude', '0.11.1']);
});

test('the gate update runs that Agent\'s own commands under the launch lock and reads the version back (G-01)', async t => {
  const w = await world(t);
  const calls = path.join(w.root, 'calls'); const listed = path.join(w.root, 'listed.json'); const next = path.join(w.root, 'next.json');
  const entry = version => JSON.stringify({ installed: [{ name: 'skilldock', marketplaceName: MARKET, version }] });
  await fs.writeFile(listed, entry('0.10.2')); await fs.writeFile(next, entry('0.11.0'));
  const cli = path.join(w.root, 'codex-stand-in');
  await fs.writeFile(cli, `#!/bin/sh\necho "$*" >> '${calls}'\ncase "$1 $2" in\n"--version ") echo "codex-cli 0.200.0" ;;\n"plugin --help") echo "list marketplace" ;;\n"plugin list") cat '${listed}' ;;\n"plugin add") cp '${next}' '${listed}' ;;\nesac\n`, { mode: 0o755 });
  const request = { agent: 'codex', marketplace: MARKET, state: w.state, codexHome: w.codexHome, claudeRoot: { configDir: w.claudeConfig }, env: { ...w.env, SKILLDOCK_CODEX_BIN: cli }, home: w.home };
  const held = acquireFileLock(path.join(w.state, 'launcher.lock'));
  try { await assert.rejects(gateUpdate(request), { code: 'BUSY' }, '启动锁被占用时不更新'); } finally { held(); }
  const result = await gateUpdate(request);
  assert.deepEqual([result.from, result.to], ['0.10.2', '0.11.0']);
  const ran = (await fs.readFile(calls, 'utf8')).split('\n').filter(line => line.startsWith('plugin') && !line.includes('--help'));
  assert.deepEqual(ran, ['plugin list --json', `plugin marketplace upgrade ${MARKET} --json`, `plugin add skilldock@${MARKET} --json`, 'plugin list --json']);
  await assert.rejects(gateUpdate({ ...request, env: w.env }), error => error.code === 'CLI_UNAVAILABLE' && /\n在 Codex 的插件页更新 SkillDock/.test(error.message));
});
