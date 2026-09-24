import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Check, Grid2X2, List, Loader2 } from "lucide-react";
import type { ActionRequest, ActionResult } from "../shared/contracts";
import { t } from "./i18n";

export type ActionHandler = (request: Omit<ActionRequest, "mode">) => Promise<ActionResult | undefined>;
export function LibraryButton({ children, variant = "secondary", busy, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger"; busy?: boolean }) {
  return <button {...props} type={props.type || "button"} disabled={props.disabled || busy} className={`button button-${variant} ${props.className || ""}`}>{busy && <Loader2 size={15} className="spin" />}{children}</button>;
}
export function ViewSwitch({ value, onChange }: { value: "grid" | "list"; onChange: (value: "grid" | "list") => void }) {
  return <div className="view-switch" aria-label={t("显示方式")}>
    <button onClick={() => onChange("grid")} className={value === "grid" ? "active" : ""} aria-pressed={value === "grid"} aria-label={t("卡片视图")}><Grid2X2 size={17} /></button>
    <button onClick={() => onChange("list")} className={value === "list" ? "active" : ""} aria-pressed={value === "list"} aria-label={t("列表视图")}><List size={18} /></button>
  </div>;
}
export function LibraryFilters<T extends string>({ items, selected, onChange }: { items: { id: T; label: string; count: number; icon: ReactNode }[]; selected: T; onChange: (value: T) => void }) {
  return <div className="stats-grid">{items.map(item => <button key={item.id} className={`stat-card ${selected === item.id ? "selected" : ""}`} onClick={() => onChange(item.id)} aria-pressed={selected === item.id}>
    <div><span>{t(item.label)}</span>{item.icon}</div><strong>{item.count}<span>{t("个")}</span></strong><span className="stat-indicator" />
  </button>)}</div>;
}
export function InstallSteps({ preview }: { preview: boolean }) {
  return <div className="step-indicator"><span className={preview ? "complete" : "active"}>{preview ? <Check size={12} /> : "1"}</span>{t("选择来源")}<div /><span className={preview ? "active" : ""}>2</span>{t("预览与安装")}</div>;
}
export function CollectionFooter({ visible, total, onMore }: { visible: number; total: number; onMore: () => void }) {
  return <div className="plugin-pagination"><p aria-live="polite">{t("已显示 {v0} / {v1} 项", { v0: Math.min(visible, total), v1: total })}</p>
    {visible < total ? <LibraryButton onClick={onMore}>{t("显示更多")}</LibraryButton> : <span>{t("当前筛选结果已全部显示")}</span>}
  </div>;
}
