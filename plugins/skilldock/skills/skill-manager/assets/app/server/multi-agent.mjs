// SPDX-License-Identifier: AGPL-3.0-only
// The multi-agent view (API-SDX-001 36c §6 "共用对象与去重"): Claude objects join the Codex
// snapshot; a standalone skill both Agents find at the same real path appears once.
import crypto from 'node:crypto';

const revision = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);
const STANDALONE = new Set(['user', 'project']);

/** One side of a shared skill (36c SkillSide); the two sides are independent. */
function side(skill) {
  return {
    path: skill.path, scope: skill.scope, enabled: skill.enabled,
    ...(skill.visibility ? { visibility: skill.visibility } : {}), ...(skill.enablement ? { enablement: skill.enablement } : {}),
    canToggle: skill.canToggle, canRemove: skill.canRemove, canUpdate: skill.canUpdate,
    ...(skill.removeKind ? { removeKind: skill.removeKind } : {}), ...(skill.reason ? { reason: skill.reason } : {}),
    ...(skill.protection ? { protection: skill.protection } : {}),
    revision: skill.revision ?? revision({ path: skill.path, enabled: skill.enabled, canToggle: skill.canToggle, canRemove: skill.canRemove, canUpdate: skill.canUpdate, reason: skill.reason }),
  };
}

/**
 * Merges the Claude catalog into a Codex snapshot in place. Only standalone skills merge:
 * the shared object keeps the Codex ID and Codex top-level fields, and lists both sides in
 * `perAgent`. A skill shipped by a plugin on either side is never merged.
 */
export function mergeClaude(result, claude) {
  const codexByReal = new Map();
  for (const skill of result.skills) {
    skill.agents ??= ['codex'];
    if (STANDALONE.has(skill.scope) && !skill.pluginId && skill.realPath) codexByReal.set(skill.realPath, skill);
  }
  for (const skill of claude.skills) {
    const shared = codexByReal.get(skill.realPath);
    if (!shared) { result.skills.push(skill); continue; }
    shared.agents = ['codex', 'claude'];
    shared.perAgent = { codex: side(shared), claude: side(skill) };
    shared.revision = revision([shared.perAgent.codex.revision, shared.perAgent.claude.revision]);
  }
  for (const list of [result.plugins, result.marketplaces]) for (const item of list) item.agents ??= ['codex'];
  result.plugins.push(...claude.plugins);
  result.marketplaces.push(...claude.marketplaces);
  result.diagnostics.push(...claude.diagnostics);
  return result;
}

/**
 * Multi-agent snapshots only (PRD 5.1.4, AC-001): objects of an Agent that is not managed
 * offer no changes and say why; version-1 snapshots keep 0.10.2 behaviour.
 */
export function markReadOnly(result, agent, reason) {
  const off = item => Object.assign(item, { reason });
  for (const skill of result.skills) {
    if (!(skill.agents ?? ['codex']).includes(agent)) continue;
    if (skill.perAgent?.[agent]) Object.assign(skill.perAgent[agent], { canToggle: false, canRemove: false, canUpdate: false, reason });
    if (agent === 'codex' || !(skill.agents ?? []).includes('codex')) off(Object.assign(skill, { canToggle: false, canRemove: false, canUpdate: false }));
  }
  for (const plugin of result.plugins) if ((plugin.agents ?? ['codex']).includes(agent)) off(Object.assign(plugin, { canToggle: false, canRemove: false, canInstall: false }));
  for (const market of result.marketplaces) if ((market.agents ?? ['codex']).includes(agent)) off(Object.assign(market, { canRemove: false, canRefresh: false }));
  return result;
}

