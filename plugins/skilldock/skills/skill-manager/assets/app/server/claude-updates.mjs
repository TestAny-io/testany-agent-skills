// SPDX-License-Identifier: AGPL-3.0-only
// Update items for Claude objects (phase 5a; API-SDX-001 36c §6, HLD 3.3, 3.3A, DEC-SDX-019).
// A Claude-only skill, the Claude side of a shared skill that Claude leads, and a skills-directory
// plugin update by the file transaction from their recorded source. A plugin installed from a
// marketplace updates through Claude's command line (phase 5b, 5c); those SkillDock never
// updates say why.

const tracked = (name, path, extra) => ({ agent: 'claude', name, owner: 'SkillDock', route: 'skill-source', status: 'unchecked', canCheck: true, canApply: false, canAutoApply: true,
  message: '检查已追踪来源的文件变化。', installedPath: path, ...extra });
const blocked = (name, path, reasonCode, message, route = 'owner-managed', extra = {}) => ({ agent: 'claude', name, owner: 'Claude', route, status: 'blocked', canCheck: false, canApply: false, canAutoApply: false,
  message, reasonCode, installedPath: path, ...extra });

function skillItem(skill, sources) {
  const shared = skill.agents?.length === 2;
  const view = shared ? skill.perAgent.claude : skill;
  const target = { kind: 'skill', id: skill.id, agent: 'claude' };
  const extra = { target, sourceInfo: sources.get(skill.id), installedVersion: skill.version, affectedSkillIds: [skill.id] };
  if (view.canUpdate) return tracked(skill.name, view.path, extra);
  if (view.protection) return blocked(skill.name, view.path, 'HOST_MANAGED', '由组织托管设置管理；SkillDock 不代为更新。', 'owner-managed', extra);
  if (view.removeKind === 'link' || skill.isLink) return blocked(skill.name, view.path, 'LINK_MANAGED', '此技能通过链接接入；更新请在真实来源目录进行。', 'owner-managed', extra);
  // Only the personal skills directory and the current project's .claude/skills are written (4b review P3-04).
  if (!view.canRemove) return blocked(skill.name, view.path, 'ROOT_BOUNDARY', '这个技能不在个人技能目录或当前项目的 .claude/skills 中，属于仓库或其他项目；SkillDock 不在这里更新它。', 'owner-managed', extra);
  return blocked(skill.name, view.path, 'SOURCE_UNKNOWN', '关联一个本地或 Git 来源后，预览差异并更新；关联本身不会替换文件。', 'connect-source', extra);
}

function pluginItem(plugin, sources, skillsDir) {
  const target = { kind: 'plugin', id: plugin.id, agent: 'claude' };
  const path = plugin.installedPath; const extra = { target, sourceInfo: sources.get(plugin.id) ?? plugin.sourceInfo, installedVersion: plugin.version, affectedSkillIds: [] };
  const name = plugin.displayName || plugin.name;
  if (plugin.marketplace === 'skills-dir') {
    const { canUpdate, isLink } = skillsDir.get(plugin.id) ?? {};
    if (canUpdate) return { ...tracked(name, path, extra), route: 'plugin-files', message: '检查已追踪来源的文件变化；更新时替换技能目录中的插件文件。' };
    return blocked(name, path, isLink ? 'LINK_MANAGED' : 'SOURCE_UNKNOWN', isLink ? '这个技能目录插件通过链接接入；更新请在真实来源目录进行。' : '这个技能目录插件没有 SkillDock 记录的来源；请在它的来源处更新。', 'owner-managed', extra);
  }
  // DEC-SDX-019: what Claude or the organisation manages is shown with its reason, not updated here.
  if (plugin.protection === 'synced') return blocked(name, path, 'HOST_MANAGED', '由 claude.ai 账号同步；SkillDock 不代为更新。', 'owner-managed', extra);
  if (plugin.installation?.scope === 'managed' || plugin.protection === 'managed') return blocked(name, path, 'HOST_MANAGED', '由组织托管设置安装；SkillDock 不代为更新。', 'owner-managed', extra);
  // A marketplace SkillDock generated for a source updates from that source (phase 5c).
  if (plugin.marketplace.startsWith('skilldock-')) return blocked(name, path, 'NOT_YET_AVAILABLE', '这一版 SkillDock 暂不能检查这个 Claude 插件的更新；可在 Claude Code 中用 /plugin 更新。', 'claude-plugin', extra);
  // Phase 5b: from its marketplace, through Claude's command line (HLD 3.3A).
  return { agent: 'claude', name, owner: 'Claude', route: 'claude-plugin', status: 'unchecked', canCheck: true, canApply: false, canAutoApply: true,
    message: '检查这个插件的来源；更新经 Claude 命令行完成，并读回核对。', installedPath: path, ...extra };
}

/**
 * The update items of the Claude objects in a multi-agent snapshot, before any observation.
 * `sources` maps an object ID to its Claude-side source information (SkillDock's records);
 * `skillsDir` maps a skills-directory plugin's ID to whether SkillDock can update it.
 */
export function claudeUpdateItems(snapshot, { sources = new Map(), skillsDir = new Map() } = {}) {
  const items = [];
  for (const skill of snapshot.skills) {
    const claudeOnly = skill.agents?.length === 1 && skill.agents[0] === 'claude' && ['user', 'project'].includes(skill.scope);
    const leads = skill.agents?.length === 2 && !!skill.perAgent?.claude?.canUpdate;
    if (claudeOnly || leads) items.push(skillItem(skill, sources));
  }
  for (const plugin of snapshot.plugins) if (plugin.installed && plugin.agents?.length === 1 && plugin.agents[0] === 'claude') items.push(pluginItem(plugin, sources, skillsDir));
  return items;
}

/** Shared skills whose update Claude leads: their Codex-side item gives way to Claude's. */
export function claudeLedSkills(snapshot) {
  return new Set(snapshot.skills.filter(skill => skill.agents?.length === 2 && skill.perAgent?.claude?.canUpdate).map(skill => skill.id));
}
