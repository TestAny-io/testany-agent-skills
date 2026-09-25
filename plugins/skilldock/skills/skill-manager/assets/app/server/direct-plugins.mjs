// SPDX-License-Identifier: AGPL-3.0-only
import fs from 'node:fs/promises';
import path from 'node:path';
import { fail, hash, safeSegment, inside, writeJson, verifyDescendantDirectory } from './files.mjs';
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
