import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowUpRight, Check, CircleAlert, Folder, Link2, Loader2, LockKeyhole, Trash2 } from "lucide-react";
import type { ActionRequest, ActionResult, RemovalPreview, Skill } from "../shared/contracts";
import { Modal } from "./Modal";
import { ServiceMessage, t } from "./i18n";
import "./DuplicateSkillsDialog.css";

const scopes = { user: "个人技能", project: "项目技能", plugin: "插件技能", system: "系统内置", cache: "插件缓存" };

export function DuplicateSkillsDialog({ name, skills, busy, action, onClose, onPlugin }: {
  name: string;
  skills: Skill[];
  busy: string | null;
  action: (request: Omit<ActionRequest, "mode">) => Promise<ActionResult | undefined>;
  onClose: () => void;
  onPlugin: (id: string) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [preview, setPreview] = useState<RemovalPreview | null>(null);
  const [error, setError] = useState("");
  const body = useRef<HTMLDivElement>(null);
  const group = skills.filter(skill => skill.name === name).sort((a, b) => Number(b.canRemove) - Number(a.canRemove) || a.path.localeCompare(b.path));
  const removable = group.filter(skill => skill.canRemove);
  const signature = group.map(skill => `${skill.id}:${skill.canRemove}`).sort().join("|");
  useEffect(() => {
    setSelected(previous => previous.filter(id => removable.some(skill => skill.id === id)));
    setPreview(null);
  }, [signature]);
  useEffect(() => { body.current?.scrollTo({ top: 0 }); }, [preview?.id]);
  function choose(id: string) {
    setSelected(previous => previous.includes(id) ? previous.filter(value => value !== id) : [...previous, id]);
    setError("");
  }
  async function prepare() {
    setError("");
    try {
      const result = await action({ action: "skill.previewRemoval", groupName: name, ids: selected });
      if (result?.removalPreview) setPreview(result.removalPreview);
    } catch (error) { setError((error as Error).message); }
  }
  async function apply() {
    if (!preview) return;
    setError("");
    try {
      if (await action({ action: "skill.removeSelected", previewId: preview.id })) onClose();
    } catch (error) { setPreview(null); setError((error as Error).message); }
  }
  function paths(title: string, items: Skill[], removing = false) {
    return <section className={`duplicate-review-list ${removing ? "duplicate-review-remove" : ""}`}>
      <h4>{title}<span>{items.length}</span></h4>
      {items.length ? <ul>{items.map(skill => <li key={skill.id}>
        {removing ? <Trash2 size={14} /> : <Check size={14} />}
        <div><code>{skill.path}</code><span>{t(scopes[skill.scope])} · {t(skill.sourceLabel)}</span>
          {skill.isLink && <p>{t("仅移除这个链接，目标内容保留。")}</p>}
        </div>
      </li>)}</ul> : <p>{t("没有保留项；这个同名组的所有已列出安装都将移除。")}</p>}
    </section>;
  }
  return <Modal title={t(preview ? "确认移除范围" : "管理同名技能")} onClose={() => { if (!busy) onClose(); }} wide className="duplicate-modal">
    <div className="modal-body duplicate-body" ref={body}>
      <div className="duplicate-heading"><Folder size={22} /><div><h3>{name}</h3>
        <p>{t("共 {v0} 份，按完整路径区分。", { v0: group.length })}</p></div></div>
      {preview ? <>
        <p className="dialog-description">{t("仅移除以下选中项，未选择项的文件和启用状态保持原样。每份都可从操作记录单独恢复。")}</p>
        {paths(t("将移除"), preview.remove, true)}
        {paths(t("将保留"), preview.keep)}
      </> : <>
        <p className="dialog-description">{t("默认全部保留。勾选要移除的安装副本，可以选择一份或多份；保留不会改变启用状态。")}</p>
        <div className="duplicate-tools">
          <button className="text-button" disabled={!!busy || !selected.length} onClick={() => { setSelected([]); setError(""); }}>{t("全部保留")}</button>
          <button className="text-button" disabled={!!busy || !removable.length || removable.length > 100} onClick={() => { setSelected(removable.map(skill => skill.id)); setError(""); }}>{t("选择可移除项")}</button>
        </div>
        <div className="duplicate-list">
          {group.map(skill => {
            const removing = selected.includes(skill.id);
            return <article className={`duplicate-copy ${removing ? "duplicate-copy-selected" : ""}`} key={skill.id} data-skill-id={skill.id}>
              <div className="duplicate-copy-heading">
                <label className="duplicate-choice"><input type="checkbox" checked={removing} disabled={!!busy || !skill.canRemove || (!removing && selected.length >= 100)} onChange={() => choose(skill.id)} aria-label={t("移除 {v0}", { v0: skill.path })} />
                  <span>{t(scopes[skill.scope])}</span></label>
                <span className="duplicate-state">{t(skill.enabled === null ? "尚未核实" : skill.enabled ? "配置已启用" : "配置已禁用")}</span>
                <span className={`duplicate-decision ${removing ? "remove" : "keep"}`}>{removing ? <Trash2 size={12} /> : <Check size={12} />}{t(removing ? "将移除" : "保留")}</span>
              </div>
              <code className="duplicate-path">{skill.path}</code>
              <p className="duplicate-source">{t("来源")} · {t(skill.sourceLabel)}{skill.version ? ` · ${skill.version}` : ""}{skill.pluginId ? ` · ${skill.pluginId}` : ""}</p>
              {skill.isLink && <p className="duplicate-note"><Link2 size={14} />{t("仅移除这个链接，目标内容保留。")}</p>}
              {!!skill.aliases?.length && <details className="duplicate-aliases"><summary>{t("同一份内容的其他路径")}</summary>
                <p>{t("这些路径指向同一份内容，不计为额外副本。移除实际目录后，指向它的链接可能失效。")}</p>
                {skill.aliases.map(alias => <code key={alias}>{alias}</code>)}
              </details>}
              {!skill.canRemove && <div className="duplicate-protection"><LockKeyhole size={14} /><div>
                <p>{t(skill.scope === "plugin" ? "插件附带技能不能单独卸载；本次选择不会卸载整个插件。" : skill.scope === "cache" ? "这是未核实的插件缓存，不能按已安装技能移除。" : "系统或宿主管理的技能不支持在此移除。")}</p>
                {skill.pluginId && <button className="text-button" disabled={!!busy} onClick={() => onPlugin(skill.pluginId!)}>{t("查看所属插件")}<ArrowUpRight size={12} /></button>}
              </div></div>}
            </article>;
          })}
        </div>
        {group.length < 2 && <p className="duplicate-note">{t("当前已没有同名冲突，请关闭此窗口查看最新清单。")}</p>}
      </>}
      {error && <div className="field-error" role="alert"><CircleAlert size={16} /><ServiceMessage value={error} error /></div>}
    </div>
    <div className="modal-footer duplicate-footer">
      {!preview && <span className="duplicate-summary" role="status">{t("移除 {v0} 份 · 保留 {v1} 份", { v0: selected.length, v1: group.length - selected.length })}</span>}
      <button className="button button-secondary" disabled={!!busy} onClick={() => preview ? setPreview(null) : onClose()}>{preview && <ArrowLeft size={15} />}{t(preview ? "返回选择" : "取消")}</button>
      <button className={`button ${preview ? "button-danger" : "button-primary"}`} disabled={!!busy || (!preview && (!selected.length || group.length < 2))} onClick={() => void (preview ? apply() : prepare())}>
        {busy ? <Loader2 className="spin" size={15} /> : <Trash2 size={15} />}
        {t(preview ? "确认移除选中的 {v0} 份" : "预览移除（{v0}）", { v0: preview ? preview.remove.length : selected.length })}
      </button>
    </div>
  </Modal>;
}
