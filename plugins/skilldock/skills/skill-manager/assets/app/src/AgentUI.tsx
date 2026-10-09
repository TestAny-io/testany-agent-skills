// Agent dimension of the library (HLD 4.1; PRD 5.2): filter, badges and Claude facts.
import { Lock } from "lucide-react";
import type { Agent, AgentEnvironment, ClaudeSettingsLayer, EnablementSource, Marketplace, Plugin, Skill, SkillVisibility } from "../shared/contracts";
import { t } from "./i18n";
import "./AgentUI.css";

export type AgentFilterValue = "all" | Agent;
export const AGENT_LABEL: Record<Agent, string> = { codex: "Codex", claude: "Claude" };
export const objectAgents = (item: { agents?: Agent[] }): Agent[] => item.agents ?? ["codex"];
export const matchesAgent = (item: { agents?: Agent[] }, filter: AgentFilterValue) => filter === "all" || objectAgents(item).includes(filter);
/** The Agent filter and badges appear only when more than one environment is present (HLD 4.1). */
export const showsAgents = (agents?: AgentEnvironment[]) => (agents?.filter(item => item.installed).length ?? 0) > 1;

export function AgentFilter({ value, onChange, counts }: { value: AgentFilterValue; onChange: (value: AgentFilterValue) => void; counts: Record<AgentFilterValue, number> }) {
  const items: AgentFilterValue[] = ["all", "codex", "claude"];
  return (
    <div className="agent-filter" role="group" aria-label={t("按 Agent 筛选")}>
      {items.map(item => (
        <button key={item} className={item === value ? "active" : undefined} aria-pressed={item === value} onClick={() => onChange(item)}>
          {item === "all" ? t("全部") : AGENT_LABEL[item]}<span>{counts[item]}</span>
        </button>
      ))}
    </div>
  );
}

export function AgentBadges({ agents }: { agents?: Agent[] }) {
  return <span className="agent-badges">{(agents ?? ["codex"]).map(agent => <span key={agent} className={`agent-badge agent-${agent}`}>{AGENT_LABEL[agent]}</span>)}</span>;
}

const LAYER: Record<ClaudeSettingsLayer, string> = { user: "用户设置", project: "项目设置", local: "本地设置", managed: "组织托管设置" };
const SCOPE: Record<string, string> = { user: "用户", project: "项目", local: "本地", managed: "托管" };
const VISIBILITY: Record<SkillVisibility, string> = { enabled: "可见", disabled: "已关闭", "name-only": "仅显示名称", "user-invocable-only": "仅用户调用" };

/** "由项目设置启用" and its variants (PRD 5.2.2, AC-002, AC-015). */
export function enablementText(source: EnablementSource | undefined, state: string) {
  if (!source || source.decidedBy === "default") return t("{v0}（默认）", { v0: t(state) });
  const text = t("由{v0}决定：{v1}", { v0: t(LAYER[source.decidedBy]), v1: t(state) });
  return source.overriddenBy ? `${text}${t("（覆盖了较低层级的设置）")}` : text;
}

function Protected({ item }: { item: { protection?: string; reason?: string } }) {
  if (!item.protection) return null;
  const label = item.protection === "synced" ? "由 claude.ai 同步" : item.protection === "managed" ? "由组织托管" : "系统内置";
  return <span className="agent-fact protected" title={item.reason ? t(item.reason) : undefined}><Lock size={11} />{t(label)}</span>;
}

/** Install scope, enablement source and protection of a Claude plugin. */
export function ClaudePluginFacts({ plugin }: { plugin: Plugin }) {
  if (!plugin.installation) return null;
  const state = plugin.enabled === true ? "已启用" : plugin.enabled === false ? "已停用" : "状态未知";
  return (
    <span className="agent-facts">
      <span className="agent-fact">{t("安装范围：{v0}", { v0: t(SCOPE[plugin.installation.scope] ?? plugin.installation.scope) })}</span>
      <span className="agent-fact">{enablementText(plugin.enablement, state)}</span>
      <Protected item={plugin} />
      {plugin.installation.readOnlyReason && <span className="agent-fact warning">{t(plugin.installation.readOnlyReason)}</span>}
    </span>
  );
}

/** Visibility of a Claude skill, or both sides of a shared one. */
export function ClaudeSkillFacts({ skill }: { skill: Skill }) {
  if (skill.perAgent?.claude) {
    const codex = skill.perAgent.codex; const claude = skill.perAgent.claude;
    return (
      <span className="agent-facts">
        <span className="agent-fact">{t("Codex：{v0}", { v0: t(codex?.enabled === false ? "已停用" : codex?.enabled === null ? "状态未知" : "已启用") })}</span>
        <span className="agent-fact">{t("Claude：{v0}", { v0: enablementText(claude.enablement, VISIBILITY[claude.visibility ?? "enabled"]) })}</span>
      </span>
    );
  }
  if (!skill.visibility) return null;
  return (
    <span className="agent-facts">
      <span className="agent-fact">{enablementText(skill.enablement, VISIBILITY[skill.visibility])}</span>
      <Protected item={skill} />
    </span>
  );
}

/** Actual auto-update value of a Claude marketplace (PRD 5.2.2, AC-002). */
export function MarketAutoUpdate({ market }: { market: Marketplace }) {
  if (!market.autoUpdate) return null;
  const value = t(market.autoUpdate.enabled ? "自动更新：开" : "自动更新：关");
  return <span className="agent-fact" title={market.autoUpdate.note ? t(market.autoUpdate.note) : undefined}>{market.autoUpdate.isDefault ? `${value}${t("（默认）")}` : value}</span>;
}
