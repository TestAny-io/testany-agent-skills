// SPDX-License-Identifier: AGPL-3.0-only
// Bootstrap-safe: runs before any toolchain is selected, so it may import only
// Node built-ins. Implements the 0.10.3 transfer chain defined by API-SDX-001
// (references/36b-launcher-handover-protocol.md, 36a-cross-version-file-formats.md).
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';

export const HANDOVER_FROM = '0.10.3';
const MINIMUM = [0, 11, 0];
const FORWARDED = new Set(['start', 'restart', 'status', 'stop']);
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$/;
const APP_TAIL = ['skills', 'skill-manager', 'assets', 'app'];

const safeSegment = value => typeof value === 'string' && SEGMENT.test(value) && !['__proto__', 'prototype', 'constructor'].includes(value);
const absolute = value => typeof value === 'string' && path.isAbsolute(value) && value.length <= 4096 && !/[\x00-\x1f]/.test(value);
const within = (root, target) => { const relative = path.relative(root, target); return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative)); };
const redactUrl = value => String(value).replace(/((?:https?|ssh):\/\/)[^\s/@]+@/gi, '$1[redacted]@');

export function parseVersion(value) {
  return typeof value === 'string' && /^\d+\.\d+\.\d+$/.test(value) ? value.split('.').map(Number) : null;
}
export function compareVersions(left, right) {
  for (let index = 0; index < 3; index++) if (left[index] !== right[index]) return left[index] < right[index] ? -1 : 1;
  return 0;
}
const atLeastMinimum = version => { const parsed = parseVersion(version); return !!parsed && compareVersions(parsed, MINIMUM) >= 0; };

async function canonical(value) {
  try { return await fs.realpath(value); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const parent = path.dirname(value);
    return parent === value ? value : path.join(await canonical(parent), path.basename(value));
  }
}
async function realOrNull(value) { try { return await fs.realpath(value); } catch { return null; } }
// undefined: absent; null: present but unreadable.
async function readText(file, limit = 1024 * 1024) {
  try {
    const handle = await fs.open(file, 'r');
    try { const { size } = await handle.stat(); if (size > limit) return null; return await handle.readFile('utf8'); }
    finally { await handle.close(); }
  } catch (error) { return error.code === 'ENOENT' ? undefined : null; }
}
async function readJson(file) {
  const text = await readText(file);
  if (typeof text !== 'string') return text;
  try { return JSON.parse(text); } catch { return null; }
}

export async function stateDirectory(env = process.env, home = os.homedir()) {
  return canonical(path.resolve(env.SKILLDOCK_STATE_DIR || path.join(home, '.local/share/skilldock')));
}

// 36a §4: absent → 1; unreadable or malformed → treated as newer (never take over).
export async function readGeneration(state) {
  const text = await readText(path.join(state, 'generation.json'));
  if (text === undefined) return 1;
  try { const value = JSON.parse(text); if (Number.isInteger(value?.generation)) return value.generation; } catch { /* treated as newer */ }
  return Number.POSITIVE_INFINITY;
}

// 36a §5.3: a parseable record with format ≥ 2 was written by 0.11.x. An unreadable
// record alone does not trigger the chain; 0.10.2's own error handling applies.
export async function readLauncherRecord(state) {
  const text = await readText(path.join(state, 'launcher.json'));
  if (text === undefined) return { exists: false, newer: false };
  if (text === null) return { exists: true, newer: false, unreadable: true };
  try {
    const value = JSON.parse(text);
    return { exists: true, value, newer: Number.isInteger(value?.format) && value.format >= 2 };
  } catch { return { exists: true, newer: false, unreadable: true }; }
}

export async function handoverState(state) {
  const [generation, record] = await Promise.all([readGeneration(state), readLauncherRecord(state)]);
  return { generation, record, triggered: generation >= 2 || record.newer };
}

