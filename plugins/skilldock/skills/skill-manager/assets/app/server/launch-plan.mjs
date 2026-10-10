// SPDX-License-Identifier: AGPL-3.0-only
// Bootstrap-safe launch planning shared by scripts/bootstrap.mjs and scripts/launch.mjs:
// which installations exist, which one should run (DEC-SDX-008), and whether this
// launcher hands over to a newer one before any toolchain work.
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { agentRoots, discoverInstalls, locate, inspect, selectRunSource, reference, compareVersions, parseVersion, atLeast, safeSegment, readJsonFile, readText, canonical, sourceKeyFor, within, absolute, APP_TAIL } from './installs.mjs';
import { installationIdentity, sameInstallation } from './installation.mjs';
import { readGeneration, CURRENT_GENERATION, CURRENT_GENERATION_MINIMUM } from './generation.mjs';
import { isCurrentRecord, refreshRecord, writeRecord } from './launcher-record.mjs';
import { acquireFileLock } from './process-lock.mjs';
import { withStateLocks } from './state-locks.mjs';
import { resolveClaudeRoot } from './claude-root.mjs';
import { migrationGate, gateGuidance, repeatedFailure } from './migration.mjs';
import { commandLineGateEvidence, gateUpdate } from './gate-cli.mjs';

export const EXIT_UPDATE_REQUIRED = 3;
export const EXIT_MIGRATION_BLOCKED = 4;

/**
 * Readable lines for stderr (36b §6.3: a non-zero exit writes nothing to stdout). The
 * structured `output` stays on the error for in-process callers.
 */
export function failureText(error) {
  const steps = error.output?.steps ?? [];
  return [`SkillDock：${error.message}`, ...(steps.length ? ['SkillDock：处理步骤：', ...steps.map((step, index) => `  ${index + 1}. ${step}`)] : [])].join('\n') + '\n';
}

/** Exit 3: the data belongs to a newer release (36a §4). */
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

/** DEC-SDX-008 preferred target once `runningAppPath` runs: ties keep the running source. */
export const preferredWhenRunning = (context, runningAppPath) => reference(selectRunSource(context.family, { runningAppPath }) ?? context.own);

/**
 * HLD 3.7: when SkillDock installations change, the service and the background check
 * refresh the record's preferred target and (Codex side) legacy fields under the locks.
 * The running installation is left alone. Busy locks skip this round.
 */
export async function refreshInstallations({ state, codexHome, env = process.env, home = os.homedir(), appDir, instance }) {
  const record = await readRecordQuietly(state);
  if (!isCurrentRecord(record)) return null;
  const context = await installationContext({ env, home, state, appDir, record, codexHome });
  let next = await refreshRecord(record, { codexHome, installs: context.installs, preferred: context.preferred });
  // 36a §5.3: a project switched inside the running instance is its actual project.
  if (instance && record.pid === instance.pid && record.status === 'running' && instance.project && record.actualProject !== instance.project)
    next = { ...next, actualProject: instance.project, updatedAt: new Date().toISOString() };
  if (next === record) return null;
  // A launch in progress (launcher.lock) compares the record before switching; leave it alone.
  let launching;
  try {
    launching = acquireFileLock(path.join(state, 'launcher.lock'));
    return await withStateLocks(state, codexHome, async () => {
      if (JSON.stringify(await readRecordQuietly(state)) !== JSON.stringify(record)) return null;
      return writeRecord(state, next);
    }, { wait: 0 });
  } catch { return null; } finally { launching?.(); }
}

/**
 * HLD 3.8 (generation 2): the running family's installations on either side, and the highest
 * one that reads the current data (`best`, null when none does). Null when the record names
 * no installed family: a development copy, or no current record.
 */
