// SPDX-License-Identifier: AGPL-3.0-only
// Claude read path (HLD 3.2, 3.4; DEC-SDX-004, 020, 023; API-SDX-001 36c §6). The command
// line's lists are the main evidence; Claude's own records only stand in when they fail,
// and then the environment is unconfirmed. Settings are read for three keys only.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { claudeCliEnvironment } from './process-env.mjs';
import { metadata, redact } from './files.mjs';

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
const READ_ONLY = '这一版 SkillDock 只读取 Claude 中的对象，暂不能在这里修改。';

/** 36c §6: Claude object IDs are derived from the installation identity; clients never parse them. */
export const claudeIds = {
  plugin: (id, scope, projectPath) => `claude:plugin:${id}:${scope}${projectPath ? `:${digest(projectPath)}` : ''}`,
  skill: (scope, directory) => `claude:skill:${scope}:${digest(directory)}`,
  marketplace: name => `claude:marketplace:${name}`,
};

async function readLayer(file) {
  let text;
  try { text = await fs.readFile(file, 'utf8'); } catch (error) { if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return { file, values: {} }; return { file, error: error.code || 'UNREADABLE' }; }
  let data;
  try { data = JSON.parse(text); } catch { return { file, error: '不是有效的 JSON' }; }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { file, error: '格式未知' };
  const values = {};
  for (const key of SETTINGS_KEYS) if (data[key] !== undefined) {
    if (!data[key] || typeof data[key] !== 'object' || Array.isArray(data[key])) return { file, error: `${key} 的格式未知` };
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
    if (read.error) { problems.push(`${read.file}：${read.error}`); layers[layer] = {}; } else layers[layer] = read.values;
  }
  // Managed drop-in files merge over managed-settings.json in name order.
  const dropIn = path.join(managedDir, 'managed-settings.d');
  for (const name of (await fs.readdir(dropIn).catch(() => [])).filter(item => item.endsWith('.json')).sort()) {
    const read = await readLayer(path.join(dropIn, name));
    if (read.error) { problems.push(`${read.file}：${read.error}`); continue; }
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
      if (error) return reject(new Error(`claude ${args.slice(0, 2).join(' ')} 失败：${redact(String(error.message).split('\n')[0])}`));
      try { resolve(JSON.parse(String(stdout))); } catch { reject(new Error(`claude ${args.slice(0, 2).join(' ')} 的输出无法解析`)); }
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

async function scanSkills({ roots, layers, diagnostics }) {
  const skills = []; const plugins = [];
  for (const { directory: root, scope } of roots) {
    let entries;
    try { entries = await fs.readdir(root, { withFileTypes: true }); } catch (error) { if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') diagnostics.push(`${root}：${error.code}`); continue; }
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
      if (!visibility) { diagnostics.push(`技能 ${detail.name} 的可见性设置 ${String(value)} 无法识别。`); }
      const state = { visibility: visibility || 'enabled', source };
      skills.push({
        agents: ['claude'], id: claudeIds.skill(scope, directory), name: detail.name, description: detail.description, path: path.join(directory, 'SKILL.md'), realPath: real,
        scope, sourceLabel: scope === 'user' ? 'Claude 个人技能' : 'Claude 项目技能', enabled: state.visibility === 'enabled' ? true : state.visibility === 'disabled' ? false : null,
        visibility: state.visibility, enablement: source, ...(source.locked ? { protection: 'managed' } : {}), managed: !!source.locked, isLink,
        canToggle: false, canRemove: false, canUpdate: false, reason: READ_ONLY, statusEvidence: 'Claude 技能目录 + 设置中的技能可见性', updatedAt: detail.updatedAt,
        revision: revision({ real, visibility: state.visibility, source }),
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
  if (cli?.available) {
    try {
      const value = await (listPlugins ? listPlugins() : run(cli.path, ['plugin', 'list', '--json'], options));
      if (!Array.isArray(value) || !value.every(pluginShape)) throw new Error('claude plugin list 的输出形状未知');
      installed = value;
    } catch (error) { problems.push(error.message); }
    try {
      const value = await (listMarketplaces ? listMarketplaces() : run(cli.path, ['plugin', 'marketplace', 'list', '--json'], options));
      if (!Array.isArray(value) || !value.every(marketShape)) throw new Error('claude plugin marketplace list 的输出形状未知');
      markets = value;
    } catch (error) { problems.push(error.message); }
  }
  // Fast path and fallback (HLD 3.2): Claude's own records, shown as unconfirmed evidence.
  const record = installed ? null : await installRecord(configDir);
  const known = await knownMarketplaces(configDir);
  const pluginList = (installed ?? record ?? []).filter(item => {
    const [name, market] = item.id.split('@');
    return name && market;
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
    plugins.push({
      agents: ['claude'], id: claudeIds.plugin(item.id, item.scope, projectPath), name, displayName: manifest?.name !== name ? manifest?.name : undefined,
      description: typeof manifest?.description === 'string' ? manifest.description : '', marketplace, version: typeof item.version === 'string' ? item.version : undefined,
      installed: true, enabled, skillCount: installPath ? await countSkills(installPath) : 0, ...(installPath ? { installedPath: installPath, realPath: await fs.realpath(installPath).catch(() => installPath) } : {}),
      installation, enablement: source, manifests, ...(synced ? { protection: 'synced' } : source.locked ? { protection: 'managed' } : {}),
      canInstall: false, canRemove: false, canToggle: false,
      reason: synced ? '由 claude.ai 同步的插件由组织管理，不能在这里修改。' : enabled !== null && typeof fromFiles === 'boolean' && fromFiles !== enabled
        ? `设置文件写的是${fromFiles ? '启用' : '停用'}，Claude 实际${enabled ? '启用' : '停用'}：由设置文件之外的更高层级（例如组织托管设置）决定。` : READ_ONLY,
      revision: revision({ id: item.id, scope: item.scope, projectPath, version: item.version, enabled, source }),
    });
  }
  // Skills-directory plugins (name@skills-dir) load in place (9.3 V9).
  const userSkills = { directory: path.join(configDir, 'skills'), scope: 'user' };
  const roots = [userSkills];
  for (const directory of await projectSkillRoots(project)) if (!await sameDirectory(directory, userSkills.directory)) roots.push({ directory, scope: 'project' });
  const { skills, skillDirectoryPlugins } = await scanSkills({ roots, layers, diagnostics });
  for (const { directory, manifest, scope } of skillDirectoryPlugins) {
    const name = typeof manifest.name === 'string' ? manifest.name : path.basename(directory);
    const id = `${name}@skills-dir`;
    if (plugins.some(item => item.name === name && item.marketplace === 'skills-dir')) continue;
    const listed = (installed ?? []).find(item => item.id === id);
    const { source } = enablement(layers, 'enabledPlugins', id, (a, b) => a === b);
    plugins.push({ agents: ['claude'], id: claudeIds.plugin(id, scope, directory), name, description: typeof manifest.description === 'string' ? manifest.description : '', marketplace: 'skills-dir',
      version: typeof manifest.version === 'string' ? manifest.version : undefined, installed: true, enabled: listed ? listed.enabled : null, skillCount: await countSkills(directory),
      installedPath: directory, realPath: await fs.realpath(directory).catch(() => directory), installation: { scope, skillsDir: path.dirname(directory) }, enablement: source,
      manifests: ['claude', ...(await exists(path.join(directory, '.codex-plugin/plugin.json')) ? ['codex'] : [])].sort(),
      canInstall: false, canRemove: false, canToggle: false, reason: READ_ONLY, revision: revision({ id, directory, enabled: listed?.enabled, source }) });
  }
  const marketplaces = [];
  for (const item of markets ?? Object.entries(known).map(([name, entry]) => ({ name, source: entry?.source?.source ?? 'unknown', installLocation: entry?.installLocation }))) {
    const entry = known[item.name] || {};
    const declared = decidedBy(layers, 'extraKnownMarketplaces', item.name).value;
    const autoUpdate = typeof declared?.autoUpdate === 'boolean' ? { enabled: declared.autoUpdate, isDefault: false }
      : typeof entry.autoUpdate === 'boolean' ? { enabled: entry.autoUpdate, isDefault: false } : { enabled: officialDefault(item.name), isDefault: true };
    if (autoUpdate.enabled) autoUpdate.note = '从 Claude 桌面应用打开的会话不会自动更新插件；终端中的会话按这个开关更新。';
    let pluginCount = 0;
    const location = typeof item.installLocation === 'string' ? item.installLocation : entry.installLocation;
    if (typeof location === 'string') {
      try { const catalog = JSON.parse(await fs.readFile(path.join(location, '.claude-plugin/marketplace.json'), 'utf8')); pluginCount = Array.isArray(catalog.plugins) ? catalog.plugins.length : 0; } catch { /* unknown */ }
    }
    const sourceText = item.repo || item.url || item.path || entry.source?.repo || entry.source?.url || entry.source?.path || item.source;
    marketplaces.push({ agents: ['claude'], id: claudeIds.marketplace(item.name), name: item.name, source: String(sourceText), type: item.source, pluginCount, autoUpdate,
      ...(typeof entry.lastUpdated === 'string' ? { refreshedAt: entry.lastUpdated } : {}), canRemove: false, canRefresh: false, reason: READ_ONLY,
      revision: revision({ name: item.name, autoUpdate, plugins: plugins.filter(plugin => plugin.marketplace === item.name).map(plugin => plugin.id).sort() }) });
  }
  const unconfirmed = !cli?.available ? null : problems.length ? `无法确认 Claude 中的插件状态：${problems.join('；')}。` : null;
  return { skills, plugins, marketplaces, diagnostics, unconfirmed, evidence: installed ? 'cli' : record ? 'record' : 'none' };
}
