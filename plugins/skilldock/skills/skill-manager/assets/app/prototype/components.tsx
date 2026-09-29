// [PROTOTYPE] Composition gaps: production equivalents are private to App.tsx.
import type { ReactNode } from "react";
import { Archive, BookOpen, Box, Braces, Check, CircleAlert, Code2, FileText, Folder, Image, Layers3, Loader2, PenLine, Search, SlidersHorizontal, Sparkles, TestTube2, WandSparkles } from "lucide-react";
import { LibraryButton as Button } from "../src/LibraryUI";

export function ItemIcon({ name, large = false }: { name: string; large?: boolean }) {
  const match = /prompt|llm/.test(name) ? [WandSparkles, "violet"] as const
    : /design|image/.test(name) ? [name.includes("image") ? Image : Layers3, "rose"] as const
      : /review|eng/.test(name) ? [Code2, "blue"] as const
        : /playwright|browser|test/.test(name) ? [TestTube2, "teal"] as const
          : /skilldock|manager/.test(name) ? [SlidersHorizontal, "graphite"] as const
            : /docs/.test(name) ? [BookOpen, "sand"] as const
              : /writing|writer|notes/.test(name) ? [FileText, "sand"] as const : [Braces, "blue"] as const;
  const [Icon, tone] = match;
  return <span className={`item-icon icon-${tone} ${large ? "icon-large" : ""}`}><Icon size={large ? 27 : 20} strokeWidth={1.65} /></span>;
}

export function Switch({ checked, disabled, label, onChange }: { checked: boolean; disabled?: boolean; label: string; onChange: () => void }) {
  return <button type="button" className="sd-switch" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={onChange}><span /></button>;
}

export type Page = "skills" | "plugins" | "markets" | "updates" | "activity";
export type State = "normal" | "loading" | "empty" | "error" | "boundary";
export const pageNames: Record<Page, string> = { skills: "技能库", plugins: "插件", markets: "市场来源", updates: "更新", activity: "操作记录" };

export function PageState({ page, state, onReset, onAdd, children }: { page: Page; state: State; onReset: () => void; onAdd: () => void; children: ReactNode }) {
  if (state === "normal" || state === "boundary") return <>{children}</>;
  if (state === "loading") return <section className="state-loading" aria-busy="true" aria-label={`正在读取${pageNames[page]}`}>
    <div className="loading-caption"><Loader2 size={17} className="spin" /><span>正在读取{pageNames[page]}…</span><Button variant="ghost" onClick={onReset}>完成加载（预览）</Button></div>
    {[0, 1, 2, 3, 4].map(i => <div className="skeleton-row" key={i}><span className="skeleton-icon" /><span><i /><i /></span><i /></div>)}
  </section>;
  const errorText: Record<Page, string> = { skills: "暂时无法读取项目目录，个人技能未受影响。", plugins: "未能读取插件清单，请检查 Codex 的连接。", markets: "无法连接 Git 来源，请检查网络与仓库访问权限。", updates: "检查被网络中断，已安装内容保持原样。", activity: "暂时无法读取操作记录，已有记录未被删除。" };
  const emptyText: Record<Page, [string, string, string]> = {
    skills: ["从第一项技能开始", "把常用的工作方式，放进你的技能库。", "安装技能"],
    plugins: ["让工具配合你的工作", "安装一个插件，将相关技能放在一起管理。", "安装插件"],
    markets: ["连接你的第一个来源", "从团队仓库或公开 Marketplace 发现插件。", "添加来源"],
    updates: ["一切都是最新的", "下次检查会按计划在后台进行。", "重新检查"],
    activity: ["这里会记住每次变化", "安装、更新和移除的结果都能在这里找到。", "浏览技能库"],
  };
  const [title, description, action] = emptyText[page];
  const Icon = state === "error" ? CircleAlert : ({ skills: Sparkles, plugins: Box, markets: Folder, updates: Check, activity: Archive }[page]);
  return <section className={`empty-view ${state === "error" ? "error-view" : ""}`} role={state === "error" ? "alert" : "status"}>
    <span className="empty-glyph"><Icon size={30} strokeWidth={1.4} /></span><h2>{state === "error" ? "暂时没有连接上" : title}</h2><p>{state === "error" ? errorText[page] : description}</p>
    <Button variant="primary" onClick={state === "error" || page === "updates" ? onReset : onAdd}>{state === "error" ? "重试" : action}</Button>
  </section>;
}

export function NoResults({ onClear }: { onClear: () => void }) {
  return <div className="empty-view compact" role="status"><span className="empty-glyph"><Search size={26} /></span><h2>没有找到匹配项</h2><p>试试另一个关键词，或调整筛选条件。</p><Button onClick={onClear}>清除筛选</Button></div>;
}

export function Notice({ children, tone = "info", action }: { children: ReactNode; tone?: "info" | "warning"; action?: ReactNode }) {
  return <div className={`sd-notice notice-${tone}`}><CircleAlert size={16} /><span>{children}</span>{action}</div>;
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return <div className="section-title"><h2>{children}</h2>{aside}</div>;
}

export { Button, PenLine };
