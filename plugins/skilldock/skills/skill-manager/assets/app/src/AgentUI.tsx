// Agent dimension of the library (HLD 4.1; PRD 5.2): filter, badges and Claude facts.
import { Lock } from "lucide-react";
import type { Agent, AgentEnvironment, ClaudeSettingsLayer, EnablementSource, Marketplace, Plugin, Skill, SkillVisibility } from "../shared/contracts";
import { t } from "./i18n";
import "./AgentUI.css";

export type AgentFilterValue = "all" | Agent;
export const AGENT_LABEL: Record<Agent, string> = { codex: "Codex", claude: "Claude" };
export const objectAgents = (item: { agents?: Agent[] }): Agent[] => item.agents ?? ["codex"];
export const matchesAgent = (item: { agents?: Agent[] }, filter: AgentFilterValue) => filter === "all" || objectAgents(item).includes(filter);
/**
 * A skill whose state is not known and is its own to know. One a Claude plugin ships follows its
 * plugin: when that is not known the plugin says so, not each of its skills (69 IF2-P2-01).
 */
export const stateUnknown = (item: Skill) => item.enabled === null && !(item.pluginId && objectAgents(item).join() === "claude");
/** What each category of the skill page holds; its count and its list use the same rule (67 IF-P3-06). */
export const SKILL_CATEGORY = {
  all: () => true,
  enabled: (item: Skill) => item.enabled === true,
  standalone: (item: Skill) => item.scope === "user" || item.scope === "project",
  attention: (item: Skill) => stateUnknown(item) || (item.duplicateNames?.length || 0) > 0,
} satisfies Record<string, (item: Skill) => boolean>;
/** The skill page's category counts under the Agent filter in effect, so that one screen shows one total (backlog UI-02). */
export function skillCategoryCounts(skills: Skill[], filter: AgentFilterValue) {
  const shown = skills.filter(item => matchesAgent(item, filter));
  return { all: shown.length, enabled: shown.filter(SKILL_CATEGORY.enabled).length, standalone: shown.filter(SKILL_CATEGORY.standalone).length, attention: shown.filter(SKILL_CATEGORY.attention).length };
}
/** The Agent filter and badges appear only when more than one environment is present (HLD 4.1). */
export const showsAgents = (agents?: AgentEnvironment[]) => (agents?.filter(item => item.installed).length ?? 0) > 1;

