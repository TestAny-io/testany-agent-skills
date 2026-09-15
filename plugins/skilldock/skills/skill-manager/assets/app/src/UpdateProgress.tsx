import { useEffect, useRef, useState } from "react";
import { CircleAlert, CircleCheck, Loader2 } from "lucide-react";
import type { Mode, UpdateProgress as Progress } from "../shared/contracts";
import { t } from "./i18n";
import "./UpdateProgress.css";

export function UpdateProgress({ mode, seed, pending, onComplete, onRunningChange }: { mode: Mode; seed?: Progress | null; pending: boolean; onComplete: () => void; onRunningChange: (value: boolean) => void }) {
  const [progress, setProgress] = useState<Progress | null>(seed || null);
  const [disconnected, setDisconnected] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [startedAt, setStartedAt] = useState(Date.now());
  const current = useRef(progress); const baseline = useRef<string | null>(null);
  const complete = useRef(onComplete); complete.current = onComplete;
  const runningChanged = useRef(onRunningChange); runningChanged.current = onRunningChange;
  useEffect(() => {
    if (pending) { baseline.current = current.current?.status === "running" ? null : current.current?.id || null; setStartedAt(Date.now()); }
  }, [pending]);
  useEffect(() => {
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const response = await fetch(`/api/updates/progress?mode=${mode}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]) });
        if (!response.ok) throw new Error("progress unavailable");
        const { progress: next } = await response.json() as { progress: Progress | null };
        if (controller.signal.aborted) return;
        const previous = current.current;
        current.current = next; setProgress(next); setDisconnected(false);
        runningChanged.current(next?.status === "running");
        if (next && next.status !== "running" && (previous?.id !== next.id || previous?.status === "running")) complete.current();
      } catch { if (!controller.signal.aborted) setDisconnected(true); }
      finally {
        if (!controller.signal.aborted) {
          setNow(Date.now());
          timer = setTimeout(() => void poll(), pending || current.current?.status === "running" ? 750 : 4000);
        }
      }
    }
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [mode, pending]);
  const visible = pending && progress?.id === baseline.current ? null : progress;
  if (!visible && !pending) return disconnected ? <p role="status">{t("暂时无法读取进度，正在重试；后台任务可能仍在运行。")}</p> : null;
  const active = pending && !visible || visible?.status === "running";
  const total = visible?.total;
  const determined = total !== null && total !== undefined;
  const percent = determined ? total ? Math.floor((visible!.completed / total) * 100) : active ? 0 : 100 : undefined;
  const duration = Math.max(0, Math.floor(((visible?.finishedAt ? Date.parse(visible.finishedAt) : now) - (visible ? Date.parse(visible.startedAt) : startedAt)) / 1000));
  const elapsed = t("耗时 {v0} 分 {v1} 秒", { v0: Math.floor(duration / 60), v1: duration % 60 });
  const phase = visible?.phase || "preparing";
  const labels = { preparing: "正在准备更新清单", checking: "正在检查", applying: "正在应用更新", finalizing: "正在保存检查结果", finished: "检查结束" };
  const summary = determined ? t("已处理 {v0} / {v1} 个更新对象", { v0: visible!.completed, v1: total }) : active ? t(labels.preparing) : t("已处理 {v0} 个更新对象", { v0: visible?.completed || 0 });
  const title = active ? t("更新检查进行中") : t(visible?.status === "success" ? "更新检查已完成" : visible?.status === "partial" ? "更新检查部分完成" : "更新检查未完成");
  return <section className={`update-progress ${!active && visible?.status !== "success" ? "has-issues" : ""}`} aria-label={t("更新进度")}>
    <div className="update-progress-heading"><strong>{active ? <Loader2 size={17} className="spin" /> : visible?.status === "success" ? <CircleCheck size={17} /> : <CircleAlert size={17} />}{title}</strong>
      <span>{percent === undefined ? active ? "—" : "" : `${percent}%`}</span></div>
    {(active || determined) && <div className={`update-progress-track ${!determined ? "is-indeterminate" : ""}`} role="progressbar" aria-label={t("更新进度")}
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-valuetext={summary}>
      <span style={determined ? { width: `${percent}%` } : undefined} /></div>}
    <div className="update-progress-caption" aria-live="polite"><span>{summary}</span>
      <span>{elapsed}</span></div>
    {active && <p className="update-progress-current">{t(labels[phase])}{visible?.current && <> · <strong>{visible.current.name}</strong></>}</p>}
    {!!visible && <div className="update-progress-counts">
      {Object.entries(visible.counts).map(([status, count]) => <span key={status} className={status === "error" && count ? "progress-error" : ""}>
        {t(({ current: "已是最新", available: "有可用更新", updated: "已更新", skipped: "已跳过", error: "失败" })[status as keyof Progress["counts"]])}<b>{count}</b></span>)}
    </div>}
    {active && <small>{t("按更新对象计数；一个插件及其附带技能算一个对象。")}</small>}
    {disconnected && <p role="status" className="progress-error">{t("暂时无法读取进度，正在重试；后台任务可能仍在运行。")}</p>}
  </section>;
}