// 36a §9.3
export function normalizeGitSource(value) {
  if (typeof value !== 'string' || !value || value.length > 2048 || /[\s\x00-\x1f?#%]/.test(value)) return null;
  let match = /^(?:https?|ssh):\/\/(?:[^@/]*@)?([^/:@]+)(?::\d+)?\/(.+)$/i.exec(value);
  if (!match && !/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(value)) match = /^(?:[^@/:]+@)?([^/:@]+):(?!\/)(.+)$/.exec(value);
  if (!match) return null;
  const host = match[1].toLowerCase();
  let route = match[2].replace(/\/+$/, '').replace(/\.git$/i, '').replace(/\/+$/, '').replace(/^\/+/, '');
  if (!route || route.split('/').some(segment => !segment || segment === '.' || segment === '..')) return null;
  if (host === 'github.com') route = route.toLowerCase();
  return `${host}/${route}`;
}
export function codexSourceKey(entry) {
  return entry?.source_type === 'git' ? normalizeGitSource(entry.source) : null;
}
export function claudeSourceKey(source) {
  if (source?.source === 'github' && typeof source.repo === 'string' && /^[^/\s]+\/[^/\s]+$/.test(source.repo)) return normalizeGitSource(`https://github.com/${source.repo}`);
  if (source?.source === 'git') return normalizeGitSource(source.url);
  return null;
}

// 36a §9.1: reads only `source_type` and `source` from `[marketplaces.<name>]`.
export function codexMarketplaceEntry(text, name) {
  const headers = new Set([`[marketplaces.${name}]`, `[marketplaces."${name}"]`]);
  const entry = {}; let active = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('[')) { active = headers.has(line.replace(/\s+#.*$/, '').replace(/\s+/g, '')); continue; }
    if (!active || !line || line.startsWith('#')) continue;
    const match = /^(source_type|source)\s*=\s*("(?:[^"\\]|\\.)*"|'[^']*')\s*(?:#.*)?$/.exec(line);
    if (!match) continue;
    try { entry[match[1]] = match[2].startsWith('"') ? JSON.parse(match[2]) : match[2].slice(1, -1); }
    catch { return null; }
  }
  return entry;
}

async function sourceKeyFor(install) {
  if (install.agent === 'codex') {
    const text = await readText(path.join(install.home, 'config.toml'));
    return typeof text === 'string' ? codexSourceKey(codexMarketplaceEntry(text, install.marketplace)) : null;
  }
  if (!install.configDir) return null;
  const known = await readJson(path.join(install.configDir, 'plugins/known_marketplaces.json'));
  return known && typeof known === 'object' && Object.hasOwn(known, install.marketplace) ? claudeSourceKey(known[install.marketplace]?.source) : null;
}

// 36b §5.1
export async function agentRoots({ env = process.env, home = os.homedir(), state, record } = {}) {
  const codex = []; const claude = [];
  const pushCodex = async value => { if (absolute(value)) { const root = await canonical(value); if (!codex.includes(root)) codex.push(root); } };
  const pushClaude = async (configDir, cacheDir) => {
    if (!absolute(cacheDir) || (configDir !== null && !absolute(configDir))) return;
    const pair = { configDir: configDir === null ? null : await canonical(configDir), cacheDir: await canonical(cacheDir) };
    if (!claude.some(item => item.cacheDir === pair.cacheDir && item.configDir === pair.configDir)) claude.push(pair);
  };
  await pushCodex(env.CODEX_HOME);
  await pushCodex(path.join(home, '.codex'));
  const saved = state ? await readJson(path.join(state, 'agents/claude-root.json')) : undefined;
  if (saved && saved.format === 1 && absolute(saved.configDir) && absolute(saved.pluginCacheDir)) await pushClaude(saved.configDir, saved.pluginCacheDir);
  if (absolute(env.CLAUDE_CONFIG_DIR)) await pushClaude(env.CLAUDE_CONFIG_DIR, absolute(env.CLAUDE_CODE_PLUGIN_CACHE_DIR) ? env.CLAUDE_CODE_PLUGIN_CACHE_DIR : path.join(env.CLAUDE_CONFIG_DIR, 'plugins/cache'));
  else if (absolute(env.CLAUDE_CODE_PLUGIN_CACHE_DIR)) await pushClaude(path.join(home, '.claude'), env.CLAUDE_CODE_PLUGIN_CACHE_DIR);
  await pushClaude(path.join(home, '.claude'), path.join(home, '.claude/plugins/cache'));
  for (const reference of [record?.running, record?.preferred]) {
    if (!reference || typeof reference !== 'object' || !absolute(reference.appPath)) continue;
    const parts = path.resolve(reference.appPath).split(path.sep);
    if (reference.agent === 'codex' && parts.length > 10 && parts.at(-9) === 'plugins' && parts.at(-8) === 'cache' && parts.at(-6) === 'skilldock')
      await pushCodex(parts.slice(0, -9).join(path.sep) || path.sep);
    if (reference.agent === 'claude' && parts.length > 8 && parts.at(-6) === 'skilldock') {
      const cacheDir = parts.slice(0, -7).join(path.sep) || path.sep;
      const nested = cacheDir.split(path.sep);
      await pushClaude(nested.at(-1) === 'cache' && nested.at(-2) === 'plugins' ? nested.slice(0, -2).join(path.sep) || path.sep : null, cacheDir);
    }
  }
  return {
    caches: [
      ...codex.map(home => ({ agent: 'codex', home, cacheDir: path.join(home, 'plugins/cache') })),
      ...claude.map(pair => ({ agent: 'claude', configDir: pair.configDir, cacheDir: pair.cacheDir })),
    ],
  };
}

// 36a §10.1: <cacheDir>/<marketplace>/skilldock/<version dir>/skills/skill-manager/assets/app
async function locate(appPath, roots) {
  const real = await realOrNull(appPath);
  if (!real) return null;
  for (const cache of roots.caches) {
    const cacheReal = await realOrNull(cache.cacheDir);
    if (!cacheReal || !within(cacheReal, real)) continue;
    const segments = path.relative(cacheReal, real).split(path.sep);
    if (segments.length !== 7 || segments[1] !== 'skilldock' || !safeSegment(segments[0]) || !safeSegment(segments[2])
      || segments.slice(3).join('/') !== APP_TAIL.join('/')) continue;
    const versionDir = path.join(cacheReal, segments[0], 'skilldock', segments[2]);
    return { ...cache, cacheReal, marketplace: segments[0], versionName: segments[2], versionDir, appPath: real, skillRoot: path.join(versionDir, 'skills/skill-manager') };
  }
  return null;
}

// 36a §10.2 conditions 2–6; condition 1 is enforced by locate().
async function inspect(install, own) {
  try {
    if ((await readText(path.join(install.versionDir, '.orphaned_at'))) !== undefined) return null;
    const pkg = await readJson(path.join(install.appPath, 'package.json'));
    if (!pkg || pkg.name !== 'skilldock' || !atLeastMinimum(pkg.version)) return null;
    if (install.agent === 'codex') {
      const manifest = await readJson(path.join(install.versionDir, '.codex-plugin/plugin.json'));
      if (!manifest || manifest.name !== 'skilldock' || manifest.version !== install.versionName) return null;
    }
    const script = await fs.lstat(path.join(install.skillRoot, 'scripts/launch.sh'));
    if (!script.isFile()) return null;
    if (own) {
      if (install.marketplace !== own.marketplace) return null;
      const key = await sourceKeyFor(install); if (!key || key !== own.key) return null;
    }
    return { ...install, version: pkg.version };
  } catch { return null; }
}

async function enumerate(cache) {
  const found = [];
  const cacheReal = await realOrNull(cache.cacheDir);
  if (!cacheReal) return found;
  let markets = [];
  try { markets = await fs.readdir(cacheReal); } catch { return found; }
  for (const market of markets.filter(safeSegment)) {
    let versions = [];
    try { versions = await fs.readdir(path.join(cacheReal, market, 'skilldock')); } catch { continue; }
    for (const version of versions.filter(safeSegment)) found.push(path.join(cacheReal, market, 'skilldock', version, ...APP_TAIL));
  }
  return found;
}

const best = (installs, ownAgent) => installs.sort((a, b) =>
  compareVersions(parseVersion(b.version), parseVersion(a.version))
  || Number(b.agent === ownAgent) - Number(a.agent === ownAgent)
  || a.appPath.localeCompare(b.appPath))[0] || null;

// 36b §4.4
export async function validProject(value, state) {
  if (!absolute(value)) return null;
  const real = await realOrNull(value);
  if (!real) return null;
  try { if (!(await fs.stat(real)).isDirectory()) return null; } catch { return null; }
  return within(state, real) ? null : real;
}

function loopbackOrigin(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.username || url.password || url.search || url.hash || url.pathname !== '/') return null;
    return url.origin;
  } catch { return null; }
}

