import { CompatibilityWarnings } from "./CompatibilityWarnings";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Blocks, CheckCircle2, CircleHelp, ExternalLink as LinkIcon, FolderOpen, GitBranch, Globe2, Plus, RefreshCw, Search, ShieldCheck, Sparkles } from "lucide-react";
import type { ActionResult, InstallPreview, PluginInstallPreview, Plugin, Snapshot } from "../shared/contracts";
import { Modal } from "./Modal";
import { IconProvider, ProviderIcon } from "./ProviderIcon";
import { LibraryButton as Button, InstallSteps, type ActionHandler } from "./LibraryUI";
import { GitSourceFields, ResolvedGitSource } from "./GitSourceFields";
import { ServiceMessage, t } from "./i18n";
import { PluginSkillPicker } from "./PluginSkillPicker";
import { ExternalLink } from './ExternalLink';
import { matchesPlugin, pluginTitle } from './plugin-presentation';

export function InstallDialog({ kind, data, initialPlugin, initialMarket = false, busy, action, onClose, onMarket, agents = [] }: {
  kind: "skill" | "plugin"; data: Snapshot; initialPlugin?: Plugin; initialMarket?: boolean; busy: string | null; action: ActionHandler; onClose: () => void; onMarket: () => void;
  /** Agents whose management is enabled; a skill install offers the choice only with more than one. */
  agents?: ("codex" | "claude")[];
}) {
  const plugin = kind === "plugin";
  const [sourceType, setType] = useState<"local" | "git" | "market">(initialPlugin || initialMarket || plugin ? "market" : "local");
  const [source, setSource] = useState(""); const [subpath, setSubpath] = useState(""); const [gitRef, setRef] = useState("");
  const [query, setQuery] = useState(""); const [market, setMarket] = useState("all"); const [limit, setLimit] = useState(30);
  const [preview, setPreview] = useState<InstallPreview | PluginInstallPreview | null>(null);
  const [selection, setSelection] = useState<Plugin | null>(null);
  const [enabledSkills, setEnabledSkills] = useState<string[]>([]);
  const [scope, setScope] = useState<"user" | "project" | "local">("user");
  // A skill goes to Codex, or to Claude's personal skills or the current project's .claude/skills (HLD 3.4).
  // A plugin from a local directory or Git may go to either side as well (HLD 3.3).
  const fromSource = kind === "skill" || sourceType !== "market";
  const chooseAgent = fromSource && agents.length > 1;
  const [agent, setAgent] = useState<"codex" | "claude">(agents.includes("codex") || !agents.length ? "codex" : agents[0]);
  const [skillScope, setSkillScope] = useState<"user" | "project">("user");
  const side = fromSource && agent === "claude" ? { agent: "claude" as const } : {};
  const initialized = useRef(false);
  const [error, setError] = useState(""); const review = preview;
  const [remoteResult, setRemoteResult] = useState<ActionResult['remoteInstall']>();
  const [attempted, setAttempted] = useState(false);
  const listed = data.plugins.filter(item => (market === "all" || item.marketplace === market) && matchesPlugin(item, query));
  const direct = preview && "skills" in preview ? preview : null;
  // A Claude plugin installs whole, into a scope the user picks (HLD 3.3).
  const claudePreview = direct?.agent === "claude";
  async function checkConnection() {
    if (!selection) return;
    setError('');
    try { const result = await action({ action: 'plugin.connectionStatus', id: selection.id }); if (result?.remoteInstall) setRemoteResult(result.remoteInstall); }
    catch (failure) { setError((failure as Error).message); }
  }
  function acceptPreview(value: PluginInstallPreview) { setPreview(value); setEnabledSkills(value.skillDetails.map(skill => skill.path)); setScope(value.defaultScope && value.defaultScope !== "managed" ? value.defaultScope : "user"); }
  async function choosePlugin(item: Plugin) {
    setError("");
    try {
      const result = await action({ action: "plugin.previewMarketplace", id: item.id });
      if (result?.pluginPreview) { setSelection(item); acceptPreview(result.pluginPreview); }
    } catch (failure) { setError((failure as Error).message); }
  }
  useEffect(() => { if (initialPlugin && !initialized.current) { initialized.current = true; void choosePlugin(initialPlugin); } }, [initialPlugin]);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError("");
    try {
      if (direct?.remote) setAttempted(true);
      const skillChoice = direct?.canSelectSkills ? { enabledSkills } : {};
      const result = await action(selection && preview ? { action: "plugin.install", id: selection.id, previewId: preview.id, ...skillChoice, ...(claudePreview ? { scope } : {}) } : preview
        ? { action: plugin ? "plugin.installSource" : "skill.install", previewId: preview.id, ...skillChoice, ...side, ...(plugin && claudePreview ? { scope } : {}) }
        : { action: plugin ? "plugin.previewInstall" : "skill.previewInstall", ...side, ...(kind === "skill" && "agent" in side ? { scope: skillScope } : {}), sourceType: sourceType === "git" ? "git" : "local", source: source.trim(), ...(subpath.trim() ? { subpath: subpath.trim() } : {}), ...(sourceType === "git" && gitRef.trim() ? { ref: gitRef.trim() } : {}) });
      if (result?.remoteInstall) setRemoteResult(result.remoteInstall);
      else if (result?.pluginPreview) acceptPreview(result.pluginPreview);
      else if (result?.preview) setPreview(result.preview);
      else if (result) onClose();
    } catch (failure) { setError((failure as Error).message); }
  }
  return <IconProvider assets={preview?.iconAssets}><Modal wide={plugin} className="install-dialog" title={t(remoteResult ? '插件安装状态' : review ? plugin ? "确认安装插件" : "确认安装技能" : plugin ? "安装插件" : "安装技能")} eyebrow={plugin ? "INSTALL A PLUGIN" : "INSTALL A SKILL"} onClose={() => { if (!busy) onClose(); }}>
    <form onSubmit={event => void submit(event)}>
      <div className="modal-body">
        {!remoteResult && <InstallSteps preview={!!review} />}
        {remoteResult ? <div className="remote-install-result" role="status">
          {remoteResult.installed ? <CheckCircle2 size={28} /> : <CircleHelp size={28} />}<h3>{remoteResult.name}</h3>
          <p>{t(remoteResult.installed ? '插件已安装' : '安装尚未确认')}</p>
          <p className="field-hint">{t(remoteResult.installed && remoteResult.connected ? '应用连接可用，请在新的 Codex 会话中使用。' : '请在官方页面完成账号授权，然后返回这里刷新安装状态。')}</p>
          {remoteResult.installUrl && !(remoteResult.installed && remoteResult.connected) && <ExternalLink className="button button-primary" href={remoteResult.installUrl} target="_blank" rel="noopener noreferrer">{t('连接账号')}<LinkIcon size={15} /></ExternalLink>}
          <Button onClick={() => void checkConnection()} busy={!!busy}><RefreshCw size={15} />{t('刷新安装状态')}</Button>
          {!remoteResult.installed && selection && <Button disabled={!!busy} onClick={() => { setRemoteResult(undefined); setAttempted(false); setPreview(null); void choosePlugin(selection); }}>{t('重新预览')}</Button>}
        </div> : review ? <>
          <div className={`install-preview ${plugin ? "plugin-install-summary" : ""}`}><ProviderIcon icon={review.icon} className="skill-icon tone-1" large>{plugin ? <Blocks size={23} /> : <Sparkles size={23} />}</ProviderIcon><h3>{review.name}</h3><p>{review.description || t("未提供描述")}</p>
            {"version" in review && <span className="badge badge-neutral">{review.version || t("版本未提供")}</span>}
            {preview && typeof preview.files === "number" && typeof preview.bytes === "number" && <span className="badge badge-neutral">{t("{v0} 个文件", { v0: preview.files })} · {(preview.bytes / 1024).toFixed(1)} KB</span>}
          </div>
          <dl className="preview-paths"><dt>{t("来自")}</dt><dd><code>{selection?.marketplace || preview?.source}</code></dd>
            {preview && "target" in preview && <><dt>{t("安装到")}</dt><dd><code>{preview.target}</code></dd></>}
          </dl>
          {preview && <ResolvedGitSource source={preview} />}
          <CompatibilityWarnings warnings={direct?.warnings} />
          {direct?.remote && <section className="remote-plugin-preview">
            <strong>{t('应用连接')}: {direct.remote.name}</strong>
            <p className="field-hint">{t('将由 Codex 安装官方目录插件。账号登录与权限授权在官方页面完成；SkillDock 不接触你的账号密码。')}</p>
            <p className="field-hint">{t('远程插件的完整组件清单与技能选择尚未开放；这里展示官方应用介绍。')}</p>
            <details><summary>{t('查看完整介绍')}</summary><p className="remote-description">{direct.remote.description}</p></details>
            <ExternalLink href={direct.remote.installUrl} target="_blank" rel="noopener noreferrer">{t('查看官方详情与授权')}<LinkIcon size={13} /></ExternalLink>
          </section>}
          {claudePreview && <div className="scope-choice" role="radiogroup" aria-label={t("安装范围")}>
            {(direct?.scopes ?? ["user"]).filter((item): item is "user" | "project" | "local" => item !== "managed").map(item => <label key={item}><input type="radio" name="claude-scope" checked={scope === item} onChange={() => setScope(item)} />{t(direct?.scopes?.includes("local") === false && item === "project" ? "当前项目（.claude/skills）" : { user: "当前用户（所有项目）", local: "当前项目，只给自己（本地设置）", project: "当前项目，所有协作者（共享设置，需要确认）" }[item])}</label>)}
            {direct?.manifests && <p className="field-hint">{t("专用 manifest：{v0}", { v0: direct.manifests.length ? direct.manifests.map(item => item === "claude" ? "Claude" : "Codex").join(" · ") : t("无") })}</p>}
            {direct?.nativeRules?.map(rule => <p key={rule.message} className="field-hint"><ServiceMessage value={rule.message} /></p>)}
          </div>}
          {direct && !direct.remote && !claudePreview && <><PluginSkillPicker preview={direct} selected={enabledSkills} onChange={setEnabledSkills} disabled={!!busy} /><div className="install-components">
            {!!direct.components.length && <p>{t("其他组件")}: {direct.components.map(item => t({ commands: "命令", agents: "代理", hooks: "Hooks", mcp: "MCP 服务器", apps: "应用连接" }[item] || item)).join(" · ")}</p>}
            {!!direct.duplicates.length && <p className="field-error">{t("已有同名插件，将作为另一个来源单独安装：")}{direct.duplicates.join(", ")}</p>}
          </div></>}
          <div className="dialog-note"><ShieldCheck size={16} /><p>{t(direct?.remote ? '安装后会核对官方清单。插件安装与账号连接会分别显示状态。' : plugin ? claudePreview ? "将安装这个插件及其附带组件。安装后可在插件详情中启停或卸载，在更新页检查与更新。" : "将安装这个插件及其附带组件。安装后可在插件详情统一管理、更新或卸载。" : "安装前会再次核验文件。已存在的同名目录会保留，不会被覆盖。")}</p></div>
        </> : <>
          <div className={`source-choice ${plugin ? "source-choice-three" : ""}`}>
            {([{ id: "local", label: "本地目录", icon: FolderOpen }, { id: "git", label: "Git 仓库", icon: GitBranch }, ...(plugin ? [{ id: "market", label: "Marketplace", icon: Globe2 }] : [])] as const).map(item => <button type="button" key={item.id} aria-label={t(item.label)} disabled={!!busy} className={sourceType === item.id ? "selected" : ""} aria-pressed={sourceType === item.id} onClick={() => { setType(item.id as typeof sourceType); setSource(""); setSubpath(""); setRef(""); setError(""); }}><item.icon size={19} /><strong>{t(item.label)}</strong></button>)}
          </div>
          {sourceType === "market" ? <div className="market-install">
            <div className="catalog-intro"><p>{t("从 Codex 官方目录或已连接的 Marketplace 选择插件。")}</p><Button onClick={onMarket} disabled={!!busy}><Plus size={15} />{t("添加来源")}</Button></div>
            {data.directoryError && <p className="field-error" role="status"><ServiceMessage value={data.directoryError} /></p>}
            <div className="toolbar"><label className="search-field"><Search size={17} /><input type="search" aria-label={t("搜索插件")} placeholder={t("搜索插件或市场…")} value={query} onChange={e => { setQuery(e.target.value); setLimit(30); }} /></label>
              <label className="select-control"><Globe2 size={15} /><select aria-label={t("筛选插件市场")} value={market} onChange={e => { setMarket(e.target.value); setLimit(30); }}><option value="all">{t("全部市场")}</option>{[...new Set([...data.marketplaces.map(item => item.name), ...data.plugins.map(item => item.marketplace)])].map(name => <option key={name} value={name}>{data.marketplaces.find(item => item.name === name)?.displayName || name}</option>)}</select></label>
            </div>
            {busy?.startsWith("plugin.previewMarketplace:") && <p role="status" className="field-hint">{t("正在读取插件的技能和组件…")}</p>}
            <div className="install-catalog">{listed.slice(0, limit).map(item => <button type="button" className="install-catalog-row" key={item.id} disabled={!!busy || item.installed || !item.canInstall} onClick={() => void choosePlugin(item)}>
              <ProviderIcon icon={item.icon}><Blocks size={21} /></ProviderIcon><div><strong>{pluginTitle(item)}</strong><small>{item.directSource ? t("单插件来源") : data.marketplaces.find(market => market.name === item.marketplace)?.displayName || item.marketplace} · {item.version || t("版本未提供")}</small>{item.description && <p>{item.description}</p>}{!item.canInstall && !item.installed && <small><ServiceMessage value={item.reason || "请通过 Codex 的插件管理入口安装。"} /></small>}</div><span>{item.installed ? t("已安装") : item.canInstall ? t("预览插件") : t("由 Codex 管理")}</span><ArrowRight size={15} />
            </button>)}</div>
            {!listed.length && <div className="empty-state"><Globe2 size={28} /><h3>{t("没有找到匹配的插件")}</h3><p>{t("调整筛选，或添加一个 Marketplace 来源。")}</p><Button onClick={onMarket}>{t("添加来源")}</Button></div>}
            {listed.length > limit && <Button onClick={() => setLimit(limit + 30)}>{t("显示更多")}</Button>}
          </div> : <>{(chooseAgent || "agent" in side) && <div className="scope-choice" role="radiogroup" aria-label={t("安装到")}>
            {chooseAgent ? agents.map(item => <label key={item}><input type="radio" name="skill-agent" checked={agent === item} onChange={() => setAgent(item)} />{t("安装到 {v0}", { v0: item === "codex" ? "Codex" : "Claude" })}</label>)
              : <p className="field-hint">{t("将安装到 {v0}。", { v0: "Claude" })}</p>}
            {agent === "claude" && kind === "skill" && (["user", "project"] as const).map(item => <label key={item}><input type="radio" name="skill-scope" checked={skillScope === item} onChange={() => setSkillScope(item)} />{t(item === "user" ? "个人技能（所有项目）" : "当前项目（.claude/skills）")}</label>)}
          </div>}</>}{sourceType === "market" ? null : sourceType === "git" ? <GitSourceFields kind={kind} source={source} subpath={subpath} gitRef={gitRef} setSource={setSource} setSubpath={setSubpath} setRef={setRef} /> : <label className="field"><span>{t(plugin ? "插件目录路径" : "技能目录路径")}</span><input required value={source} disabled={!!busy} autoComplete="off" placeholder={plugin ? "/Users/you/plugins/my-plugin" : "/Users/you/skills/my-skill"} onChange={e => setSource(e.target.value)} /></label>}
          {plugin && sourceType !== "market" && <p className="field-hint">{t("agent" in side ? "选择单个插件的目录：带 Claude 的 plugin.json 时放入技能目录；否则只要含 skills 或 commands，SkillDock 会生成一个本地 marketplace 再安装。" : "选择单个插件的目录，内含 plugin.json。无需先添加 Marketplace；SkillDock 会记录来源，供后续更新使用。")}</p>}
        </>}
        {error && <div className="field-error" role="alert"><ServiceMessage value={error} error /></div>}
        {attempted && !remoteResult && <Button onClick={() => void checkConnection()} busy={!!busy}><RefreshCw size={15} />{t('刷新安装状态')}</Button>}
      </div>
      <div className="modal-footer"><Button disabled={!!busy} onClick={() => { if (remoteResult) onClose(); else if (review) { setPreview(null); setSelection(null); setError(""); setAttempted(false); } else onClose(); }}>{remoteResult ? t('完成') : review ? <><ArrowLeft size={14} />{t("修改来源")}</> : t("取消")}</Button>
        {!remoteResult && (review || sourceType !== "market") && <Button type="submit" variant="primary" busy={!!busy} disabled={attempted || !review && !source.trim()}>{t(review ? "确认安装" : plugin ? "预览插件" : "预览技能")}<ArrowRight size={15} /></Button>}
      </div>
    </form>
  </Modal></IconProvider>;
}
