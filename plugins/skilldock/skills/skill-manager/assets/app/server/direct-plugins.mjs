// SPDX-License-Identifier: AGPL-3.0-only
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { fail, hash, safeSegment, inside, writeJson, verifyDescendantDirectory, publicSource } from './files.mjs';
import { readPluginManifest } from './cli.mjs';
import { pluginContents } from './plugin-contents.mjs';

export async function inspectPlugin(directory) {
  let manifests = 0;
  for (const file of ['.codex-plugin/plugin.json', '.claude-plugin/plugin.json', 'plugin.json']) { try { await fs.access(path.join(directory, file)); manifests++; } catch { /* Optional manifest location. */ } }
  if (manifests !== 1) fail(422, 'PLUGIN_MANIFEST_REQUIRED', '单个插件需要且只能有一个 plugin.json，避免重复的配置与版本来源。');
  const manifest = await readPluginManifest(directory);
  if (!manifest || !safeSegment(manifest.name) || !safeSegment(manifest.version)) fail(422, 'PLUGIN_MANIFEST_REQUIRED', '请选择包含 plugin.json 的单个插件目录，且清单中需要有效的 name 和 version。');
  const { signature, ...contents } = await pluginContents(directory);
  return { name: manifest.name, version: manifest.version, description: typeof manifest.description === 'string' ? manifest.description : '', ...contents };
}

export function directLocation(env, staged) {
  const key = hash(JSON.stringify([staged.sourceType, staged.source, staged.subpath || '.', staged.ref || ''])).slice(0, 20);
  const market = `skilldock-${key}`;
  return { market, root: path.join(env.root, 'direct-plugins', key), pluginId: `${staged.detail.name}@${market}` };
}

export async function writeDirectMarketplace(env, staged, location) {
  await verifyDescendantDirectory(env.stateBoundary, location.root);
  await fs.mkdir(location.root, { recursive: true, mode: 0o700 });
  await verifyDescendantDirectory(env.stateBoundary, path.join(location.root, '.agents/plugins'));
  const entry = { name: staged.detail.name, source: `./plugins/${staged.detail.name}`, policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' }, category: 'Productivity' };
  await writeJson(path.join(location.root, '.agents/plugins/marketplace.json'), { name: location.market, interface: { displayName: staged.detail.name }, plugins: [entry] });
}

export async function decorateDirectCatalog(catalog, registry, env) {
  for (const [marketId, source] of Object.entries(registry.directPlugins || {})) {
    const market = catalog.marketplaces.find(item => item.id === marketId);
    if (!market || (market._root || registry.marketplaces[marketId]?.root) !== source.root || !inside(path.join(env.root, 'direct-plugins'), source.root)) continue;
    market.displayName = source.name; market.type = source.sourceType; market.source = source.source; market.canRefresh = true;
    market.reason = '由单个插件安装自动登记的来源。'; market.direct = true;
    for (const plugin of catalog.plugins.filter(item => item.marketplace === marketId)) {
      plugin.directSource = { source: source.source, sourceType: source.sourceType, subpath: source.subpath, ref: source.ref, commit: source.commit };
      plugin.sourceInfo = { ...plugin.sourceInfo, source: source.source, sourceType: source.sourceType, subpath: source.subpath, ref: source.ref, label: '单插件来源' };
    }
  }
  return catalog;
}

/**
 * A plugin source for Claude (HLD 3.3, DEC-SDX-025): with a Claude manifest it is a
 * skills-directory plugin; without one Claude still loads its skills and commands (9.3 V6)
 * through a marketplace SkillDock writes. A source with nothing Claude can load is refused.
 * Without any manifest the name is the source's own (`fallbackName`), never the staging
 * directory's (4d review P1-01).
 */
export async function inspectClaudePlugin(directory, fallbackName) {
  const read = async file => { try { const value = JSON.parse(await fs.readFile(path.join(directory, file), 'utf8')); return value && typeof value === 'object' && !Array.isArray(value) ? value : null; } catch { return null; } };
  const claude = await read('.claude-plugin/plugin.json'); const codex = await read('.codex-plugin/plugin.json');
  const entries = async folder => fs.readdir(path.join(directory, folder), { withFileTypes: true }).catch(() => []);
  const skills = [];
  for (const entry of await entries('skills')) if ((entry.isDirectory() || entry.isSymbolicLink()) && await fs.access(path.join(directory, 'skills', entry.name, 'SKILL.md')).then(() => true, () => false)) skills.push(entry.name);
  const commands = (await entries('commands')).filter(entry => entry.isFile() && entry.name.endsWith('.md')).length;
  if (!claude && !skills.length && !commands) fail(422, 'UNSUPPORTED_FOR_AGENT', '这个来源没有 Claude 能加载的内容（Claude 的 plugin.json、skills 或 commands），不能安装到 Claude。');
  const manifest = claude ?? codex ?? {};
  const named = typeof manifest.name === 'string'; const name = named ? manifest.name : fallbackName ?? path.basename(directory);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(name)) fail(422, 'INVALID_NAME', named ? '插件名称只能包含字母、数字、点、下划线与连字符。'
    : '没有 manifest 时，插件名称取自来源目录名，只能包含字母、数字、点、下划线与连字符；可以改目录名，或在 .claude-plugin/plugin.json 中写 name。');
  return { name, version: typeof manifest.version === 'string' ? manifest.version : '', description: typeof manifest.description === 'string' ? manifest.description : '',
    mode: claude ? 'skills-dir' : 'marketplace', manifests: [...(claude ? ['claude'] : []), ...(codex ? ['codex'] : [])].sort(), skills: skills.sort(), commands };
}

