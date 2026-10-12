// Version-2 requests (API-SDX-001 36c §5–6): which side a write belongs to, and when the
// multi-agent snapshot may be asked for.
import type { ActionRequest, Agent, Plugin, Snapshot } from "../shared/contracts";

/** The multi-agent snapshot only from a service with API version 2 or later. */
export function stateUrl(mode: string, apiVersion: number | undefined) {
  return `/api/state?mode=${mode}${(apiVersion ?? 1) >= 2 ? "&multiAgent=1" : ""}`;
}

/**
 * The side a write acts on: the request's own `agent`, else the object it names (a shared
 * object acts on its Codex side), else Codex (global and multi-target actions).
 */
export function requestAgent(request: Omit<ActionRequest, "mode">, snapshot: Pick<Snapshot, "skills" | "plugins" | "marketplaces"> | null): Agent {
  if (request.agent) return request.agent;
  const id = request.id ?? request.target?.id;
  const object = id && snapshot ? [...snapshot.skills, ...snapshot.plugins, ...snapshot.marketplaces].find(item => item.id === id) : undefined;
  const agents = object?.agents ?? ["codex"];
  return agents.includes("codex") ? "codex" : agents[0];
}

/**
 * 36c 7.1: a write to a single Claude object, or to a skill both Agents share, carries the
 * revision the page showed (for a shared skill, the one that covers both sides).
 */
export function requestRevision(request: Omit<ActionRequest, "mode">, snapshot: Pick<Snapshot, "skills" | "plugins" | "marketplaces"> | null): string | undefined {
  if (request.expectedRevision !== undefined || !snapshot) return request.expectedRevision;
  const id = request.id ?? request.target?.id;
  const object = id ? [...snapshot.skills, ...snapshot.plugins, ...snapshot.marketplaces].find(item => item.id === id) : undefined;
  return object && (object.agents ?? ["codex"]).includes("claude") ? object.revision : undefined;
}

/**
 * The side a creation request (a new marketplace, a new skill) names: the one chosen whenever any
 * Agent is managed, so that a Claude-only setup does not fall back to Codex (4a review P2-02).
 */
export function creationAgent(managed: Agent[], chosen: Agent): Agent | undefined {
  return managed.length ? (managed.includes(chosen) ? chosen : managed[0]) : undefined;
}

/**
 * The side a creation dialog starts on: the one the page is filtered to when it can be managed
 * (backlog UI-13), else Codex where it is managed, else the only managed side.
 */
export function defaultCreationAgent(managed: Agent[], filter?: Agent | "all"): Agent {
  if (filter && filter !== "all" && managed.includes(filter)) return filter;
  return managed.includes("codex") || !managed.length ? "codex" : managed[0];
}

/**
 * A side SkillDock does not manage gives every plugin the same reason. Shown once above the list,
 * not on each card: a card says only why this one plugin cannot be installed (67 IF-P2-01).
 */
export function sideNotes(plugins: Pick<Plugin, "agents" | "reason">[], environments: { agent: Agent; installed?: boolean; management?: string }[]): { agent: Agent; reason: string }[] {
  return environments.filter(item => item.installed && item.management !== "enabled").flatMap(({ agent }) => {
    const reason = plugins.find(plugin => (plugin.agents ?? ["codex"]).includes(agent) && plugin.reason)?.reason;
    return reason ? [{ agent, reason }] : [];
  });
}

const AVAILABLE_NOTE: Record<Agent, string> = {
  codex: "未安装：已连接 Marketplace 中可发现的插件；也可直接从 Git 或本地目录安装单个插件。",
  claude: "未安装：Claude 已添加的 Marketplace 中尚未安装的插件，取自 Claude 在本机保存的副本。",
};
/**
 * The notes under the "未安装" filter: one for each Agent that has such plugins on the page, or,
 * with none listed, for each Agent the page covers (backlog UI-04). A version-1 snapshot is Codex.
 */
export function availableNotes(plugins: { installed?: boolean; agents?: Agent[] }[], covered: Agent[]): string[] {
  const listed = new Set(plugins.filter(item => !item.installed).flatMap(item => item.agents ?? ["codex"]));
  const sides = (listed.size ? [...listed] : covered.length ? covered : ["codex"]) as Agent[];
  return (["codex", "claude"] as const).filter(agent => sides.includes(agent)).map(agent => AVAILABLE_NOTE[agent]);
}

/** The plugins page's "Codex CLI unavailable" notice, only where Codex is on this computer (PRD AC-013); a version-1 snapshot lists no environments. */
export function showsCodexCliNotice(data: Pick<Snapshot, "cli" | "agents">) {
  return !data.cli.available && (!data.agents || data.agents.some(item => item.agent === "codex"));
}

/** The marketplace note of the plugin install dialog: the Codex directory only where Codex is managed (PRD AC-013). */
export function pluginMarketIntro(agents: Agent[]) {
  return agents.includes("codex") || !agents.length ? "从 Codex 官方目录或已连接的 Marketplace 选择插件。" : "从已连接的 Marketplace 选择插件。";
}