// 36b §4.5
export async function verifiedInstance(record, state, fetchImpl = fetch) {
  const value = record?.newer ? record.value : null;
  if (!value || value.status !== 'running' || !value.running || typeof value.running !== 'object') return null;
  const origin = loopbackOrigin(value.url);
  if (!origin) return null;
  try {
    const response = await fetchImpl(`${origin}/api/health`, { signal: AbortSignal.timeout(2000), redirect: 'error' });
    if (response.status !== 200) return null;
    const text = await response.text();
    if (text.length > 1024 * 1024) return null;
    const health = JSON.parse(text);
    if (health?.app !== 'skilldock' || typeof health.instanceId !== 'string' || health.pid !== value.pid || health.state !== value.state
      || health.state !== state || health.sourceDigest !== value.digest || !atLeastMinimum(health.appVersion)
      || !Number.isInteger(health.dataGeneration) || health.dataGeneration < 2) return null;
    return { url: value.url, pid: value.pid, health };
  } catch { return null; }
}

const AGENT_LABEL = { codex: 'Codex', claude: 'Claude' };
const STDOUT_LIMIT = 64 * 1024;
const FAILED = '较新版本启动失败，沿用已在运行的实例。';
export function updateMessage(agent) {
  return agent in AGENT_LABEL
    ? `SkillDock 的数据已由 0.11 或更高版本管理。请把 ${AGENT_LABEL[agent]} 中的 SkillDock 更新到 0.11 或更高后重新打开。`
    : 'SkillDock 的数据已由 0.11 或更高版本管理。请改用 0.11 或更高版本的 SkillDock。';
}

