import fs from 'node:fs/promises';
import path from 'node:path';
import { exists, inside, publicSource, safeSegment } from './files.mjs';
import { runProcess } from './cli.mjs';

const gitCache = new Map();
export const OWNER_HELP = 'https://learn.chatgpt.com/docs/enterprise/manage-app-updates';
export const PLUGIN_HELP = 'https://developers.openai.com/plugins/build/plugins';
export const targetKey = target => `${target.kind}:${target.id}`;

export function pluginSourceInfo(plugin, details = {}) {
  const local = details.sourceType === 'local' || !!plugin.sourcePath;
  const owner = plugin.marketplace === 'openai-bundled' ? 'Codex bundled plugins' : plugin.marketplace === 'openai-primary-runtime' ? 'Codex workspace runtime' : plugin.marketplace === 'openai-curated-remote' ? 'Codex remote plugin manager' : `Marketplace · ${plugin.marketplace}`;
  return { kind: 'plugin', confidence: plugin.installed ? 'verified' : 'inferred', owner, label: plugin.marketplace,
    evidence: plugin.installed ? 'Codex 已安装清单与所属 marketplace。' : 'Marketplace 声明；未确认安装。',
    source: publicSource(details.source || plugin.sourcePath || `remote:${details.remoteId || plugin.id}`),
    ...(local ? { sourceType: 'local' } : {}), marketplace: plugin.marketplace, pluginId: plugin.id, ownerVersion: plugin.version, helpUrl: PLUGIN_HELP };
}

export async function inferGitSource(directory, stopAt) {
  const cacheKey = `${directory}:${stopAt}`; const cached = gitCache.get(cacheKey);
  if (cached && Date.now() - cached.at < 10000) return cached.value;
  let cursor = directory; let found;
  for (let depth = 0; depth < 24; depth += 1) {
    if (await exists(path.join(cursor, '.git'))) { found = cursor; break; }
    if (cursor === stopAt || cursor === path.dirname(cursor)) break;
    cursor = path.dirname(cursor);
  }
  if (!found) { gitCache.set(cacheKey, { at: Date.now(), value: null }); return null; }
  const env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_OPTIONAL_LOCKS: '0' };
  for (const key of Object.keys(env)) if (/^GIT_(DIR|WORK_TREE|INDEX_FILE|CONFIG_PARAMETERS|CONFIG_COUNT|CONFIG_KEY_|CONFIG_VALUE_)/.test(key)) delete env[key];
  const run = async args => (await runProcess('git', ['-c', 'core.hooksPath=/dev/null', '-C', directory, ...args], { env, timeout: 3000 })).stdout.trim();
  try {
    const root = await run(['rev-parse', '--show-toplevel']);
    if (!inside(root, directory)) return null;
    const commit = await run(['rev-parse', 'HEAD']);
    const origin = await run(['config', '--get', 'remote.origin.url']).catch(() => '');
    const ref = await run(['symbolic-ref', '--short', 'HEAD']).catch(() => '');
    const value = { kind: 'git-checkout', confidence: 'inferred', owner: 'Git working tree', label: '现有 Git 工作区',
      evidence: '读取已有 Git origin、HEAD 和目录相对路径；未 fetch、pull 或修改工作树。',
      source: publicSource(origin || root), sourceType: origin ? 'git' : 'local', subpath: path.relative(root, directory) || '.', commit, ...(ref ? { ref } : {}), helpUrl: 'https://git-scm.com/docs/git-pull' };
    gitCache.set(cacheKey, { at: Date.now(), value }); return value;
  } catch { return null; }
}

export async function enrichSources(snapshot, environment, registry) {
  for (const plugin of snapshot.plugins) if (!plugin.sourceInfo) plugin.sourceInfo = pluginSourceInfo(plugin);
  let marker;
  try { const value = await fs.readFile(path.join(environment.codexHome, 'skills/.system/.codex-system-skills.marker'), 'utf8'); if (/^[a-f0-9]{8,64}\s*$/.test(value)) marker = value.trim(); } catch { /* Optional host marker. */ }
  for (const skill of snapshot.skills) {
    const tracked = registry.sources[skill.id]; const plugin = snapshot.plugins.find(item => item.id === skill.pluginId && item.installed);
    if (plugin) skill.sourceInfo = { ...plugin.sourceInfo, label: plugin.name, pluginId: plugin.id };
    else if (skill.scope === 'system') skill.sourceInfo = { kind: 'system', confidence: 'verified', owner: 'Codex', label: 'Codex 系统内置', evidence: marker ? `系统技能标记 ${marker}；由宿主提供。` : '位于 Codex 系统技能根；由宿主维护。', source: snapshot.cli.path || environment.codexHome, sourceType: 'local', ownerVersion: snapshot.cli.version, helpUrl: OWNER_HELP };
    else if (tracked) skill.sourceInfo = { kind: 'tracked', confidence: tracked.confidence || 'verified', owner: 'SkillDock', label: tracked.confidence === 'user-confirmed' ? '用户关联来源' : '已追踪来源', evidence: '已记录来源及当前安装内容指纹；更新前重新校验。', source: publicSource(tracked.source), sourceType: tracked.sourceType, subpath: tracked.subpath, ref: tracked.ref, commit: tracked.commit };
    else if (skill.scope === 'cache' || skill.pluginId) skill.sourceInfo = { kind: 'plugin', confidence: 'inferred', owner: 'Codex plugin manager', label: '仅缓存线索', evidence: '缓存路径表明包名和版本，不能证明当前有效安装或原始下载来源。', pluginId: skill.pluginId, ownerVersion: skill.version, helpUrl: PLUGIN_HELP };
    else skill.sourceInfo = await inferGitSource(path.dirname(skill.path), environment.home) || { kind: 'unknown', confidence: 'unknown', owner: 'User', label: '来源未记录', evidence: '未发现安装来源记录；文件名和修改时间不能证明来源。' };
    if (skill.sourceInfo.kind === 'git-checkout' && !tracked) skill.canUpdate = false;
  }
  return snapshot;
}

