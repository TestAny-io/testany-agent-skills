import { useState } from "react";
import { ChevronDown, ChevronRight, FileCode2, GitCompareArrows, LoaderCircle } from "lucide-react";
import type { ActionRequest, ActionResult, FileChange, FileDiff } from "../shared/contracts";
import { ServiceMessage, t } from "./i18n";
import "./DiffBrowser.css";

type Execute = (request: Omit<ActionRequest, "mode">) => Promise<ActionResult | undefined>;

export function DiffBrowser({ previewId, changes, execute }: {
  previewId: string; changes: FileChange[]; execute: Execute;
}) {
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(40);
  if (!changes.length) return null;
  return <section className="diff-review">
    <button type="button" className="diff-toggle" aria-expanded={open} onClick={() => setOpen(value => !value)}>
      {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      <GitCompareArrows size={17} /><strong>{t("查看代码差异")}</strong>
      <span>{t("{count} 个文件", { count: changes.length })}</span>
    </button>
    {open && <div className="diff-files">
      <p className="diff-legend">{t("本机已安装内容 → 本次更新内容")}</p>
      {changes.slice(0, visible).map(change => <DiffFile key={`${previewId}:${change.path}`} change={change} previewId={previewId} execute={execute} />)}
      {visible < changes.length && <button type="button" className="button button-ghost" onClick={() => setVisible(value => value + 40)}>{t("显示更多文件")}</button>}
    </div>}
  </section>;
}

function DiffFile({ change, previewId, execute }: { change: FileChange; previewId: string; execute: Execute }) {
  const [open, setOpen] = useState(false);
  const [diff, setDiff] = useState<FileDiff>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function load() {
    setLoading(true); setError("");
    try {
      const result = await execute({ action: "preview.diff", previewId, path: change.path });
      if (result?.diff) setDiff(result.diff);
      else setError(t("差异尚未加载，请重试。"));
    } catch (failure) { setError((failure as Error).message); }
    finally { setLoading(false); }
  }
  function toggle() { const next = !open; setOpen(next); if (next && !diff && !loading) void load(); }
  return <article className="diff-file">
    <button type="button" className="diff-file-heading" aria-expanded={open} onClick={toggle}>
      {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}<FileCode2 size={15} />
      <span className={`diff-badge diff-badge-${change.type}`}>{t({ added: "新增", modified: "修改", removed: "删除" }[change.type])}</span>
      <code>{change.path}</code>
      {diff?.status === "text" && <span className="diff-counts"><b>+{diff.additions}</b><b>−{diff.deletions}</b></span>}
    </button>
    {open && <div className="diff-file-body">
      {loading && <p className="diff-note" role="status"><LoaderCircle className="spin" size={15} />{t("正在加载差异…")}</p>}
      {error && <div className="diff-note" role="alert"><ServiceMessage value={error} error /><button type="button" className="button button-ghost" onClick={() => void load()}>{t("重试")}</button></div>}
      {diff && diff.status !== "text" && <p className="diff-note">{t({
        binary: "二进制或非 UTF-8 文件，无法显示逐行差异。",
        symlink: "符号链接已变化；不读取链接目标的内容。",
        "too-large": "文件超过 256 KB 或包含过长行，逐行差异已省略。",
        "too-complex": "文件差异过于复杂，逐行预览已省略。",
      }[diff.status])}</p>}
      {diff?.status === "text" && <>
        <div className="diff-scroll" tabIndex={0} role="region" aria-label={`${t("文件差异")}: ${change.path}`}>
          <table className="diff-code"><caption className="sr-only">{t("本机已安装内容 → 本次更新内容")}</caption><tbody>
            {diff.hunks.map((hunk, index) => <DiffHunk key={index} hunk={hunk} />)}
          </tbody></table>
        </div>
        {diff.truncated && <p className="diff-note">{t("仅显示前 2000 行差异；更新仍包含完整文件。")}</p>}
      </>}
    </div>}
  </article>;
}

function DiffHunk({ hunk }: { hunk: FileDiff["hunks"][number] }) {
  return <>
    <tr className="diff-hunk"><td colSpan={4}><code>@@ −{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@</code></td></tr>
    {hunk.lines.map((line, index) => <tr key={index} className={`diff-line diff-line-${line.kind}`}>
      <td className="diff-number">{line.oldLine ?? ""}</td><td className="diff-number">{line.newLine ?? ""}</td>
      <td className="diff-sign" aria-label={line.kind === "added" ? t("新增") : line.kind === "removed" ? t("删除") : undefined}>{line.kind === "added" ? "+" : line.kind === "removed" ? "−" : " "}</td>
      <td className="diff-content"><code>{line.kind === "note" ? t("文件末尾无换行") : line.content}</code></td>
    </tr>)}
  </>;
}
