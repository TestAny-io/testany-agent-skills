import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Blocks, FolderOpen, GitBranch, Globe2, Plus, Search, ShieldCheck, Sparkles } from "lucide-react";
import type { InstallPreview, PluginInstallPreview, Plugin, Snapshot } from "../shared/contracts";
import { Modal } from "./Modal";
import { LibraryButton as Button, InstallSteps, type ActionHandler } from "./LibraryUI";
import { GitSourceFields, ResolvedGitSource } from "./GitSourceFields";
import { ServiceMessage, t } from "./i18n";
import { PluginSkillPicker } from "./PluginSkillPicker";

export function InstallDialog({ kind, data, initialPlugin, initialMarket = false, busy, action, onClose, onMarket }: {
  kind: "skill" | "plugin"; data: Snapshot; initialPlugin?: Plugin; initialMarket?: boolean; busy: string | null; action: ActionHandler; onClose: () => void; onMarket: () => void;
}) {
  const plugin = kind === "plugin";
  const [sourceType, setType] = useState<"local" | "git" | "market">(initialPlugin || initialMarket ? "market" : "local");
  const [source, setSource] = useState(""); const [subpath, setSubpath] = useState(""); const [gitRef, setRef] = useState("");
  const [query, setQuery] = useState(""); const [market, setMarket] = useState("all"); const [limit, setLimit] = useState(30);
  const [preview, setPreview] = useState<InstallPreview | PluginInstallPreview | null>(null);
  const [selection, setSelection] = useState<Plugin | null>(null);
  const [enabledSkills, setEnabledSkills] = useState<string[]>([]);
  const initialized = useRef(false);
  const [error, setError] = useState(""); const review = preview;
  const listed = data.plugins.filter(item => (market === "all" || item.marketplace === market) && `${item.name} ${item.description} ${item.marketplace}`.toLowerCase().includes(query.toLowerCase()));
  const direct = preview && "skills" in preview ? preview : null;
  function acceptPreview(value: PluginInstallPreview) { setPreview(value); setEnabledSkills(value.skillDetails.map(skill => skill.path)); }
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
      const skillChoice = direct?.canSelectSkills ? { enabledSkills } : {};
      const result = await action(selection && preview ? { action: "plugin.install", id: selection.id, previewId: preview.id, ...skillChoice } : preview
        ? { action: plugin ? "plugin.installSource" : "skill.install", previewId: preview.id, ...skillChoice }
        : { action: plugin ? "plugin.previewInstall" : "skill.previewInstall", sourceType: sourceType === "git" ? "git" : "local", source: source.trim(), ...(subpath.trim() ? { subpath: subpath.trim() } : {}), ...(sourceType === "git" && gitRef.trim() ? { ref: gitRef.trim() } : {}) });
      if (result?.pluginPreview) acceptPreview(result.pluginPreview);
      else if (result?.preview) setPreview(result.preview);
      else if (result) onClose();
    } catch (failure) { setError((failure as Error).message); }
  }
  return <Modal wide={plugin} className="install-dialog" title={t(review ? plugin ? "确认安装插件" : "确认安装技能" : plugin ? "安装插件" : "安装技能")} eyebrow={plugin ? "INSTALL A PLUGIN" : "INSTALL A SKILL"} onClose={() => { if (!busy) onClose(); }}>
    <form onSubmit={event => void submit(event)}>
      <div className="modal-body">
        <InstallSteps preview={!!review} />
        {review ? <>
          <div className={`install-preview ${plugin ? "plugin-install-summary" : ""}`}><span className="skill-icon tone-1">{plugin ? <Blocks size={23} /> : <Sparkles size={23} />}</span><h3>{review.name}</h3><p>{review.description || t("未提供描述")}</p>
            {"version" in review && <span className="badge badge-neutral">{review.version || t("版本未提供")}</span>}
            {preview && typeof preview.files === "number" && typeof preview.bytes === "number" && <span className="badge badge-neutral">{t("{v0} 个文件", { v0: preview.files })} · {(preview.bytes / 1024).toFixed(1)} KB</span>}
          </div>
          <dl className="preview-paths"><dt>{t("来自")}</dt><dd><code>{selection?.marketplace || preview?.source}</code></dd>
            {preview && "target" in preview && <><dt>{t("安装到")}</dt><dd><code>{preview.target}</code></dd></>}
          </dl>
          {preview && <ResolvedGitSource source={preview} />}
          {direct && <><PluginSkillPicker preview={direct} selected={enabledSkills} onChange={setEnabledSkills} disabled={!!busy} /><div className="install-components">
            {!!direct.components.length && <p>{t("其他组件")}: {direct.components.map(item => t({ commands: "命令", agents: "代理", hooks: "Hooks", mcp: "MCP 服务器", apps: "应用连接" }[item] || item)).join(" · ")}</p>}
            {!!direct.duplicates.length && <p className="field-error">{t("已有同名插件，将作为另一个来源单独安装：")}{direct.duplicates.join(", ")}</p>}
          </div></>}
          <div className="dialog-note"><ShieldCheck size={16} /><p>{t(plugin ? "将安装这个插件及其附带组件。安装后可在插件详情统一管理、更新或卸载。" : "安装前会再次核验文件。已存在的同名目录会保留，不会被覆盖。")}</p></div>
        </> : <>
          <div className={`source-choice ${plugin ? "source-choice-three" : ""}`}>
            {([{ id: "local", label: "本地目录", icon: FolderOpen }, { id: "git", label: "Git 仓库", icon: GitBranch }, ...(plugin ? [{ id: "market", label: "Marketplace", icon: Globe2 }] : [])] as const).map(item => <button type="button" key={item.id} aria-label={t(item.label)} disabled={!!busy} className={sourceType === item.id ? "selected" : ""} aria-pressed={sourceType === item.id} onClick={() => { setType(item.id as typeof sourceType); setSource(""); setSubpath(""); setRef(""); setError(""); }}><item.icon size={19} /><strong>{t(item.label)}</strong></button>)}
          </div>
          {sourceType === "market" ? <div className="market-install">
            <div className="catalog-intro"><p>{t("从已连接的 Marketplace 选择一个插件。")}</p><Button onClick={onMarket} disabled={!!busy}><Plus size={15} />{t("添加来源")}</Button></div>
            <div className="toolbar"><label className="search-field"><Search size={17} /><input type="search" aria-label={t("搜索插件")} placeholder={t("搜索插件或市场…")} value={query} onChange={e => { setQuery(e.target.value); setLimit(30); }} /></label>
              <label className="select-control"><Globe2 size={15} /><select aria-label={t("筛选插件市场")} value={market} onChange={e => { setMarket(e.target.value); setLimit(30); }}><option value="all">{t("全部市场")}</option>{[...new Set([...data.marketplaces.map(item => item.name), ...data.plugins.map(item => item.marketplace)])].map(name => <option key={name} value={name}>{data.marketplaces.find(item => item.name === name)?.displayName || name}</option>)}</select></label>
            </div>
            {busy?.startsWith("plugin.previewMarketplace:") && <p role="status" className="field-hint">{t("正在读取插件的技能和组件…")}</p>}
            <div className="install-catalog">{listed.slice(0, limit).map(item => <button type="button" className="install-catalog-row" key={item.id} disabled={!!busy || item.installed || !item.canInstall} onClick={() => void choosePlugin(item)}>
              <Blocks size={21} /><div><strong>{item.name}</strong><small>{item.directSource ? t("单插件来源") : item.marketplace} · {item.version || t("版本未提供")}</small>{item.description && <p>{item.description}</p>}{!item.canInstall && !item.installed && <small><ServiceMessage value={item.reason || "请通过 Codex 的插件管理入口安装。"} /></small>}</div><span>{item.installed ? t("已安装") : item.canInstall ? t("预览插件") : t("由 Codex 管理")}</span><ArrowRight size={15} />
            </button>)}</div>
            {!listed.length && <div className="empty-state"><Globe2 size={28} /><h3>{t("没有找到匹配的插件")}</h3><p>{t("调整筛选，或添加一个 Marketplace 来源。")}</p><Button onClick={onMarket}>{t("添加来源")}</Button></div>}
            {listed.length > limit && <Button onClick={() => setLimit(limit + 30)}>{t("显示更多")}</Button>}
          </div> : sourceType === "git" ? <GitSourceFields kind={kind} source={source} subpath={subpath} gitRef={gitRef} setSource={setSource} setSubpath={setSubpath} setRef={setRef} /> : <label className="field"><span>{t(plugin ? "插件目录路径" : "技能目录路径")}</span><input required value={source} disabled={!!busy} autoComplete="off" placeholder={plugin ? "/Users/you/plugins/my-plugin" : "/Users/you/skills/my-skill"} onChange={e => setSource(e.target.value)} /></label>}
          {plugin && sourceType !== "market" && <p className="field-hint">{t("选择单个插件的目录，内含 plugin.json。无需先添加 Marketplace；SkillDock 会记录来源，供后续更新使用。")}</p>}
        </>}
        {error && <div className="field-error" role="alert"><ServiceMessage value={error} error /></div>}
      </div>
      <div className="modal-footer"><Button disabled={!!busy} onClick={() => { if (review) { setPreview(null); setSelection(null); setError(""); } else onClose(); }}>{review ? <><ArrowLeft size={14} />{t("修改来源")}</> : t("取消")}</Button>
        {(review || sourceType !== "market") && <Button type="submit" variant="primary" busy={!!busy} disabled={!review && !source.trim()}>{t(review ? "确认安装" : plugin ? "预览插件" : "预览技能")}<ArrowRight size={15} /></Button>}
      </div>
    </form>
  </Modal>;
}