function invoke(target, action, project, { env, state, ownAgent, spawnImpl, out, err }) {
  const args = [path.join(target.skillRoot, 'scripts/launch.sh'), action];
  if (project !== undefined && (action === 'start' || action === 'restart')) args.push('--project', project);
  const childEnv = { ...env, SKILLDOCK_STATE_DIR: state, SKILLDOCK_HANDOVER: '1', SKILLDOCK_HANDOVER_AGENT: ownAgent, SKILLDOCK_HANDOVER_FROM: HANDOVER_FROM };
  delete childEnv.SKILLDOCK_RESTART_JOB;
  err.write(`SkillDock：数据目录已由较新版本管理，转交给 ${AGENT_LABEL[target.agent]} 中的 SkillDock ${target.version}。\n`);
  return new Promise(resolve => {
    let child;
    try { child = spawnImpl('/bin/sh', args, { cwd: state, env: childEnv, stdio: ['ignore', 'pipe', 'inherit'], shell: false }); }
    catch (error) { err.write(`SkillDock：无法启动 ${redactUrl(error.message)}\n`); return resolve(1); }
    // 36b §4.7: buffer the callee's stdout so a fallback still prints exactly one JSON.
    // Keep reading past the limit so the callee never blocks; keep the last 4 KiB for diagnostics.
    const chunks = []; let size = 0; let tail = Buffer.alloc(0);
    child.stdout?.on('data', chunk => {
      size += chunk.length; if (size <= STDOUT_LIMIT) chunks.push(chunk);
      tail = Buffer.concat([tail, chunk]).subarray(-4096);
    });
    const forward = signal => { try { child.kill(signal); } catch { /* already exited */ } };
    process.on('SIGINT', forward); process.on('SIGTERM', forward);
    let finished = false;
    const done = code => {
      if (finished) return; finished = true;
      process.off('SIGINT', forward); process.off('SIGTERM', forward);
      const output = Buffer.concat(chunks);
      // Over-long output means the callee broke its contract (36b §6.3); treat it as a failure.
      if (code === 0 && size > STDOUT_LIMIT) { err.write('SkillDock：被调用方输出超过 64 KiB，按失败处理。\n'); code = 1; }
      if (code === 0) out.write(output);
      else if (tail.length) err.write(`SkillDock：被调用方输出（末尾）：${redactUrl(tail.toString('utf8'))}\n`);
      resolve(code);
    };
    child.once('error', error => { err.write(`SkillDock：无法启动 ${redactUrl(error.message)}\n`); done(1); });
    child.once('close', code => done(code ?? 1));
  });
}

