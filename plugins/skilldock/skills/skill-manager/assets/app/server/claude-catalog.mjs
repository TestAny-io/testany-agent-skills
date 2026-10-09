// SPDX-License-Identifier: AGPL-3.0-only
// Claude read path (HLD 3.2, 3.4; DEC-SDX-004, 020, 023; API-SDX-001 36c §6). The command
// line's lists are the main evidence; Claude's own records only stand in when they fail,
// and then the environment is unconfirmed. Settings are read for three keys only.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { claudeCliEnvironment } from './process-env.mjs';
import { metadata, redact, publicSource } from './files.mjs';

const SETTINGS_KEYS = ['enabledPlugins', 'skillOverrides', 'extraKnownMarketplaces'];
/** Highest first (Claude: managed > local > project > user; command-line flags are per session). */
export const LAYERS = ['managed', 'local', 'project', 'user'];
export const MANAGED_DIR = '/Library/Application Support/ClaudeCode';
const VISIBILITY = { on: 'enabled', off: 'disabled', 'name-only': 'name-only', 'user-invocable-only': 'user-invocable-only' };
// Auto-update is on by default for Anthropic's official marketplaces (except these two).
const OFFICIAL_OFF = new Set(['knowledge-work-plugins', 'first-party-plugins']);
const officialDefault = name => name === 'claude-plugins-official' || (name.startsWith('anthropic') && !OFFICIAL_OFF.has(name));

const digest = value => crypto.createHash('sha256').update(value).digest('hex').slice(0, 12);
const revision = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);
const exists = async file => !!(await fs.lstat(file).catch(() => null));
const isDirectory = async directory => (await fs.stat(directory).catch(() => null))?.isDirectory() ?? false;
// Capabilities below are what Claude's native rules allow; the service marks every Claude
// object read-only while Claude management is not enabled (36c §5).
// Removal and updates come from SkillDock's own records; the service adds them (phase 4b2).
const SKILLS_DIR_REMOVAL = '这个技能目录插件不在个人技能目录或当前项目的 .claude/skills 中，不能在这里移除。';
// Plugin and marketplace names as Claude writes them (letters, digits, '.', '_', '-'), so an
// ID made from them stays unambiguous and carries no control characters.
const plainName = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value);

/** 36c §6: Claude object IDs are derived from the installation identity; clients never parse them. */
export const claudeIds = {
  plugin: (id, scope, projectPath) => `claude:plugin:${id}:${scope}${projectPath ? `:${digest(projectPath)}` : ''}`,
  skill: (scope, directory) => `claude:skill:${scope}:${digest(directory)}`,
  marketplace: name => `claude:marketplace:${name}`,
  /** A plugin not installed in any scope has no installation identity yet. */
  available: id => `claude:plugin:${id}`,
};

// Problems are complete sentences: they become the reason Claude is unconfirmed.
async function readLayer(file) {
  let text;
  try { text = await fs.readFile(file, 'utf8'); } catch (error) { if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return { file, values: {} }; return { file, error: `设置文件 ${file} 无法读取（${error.code || 'UNREADABLE'}）。` }; }
  let data;
  try { data = JSON.parse(text); } catch { return { file, error: `设置文件 ${file} 不是有效的 JSON。` }; }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { file, error: `设置文件 ${file} 的格式未知。` };
  const values = {};
  for (const key of SETTINGS_KEYS) if (data[key] !== undefined) {
    if (!data[key] || typeof data[key] !== 'object' || Array.isArray(data[key])) return { file, error: `设置文件 ${file} 中 ${key} 的格式未知。` };
    values[key] = data[key];
  }
  return { file, values };
}

