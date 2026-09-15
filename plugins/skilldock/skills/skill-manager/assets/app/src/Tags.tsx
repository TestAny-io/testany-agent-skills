import { useRef, useState } from "react";
import { Check, ChevronDown, Plus, Search, Tag, X } from "lucide-react";
import type { ActionRequest, ActionResult } from "../shared/contracts";
import { Modal } from "./Modal";
import { ServiceMessage, t } from "./i18n";
import "./Tags.css";

export type TagSubject = { kind: "skill" | "plugin"; id: string; name: string; path?: string; tags?: string[] };
const normalized = (value: string) => value.normalize("NFKC").trim().replace(/\s+/gu, " ");
const key = (value: string) => normalized(value).toLowerCase();
export function matchesTags(tags: string[] = [], selected: string[]) {
  return !selected.length || (!tags.length && selected.includes("")) || tags.some(tag => selected.includes(key(tag)));
}

export function TagStrip({ subject, disabled, onEdit }: { subject: TagSubject; disabled: boolean; onEdit: () => void }) {
  const tags = subject.tags || [];
  return <button className="tag-strip" disabled={disabled} onClick={onEdit}
    aria-label={t("编辑 {v0} 的标签", { v0: subject.name })} title={tags.join(" · ") || t("添加标签")}>
    <Tag size={13} />
    {tags.length ? <>{tags.slice(0, 3).map(tag => <span className="tag-chip" key={key(tag)}>{tag}</span>)}
      {tags.length > 3 && <span>+{tags.length - 3}</span>}<span className="tag-edit-caption">{t("编辑")}</span></>
      : <span>{t("添加标签")}</span>}
  </button>;
}

export function TagFilter({ items, selected, onChange }: { items: { tags?: string[] }[]; selected: string[]; onChange: (value: string[]) => void }) {
  const [search, setSearch] = useState("");
  const dropdown = useRef<HTMLDetailsElement>(null);
  const options = new Map<string, { label: string; count: number }>();
  for (const item of items) for (const tag of item.tags || []) {
    const id = key(tag); const previous = options.get(id);
    options.set(id, { label: previous?.label || tag, count: (previous?.count || 0) + 1 });
  }
  const available = [...options].sort((a, b) => a[1].label.localeCompare(b[1].label));
  const shown = available.filter(([, value]) => key(value.label).includes(key(search)));
  const choose = (id: string) => onChange(selected.includes(id) ? selected.filter(tag => tag !== id) : [...selected, id]);
  return <div className="tag-filter-bar">
    <details className="tag-filter" ref={dropdown} onKeyDown={event => {
      if (event.key === "Escape" && dropdown.current) { dropdown.current.open = false; dropdown.current.querySelector("summary")?.focus(); }
    }}>
      <summary><Tag size={15} />{t("标签筛选")}{!!selected.length && <b>{selected.length}</b>}<ChevronDown size={13} /></summary>
      <div className="tag-filter-popover">
        <label className="tag-search"><Search size={15} /><input aria-label={t("搜索标签")} placeholder={t("搜索标签")} value={search} onChange={event => setSearch(event.target.value)} /></label>
        <p>{t("匹配任一选中标签")}</p>
        <div className="tag-filter-options">
          {!search && <label><input type="checkbox" checked={selected.includes("")} onChange={() => choose("")} />
            <span>{t("未添加标签")}</span><small>{items.filter(item => !item.tags?.length).length}</small></label>}
          {shown.slice(0, 100).map(([id, option]) => <label key={id}><input type="checkbox" checked={selected.includes(id)} onChange={() => choose(id)} />
            <span>{option.label}</span><small>{option.count}</small></label>)}
          {!shown.length && <p>{t(available.length ? "没有匹配的标签" : "还没有标签，可在卡片上添加。")}</p>}
          {shown.length > 100 && <p>{t("输入更多文字以缩小标签范围。")}</p>}
        </div>
        <button className="text-button" onClick={() => { if (dropdown.current) dropdown.current.open = false; }}>{t("完成选择")}</button>
      </div>
    </details>
    <div className="tag-selected" aria-label={t("已选标签")}>{selected.map(id => <button className="tag-chip" key={id} onClick={() => choose(id)}
      aria-label={t("取消筛选 {v0}", { v0: id ? options.get(id)?.label || id : t("未添加标签") })}>
      {id ? options.get(id)?.label || id : t("未添加标签")}<X size={12} /></button>)}</div>
    {!!selected.length && <button className="text-button" onClick={() => onChange([])}>{t("清空标签筛选")}</button>}
  </div>;
}

