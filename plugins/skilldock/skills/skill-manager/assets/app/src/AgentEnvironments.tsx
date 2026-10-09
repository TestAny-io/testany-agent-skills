// Settings › Agent environments (PRD 5.1, REQ-SDX-001; HLD 3.1, 3.6, 3.10).
import { useState } from "react";
import { FolderTree, RefreshCw } from "lucide-react";
import type { ActionRequest, AgentEnvironment, Plugin, Skill } from "../shared/contracts";
import { t } from "./i18n";
import { AGENT_LABEL } from "./AgentUI";

type Request = Omit<ActionRequest, "mode">;
export interface ConfirmSpec { title: string; description: string; target: string; request: Request; danger?: boolean; label: string; affected?: string[] }

const STATE: Record<AgentEnvironment["management"], { label: string; tone: string }> = {
  enabled: { label: "已启用管理", tone: "badge-green" },
  "read-only": { label: "只读", tone: "" },
  unconfirmed: { label: "无法确认", tone: "badge-orange" },
};
const ORIGIN: Record<string, string> = { default: "默认位置", session: "来自 Agent 会话", explicit: "手动指定" };

function EnvironmentCard({ environment, skills, plugins, busy, onRun, onConfirm }: {
  environment: AgentEnvironment; skills: Skill[]; plugins: Plugin[]; busy: boolean; onRun: (request: Request) => void; onConfirm: (spec: ConfirmSpec) => void;
}) {
  const [paths, setPaths] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [configDir, setConfigDir] = useState(environment.roots.config);
  const [pluginCacheDir, setPluginCacheDir] = useState(environment.roots.pluginCache);
  const name = AGENT_LABEL[environment.agent];
  const skillCount = skills.filter(item => (item.agents ?? ["codex"]).includes(environment.agent)).length;
  const pluginCount = plugins.filter(item => item.installed && (item.agents ?? ["codex"]).includes(environment.agent)).length;
  const state = environment.installed ? STATE[environment.management] : { label: "未找到", tone: "" };
  // PRD 5.1.3: the confirmation names the places SkillDock will write to.
  const places = [t("配置根：{v0}", { v0: environment.roots.config }), t("个人技能：{v0}", { v0: environment.roots.skills }), t("插件缓存：{v0}", { v0: environment.roots.pluginCache }),
    ...(environment.agent === "claude" ? [t("当前项目的 .claude/settings.json 与 .claude/settings.local.json（只在你选择项目范围时）")] : [])];
  const enable = () => onConfirm({ title: t("启用 {v0} 管理？", { v0: name }),
    description: environment.agent === "claude"
      ? t("这一版 SkillDock 只读取 Claude 中的对象；启用后，后续版本才能按你的操作修改 Claude 中的技能、插件和 marketplace，并把它们加入后台更新计划。这不会改动 Claude 自身的设置。")
      : t("启用后，SkillDock 可以按你的操作修改 {v0} 中的技能、插件和 marketplace，并可以把它们加入后台更新计划。这不会改动 {v0} 自身的设置。", { v0: name }),
    affected: places, target: name, request: { action: "agent.setManagement", agent: environment.agent, management: "enabled" }, label: t("启用管理") });
  const disable = () => onConfirm({ title: t("停用 {v0} 管理？", { v0: name }),
    description: t("停用后 {v0} 回到只读：SkillDock 只显示其中的对象，不再修改它们；更新计划中属于 {v0} 的项暂停，重新启用后恢复。", { v0: name }),
    target: name, request: { action: "agent.setManagement", agent: environment.agent, management: "read-only" }, label: t("停用管理"), danger: true });
  return (
    <section className="agent-card" aria-label={name}>
      <header>
        <h2>{name}</h2>
        <span className={`badge ${state.tone}`}>{t(state.label)}</span>
      </header>
      <p className="agent-summary">{t("配置根 {v0} · 技能 {v1} 个 · 插件 {v2} 个", { v0: environment.roots.config, v1: skillCount, v2: pluginCount })}</p>
      {environment.reason && <p className="agent-reason">{t(environment.reason)}</p>}
      {environment.management === "read-only" && environment.installed && <p className="agent-hint">{t(environment.agent === "claude" ? "这一版只读取 Claude；启用管理后，修改功能会在后续版本开放。" : "启用后可更新插件与技能、加入后台计划。")}</p>}
      <dl className="agent-details">
        <dt>{t("命令行")}</dt>
        <dd>{environment.cli.available ? `${environment.cli.path ?? ""}${environment.cli.version ? `（${environment.cli.version}）` : ""}` : t("未找到：{v0}", { v0: t(environment.cli.error ?? "无法运行") })}</dd>
        <dt>SkillDock</dt>
        <dd>{environment.skilldock ? <>{environment.skilldock.version}{environment.skilldock.running ? t("（正在运行）") : ""}{environment.skilldock.reason && <span className="agent-reason">{t(environment.skilldock.reason)}</span>}</> : t("未安装")}</dd>
      </dl>
      {environment.notes?.map(note => <p key={note} className="agent-note">{t(note)}</p>)}
      <div className="agent-actions">
        {environment.installed && environment.management === "read-only" && <button className="button button-primary" disabled={busy} onClick={enable}>{t("启用管理")}</button>}
        {environment.management === "enabled" && <button className="button button-secondary" disabled={busy} onClick={disable}>{t("停用管理")}</button>}
        <button className="text-button" aria-expanded={paths} onClick={() => setPaths(value => !value)}><FolderTree size={13} />{t(paths ? "收起路径" : "查看路径")}</button>
        {environment.agent === "claude" && <button className="text-button" aria-expanded={switching} onClick={() => setSwitching(value => !value)}>{t("切换 Claude 根目录")}</button>}
      </div>
      {paths && (
        <dl className="agent-paths">
          <dt>{t("配置根")}</dt><dd><code>{environment.roots.config}</code>{environment.roots.origin && <span>{t(ORIGIN[environment.roots.origin])}</span>}</dd>
          <dt>{t("个人技能")}</dt><dd><code>{environment.roots.skills}</code></dd>
          <dt>{t("插件缓存")}</dt><dd><code>{environment.roots.pluginCache}</code></dd>
        </dl>
      )}
      {switching && (
        <form className="agent-root-form" onSubmit={event => { event.preventDefault(); onRun({ action: "settings.setClaudeRoot", agent: "codex", claudeRoot: { configDir: configDir.trim(), pluginCacheDir: pluginCacheDir.trim() } }); }}>
          <label>{t("Claude 配置目录")}<input value={configDir} onChange={event => { setConfigDir(event.target.value); setPluginCacheDir(`${event.target.value.replace(/\/+$/, "")}/plugins/cache`); }} /></label>
          <label>{t("插件缓存目录")}<input value={pluginCacheDir} onChange={event => setPluginCacheDir(event.target.value)} /></label>
          <p className="agent-hint">{t("切换前会先核验新目录；之后 Codex 入口、Claude 入口和后台任务都使用这里保存的目录。")}</p>
          <button className="button button-secondary" type="submit" disabled={busy || !configDir.trim().startsWith("/") || !pluginCacheDir.trim().startsWith("/")}>{t("保存并切换")}</button>
        </form>
      )}
    </section>
  );
}

