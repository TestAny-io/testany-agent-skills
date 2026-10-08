// SPDX-License-Identifier: AGPL-3.0-only
// Bootstrap-safe launch planning shared by scripts/bootstrap.mjs and scripts/launch.mjs:
// which installations exist, which one should run (DEC-SDX-008), and whether this
// launcher hands over to a newer one before any toolchain work.
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { agentRoots, discoverInstalls, locate, inspect, selectRunSource, reference, compareVersions, parseVersion, readJsonFile, readText, canonical, sourceKeyFor, within, APP_TAIL } from './installs.mjs';
import { installationIdentity, sameInstallation } from './installation.mjs';
import { readGeneration, CURRENT_GENERATION } from './generation.mjs';
import { isCurrentRecord } from './launcher-record.mjs';
import { resolveClaudeRoot } from './claude-root.mjs';

export const EXIT_UPDATE_REQUIRED = 3;
export const EXIT_MIGRATION_BLOCKED = 4;

/** Exit 3 with the 0.10.3-compatible update-required shape (API-SDX-001 36b §10.3). */
export function newerDataError(generation) {
  const message = `SkillDock 的数据已由更高版本（数据代号 ${Number.isFinite(generation) ? generation : '未知'}）管理。请把本侧 SkillDock 更新到最新版本后重新打开。`;
  return Object.assign(new Error(message), { code: 'DATA_GENERATION_NEWER', exitCode: EXIT_UPDATE_REQUIRED, output: { status: 'update-required', message } });
}

async function readRecordQuietly(state) {
  const text = await readText(path.join(state, 'launcher.json'));
  if (typeof text !== 'string') return null;
  try { return JSON.parse(text); } catch { return null; }
}

/**
 * Installations known to this launcher. `own` is this installation (inspected when it
 * lives in a plugin cache, otherwise a development copy), `family` the installations of
 * the same marketplace name and source identity (DEC-SDX-007).
 */
export async function installationContext({ env = process.env, home = os.homedir(), state, appDir, record, codexHome }) {
  const claudeRoot = await resolveClaudeRoot({ state, env, home });
  const roots = await agentRoots({ env: codexHome ? { ...env, CODEX_HOME: codexHome } : env, home, claudeRoot: { configDir: claudeRoot.configDir, pluginCacheDir: claudeRoot.pluginCacheDir }, record: isCurrentRecord(record) ? record : null });
  const installs = await discoverInstalls(roots);
  const real = await canonical(appDir);
  const located = await locate(real, roots);
  const inspected = located && await inspect(located);
  const pkg = await readJsonFile(path.join(real, 'package.json'));
  const own = inspected || { agent: located?.agent ?? 'codex', marketplace: located?.marketplace ?? 'local', appPath: real, version: pkg?.version ?? '0.0.0', sourceKey: null, development: true };
  const owner = own.sourceKey ? { marketplace: own.marketplace, key: own.sourceKey } : null;
  const family = owner ? installs.filter(item => item.marketplace === owner.marketplace && item.sourceKey === owner.key) : [];
  const best = selectRunSource(family, { runningAppPath: isCurrentRecord(record) ? record.running?.appPath : undefined });
  return { claudeRoot, roots, installs, own, owner, family, best, ownReference: reference(own), preferred: reference(best ?? own) };
}

/** Health check summary of installations (36c §4): no paths or credentials. */
export async function installationSummary({ env = process.env, home = os.homedir(), state, appDir }) {
  const context = await installationContext({ env, home, state, appDir, record: await readRecordQuietly(state) });
  return context.installs.map(item => ({ agent: item.agent, marketplace: item.marketplace, version: item.version, running: item.appPath === context.own.appPath }))
    .sort((a, b) => a.agent.localeCompare(b.agent) || a.marketplace.localeCompare(b.marketplace) || compareVersions(parseVersion(a.version), parseVersion(b.version)));
}

/**
 * A strictly newer installation of the same family runs instead of this one. Only start
 * and restart hand over; a restart job is bound to its own source (36b §7.4).
 */
export function delegationTarget(context, { action, env = process.env, restartJob } = {}) {
  if (!['start', 'restart'].includes(action) || restartJob || env.SKILLDOCK_RESTART_JOB) return null;
  if (env.SKILLDOCK_DELEGATED === '1' || !context.best || context.best.appPath === context.own.appPath) return null;
  const best = parseVersion(context.best.version); const own = parseVersion(context.own.version);
  return best && own && compareVersions(best, own) > 0 ? context.best : null;
}

/** Bootstrap-time planning: generation guard and delegation, before any toolchain work. */
export async function planLaunch({ action, env = process.env, home = os.homedir(), appDir }) {
  if (!['start', 'restart', 'status', 'stop'].includes(action)) return { kind: 'continue' };
  const state = await canonical(path.resolve(env.SKILLDOCK_STATE_DIR || path.join(home, '.local/share/skilldock')));
  const generation = await readGeneration(state);
  if (generation > CURRENT_GENERATION) return { kind: 'error', error: newerDataError(generation) };
  const context = await installationContext({ env, home, state, appDir, record: await readRecordQuietly(state) });
  const target = delegationTarget(context, { action, env });
  return target ? { kind: 'delegate', target, state } : { kind: 'continue', state, context };
}

/**
 * Ownership of a 0.10.x record (HLD 3.7; 36a §5). Returns `family` for a Codex plugin
 * record of the same marketplace name, plugin and source identity (DEC-SDX-007),
 * `testany-eng` for the old testany-eng plugin of the same Codex marketplace when
 * explicitly requested, `claude-legacy` for a directory-form record inside a Claude
 * plugin cache (a SkillDock older than 0.10.3 on the Claude side), otherwise null.
 */
export async function legacyOwnership(record, context, { migrateFrom } = {}) {
  const installation = record.installation;
  if (installation?.kind === 'plugin') {
    const current = await installationIdentity(record.source, installation.codexHome, { expected: installation });
    if (!sameInstallation(current, installation) || current.appPath !== APP_TAIL.join('/')) return null;
    if (current.plugin === 'skilldock' && context.owner && current.marketplace === context.owner.marketplace
      && await sourceKeyFor({ agent: 'codex', home: current.codexHome, marketplace: current.marketplace }) === context.owner.key) return 'family';
    const own = context.own;
    if (migrateFrom === 'testany-eng' && current.plugin === 'testany-eng' && current.marketplace === 'testany-agent-skills'
      && own.agent === 'codex' && !own.development && own.marketplace === current.marketplace && own.home === current.codexHome) return 'testany-eng';
    return null;
  }
  const source = typeof record.source === 'string' ? await canonical(record.source) : null;
  if (!source) return null;
  for (const cache of context.roots.caches) {
    if (cache.agent === 'claude' && within(await canonical(cache.cacheDir), source)) return 'claude-legacy';
  }
  return null;
}

/** Runs the newer installation's launcher with the same arguments (36b §6.3 obligations apply to it). */
export function delegate(target, args, { env = process.env, stdio = 'inherit' } = {}) {
  return new Promise(resolve => {
    const child = spawn('/bin/sh', [path.join(target.skillRoot, 'scripts/launch.sh'), ...args], {
      env: { ...env, SKILLDOCK_DELEGATED: '1' }, stdio: ['ignore', stdio, stdio], shell: false });
    const forward = signal => { try { child.kill(signal); } catch { /* exited */ } };
    process.on('SIGINT', forward); process.on('SIGTERM', forward);
    const done = code => { process.off('SIGINT', forward); process.off('SIGTERM', forward); resolve(code ?? 1); };
    child.once('error', () => done(1)); child.once('exit', done);
  });
}