/** Where a manifest-less source becomes a Claude marketplace in SkillDock's data. */
export function claudeDirectLocation(env, staged) {
  const key = hash(JSON.stringify(['claude', staged.sourceType, staged.source, staged.subpath || '.', staged.ref || ''])).slice(0, 20);
  const market = `skilldock-${key}`;
  return { market, root: path.join(env.root, 'claude-direct-plugins', key), pluginId: `${staged.detail.name}@${market}` };
}

/** The one directory a generated marketplace may have: `claude-direct-plugins/<its key>`. */
export function claudeDirectRoot(env, name) {
  return /^skilldock-[a-f0-9]{20}$/.test(name) ? path.join(env.root, 'claude-direct-plugins', name.slice('skilldock-'.length)) : null;
}

/**
 * Whether the marketplace Claude lists under this name is the one SkillDock wrote for the record:
 * the name, the directory Claude reads and the record's place in SkillDock's data all match, so
 * a same-named marketplace of the user's is never taken for it (4d review P3-01).
 */
export function ownClaudeDirect(listed, tracked, env) {
  return !!listed && !!tracked && tracked.root === claudeDirectRoot(env, listed.name) && samePath(listed.source, tracked.root);
}
// Another spelling of the same directory (a trailing slash, a link on the way) is the same one (re-review P3-03).
function samePath(shown, root) {
  if (shown === publicSource(root)) return true;
  if (typeof shown !== 'string' || !path.isAbsolute(shown)) return false;
  if (path.resolve(shown) === path.resolve(root)) return true;
  try { return fsSync.realpathSync(shown) === fsSync.realpathSync(root); } catch { return false; }
}

/** A marketplace SkillDock wrote for a Claude source shows that source. */
export function decorateClaudeDirect(claude, registry, env) {
  for (const [name, tracked] of Object.entries(registry.claudeDirectPlugins || {})) {
    const market = claude.marketplaces.find(item => item.name === name);
    if (!ownClaudeDirect(market, tracked, env)) continue;
    market.displayName = tracked.name; market.source = publicSource(tracked.source); market.type = tracked.sourceType;
    market.reason = '由单个插件安装自动登记的来源。'; market.direct = true;
    for (const plugin of claude.plugins.filter(item => item.marketplace === name))
      plugin.sourceInfo = { ...plugin.sourceInfo, source: publicSource(tracked.source), sourceType: tracked.sourceType, subpath: tracked.subpath, ref: tracked.ref, label: '单插件来源' };
  }
  return claude;
}

export async function writeClaudeDirectMarketplace(env, staged, location) {
  await verifyDescendantDirectory(env.stateBoundary, location.root);
  await fs.mkdir(location.root, { recursive: true, mode: 0o700 });
  await verifyDescendantDirectory(env.stateBoundary, path.join(location.root, '.claude-plugin'));
  await writeJson(path.join(location.root, '.claude-plugin/marketplace.json'), { name: location.market, owner: { name: 'SkillDock' },
    plugins: [{ name: staged.detail.name, source: `./plugins/${staged.detail.name}`, description: staged.detail.description || '', ...(staged.detail.version ? { version: staged.detail.version } : {}) }] });
}