export async function backgroundFamily({ state, codexHome, env = process.env, home = os.homedir() }) {
  const record = await readRecordQuietly(state);
  const running = isCurrentRecord(record) && record.state === state ? record.running : null;
  if (!running?.sourceKey) return null;
  const claudeRoot = await resolveClaudeRoot({ state, env, home });
  const roots = await agentRoots({ env: { ...env, CODEX_HOME: codexHome }, home, claudeRoot: { configDir: claudeRoot.configDir, pluginCacheDir: claudeRoot.pluginCacheDir }, record });
  const family = (await discoverInstalls(roots)).filter(item => item.marketplace === running.marketplace && item.sourceKey === running.sourceKey);
  return { family, best: selectRunSource(family.filter(item => atLeast(item.version, CURRENT_GENERATION_MINIMUM)), { runningAppPath: running.appPath }) };
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

/**
 * Generation-1 data (HLD 3.7; 36b §7.4): the gate, and for a restart job the fast reject
 * of a target whose migration failed before. Returns the error to stop with, or null.
 * A restart job gets no guidance object: it is not interactive.
 */
export async function migrationCheck({ state, context, restartJob, env = process.env, home = os.homedir(), codexHome, commandLines = true,
  log = note => process.stderr.write(`SkillDock：${note}\n`) }) {
  if (await readGeneration(state) >= CURRENT_GENERATION) return null;
  const gate = await migrationGate(context.roots);
  // 36b §7.4: a restart job for a target whose takeover failed is refused before any
  // Agent command line runs (0.10.x coordinators retry and wait on every attempt).
  const failure = gate.passed && restartJob && await repeatedFailure(state, { appDir: context.own.appPath, version: context.own.version });
  if (failure) return Object.assign(new Error(`上次迁移到 SkillDock ${failure.version} 失败，已恢复旧版本；后台重启不再自动重试。请从 SkillDock 入口重新打开以重试。`), { code: 'MIGRATION_FAILED_BEFORE', exitCode: EXIT_MIGRATION_BLOCKED });
  // File evidence first; the command lines confirm only what it lets through (36b §7.4).
  if (gate.passed && commandLines) {
    const confirmed = await commandLineGateEvidence({ codexHome: codexHome ?? context.roots.caches.find(cache => cache.agent === 'codex')?.home,
      claudeRoot: context.claudeRoot, state, env, home });
    for (const note of confirmed.notes) log(note);
    gate.blockers.push(...confirmed.blockers);
    gate.passed = !gate.blockers.length;
  }
  if (!gate.passed) {
    const guidance = gateGuidance(gate);
    return Object.assign(new Error(guidance.message), { code: 'MIGRATION_BLOCKED', exitCode: EXIT_MIGRATION_BLOCKED, ...(restartJob ? {} : { output: guidance }) });
  }
  return null;
}

/**
 * Bootstrap-time planning, before any toolchain work: newer data stops here, a newer
 * installation of the family runs instead, and generation-1 data passes the gate first.
 */
export async function planLaunch({ action, env = process.env, home = os.homedir(), appDir, update = gateUpdate, log = note => process.stderr.write(`SkillDock：${note}\n`) }) {
  if (!['start', 'restart', 'status', 'stop'].includes(action)) return { kind: 'continue' };
  const state = await canonical(path.resolve(env.SKILLDOCK_STATE_DIR || path.join(home, '.local/share/skilldock')));
  const generation = await readGeneration(state);
  if (generation > CURRENT_GENERATION) return { kind: 'error', error: newerDataError(generation) };
  const record = await readRecordQuietly(state);
  // 36b 6.3: without CODEX_HOME the Codex home saved in the record is used.
  const codexHome = env.CODEX_HOME || (absolute(record?.codexHome) ? record.codexHome : undefined);
  const context = await installationContext({ env, home, state, appDir, record, codexHome });
  const target = delegationTarget(context, { action, env });
  if (target) return { kind: 'delegate', target, state };
  const gated = ['start', 'restart'].includes(action) && generation < CURRENT_GENERATION;
  let blocked = gated && await migrationCheck({ state, context, restartJob: env.SKILLDOCK_RESTART_JOB, env, home, codexHome });
  // HLD 3.7 (G-01): an interactive entry that has the user's agreement names the Agent the gate
  // stopped at; its SkillDock is updated, then the gate is checked again. Never for a restart job.
  const blocker = blocked?.code === 'MIGRATION_BLOCKED' && !env.SKILLDOCK_RESTART_JOB && blocked.output?.blockers?.find(item => item.agent === env.SKILLDOCK_UPDATE_AGENT);
  if (blocker) {
    try {
      log((await update({ agent: blocker.agent, marketplace: blocker.marketplace, state, codexHome: codexHome ?? context.roots.caches.find(cache => cache.agent === 'codex')?.home ?? path.join(home, '.codex'),
        claudeRoot: context.claudeRoot, env, home })).message);
    } catch (error) {
      const message = `一键更新没有完成：${error.message}`;
      return { kind: 'error', error: Object.assign(new Error(message), { code: 'MIGRATION_BLOCKED', exitCode: EXIT_MIGRATION_BLOCKED, output: { ...blocked.output, message } }) };
    }
    blocked = await migrationCheck({ state, context, env, home, codexHome });
    // The updated side may now hold a newer member of the family, which runs instead.
    const refreshed = !blocked && await installationContext({ env, home, state, appDir, record, codexHome });
    const newer = refreshed && delegationTarget(refreshed, { action, env });
    if (newer) return { kind: 'delegate', target: newer, state };
  }
  return blocked ? { kind: 'error', error: blocked } : { kind: 'continue', state, context, gateChecked: gated };
}

/**
 * Ownership of a 0.10.x record (HLD 3.7; 36a §5). Returns `family` for a record of the
 * same marketplace name, plugin and source identity (DEC-SDX-007) — a Codex plugin
 * record, or a directory-form record inside a Claude plugin cache whose installation is
 * gone, orphaned or at least 0.10.3 (a stale record, taken over like any 0.10.x one);
 * `claude-legacy` while that Claude installation is still in use and older than 0.10.3,
 * or its package exists but cannot be read; `claude-unverified` when its source identity
 * cannot be read (the marketplace was removed from Claude, or the record lies in a Claude
 * cache whose configuration directory is not visible from here); `testany-eng` for the
 * old testany-eng plugin of the same Codex marketplace when explicitly requested;
 * otherwise null.
 */
export async function legacyOwnership(record, context, options) {
  return (await legacyOwnershipDetail(record, context, options)).owner;
}

/**
 * `legacyOwnership` with what a refusal needs to explain itself: the version found, the
 * package that could not be read, or the configuration directory that is not visible.
 */
export async function legacyOwnershipDetail(record, context, { migrateFrom } = {}) {
  const installation = record.installation;
  if (installation?.kind === 'plugin') {
    const current = await installationIdentity(record.source, installation.codexHome, { expected: installation });
    if (!sameInstallation(current, installation) || current.appPath !== APP_TAIL.join('/')) return { owner: null };
    if (current.plugin === 'skilldock' && context.owner && current.marketplace === context.owner.marketplace
      && await sourceKeyFor({ agent: 'codex', home: current.codexHome, marketplace: current.marketplace }) === context.owner.key) return { owner: 'family' };
    const own = context.own;
    if (migrateFrom === 'testany-eng' && current.plugin === 'testany-eng' && current.marketplace === 'testany-agent-skills'
      && own.agent === 'codex' && !own.development && own.marketplace === current.marketplace && own.home === current.codexHome) return { owner: 'testany-eng' };
    return { owner: null };
  }
  const source = absolute(record.source) ? await canonical(record.source) : null;
  if (!source) return { owner: null };
  for (const cache of context.roots.caches) {
    const cacheDir = await canonical(cache.cacheDir);
    if (!within(cacheDir, source)) continue;
    // A directory-form record in a Codex cache is not a Claude installation.
    if (cache.agent !== 'claude') return { owner: null };
    const segments = path.relative(cacheDir, source).split(path.sep);
    const [marketplace, plugin, versionName] = segments;
    if (segments.length !== 7 || plugin !== 'skilldock' || ![marketplace, versionName].every(safeSegment) || segments.slice(3).join('/') !== APP_TAIL.join('/')) return { owner: null };
    const versionDir = path.join(cacheDir, marketplace, 'skilldock', versionName);
    const orphaned = await readText(path.join(versionDir, '.orphaned_at')) !== undefined;
    // As in the gate: a package that exists but cannot be read may be an old installation
    // still in use; one that is not JSON is not an installation.
    const packageFile = path.join(source, 'package.json');
    const text = await readText(packageFile);
    let version;
    if (typeof text === 'string') { try { version = JSON.parse(text)?.version; } catch { /* not an installation */ } }
    if (!orphaned && text === null) return { owner: 'claude-legacy', unreadable: packageFile };
    if (!orphaned && parseVersion(version) && !atLeast(version, '0.10.3')) return { owner: 'claude-legacy', version };
    if (!context.owner || marketplace !== context.owner.marketplace) return { owner: null };
    const key = await sourceKeyFor({ agent: 'claude', configDir: cache.configDir, marketplace });
    // The marketplace is gone from Claude, or its configuration cannot be seen from here.
    if (!key) return { owner: 'claude-unverified', reason: 'marketplace' };
    return { owner: key === context.owner.key ? 'family' : null };
  }
  // The plugin-cache layout of this installation's marketplace under a root this process
  // does not know: typically Claude with a custom configuration directory, seen from the
  // Codex side. Refused like any unverifiable record, with the directory named.
  const parts = source.split(path.sep);
  const [plugins, cacheName, marketplace, plugin, versionName] = parts.slice(-APP_TAIL.length - 5, -APP_TAIL.length);
  if (parts.slice(-APP_TAIL.length).join('/') === APP_TAIL.join('/') && plugins === 'plugins' && cacheName === 'cache' && plugin === 'skilldock'
    && [marketplace, versionName].every(safeSegment) && context.owner && marketplace === context.owner.marketplace)
    return { owner: 'claude-unverified', reason: 'configuration', configDir: parts.slice(0, -APP_TAIL.length - 5).join(path.sep) || path.sep };
  return { owner: null };
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