export function TagsDialog({ subject, suggestions, busy, execute, onClose }: {
  subject: TagSubject; suggestions: string[]; busy: boolean;
  execute: (request: Omit<ActionRequest, "mode">) => Promise<ActionResult | undefined>; onClose: () => void;
}) {
  const [tags, setTags] = useState(subject.tags || []);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  function withDraft() {
    if (!draft.trim() && editing === null) return tags;
    const tag = normalized(draft);
    if (!tag || [...tag].length > 32 || /[\p{Cc}\p{Cf}]/u.test(draft)) throw new Error(t("每个标签需要 1 至 32 个字符，不能包含控制字符。"));
    const others = tags.filter((_, index) => index !== editing);
    if (others.some(value => key(value) === key(tag))) throw new Error(t("这个标签已经添加。"));
    if (others.length >= 12) throw new Error(t("每个对象最多设置 12 个标签。"));
    return editing === null ? [...tags, tag] : tags.map((value, index) => index === editing ? tag : value);
  }
  function add() {
    try { setTags(withDraft()); setDraft(""); setEditing(null); setError(""); input.current?.focus(); }
    catch (error) { setError((error as Error).message); }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); setError("");
    try {
      const next = withDraft();
      if (await execute({ action: "tags.set", target: { kind: subject.kind, id: subject.id }, tags: next })) onClose();
    } catch (error) { setError((error as Error).message); }
  }
  const choices = [...new Map(suggestions.map(tag => [key(tag), tag])).values()].filter(tag => !tags.some(value => key(value) === key(tag)) && key(tag).includes(key(draft))).slice(0, 8);
  return <Modal title={t("编辑标签")} onClose={() => { if (!busy) onClose(); }}>
    <form onSubmit={event => void save(event)}>
      <div className="modal-body tags-editor">
        <h3>{subject.name}</h3>{subject.path && <code className="tags-subject-path">{subject.path}</code>}
        <p>{t("标签只保存在 SkillDock 本机数据中，更新后保留。点击标签文字可以修改。")}</p>
        <div className="tags-edit-list">{tags.map((tag, index) => <span className={`tag-chip ${editing === index ? "is-editing" : ""}`} key={index}>
          <button type="button" disabled={busy} onClick={() => { setEditing(index); setDraft(tag); setError(""); input.current?.focus(); }}>{tag}</button>
          <button type="button" disabled={busy} aria-label={t("移除标签 {v0}", { v0: tag })} onClick={() => { setTags(tags.filter((_, i) => i !== index)); setEditing(null); setDraft(""); setError(""); }}><X size={12} /></button>
        </span>)}{!tags.length && <span className="tags-empty">{t("尚未添加标签")}</span>}</div>
        <label className="field"><span>{t("标签名称")}</span>
          <div className="tag-input-row"><input ref={input} aria-label={t("标签名称")} autoFocus value={draft} disabled={busy} placeholder={t("例如：研发、常用、写作")}
            onChange={event => { setDraft(event.target.value); setError(""); }} onKeyDown={event => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); add(); }
            }} /><button className="button button-secondary" type="button" disabled={busy || !draft.trim()} onClick={add}>
              {editing === null ? <Plus size={14} /> : <Check size={14} />}{t(editing === null ? "添加标签" : "修改标签")}</button></div>
          <small>{t("最多 12 个标签，每个最多 32 个字符。")}</small></label>
        {!!choices.length && editing === null && <div className="tag-suggestions"><span>{t("已有标签")}</span>{choices.map(tag => <button type="button" className="tag-chip" key={key(tag)} disabled={busy || tags.length >= 12}
          onClick={() => { setTags([...tags, tag]); setDraft(""); setError(""); }}>{tag}<Plus size={12} /></button>)}</div>}
        {error && <div className="field-error" role="alert"><ServiceMessage value={error} error /></div>}
      </div>
      <div className="modal-footer"><button className="button button-secondary" type="button" disabled={busy} onClick={onClose}>{t("取消")}</button>
        <button className="button button-primary" type="submit" disabled={busy}>{t(busy ? "正在保存…" : "保存标签")}</button></div>
    </form>
  </Modal>;
}