function NodeSettings({ busy, onRun }: { busy: boolean; onRun: (request: Request) => void }) {
  const [nodePath, setNodePath] = useState("");
  return (
    <section className="agent-card" aria-label={t("Node.js")}>
      <header><h2>Node.js</h2></header>
      <p className="agent-hint">{t("SkillDock 用本机的 Node.js 22.12 或更新版本构建和运行；两侧入口与后台任务共用这里保存的选择。")}</p>
      <form className="agent-root-form" onSubmit={event => { event.preventDefault(); onRun({ action: "settings.setNodePath", agent: "codex", nodePath: nodePath.trim() }); }}>
        <label>{t("Node 路径")}<input value={nodePath} placeholder="/opt/homebrew/bin/node" onChange={event => setNodePath(event.target.value)} /></label>
        <div className="agent-actions">
          <button className="button button-secondary" type="submit" disabled={busy || !nodePath.trim().startsWith("/")}>{t("使用这个 Node")}</button>
          <button className="text-button" type="button" disabled={busy} onClick={() => onRun({ action: "settings.redetectNode", agent: "codex" })}><RefreshCw size={13} />{t("重新检测")}</button>
        </div>
      </form>
    </section>
  );
}

export function AgentEnvironments({ environments, skills, plugins, busy, onRun, onConfirm }: {
  environments: AgentEnvironment[]; skills: Skill[]; plugins: Plugin[]; busy: boolean; onRun: (request: Request) => void; onConfirm: (spec: ConfirmSpec) => void;
}) {
  return (
    <div className="agent-environments">
      {!environments.length && <p className="agent-hint">{t("本机没有发现 Codex 或 Claude。")}</p>}
      {environments.map(environment => <EnvironmentCard key={environment.agent} environment={environment} skills={skills} plugins={plugins} busy={busy} onRun={onRun} onConfirm={onConfirm} />)}
      <NodeSettings busy={busy} onRun={onRun} />
    </div>
  );
}
