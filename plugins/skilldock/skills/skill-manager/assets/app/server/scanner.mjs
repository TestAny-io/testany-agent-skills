import fs from 'node:fs/promises';
import path from 'node:path';
import { exists, identity, inside, metadata, redact, safeSegment, verifyDirectoryRoot } from './files.mjs';
import { readConfig } from './config.mjs';
import { readMarketplace, discoverSkillRoots } from './cli.mjs';
import { pluginSourceInfo } from './sources.mjs';

export async function sandboxCatalog(environment, registry) {
  const plugins = []; const marketplaces = []; const diagnostics = [];
  let configuration; try { configuration = (await readConfig(environment.config)).data; } catch (e) { diagnostics.push(redact(e.message)); }
  const enabled = (id, installed) => !configuration ? null : configuration.plugins?.[id]?.enabled ?? installed?.enabled ?? false;
  for (const [id, entry] of Object.entries(registry.marketplaces)) {
    try {
      const catalog = await readMarketplace(entry.root || entry.source);
      marketplaces.push({ id, name: id, source: entry.source, type: entry.type, pluginCount: catalog.plugins.length, canRemove: true, canRefresh: entry.type === 'git', refreshedAt: entry.refreshedAt });
      for (const plugin of catalog.plugins) {
        const installed = registry.plugins[plugin.id];
        const record = { ...plugin, version: installed?.version || plugin.version, installed: !!installed, enabled: enabled(plugin.id, installed), sourcePath: installed?.directory || plugin.sourcePath, _updateSourcePath: plugin.sourcePath, _skillRoots: installed ? undefined : plugin._skillRoots, _componentRoots: installed?.componentRoots || plugin._componentRoots, canInstall: !installed, canRemove: !!installed, canToggle: !!installed && !!configuration };
        record.sourceInfo = pluginSourceInfo(record, { sourceType: 'local', source: plugin.sourcePath }); plugins.push(record);
      }
    } catch (e) { diagnostics.push(`市场 ${id}：${redact(e.message)}`); }
  }
  for (const [id, installed] of Object.entries(registry.plugins)) if (!plugins.some(plugin => plugin.id === id)) {
    const record = { id, name: installed.name, description: installed.description || '', marketplace: installed.marketplace, version: installed.version, installed: true, enabled: enabled(id, installed), sourcePath: installed.directory, _componentRoots: installed.componentRoots, skillCount: 0, canInstall: false, canRemove: true, canToggle: !!configuration };
    record.sourceInfo = { ...pluginSourceInfo(record, { source: installed.updateSourcePath || installed.directory, sourceType: 'local' }), confidence: 'inferred', evidence: '安装记录保留，但所属 marketplace 已移除；重新关联市场后才能更新。' }; plugins.push(record);
  }
  return { plugins, marketplaces, diagnostics, cli: { available: true, version: 'sandbox · isolated file adapter' } };
}

export function rootsFor(environment) {
  const roots = [
    { directory: path.join(environment.codexHome, 'skills'), scope: 'user', label: '个人技能' },
    { directory: path.join(environment.home, '.agents/skills'), scope: 'user', label: '个人 · .agents' },
  ];
  let current = environment.project;
  while (current && current !== path.dirname(current) && current !== environment.home) {
    roots.push({ directory: path.join(current, '.agents/skills'), scope: 'project', label: '当前项目' });
    roots.push({ directory: path.join(current, '.codex/skills'), scope: 'project', label: '当前项目 · .codex' });
    if (!inside(environment.home, current) || current === environment.root) break;
    current = path.dirname(current);
  }
  if (environment.mode === 'local') roots.push({ directory: '/etc/codex/skills', scope: 'system', label: '系统技能' });
  return roots.filter((root, i, all) => all.findIndex(other => other.directory === root.directory) === i);
}

