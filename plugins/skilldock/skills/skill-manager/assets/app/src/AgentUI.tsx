// Agent dimension of the library (HLD 4.1; PRD 5.2): filter, badges and Claude facts.
import { Lock, SquareTerminal } from "lucide-react";
import type { Agent, AgentEnvironment, ClaudeSettingsLayer, EnablementSource, Marketplace, Plugin, Skill, SkillVisibility } from "../shared/contracts";
import { t } from "./i18n";
import "./AgentUI.css";

export type AgentFilterValue = "all" | Agent;
export const AGENT_LABEL: Record<Agent, string> = { codex: "Codex", claude: "Claude" };
export const objectAgents = (item: { agents?: Agent[] }): Agent[] => item.agents ?? ["codex"];
export const matchesAgent = (item: { agents?: Agent[] }, filter: AgentFilterValue) => filter === "all" || objectAgents(item).includes(filter);
/** The Agent filter and badges appear only when more than one environment is present (HLD 4.1). */
export const showsAgents = (agents?: AgentEnvironment[]) => (agents?.filter(item => item.installed).length ?? 0) > 1;

// The Claude mark: Simple Icons 16.0.0 (CC0 1.0); Claude is a trademark of Anthropic. Codex uses
// a generic Lucide icon: OpenAI's marks need OpenAI's permission (THIRD_PARTY_NOTICES.md).
const CLAUDE_MARK = "m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z";

/** The mark that stands for an Agent; its name is the accessible label and tooltip. */
export function AgentMark({ agent, size = 12 }: { agent: Agent; size?: number }) {
  if (agent === "codex") return <SquareTerminal size={size} strokeWidth={2} aria-hidden="true" />;
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d={CLAUDE_MARK} /></svg>;
}

export function AgentFilter({ value, onChange, counts }: { value: AgentFilterValue; onChange: (value: AgentFilterValue) => void; counts: Record<AgentFilterValue, number> }) {
  const items: AgentFilterValue[] = ["all", "codex", "claude"];
  return (
    <div className="agent-filter" role="group" aria-label={t("按 Agent 筛选")}>
      {items.map(item => (
        <button key={item} className={item === value ? "active" : undefined} aria-pressed={item === value} onClick={() => onChange(item)}>
          {item !== "all" && <AgentMark agent={item} />}{item === "all" ? t("全部") : AGENT_LABEL[item]}<span>{counts[item]}</span>
        </button>
      ))}
    </div>
  );
}

export function AgentBadges({ agents }: { agents?: Agent[] }) {
  return <span className="agent-badges">{(agents ?? ["codex"]).map(agent => <span key={agent} className={`agent-badge agent-${agent}`} role="img" aria-label={AGENT_LABEL[agent]} title={AGENT_LABEL[agent]}><AgentMark agent={agent} /></span>)}</span>;
}

/** Per-Agent counts beside a total, e.g. the installed plugins of each side. */
export function AgentSplit({ counts }: { counts: Record<Agent, number> }) {
  return <span className="agent-split">{(["codex", "claude"] as const).map(agent => <span key={agent} className={`agent-split-item agent-${agent}`} title={`${AGENT_LABEL[agent]} ${counts[agent]}`}><AgentMark agent={agent} size={11} /><span className="sr-only">{AGENT_LABEL[agent]}</span>{counts[agent]}</span>)}</span>;
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
