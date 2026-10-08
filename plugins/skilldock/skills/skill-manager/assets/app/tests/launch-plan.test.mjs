// SPDX-License-Identifier: AGPL-3.0-only
// 0.11 launch planning: project fallback (36b §6.3), 0.10.x record ownership (HLD 3.7),
// delegation (DEC-SDX-008) and the version-2 health check (36c §4).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { resolveLaunchProject } from '../server/project-context.mjs';
import { installationContext, delegationTarget, legacyOwnership, planLaunch, refreshInstallations } from '../server/launch-plan.mjs';
import { buildRecord, legacyFields, ensureLegacyProject, writeRecord, readRecord } from '../server/launcher-record.mjs';
import { writeRestart } from '../server/installation.mjs';
import { writeMigrationFailure } from '../server/migration.mjs';
import { acquireFileLock } from '../server/process-lock.mjs';
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
  return { root, home, codexHome, claudeConfig, state, project, install, env: { HOME: home } };
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
  const claudeOld = path.join(w.claudeConfig, 'plugins/cache', MARKET, 'skilldock/sha-0.10.2/skills/skill-manager/assets/app');
  assert.equal(await legacyOwnership({ source: claudeOld, installation: { kind: 'directory', source: claudeOld } }, context), 'claude-legacy');
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
  const plan = await planLaunch({ action: 'start', env: { SKILLDOCK_STATE_DIR: w.state }, home: w.home, appDir: codex });
  assert.deepEqual([plan.kind, plan.error.exitCode, plan.error.output.status], ['error', 3, 'update-required']);
  assert.equal((await planLaunch({ action: 'doctor', env: { SKILLDOCK_STATE_DIR: w.state }, home: w.home, appDir: codex })).kind, 'continue');
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
  const env = { SKILLDOCK_STATE_DIR: w.state };
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