export async function scan(environment, registry, catalog) {
  const started = performance.now(); const diagnostics = [...catalog.diagnostics]; let config; let configValid = true;
  try { config = (await readConfig(environment.config)).data; } catch (e) { diagnostics.push(redact(e.message)); config = {}; configValid = false; }
  const disabled = new Map((Array.isArray(config.skills?.config) ? config.skills.config : []).filter(entry => typeof entry.path === 'string').map(entry => [path.resolve(entry.path), entry.enabled !== false]));
  const records = []; const byReal = new Map(); const rootList = rootsFor(environment);
  const protectedRoots = await Promise.all([path.join(environment.codexHome, 'skills/.system'), path.join(environment.codexHome, 'plugins'), '/etc/codex/skills'].map(async root => { try { return await fs.realpath(root); } catch { return root; } }));
  async function add(directory, root, extra = {}) {
    const entry = path.join(directory, 'SKILL.md'); let detail, real, isLink = false, directoryStat;
    try {
      directoryStat = await fs.lstat(directory); isLink = directoryStat.isSymbolicLink();
      real = await fs.realpath(entry);
      if (!inside(await fs.realpath(extra.boundary || root.directory), real)) { diagnostics.push(`技能链接越出发现范围：${directory}`); return; }
      detail = await metadata(directory);
    } catch (e) {
      if (e.code === 'ENOENT' && !isLink) return;
      diagnostics.push(`${directory}：${redact(e.message)}`);
      return;
    }
    const system = root.scope === 'system' || directory.split(path.sep).includes('.system') || protectedRoots.some(protectedRoot => inside(protectedRoot, real));
    const scope = extra.scope || (system ? 'system' : root.scope);
    const owned = ['user', 'project'].includes(scope) && !system && inside(await fs.realpath(root.directory), real);
    const packagePlugin = extra.plugin;
    const configPath = packagePlugin ? real : entry;
    const packagePath = packagePlugin ? path.relative(await fs.realpath(extra.boundary), real) : undefined;
    let enabled = !configValid || scope === 'cache' ? null : disabled.get(entry) ?? true;
    if (packagePlugin) enabled = !configValid || packagePlugin.enabled === null ? null : packagePlugin.enabled && (disabled.get(configPath) ?? true);
    const id = identity(directory);
    const record = {
      id, name: detail.name, description: detail.description, path: configPath, scope, sourceLabel: extra.label || (scope === 'system' ? '系统内置' : root.label), enabled,
      packagePath,
      ...(configPath !== entry ? { aliases: [entry] } : {}),
      pluginId: packagePlugin?.id || extra.pluginId, version: packagePlugin?.version || extra.version, managed: !owned, isLink,
      canToggle: configValid && (owned || !!packagePlugin?.canToggle && packagePlugin.enabled === true), canRemove: owned, canUpdate: owned && !isLink && !!registry.sources[id],
      reason: !configValid ? '配置无法解析，启用状态未知；配置开关暂不可用。' : !owned ? packagePlugin ? packagePlugin.enabled === false ? '请先启用所属插件，再调整其中的技能。' : '插件附带技能，可单独启禁；更新和卸载按所属插件管理。' : scope === 'cache' ? '仅发现缓存，当前安装和启用状态待核实。' : '系统或托管内容受保护。' : undefined,
      statusEvidence: packagePlugin ? 'Codex 插件状态 + 逐技能持久配置' : scope === 'cache' ? '仅文件缓存；未确认安装' : !configValid ? '文件发现；持久配置读取失败' : '文件发现 + Codex 持久配置', updatedAt: detail.updatedAt,
    };
    const prior = byReal.get(real);
    if (prior) {
      prior.aliases = [...(prior.aliases || []), entry];
      // A path that resolves to a protected entity cannot gain write access through an alias.
      if (!owned && !packagePlugin) { prior.canToggle = false; prior.canRemove = false; prior.canUpdate = false; prior.managed = true; }
      if (packagePlugin) Object.assign(prior, { scope: 'plugin', path: configPath, packagePath, managed: true, pluginId: packagePlugin.id, version: packagePlugin.version, sourceLabel: packagePlugin.name, enabled, canToggle: configValid && !!packagePlugin.canToggle && packagePlugin.enabled === true, canRemove: false, canUpdate: false, reason: '插件附带技能，可单独启禁；更新和卸载按所属插件管理。', statusEvidence: 'Codex 插件状态 + 逐技能持久配置' });
      return;
    }
    byReal.set(real, record); records.push(record);
  }
  async function walk(root, extra = {}) {
    if (!(await exists(root.directory))) return;
    try {
      const actual = await fs.realpath(root.directory);
      if (environment.mode === 'sandbox' && !inside(environment.root, actual)) { diagnostics.push(`演练目录链接越出隔离范围：${root.directory}`); return; }
      const boundary = environment.managedRoots?.find(item => item.directory === root.directory);
      if (boundary) await verifyDirectoryRoot(boundary);
    } catch (e) { diagnostics.push(`${root.directory}：${redact(e.message)}`); return; }
    const seen = new Set();
    async function visit(directory, depth) {
      if (depth > 8 || records.length > 10000) return;
      let real; try { real = await fs.realpath(directory); } catch { diagnostics.push(`目录链接不可读：${directory}`); return; }
      if (await exists(path.join(directory, 'SKILL.md'))) { await add(directory, root, extra); return; }
      if (seen.has(real)) return; seen.add(real);
      let children; try { children = await fs.readdir(directory, { withFileTypes: true }); } catch (e) { diagnostics.push(`${directory}：${redact(e.message)}`); return; }
      for (const child of children.sort((a, b) => a.name.localeCompare(b.name))) {
        if (child.name === '.git' || child.name === 'node_modules' || (child.name.startsWith('.') && child.name !== '.system')) continue;
        if (child.isDirectory() || child.isSymbolicLink()) await visit(path.join(directory, child.name), depth + 1);
      }
    }
    await visit(root.directory, 0);
  }
  for (const root of rootList) await walk(root);
  const plugins = catalog.plugins.map(plugin => ({ ...plugin }));
  // Verified installed packages first; stale cached versions never override their status.
  for (const plugin of plugins.filter(p => p.installed)) {
    if (!safeSegment(plugin.marketplace) || !safeSegment(plugin.name) || (plugin.version !== undefined && !safeSegment(plugin.version))) { diagnostics.push('插件身份或版本不安全，未扫描其路径。'); plugin.canRemove = false; plugin.canToggle = false; continue; }
    const candidates = [path.join(environment.codexHome, 'plugins/cache', plugin.marketplace, plugin.name, plugin.version || ''), plugin.sourcePath].filter(Boolean);
    const directory = (await Promise.all(candidates.map(async candidate => await exists(candidate) ? candidate : null))).find(Boolean);
    if (!directory) continue;
    try {
      let roots = await discoverSkillRoots(directory);
      if (plugin._componentRoots) {
        if (!Array.isArray(plugin._componentRoots) || plugin._componentRoots.some(relative => typeof relative !== 'string' || !inside(directory, path.resolve(directory, relative)))) throw new Error('缓存组件映射越出插件根。');
        const mapped = plugin._componentRoots.map(relative => path.resolve(directory, relative));
        for (const root of mapped) if (!(await exists(root)) || !inside(await fs.realpath(directory), await fs.realpath(root))) throw new Error('安装缓存中的声明组件缺失或越界。');
        roots = [...new Set([...roots, ...mapped])];
      }
      for (const skillRoot of roots) await walk({ directory: skillRoot, scope: 'plugin', label: plugin.name }, { scope: 'plugin', plugin, label: plugin.name, boundary: directory });
    } catch (e) { diagnostics.push(`插件 ${plugin.name}：${redact(e.message)}`); plugin.canRemove = false; plugin.reason = '无法完整确认插件组件范围，暂不提供卸载。'; }
    plugin.skillCount = records.filter(record => record.pluginId === plugin.id).length;
  }
  const cache = path.join(environment.codexHome, 'plugins/cache');
  const directoryEntries = async directory => { try { return await fs.readdir(directory, { withFileTypes: true }); } catch (e) { diagnostics.push(`${directory}：${redact(e.message)}`); return []; } };
  if (await exists(cache)) {
    for (const market of await directoryEntries(cache)) {
      if (!market.isDirectory()) continue;
      for (const pkg of await directoryEntries(path.join(cache, market.name))) {
        if (!pkg.isDirectory()) continue;
        const pluginId = `${pkg.name}@${market.name}`;
        for (const version of await directoryEntries(path.join(cache, market.name, pkg.name))) {
          if (!version.isDirectory() || version.name.startsWith('.')) continue;
          if (plugins.some(plugin => plugin.id === pluginId && plugin.installed && plugin.version === version.name)) continue;
          const directory = path.join(cache, market.name, pkg.name, version.name);
          try { for (const skillRoot of await discoverSkillRoots(directory)) await walk({ directory: skillRoot, scope: 'cache', label: `${pkg.name} · 缓存` }, { scope: 'cache', pluginId, version: version.name, label: `${pkg.name} · 缓存`, boundary: directory }); }
          catch (e) { diagnostics.push(`缓存 ${pluginId}：${redact(e.message)}`); }
        }
      }
    }
  }
  for (const record of records) {
    const duplicates = records.filter(other => other.id !== record.id && other.name === record.name).map(other => other.path);
    if (duplicates.length) record.duplicateNames = duplicates;
  }
  return { mode: environment.mode, skills: records, plugins: plugins.map(({ _skillRoots, _componentRoots, _updateSourcePath, ...plugin }) => plugin), marketplaces: catalog.marketplaces.map(({ _root, ...marketplace }) => marketplace), diagnostics, scannedAt: new Date().toISOString(), durationMs: Math.round(performance.now() - started), cli: catalog.cli, paths: { skills: environment.skills, config: environment.config, state: environment.root, project: environment.project }, examples: environment.examples, activity: registry.activity.map(({ backup, restore, ...activity }) => activity).slice(0, 200) };
}
