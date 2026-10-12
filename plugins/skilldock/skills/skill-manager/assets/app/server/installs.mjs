// SPDX-License-Identifier: AGPL-3.0-only
// Bootstrap-safe: launchers import this before a toolchain is selected, so it may
// import only Node built-ins. Finds SkillDock installations in every agent's plugin
// cache (API-SDX-001 36a §9, §10) and picks the run source (DEC-SDX-008).
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$/;
export const APP_TAIL = ['skills', 'skill-manager', 'assets', 'app'];
const AGENT_ORDER = { codex: 0, claude: 1 };

export const safeSegment = value => typeof value === 'string' && SEGMENT.test(value) && !['__proto__', 'prototype', 'constructor'].includes(value);
export const absolute = value => typeof value === 'string' && path.isAbsolute(value) && value.length <= 4096 && !/[\x00-\x1f]/.test(value);
export const within = (root, target) => { const relative = path.relative(root, target); return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative)); };

export function parseVersion(value) {
  return typeof value === 'string' && /^\d+\.\d+\.\d+$/.test(value) ? value.split('.').map(Number) : null;
}
export function compareVersions(left, right) {
  for (let index = 0; index < 3; index++) if (left[index] !== right[index]) return left[index] < right[index] ? -1 : 1;
  return 0;
}
export const atLeast = (version, minimum) => { const parsed = parseVersion(version); return !!parsed && compareVersions(parsed, parseVersion(minimum)) >= 0; };

export async function canonical(value) {
  try { return await fs.realpath(value); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const parent = path.dirname(value);
    return parent === value ? value : path.join(await canonical(parent), path.basename(value));
  }
}
export async function realOrNull(value) { try { return await fs.realpath(value); } catch { return null; } }
// undefined: absent; null: present but unreadable or larger than the limit.
export async function readText(file, limit = 1024 * 1024) {
  try {
    const handle = await fs.open(file, 'r');
    try { const { size } = await handle.stat(); if (size > limit) return null; return await handle.readFile('utf8'); }
    finally { await handle.close(); }
  } catch (error) { return error.code === 'ENOENT' ? undefined : null; }
}
export async function readJsonFile(file) {
  const text = await readText(file);
  if (typeof text !== 'string') return text;
  try { return JSON.parse(text); } catch { return null; }
}

export async function stateDirectory(env = process.env, home = os.homedir()) {
  return canonical(path.resolve(env.SKILLDOCK_STATE_DIR || path.join(home, '.local/share/skilldock')));
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

export async function sourceKeyFor(install) {
  if (install.agent === 'codex') {
    const text = await readText(path.join(install.home, 'config.toml'));
    return typeof text === 'string' ? codexSourceKey(codexMarketplaceEntry(text, install.marketplace)) : null;
  }
  if (!install.configDir) return null;
  const known = await readJsonFile(path.join(install.configDir, 'plugins/known_marketplaces.json'));
  return known && typeof known === 'object' && Object.hasOwn(known, install.marketplace) ? claudeSourceKey(known[install.marketplace]?.source) : null;
}

/**
 * Plugin cache roots of both agents (36b §5.1). `claudeRoot` is the saved Claude
 * root record ({configDir, pluginCacheDir}); record references add derived roots.
 */
export async function agentRoots({ env = process.env, home = os.homedir(), claudeRoot, record } = {}) {
  const codex = []; const claude = [];
  const pushCodex = async value => { if (absolute(value)) { const root = await canonical(value); if (!codex.includes(root)) codex.push(root); } };
  const pushClaude = async (configDir, cacheDir) => {
    if (!absolute(cacheDir) || (configDir !== null && !absolute(configDir))) return;
    const pair = { configDir: configDir === null ? null : await canonical(configDir), cacheDir: await canonical(cacheDir) };
    if (!claude.some(item => item.cacheDir === pair.cacheDir && item.configDir === pair.configDir)) claude.push(pair);
  };
  await pushCodex(env.CODEX_HOME);
  await pushCodex(path.join(home, '.codex'));
  if (claudeRoot && absolute(claudeRoot.configDir) && absolute(claudeRoot.pluginCacheDir)) await pushClaude(claudeRoot.configDir, claudeRoot.pluginCacheDir);
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
      ...codex.map(root => ({ agent: 'codex', home: root, cacheDir: path.join(root, 'plugins/cache') })),
      ...claude.map(pair => ({ agent: 'claude', configDir: pair.configDir, cacheDir: pair.cacheDir })),
    ],
  };
}

// 36a §10.1: <cacheDir>/<marketplace>/skilldock/<version dir>/skills/skill-manager/assets/app
export async function locate(appPath, roots) {
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

/**
 * 36a §10.2 conditions 2–6 (condition 1 is enforced by locate). `minimum` filters by
 * product version; `owner` ({marketplace, key}) requires the same marketplace name and
 * source identity.
 */
export async function inspect(install, { minimum, owner } = {}) {
  try {
    if ((await readText(path.join(install.versionDir, '.orphaned_at'))) !== undefined) return null;
    const pkg = await readJsonFile(path.join(install.appPath, 'package.json'));
    if (!pkg || pkg.name !== 'skilldock' || !parseVersion(pkg.version)) return null;
    if (minimum && !atLeast(pkg.version, minimum)) return null;
    if (install.agent === 'codex') {
      const manifest = await readJsonFile(path.join(install.versionDir, '.codex-plugin/plugin.json'));
      if (!manifest || manifest.name !== 'skilldock' || manifest.version !== install.versionName) return null;
    }
    const script = await fs.lstat(path.join(install.skillRoot, 'scripts/launch.sh'));
    if (!script.isFile()) return null;
    const sourceKey = await sourceKeyFor(install);
    if (owner && (install.marketplace !== owner.marketplace || !sourceKey || sourceKey !== owner.key)) return null;
    return { ...install, version: pkg.version, sourceKey };
  } catch { return null; }
}

export async function enumerate(cache) {
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

/** Every valid, non-orphaned SkillDock installation in the known caches. */
export async function discoverInstalls(roots, options = {}) {
  const installs = [];
  for (const cache of roots.caches) for (const appPath of await enumerate(cache)) {
    const located = await locate(appPath, { caches: [cache] });
    const install = located && await inspect(located, options);
    if (install && !installs.some(item => item.appPath === install.appPath)) installs.push(install);
  }
  return installs;
}

/** Plain, serialisable reference stored in the launcher record (36a §5.3). */
export const reference = install => install && ({ agent: install.agent, marketplace: install.marketplace, appPath: install.appPath, version: install.version, sourceKey: install.sourceKey ?? null });

/**
 * DEC-SDX-008: the highest product version runs. On equal versions the source of the
 * running instance wins, then Codex before Claude, then the application path.
 */
export function selectRunSource(installs, { runningAppPath } = {}) {
  return [...installs].sort((a, b) =>
    compareVersions(parseVersion(b.version), parseVersion(a.version))
    || Number(b.appPath === runningAppPath) - Number(a.appPath === runningAppPath)
    || AGENT_ORDER[a.agent] - AGENT_ORDER[b.agent]
    || a.appPath.localeCompare(b.appPath))[0] || null;
}