// Official marks, path data unchanged (THIRD_PARTY_NOTICES.md): the OpenAI Blossom from OpenAI's logo kit and the
// Claude Spark from Anthropic's media resources. Each keeps its official color: the Blossom black or white, the Spark Clay.
const OPENAI_BLOSSOM = "M508.749 317.399C516.777 287.314 508.991 253.884 485.389 230.282C461.788 206.681 428.36 198.895 398.273 206.923C376.231 184.928 343.39 174.956 311.148 183.596C278.906 192.234 255.45 217.292 247.36 247.361C217.291 255.451 192.233 278.91 183.595 311.149C174.957 343.391 184.927 376.232 206.924 398.274C198.896 428.359 206.683 461.789 230.284 485.391C253.885 508.992 287.313 516.779 317.401 508.75C339.442 530.745 372.286 540.717 404.525 532.079C436.767 523.441 460.223 498.384 468.313 468.315C498.383 460.224 523.44 436.766 532.078 404.526C540.716 372.285 530.747 339.443 508.749 317.402V317.399ZM470.899 244.776C486.892 260.77 493.488 282.601 490.687 303.412L415.577 260.046C412.411 258.218 408.509 258.218 405.345 260.046L317.401 310.82V277.526C317.401 275.191 318.652 273.005 320.676 271.837L387.644 233.174C414.178 218.353 448.346 222.223 470.901 244.776H470.899ZM357.837 311.144L398.275 334.491V381.185L357.837 404.532L317.398 381.185V334.491L357.837 311.144ZM264.776 269.693C265.207 239.305 285.644 211.649 316.453 203.393C338.3 197.54 360.505 202.744 377.127 215.573L302.014 258.937C298.848 260.764 296.898 264.144 296.898 267.798V369.346L268.065 352.699C266.043 351.531 264.776 349.353 264.776 347.017V269.691V269.693ZM203.391 316.454C209.244 294.608 224.854 277.978 244.276 269.999V356.73C244.276 360.384 246.226 363.763 249.392 365.591L337.337 416.365L308.503 433.013C306.481 434.181 303.961 434.188 301.939 433.02L234.971 394.357C208.868 378.789 195.138 347.261 203.391 316.454ZM244.775 470.9C228.781 454.906 222.186 433.075 224.986 412.264L300.096 455.63C303.263 457.457 307.164 457.457 310.328 455.63L398.273 404.856V438.149C398.273 440.485 397.022 442.671 394.997 443.839L328.029 482.502C301.495 497.322 267.327 493.452 244.772 470.9H244.775ZM450.897 445.982C450.466 476.371 430.029 504.027 399.22 512.283C377.373 518.136 355.168 512.932 338.547 500.102L413.659 456.738C416.826 454.911 418.775 451.532 418.775 447.877V346.329L447.609 362.977C449.631 364.145 450.897 366.323 450.897 368.659V445.985V445.982ZM512.282 399.221C506.429 421.068 490.819 437.697 471.397 445.676V358.946C471.397 355.292 469.448 351.912 466.281 350.085L378.336 299.311L407.17 282.663C409.192 281.495 411.712 281.487 413.734 282.655L480.702 321.318C506.805 336.887 520.536 368.415 512.282 399.221Z";
const CLAUDE_SPARK = "M18.7657 62.4437L37.1822 52.1167L37.4857 51.2122L37.1822 50.7085H36.2715L33.1852 50.5208L22.6615 50.2391L13.5545 49.8636L4.70044 49.3942L2.47428 48.9248L0.399902 46.1553L0.602281 44.794L2.47428 43.5266L5.15579 43.7613L11.0754 44.1837L19.98 44.794L26.4055 45.1695L35.9679 46.1553H37.4857L37.6881 45.545L37.1822 45.1695L36.7774 44.794L27.5692 38.5508L17.6021 31.9791L12.3908 28.1769L9.60812 26.2524L8.19147 24.4686L7.58433 20.5256L10.1141 17.7091L13.5545 17.9438L14.4146 18.1785L17.9056 20.8542L25.343 26.6279L35.0572 33.7629L36.4739 34.9364L37.0443 34.5514L37.1316 34.2792L36.4739 33.1996L31.212 23.6706L25.596 13.9539L23.0663 9.91695L22.4086 7.52296C22.1538 6.51831 22.0038 5.68714 22.0038 4.65957L24.8877 0.716544L26.5067 0.200195L30.4025 0.716544L32.0215 2.12477L34.4501 7.66379L38.3458 16.3478L44.4172 28.1769L46.188 31.6975L47.1493 34.9364L47.5035 35.9222H48.1106V35.3589L48.6166 28.6933L49.5273 20.5256L50.438 10.0108L50.7415 7.05356L52.2088 3.48605L55.1433 1.56148L57.42 2.64112L59.292 5.31674L59.039 7.05356L57.926 14.2824L55.7504 25.5952L54.3337 33.1996H55.1433L56.1046 32.2138L59.9497 27.1442L66.3752 19.0704L69.2085 15.8784L72.5478 12.3579L74.6728 10.668H78.7203L81.6548 15.0804L80.3394 19.6337L76.1906 24.8911L72.7502 29.3504L67.8172 35.9595L64.7562 41.2734L65.0307 41.7118L65.7681 41.6489L76.8989 39.255L82.9197 38.1753L90.1041 36.9549L93.3422 38.457L93.6963 40.006L92.4315 43.151L84.7411 45.0287L75.7353 46.8594L62.3244 50.0164L62.1759 50.1358L62.3512 50.3958L68.399 50.9432L70.9794 51.084H77.3037L89.0922 51.9759L92.1785 53.9944L93.9999 56.4822L93.6963 58.4068L88.9404 60.8008L82.5655 59.2987L67.6401 55.7312L62.5301 54.4638H61.8217V54.8862L66.0717 59.064L73.9139 66.1051L83.6786 75.2116L84.1845 77.4648L82.9197 79.2485L81.6042 79.0608L73.0032 72.5829L69.6639 69.6726L62.1759 63.3356H61.67V63.9928L63.3902 66.5276L72.5478 80.2812L73.0032 84.5059L72.3454 85.8672L69.9675 86.7121L67.3871 86.2427L61.9735 78.6852L56.4587 70.2359L52.0064 62.6315L51.4687 62.971L48.8189 91.2654L47.6047 92.7206L44.7714 93.8002L42.3934 92.0164L41.1286 89.1061L42.3934 83.3324L43.9113 75.8219L45.1255 69.8604L46.2386 62.4437L46.9184 59.9661L46.8583 59.8003L46.3153 59.8916L40.7238 67.5603L32.2239 79.0608L25.4948 86.2427L23.8758 86.8999L21.0931 85.4447L21.3461 82.863L22.9145 80.5629L32.2239 68.7338L37.8399 61.3641L41.4594 57.1337L41.4242 56.5218L41.2244 56.5048L16.489 72.6299L12.0873 73.1932L10.1647 71.4094L10.4176 68.4991L11.3283 67.5603L18.7657 62.4437Z";

/**
 * The mark that stands for an Agent; its name is the accessible label and tooltip. `size` is the box:
 * the Blossom is drawn on the kit's whole 716 canvas, clear space included, and the Spark, which the
 * kit draws edge to edge, gets the same share of its box so that the two look alike in size.
 */
export function AgentMark({ agent, size = 20 }: { agent: Agent; size?: number }) {
  if (agent === "codex") return <svg className="agent-mark-codex" width={size} height={size} viewBox="0 0 716 716" aria-hidden="true" focusable="false"><path fill="currentColor" d={OPENAI_BLOSSOM} /></svg>;
  return <svg width={size} height={size} viewBox="-45 -45 184 184" aria-hidden="true" focusable="false"><path fill="#D97757" d={CLAUDE_SPARK} /></svg>;
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

/** Per-Agent counts beside a total; `counted` names what both count, e.g. the installed plugins of each side. */
export function AgentSplit({ counts, counted }: { counts: Record<Agent, number>; counted: string }) {
  return <span className="agent-split">{(["codex", "claude"] as const).map(agent => { const label = `${AGENT_LABEL[agent]} ${counted}`;
    return <span key={agent} className={`agent-split-item agent-${agent}`} title={`${label} ${counts[agent]}`}><AgentMark agent={agent} size={18} /><span className="sr-only">{label}</span>{counts[agent]}</span>; })}</span>;
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