/** The settings layers that apply to `project` (DEC-SDX-004): only the three relevant keys. */
export async function readClaudeSettings({ configDir, project, managedDir = MANAGED_DIR }) {
  const files = { user: path.join(configDir, 'settings.json'), project: path.join(project, '.claude/settings.json'), local: path.join(project, '.claude/settings.local.json'), managed: path.join(managedDir, 'managed-settings.json') };
  const layers = {}; const problems = [];
  const userIsProject = await sameDirectory(path.join(project, '.claude'), configDir);
  for (const layer of LAYERS) {
    if (layer === 'project' && userIsProject) { layers.project = {}; continue; }
    const read = await readLayer(files[layer]);
    if (read.error) { problems.push(read.error); layers[layer] = {}; } else layers[layer] = read.values;
  }
  // Managed drop-in files merge over managed-settings.json in name order.
  const dropIn = path.join(managedDir, 'managed-settings.d');
  let names = [];
  try { names = await fs.readdir(dropIn); }
  catch (error) { if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') problems.push(`托管设置目录 ${dropIn} 无法读取（${error.code || 'UNREADABLE'}）。`); }
  for (const name of names.filter(item => item.endsWith('.json')).sort()) {
    const read = await readLayer(path.join(dropIn, name));
    if (read.error) { problems.push(read.error); continue; }
    for (const [key, value] of Object.entries(read.values)) layers.managed[key] = { ...layers.managed[key], ...value };
  }
  return { files, layers, problems };
}

/** Which layer decides a key of `field` (36c EnablementSource); `value` is that layer's entry. */
export function decidedBy(layers, field, key) {
  for (const layer of LAYERS) if (Object.hasOwn(layers[layer][field] || {}, key)) return { layer, value: layers[layer][field][key] };
  return { layer: 'default' };
}

function enablement(layers, field, key, equal) {
  const decided = decidedBy(layers, field, key);
  const source = { decidedBy: decided.layer };
  if (decided.layer !== 'default') {
    // A user-writable layer below the deciding one that says something else is overridden.
    const below = LAYERS.slice(LAYERS.indexOf(decided.layer) + 1).filter(layer => layer !== 'managed');
    if (decided.layer !== 'user' && below.some(layer => Object.hasOwn(layers[layer][field] || {}, key) && !equal(layers[layer][field][key], decided.value))) source.overriddenBy = decided.layer;
    if (decided.layer === 'managed') source.locked = true;
  }
  return { source, value: decided.value };
}

function run(cli, args, { env, claudeRoot, cwd, timeout }) {
  return new Promise((resolve, reject) => {
    execFile(cli, args, { timeout, maxBuffer: 8 * 1024 * 1024, cwd, shell: false,
      env: { ...claudeCliEnvironment(env, claudeRoot), CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' } }, (error, stdout) => {
      const command = args.filter(arg => !arg.startsWith('--')).join(' ');
      if (error) return reject(new Error(`Claude 命令行 ${command} 失败：${redact(String(error.message).split('\n')[0])}`));
      try { resolve(JSON.parse(String(stdout))); } catch { reject(new Error(`Claude 命令行 ${command} 的输出无法解析。`)); }
    });
  });
}

const pluginShape = item => item && typeof item.id === 'string' && /^[^@\s]+@[^@\s]+$/.test(item.id) && typeof item.scope === 'string' && typeof item.enabled === 'boolean';
const marketShape = item => item && typeof item.name === 'string' && typeof item.source === 'string';

/** Claude's install record (fallback evidence): `installed_plugins.json` version 2. */
async function installRecord(configDir) {
  try {
    const value = JSON.parse(await fs.readFile(path.join(configDir, 'plugins/installed_plugins.json'), 'utf8'));
    if (value?.version !== 2 || !value.plugins || typeof value.plugins !== 'object') return null;
    return Object.entries(value.plugins).flatMap(([id, entries]) => Array.isArray(entries) ? entries.filter(entry => entry && typeof entry.scope === 'string')
      .map(entry => ({ id, scope: entry.scope, version: entry.version, installPath: entry.installPath, projectPath: entry.projectPath, enabled: null })) : []);
  } catch { return null; }
}

async function knownMarketplaces(configDir) {
  try { const value = JSON.parse(await fs.readFile(path.join(configDir, 'plugins/known_marketplaces.json'), 'utf8')); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
  catch { return {}; }
}

async function readManifest(directory) {
  for (const file of ['.claude-plugin/plugin.json']) {
    try { const value = JSON.parse(await fs.readFile(path.join(directory, file), 'utf8')); if (value && typeof value === 'object') return value; } catch { /* none */ }
  }
  return null;
}

async function countSkills(directory) {
  let count = 0;
  for (const folder of ['skills', 'commands']) {
    for (const entry of await fs.readdir(path.join(directory, folder), { withFileTypes: true }).catch(() => [])) {
      if (folder === 'skills' && (entry.isDirectory() || entry.isSymbolicLink()) && await exists(path.join(directory, folder, entry.name, 'SKILL.md'))) count++;
      if (folder === 'commands' && entry.isFile() && entry.name.endsWith('.md')) count++;
    }
  }
  return count;
}

/**
 * Project skill roots: `.claude/skills` in the project and each parent up to the nearest
 * repository root; without a repository, the project directory alone.
 */
async function projectSkillRoots(project) {
  const chain = [];
  for (let directory = path.resolve(project); ; directory = path.dirname(directory)) {
    chain.push(path.join(directory, '.claude/skills'));
    if (await exists(path.join(directory, '.git'))) return chain;
    if (path.dirname(directory) === directory) return chain.slice(0, 1);
  }
}

// When the project is the home directory its `.claude` is the user configuration itself.
const sameDirectory = async (a, b) => (await fs.realpath(a).catch(() => path.resolve(a))) === (await fs.realpath(b).catch(() => path.resolve(b)));

async function scanSkills({ roots, layers, diagnostics, problems }) {
  const skills = []; const plugins = [];
  for (const { directory: root, scope } of roots) {
    let entries;
    try { entries = await fs.readdir(root, { withFileTypes: true }); }
    catch (error) { if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') problems.push(`技能目录 ${root} 无法读取（${error.code || 'UNREADABLE'}）。`); continue; }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith('.') || !(entry.isDirectory() || entry.isSymbolicLink())) continue;
      const directory = path.join(root, entry.name);
      // A directory with a Claude manifest is a skills-directory plugin, not a skill (9.3 V9).
      const manifest = await readManifest(directory);
      if (manifest) { plugins.push({ directory, manifest, scope }); continue; }
      if (!await exists(path.join(directory, 'SKILL.md'))) continue;
      let detail; let real; let isLink = false;
      try { isLink = (await fs.lstat(directory)).isSymbolicLink(); real = await fs.realpath(path.join(directory, 'SKILL.md')); detail = await metadata(directory); }
      catch (error) { diagnostics.push(`${directory}：${redact(error.message)}`); continue; }
      const { source, value } = enablement(layers, 'skillOverrides', detail.name, (a, b) => a === b);
      const visibility = VISIBILITY[value ?? 'on'];
      // An unknown value is an unknown format (HLD 3.2): the environment is unconfirmed.
      const unknown = !visibility ? `技能 ${detail.name} 的可见性设置 ${String(value)} 无法识别。` : null;
      if (unknown) problems.push(unknown);
      skills.push({
        agents: ['claude'], id: claudeIds.skill(scope, directory), name: detail.name, description: detail.description, path: path.join(directory, 'SKILL.md'), realPath: real,
        scope, sourceLabel: scope === 'user' ? 'Claude 个人技能' : 'Claude 项目技能', enabled: visibility === 'enabled' ? true : visibility === 'disabled' ? false : null,
        ...(visibility ? { visibility } : {}), enablement: source, ...(source.locked ? { protection: 'managed' } : {}), managed: !!source.locked, isLink,
        // Visibility is a settings entry SkillDock can write (HLD 3.4) unless managed settings decide it.
        canToggle: !unknown && !source.locked, canRemove: false, canUpdate: false,
        ...(unknown ?? source.locked ? { reason: unknown ?? '可见性由组织托管设置决定，不能在这里修改。' } : {}), statusEvidence: 'Claude 技能目录 + 设置中的技能可见性', updatedAt: detail.updatedAt,
        revision: revision({ real, visibility: visibility ?? String(value), source }),
      });
    }
  }
  return { skills, skillDirectoryPlugins: plugins };
}

/**
 * The Claude catalog for a multi-agent snapshot. `cli` is the verified command line (or
 * null); `unconfirmed` is the reason the environment is unconfirmed, or null.
 */
export async function claudeCatalog({ claudeRoot, project, cli, env = process.env, timeout = 20000, managedDir = MANAGED_DIR, listPlugins, listMarketplaces }) {
  const { configDir } = claudeRoot;
  const diagnostics = []; const problems = [];
  const settings = await readClaudeSettings({ configDir, project, managedDir });
  problems.push(...settings.problems);
  const { layers } = settings;
  const options = { env, claudeRoot, cwd: project, timeout };
  let installed = null; let markets = null;
  // Listing creates Claude's configuration when it is missing (HLD 3.1, 3.7): without the
  // root there is nothing installed, and nothing is run.
  const rooted = await isDirectory(configDir);
  if (cli?.available && rooted) {
    try {
      const value = await (listPlugins ? listPlugins() : run(cli.path, ['plugin', 'list', '--json'], options));
      if (!Array.isArray(value) || !value.every(pluginShape)) throw new Error('Claude 命令行 plugin list 的输出形状未知。');
      installed = value;
    } catch (error) { problems.push(error.message); }
    try {
      const value = await (listMarketplaces ? listMarketplaces() : run(cli.path, ['plugin', 'marketplace', 'list', '--json'], options));
      if (!Array.isArray(value) || !value.every(marketShape)) throw new Error('Claude 命令行 plugin marketplace list 的输出形状未知。');
      markets = value;
    } catch (error) { problems.push(error.message); }
  }
  // Fast path and fallback (HLD 3.2): Claude's own records, shown as unconfirmed evidence.
  const record = installed ? null : await installRecord(configDir);
  const known = await knownMarketplaces(configDir);
  // Skills-directory plugins are identified by their directory below; the lists only give their state.
  const pluginList = (installed ?? record ?? []).filter(item => {
    const [name, market] = item.id.split('@');
    return name && market && market !== 'skills-dir';
  });
  const plugins = [];
  for (const item of pluginList) {
    const [name, marketplace] = item.id.split('@');
    const installPath = typeof item.installPath === 'string' && path.isAbsolute(item.installPath) ? item.installPath : undefined;
    const manifest = installPath ? await readManifest(installPath) : null;
    const projectPath = ['project', 'local'].includes(item.scope) && typeof item.projectPath === 'string' ? item.projectPath : undefined;
    const synced = marketplace === 'synced';
    const { source } = enablement(layers, 'enabledPlugins', item.id, (a, b) => a === b);
    if (synced) Object.assign(source, { locked: true });
    const enabled = typeof item.enabled === 'boolean' ? item.enabled : null;
    const fromFiles = decidedBy(layers, 'enabledPlugins', item.id).value;
    const installation = { scope: item.scope, ...(projectPath ? { projectPath } : {}) };
    if (projectPath && !await exists(projectPath)) installation.readOnlyReason = `项目目录 ${projectPath} 不存在，这条安装只读。`;
    const manifests = [];
    if (installPath && await exists(path.join(installPath, '.codex-plugin/plugin.json'))) manifests.push('codex');
    if (manifest) manifests.push('claude');
    // HLD 3.3, 3.5: what Claude lets SkillDock do with this installation, and why not.
    const overridden = enabled !== null && typeof fromFiles === 'boolean' && fromFiles !== enabled;
    const blocked = synced ? '由 claude.ai 同步的插件由组织管理，不能在这里修改。'
      : item.scope === 'managed' ? '由组织托管安装的插件不能在这里修改。'
      : installation.readOnlyReason;
    const toggleReason = blocked ?? (source.locked ? '启用状态由组织托管设置决定，不能在这里修改。'
      : overridden ? enabled ? '设置文件中是停用，但 Claude 实际启用了它：由设置文件之外的更高层级（例如组织托管设置）决定。' : '设置文件中是启用，但 Claude 实际停用了它：由设置文件之外的更高层级（例如组织托管设置）决定。'
      : enabled === null ? 'Claude 没有报告这个插件的启用状态，暂不能切换。' : undefined);
    plugins.push({
      agents: ['claude'], id: claudeIds.plugin(item.id, item.scope, projectPath), name, displayName: manifest?.name !== name ? manifest?.name : undefined,
      description: typeof manifest?.description === 'string' ? manifest.description : '', marketplace, version: typeof item.version === 'string' ? item.version : undefined,
      installed: true, enabled, skillCount: installPath ? await countSkills(installPath) : 0, ...(installPath ? { installedPath: installPath, realPath: await fs.realpath(installPath).catch(() => installPath) } : {}),
      installation, enablement: source, manifests, ...(synced ? { protection: 'synced' } : source.locked || item.scope === 'managed' ? { protection: 'managed' } : {}),
      canInstall: false, canRemove: !blocked, canToggle: !toggleReason,
      ...(blocked ?? toggleReason ? { reason: blocked ?? toggleReason } : {}),
      revision: revision({ id: item.id, scope: item.scope, projectPath, version: item.version, enabled, source }),
    });
  }
  // Skills-directory plugins (name@skills-dir) load in place (9.3 V9).
  const userSkills = { directory: path.join(configDir, 'skills'), scope: 'user' };
  const roots = [userSkills];
  for (const directory of await projectSkillRoots(project)) if (!await sameDirectory(directory, userSkills.directory)) roots.push({ directory, scope: 'project' });
  const { skills, skillDirectoryPlugins } = await scanSkills({ roots, layers, diagnostics, problems });
  for (const { directory, manifest, scope } of skillDirectoryPlugins) {
    const name = typeof manifest.name === 'string' ? manifest.name : path.basename(directory);
    const id = `${name}@skills-dir`;
    const listed = (installed ?? []).find(item => item.id === id && (item.scope === scope || !item.scope));
    const { source } = enablement(layers, 'enabledPlugins', id, (a, b) => a === b);
    // Claude reports a skills-directory plugin only once it loads it (a project directory must be trusted).
    const toggleReason = source.locked ? '启用状态由组织托管设置决定，不能在这里修改。' : !listed ? 'Claude 尚未加载这个技能目录插件（项目目录可能未被信任），暂不能切换。' : undefined;
    // Removal moves the directory to the restorable area (phase 4d): only from the personal skills
    // directory or the current project's .claude/skills.
    const removable = [path.join(configDir, 'skills'), path.join(project, '.claude/skills')].includes(path.dirname(directory));
    plugins.push({ agents: ['claude'], id: claudeIds.plugin(id, scope, directory), name, description: typeof manifest.description === 'string' ? manifest.description : '', marketplace: 'skills-dir',
      version: typeof manifest.version === 'string' ? manifest.version : undefined, installed: true, enabled: listed ? listed.enabled : null, skillCount: await countSkills(directory),
      installedPath: directory, realPath: await fs.realpath(directory).catch(() => directory), installation: { scope, skillsDir: path.dirname(directory) }, enablement: source,
      manifests: ['claude', ...(await exists(path.join(directory, '.codex-plugin/plugin.json')) ? ['codex'] : [])].sort(),
      canInstall: false, canRemove: removable, canToggle: !toggleReason, ...(toggleReason ?? (removable ? undefined : SKILLS_DIR_REMOVAL) ? { reason: toggleReason ?? SKILLS_DIR_REMOVAL } : {}), revision: revision({ id, directory, enabled: listed?.enabled, source }) });
  }
  const marketplaces = []; const available = [];
  // Installed in any scope, by the command line or Claude's own record (which also lists
  // installs in other projects), is not "not installed".
  const records = installed ? await installRecord(configDir) ?? [] : record ?? [];
  const listedIds = new Set([...pluginList, ...records].map(item => item.id));
  for (const item of markets ?? Object.entries(known).map(([name, entry]) => ({ name, source: entry?.source?.source ?? 'unknown', installLocation: entry?.installLocation }))) {
    const entry = known[item.name] || {};
    const declared = decidedBy(layers, 'extraKnownMarketplaces', item.name).value;
    const autoUpdate = typeof declared?.autoUpdate === 'boolean' ? { enabled: declared.autoUpdate, isDefault: false }
      : typeof entry.autoUpdate === 'boolean' ? { enabled: entry.autoUpdate, isDefault: false } : { enabled: officialDefault(item.name), isDefault: true };
    if (autoUpdate.enabled) autoUpdate.note = '从 Claude 桌面应用打开的会话不会自动更新插件；终端中的会话按这个开关更新。';
    let pluginCount = 0;
    const location = typeof item.installLocation === 'string' ? item.installLocation : entry.installLocation;
    if (typeof location === 'string') {
      try {
        const catalog = JSON.parse(await fs.readFile(path.join(location, '.claude-plugin/marketplace.json'), 'utf8'));
        if (!Array.isArray(catalog?.plugins)) throw new Error('unknown shape');
        pluginCount = catalog.plugins.length;
        if (!plainName(item.name)) diagnostics.push(`marketplace ${item.name.replace(/\p{C}/gu, '').slice(0, 80)} 的名称无法用作插件身份，未列出其中未安装的插件。`);
        // Installable plugins come from the marketplace copy already on disk (HLD 3.2 table:
        // the secondary source), so the snapshot never runs the networked `--available` list.
        // Without any install evidence, an entry might already be installed: list none.
        if ((installed ?? record) && plainName(item.name)) for (const plugin of catalog.plugins) {
          if (!plainName(plugin?.name)) continue;
          const id = `${plugin.name}@${item.name}`;
          if (listedIds.has(id)) continue;
          listedIds.add(id);
          const version = typeof plugin.version === 'string' ? plugin.version : undefined;
          available.push({ agents: ['claude'], id: claudeIds.available(id), name: plugin.name, displayName: typeof plugin.displayName === 'string' && plugin.displayName !== plugin.name ? plugin.displayName : undefined,
            description: typeof plugin.description === 'string' ? plugin.description : '', marketplace: item.name, version, installed: false, enabled: null, skillCount: 0,
            canInstall: true, canRemove: false, canToggle: false, revision: revision({ id, version }) });
        }
      } catch { diagnostics.push(`marketplace ${item.name.replace(/\p{C}/gu, '').slice(0, 80)} 的本机副本无法读取，插件数与其中未安装的插件暂不显示。`); }
    }
    const sourceText = item.repo || item.url || item.path || entry.source?.repo || entry.source?.url || entry.source?.path || item.source;
    // A marketplace that organisation-managed settings declare cannot be removed here.
    const managedDeclaration = decidedBy(layers, 'extraKnownMarketplaces', item.name).layer === 'managed';
    marketplaces.push({ agents: ['claude'], id: claudeIds.marketplace(item.name), name: item.name, source: publicSource(String(sourceText)), type: item.source, pluginCount, autoUpdate,
      ...(typeof entry.lastUpdated === 'string' ? { refreshedAt: entry.lastUpdated } : {}), canRemove: !managedDeclaration, canRefresh: true,
      ...(managedDeclaration ? { protection: 'managed', reason: '由组织托管设置声明的 marketplace 不能在这里移除。' } : {}),
      revision: revision({ name: item.name, autoUpdate, plugins: plugins.filter(plugin => plugin.marketplace === item.name).map(plugin => plugin.id).sort() }) });
  }
  plugins.push(...available);
  diagnostics.push(...problems.slice(1));
  const unconfirmed = !cli?.available ? null : problems.length ? `无法确认 Claude 中的插件状态：${problems[0]}` : null;
  // Which settings layers declare each marketplace, listed or not (a removal must leave none
  // behind), and whether the shared project settings hold entries of plugins from it: removing it
  // changes them too (4a review P1-01; review r2 P3-04).
  const declarations = {}; const projectEntries = {};
  for (const layer of LAYERS) for (const name of Object.keys(layers[layer].extraKnownMarketplaces || {})) (declarations[name] ??= []).push(layer);
  for (const key of Object.keys(layers.project.enabledPlugins || {})) { const market = key.split('@')[1]; if (market) projectEntries[market] = true; }
  // Claude's own install record, in every project: whether a marketplace is still in use (4d review P2-04).
  const recordedInstalls = records.map(({ id, scope, projectPath }) => ({ id, scope, ...(projectPath ? { projectPath } : {}) }));
  return { skills, plugins, marketplaces, diagnostics, unconfirmed, evidence: installed ? 'cli' : record ? 'record' : 'none', listed: !!(cli?.available && rooted), declarations, projectEntries, recordedInstalls };
}