function reuse(instance, state, out, err, extra = {}) {
  const { health } = instance;
  out.write(`${JSON.stringify({ status: 'running', url: instance.url, pid: instance.pid, project: health.project, state,
    appVersion: health.appVersion, reused: true, handover: 'running-instance', ...extra }, null, 2)}\n`);
  err.write(`SkillDock：SkillDock ${health.appVersion} 已在运行，沿用该实例。\n`);
  if (extra.projectNotSwitched) err.write(`SkillDock：未能切换到所请求的项目 ${extra.projectNotSwitched}，请在界面中切换。\n`);
  if (extra.warning) err.write(`SkillDock：${extra.warning}\n`);
  return 0;
}

/**
 * Runs the 0.10.3 transfer chain (36b §4). Returns null when it does not apply,
 * otherwise the exit code for the caller (0, 1 or 3).
 */
export async function runHandover({ action = 'start', projectDir, appDir, env = process.env, home = os.homedir(),
  fetchImpl = fetch, spawnImpl = spawn, out = process.stdout, err = process.stderr } = {}) {
  if (!FORWARDED.has(action)) return null;
  const state = await stateDirectory(env, home);
  const current = await handoverState(state);
  if (!current.triggered) return null;
  const record = current.record.newer && current.record.value ? current.record.value : null;
  const roots = await agentRoots({ env, home, state, record });
  const own = appDir ? await locate(appDir, roots) : null;
  const ownAgent = own?.agent ?? 'unknown';
  // 36b §4.1: a launcher started by a handover never hands over again.
  const reentered = env.SKILLDOCK_HANDOVER === '1';
  const context = { env, state, ownAgent, spawnImpl, out, err };
  const wanted = projectDir === undefined ? null : await validProject(projectDir, state);
  // 36b §4.7: re-read the record each time; a callee may have restarted the instance.
  const running = async () => action === 'start' ? verifiedInstance(await readLauncherRecord(state), state, fetchImpl) : null;
  const differs = async instance => {
    const project = typeof instance.health.project === 'string' ? await realOrNull(instance.health.project) : null;
    return !!wanted && wanted !== project;
  };
  const fallback = async (instance, warning) => reuse(instance, state, out, err, {
    ...(await differs(instance) ? { projectNotSwitched: projectDir } : {}), ...(warning ? { warning } : {}) });

  // Step 1: a newer cache of this installation.
  if (own && !reentered) {
    let siblings = [];
    try { siblings = (await fs.readdir(path.dirname(own.versionDir))).filter(safeSegment); } catch { /* none */ }
    const candidates = [];
    for (const name of siblings) {
      const located = await locate(path.join(path.dirname(own.versionDir), name, ...APP_TAIL), { caches: [own] });
      const install = located && await inspect(located);
      if (install) candidates.push(install);
    }
    const target = best(candidates, ownAgent);
    if (target) {
      if (await invoke(target, action, projectDir, context) === 0) return 0;
      const instance = await running();
      return instance ? fallback(instance, FAILED) : 1;
    }
  }

  // Step 2: hand back to a verified running instance unless a different project was asked for.
  const instance = await running();
  if (instance && !(await differs(instance))) return reuse(instance, state, out, err);

  // Step 3: the preferred launch target, or the highest verified installation.
  const key = own && !reentered ? await sourceKeyFor(own) : null;
  if (key) {
    const owner = { marketplace: own.marketplace, key };
    let target = null;
    if (record?.preferred && typeof record.preferred === 'object' && absolute(record.preferred.appPath)) {
      const located = await locate(record.preferred.appPath, roots);
      target = located && located.agent === record.preferred.agent ? await inspect(located, owner) : null;
    }
    if (!target) {
      const candidates = [];
      for (const cache of roots.caches) for (const appPath of await enumerate(cache)) {
        const located = await locate(appPath, { caches: [cache] });
        const install = located && await inspect(located, owner);
        if (install && !candidates.some(item => item.appPath === install.appPath)) candidates.push(install);
      }
      target = best(candidates, ownAgent);
    }
    if (target) {
      if (await invoke(target, action, projectDir, context) === 0) return 0;
      // 36b §4.7: entered from the step 2 exception, fall back to the still-running instance.
      const again = instance ? await running() : null;
      return again ? fallback(again, FAILED) : 1;
    }
  }
  if (instance) return fallback(instance);

  // Step 4
  const message = updateMessage(ownAgent);
  out.write(`${JSON.stringify({ status: 'update-required', agent: ownAgent, requiredVersion: '0.11.0', message }, null, 2)}\n`);
  err.write(`SkillDock：${message}\n`);
  return 3;
}
