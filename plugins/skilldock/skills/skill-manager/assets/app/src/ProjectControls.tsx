import { useState } from "react";
import { ChevronDown, FolderOpen } from "lucide-react";
import type { ProjectCatalog } from "../shared/contracts";
import { LibraryButton as Button, type ActionHandler } from "./LibraryUI";
import { Modal } from "./Modal";
import { ServiceMessage, t } from "./i18n";

export function ProjectPicker({ project, catalog, disabled, onSelect, onBrowse }: { project: string; catalog?: ProjectCatalog; disabled: boolean; onSelect: (path: string) => void; onBrowse: () => void }) {
  return <label className="project-picker select-control"><FolderOpen size={16} /><select aria-label={t("切换项目")} value={project} disabled={disabled} onChange={event => {
    const value = event.target.value;
    if (value === "browse") onBrowse(); else onSelect(value);
  }}>
    {!catalog?.entries.some(item => item.path === project) && <option value={project}>{project}</option>}
    {(["codex", "recent", "current"] as const).map(source => {
      const entries = catalog?.entries.filter(item => item.source === source) || [];
      return entries.length ? <optgroup key={source} label={t({ codex: "Codex 项目", recent: "最近使用", current: "当前项目" }[source])}>{entries.map(item => <option key={item.path} value={item.path} disabled={!item.available}>{item.name} — {item.path}{item.available ? "" : ` (${t("目录不可用")})`}</option>)}</optgroup> : null;
    })}
    <optgroup label={t("项目操作")}><option value="browse">{t("选择本地文件夹…")}</option></optgroup>
  </select><ChevronDown size={13} /></label>;
}

export function ProjectDialog({ project, catalog, busy, action, onClose }: { project: string; catalog?: ProjectCatalog; busy: string | null; action: ActionHandler; onClose: () => void }) {
  const [directory, setDirectory] = useState(project);
  const [error, setError] = useState("");
  async function choose() {
    setError("");
    try { const result = await action({ action: "project.chooseDirectory", projectDir: directory }); if (result?.selectedDirectory) setDirectory(result.selectedDirectory); }
    catch (failure) { setError((failure as Error).message); }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError("");
    try { const result = await action({ action: "project.select", projectDir: directory }); if (result?.projectContext) onClose(); }
    catch (failure) { setError((failure as Error).message); }
  }
  return <Modal title={t("选择本地文件夹")} eyebrow="PROJECT DIRECTORY" onClose={() => { if (!busy) onClose(); }}>
    <form onSubmit={event => void submit(event)}><div className="modal-body">
      <p className="dialog-description">{t("选择需要管理项目技能的本机目录。个人技能和插件仍然可见。")}</p>
      {catalog?.warning && <p className="field-hint">{t(catalog.warning)}</p>}
      <div className="field"><span>{t("项目文件夹")}</span><div className="directory-choice"><code>{directory}</code>{catalog?.canChooseDirectory && <Button onClick={() => void choose()} busy={!!busy}><FolderOpen size={15} />{t("选择文件夹")}</Button>}</div></div>
      <details className="git-source-advanced" open={!catalog?.canChooseDirectory}><summary>{t("手动输入路径")}</summary><label className="field"><span>{t("项目目录（绝对路径）")}</span><input value={directory} disabled={!!busy} onChange={event => setDirectory(event.target.value)} /></label></details>
      <p className="field-hint">{t("选择会被保存；显式启动参数优先。切换后请核对定时更新计划中的项目目标。")}</p>
      {error && <div role="alert" className="field-error"><ServiceMessage value={error} error /></div>}
    </div><div className="modal-footer"><Button onClick={onClose} disabled={!!busy}>{t("取消")}</Button><Button type="submit" variant="primary" busy={!!busy} disabled={!directory.trim()}>{t("切换并重新扫描")}</Button></div></form>
  </Modal>;
}
