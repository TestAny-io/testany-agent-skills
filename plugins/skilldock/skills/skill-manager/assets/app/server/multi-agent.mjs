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