export function buildUpdateItems(snapshot, observations = {}, hasPreview = () => false) {
  const items = [];
  for (const plugin of snapshot.plugins.filter(item => item.installed)) {
    const source = plugin.sourceInfo; const attached = snapshot.skills.filter(skill => skill.pluginId === plugin.id);
    const local = source?.sourceType === 'local' && source.confidence === 'verified' && !!plugin.sourcePath && typeof plugin.enabled === 'boolean' && [plugin.marketplace, plugin.name, plugin.version].every(safeSegment);
    const installedPath = [plugin.marketplace, plugin.name, plugin.version].every(safeSegment) ? path.join(path.dirname(snapshot.paths.config), 'plugins/cache', plugin.marketplace, plugin.name, plugin.version) : undefined;
    items.push({ target: { kind: 'plugin', id: plugin.id }, name: plugin.name, owner: source?.owner || 'Codex', route: local ? 'plugin-reinstall' : 'owner-managed', status: local ? 'unchecked' : 'blocked', canCheck: true, canApply: false, canAutoApply: local,
      message: local ? '检查已验证来源；通过 Codex 包级重新安装更新，并保留启用状态。' : '由 Codex 远程插件管理器维护；在 Codex 插件页检查更新，随后刷新此处状态。', reasonCode: local ? undefined : 'OWNER_MANAGED', sourceInfo: source, installedVersion: plugin.version, installedPath, affectedSkillIds: attached.map(skill => skill.id) });
  }
  const system = snapshot.skills.filter(skill => skill.scope === 'system');
  if (system.length) items.push({ target: { kind: 'host', id: 'codex-system-skills' }, name: 'Codex system skills', owner: 'Codex', route: 'owner-managed', status: 'blocked', canCheck: true, canApply: false, canAutoApply: false,
    message: '系统内置技能随 Codex 宿主维护。请通过 Codex 应用的更新入口更新宿主，再刷新状态；SkillDock 不替换内置文件。', reasonCode: 'OWNER_MANAGED', sourceInfo: system[0].sourceInfo, installedVersion: snapshot.cli.version, installedPath: system[0].path, affectedSkillIds: system.map(skill => skill.id) });
  for (const skill of snapshot.skills.filter(item => item.scope !== 'system' && !snapshot.plugins.some(plugin => plugin.installed && plugin.id === item.pluginId))) {
    const tracked = skill.sourceInfo?.kind === 'tracked' && skill.canUpdate;
    const git = skill.sourceInfo?.kind === 'git-checkout'; const gitRoot = git && (skill.sourceInfo.subpath === '.' || !skill.canRemove); const cache = skill.scope === 'cache' || !!skill.pluginId;
    items.push({ target: { kind: 'skill', id: skill.id }, name: skill.name, owner: skill.sourceInfo?.owner || 'User', route: tracked ? 'skill-source' : gitRoot || cache ? 'owner-managed' : 'connect-source', status: tracked ? 'unchecked' : 'blocked', canCheck: tracked || gitRoot || cache, canApply: false, canAutoApply: tracked,
      message: tracked ? '检查已追踪来源的文件变化。' : gitRoot ? '该技能目录本身包含 Git 仓库元数据，或属于链接；请在所属 Git 工作区更新，SkillDock 不替换 .git。' : git ? '已读取 Git 来源。确认关联后可更新此技能子目录，会形成工作树变更；不会 pull 整个仓库。' : cache ? '先在 Codex 插件页确认所属包的安装状态，再刷新此处。' : '关联一个本地或 Git 来源后，预览差异并更新；关联本身不会替换文件。', reasonCode: tracked ? undefined : gitRoot || cache ? 'OWNER_MANAGED' : 'SOURCE_UNKNOWN', sourceInfo: skill.sourceInfo, installedVersion: skill.version || skill.sourceInfo?.commit, installedPath: skill.path, affectedSkillIds: [skill.id] });
  }
  return items.map(item => {
    const prior = observations[targetKey(item.target)];
    if (!prior || prior.installedVersion !== undefined && prior.installedVersion !== item.installedVersion || prior.route !== undefined && prior.route !== item.route) return item;
    const available = prior.status === 'available';
    return { ...item, ...prior, target: item.target, name: item.name, owner: item.owner, route: item.route, installedVersion: item.installedVersion, sourceInfo: item.sourceInfo, installedPath: item.installedPath, affectedSkillIds: item.affectedSkillIds,
      canCheck: item.canCheck, canAutoApply: item.canAutoApply && prior.canAutoApply !== false, canApply: available && item.route !== 'owner-managed' && hasPreview(prior.previewId), ...(available && !hasPreview(prior.previewId) ? { message: '检测到来源变化；请重新检查生成本次更新预览。' } : {}) };
  });
}
