// [PROTOTYPE] Local state only. No API client, native bridge, or scheduler is invoked.
import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { ArrowDownToLine, ArrowLeft, Box, Check, ChevronDown, ChevronRight, CircleHelp, Clock3, Copy, FolderOpen, Globe2, History, Layers3, Monitor, Moon, MoreHorizontal, Plus, RefreshCw, Search, Settings2, SlidersHorizontal, Sun, Tag, Trash2, X } from "lucide-react";
import type { ActionRequest, ActionResult, Activity, Marketplace, Plugin, PluginInstallPreview, RemovalPreview, Skill, UpdateItem } from "../shared/contracts";
import { Modal } from "../src/Modal";
import { CollectionFooter, LibraryFilters, ViewSwitch } from "../src/LibraryUI";
import { TagFilter, TagStrip, TagsDialog, matchesTags, type TagSubject } from "../src/Tags";
import { InstallDialog } from "../src/InstallDialog";
import { DuplicateSkillsDialog } from "../src/DuplicateSkillsDialog";
import { ProjectPicker, ProjectDialog } from "../src/ProjectControls";
import { setPreferences, usePreferences } from "../src/preferences";
import { t } from "../src/i18n";
import { Button, ItemIcon, NoResults, Notice, PageState, Switch, pageNames, type Page, type State } from "./components";
import { ActivityWorkspace, MarketsWorkspace, UpdatesWorkspace, ScheduleDialog, MarketDialog, SourceDialog } from "./Workspaces";
import { boundarySkills, initialActivity, initialMarkets, initialPlugins, initialSkills, initialUpdates, pluginPreview, projectRoot, projects, removedExample, snapshot } from "./mock/data";

type Entry = Skill | Plugin;
type Filter = { search: string; tab: string; source: string; tags: string[]; view: "list" | "grid"; visible: number };
const freshFilter = (): Filter => ({ search: "", tab: "all", source: "all", tags: [], view: "list", visible: 20 });
const isSkill = (item: Entry): item is Skill => "scope" in item;
const pause = (ms = 380) => new Promise<void>(resolve => window.setTimeout(resolve, ms));
function route() {
  const params = new URLSearchParams(location.search);
  return { page: (Object.keys(pageNames).includes(params.get("page") || "") ? params.get("page") : "skills") as Page,
    state: (["normal", "loading", "empty", "error", "boundary"].includes(params.get("state") || "") ? params.get("state") : "normal") as State };
}

export default function Prototype() {
  const [locationState, setRoute] = useState(route);
  const { page, state } = locationState;
  const prefs = usePreferences();
  const [systemDark, setSystemDark] = useState(matchMedia("(prefers-color-scheme: dark)").matches);
  const theme = prefs.theme === "system" ? systemDark ? "dark" : "light" : prefs.theme;
  const [skills, setSkills] = useState(() => state === "boundary" ? boundarySkills() : initialSkills);
  const [plugins, setPlugins] = useState(initialPlugins);
  const [markets, setMarkets] = useState(initialMarkets);
  const [activity, setActivity] = useState(initialActivity);
  const [updates, setUpdates] = useState(initialUpdates);
  const [project, setProject] = useState(projectRoot);
  const [filters, setFilters] = useState<Record<"skills" | "plugins", Filter>>({ skills: freshFilter(), plugins: freshFilter() });
  const [detail, setDetail] = useState<Entry | null>(null);
  const [detailTab, setDetailTab] = useState("overview");
  const [install, setInstall] = useState<{ kind: "skill" | "plugin"; item?: Plugin; market?: boolean } | null>(null);
  const [returnToInstall, setReturnToInstall] = useState<typeof install>(null);
  const [tags, setTags] = useState<TagSubject | null>(null);
  const [duplicates, setDuplicates] = useState<string | null>(null);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [projectOpen, setProjectOpen] = useState(false);
  const [previewTools, setPreviewTools] = useState(false);
  const [marketOpen, setMarketOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [sourceItem, setSourceItem] = useState<UpdateItem | null>(null);
  const [confirm, setConfirm] = useState<{ kind: "remove" | "restore" | "market"; item: Entry | Activity | Marketplace } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [lastCheck, setLastCheck] = useState("今天 09:00");
  const [schedule, setSchedule] = useState({ enabled: true, hours: 24, autoApply: true, targets: ["testany-eng", "skilldock", "playwright"] });
  const [operationError, setOperationError] = useState("");
  const installPreview = useRef<PluginInstallPreview | ActionResult["preview"]>(undefined);
  const removalPreview = useRef<RemovalPreview | undefined>(undefined);
  const removed = useRef(new Map<string, Skill>([["a3", removedExample]]));
  const checkTimer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const main = useRef<HTMLElement>(null);

  useEffect(() => {
    const onPop = () => { setRoute(route()); setDetail(null); setInstall(null); };
    const media = matchMedia("(prefers-color-scheme: dark)");
    const onTheme = () => setSystemDark(media.matches);
    window.addEventListener("popstate", onPop); media.addEventListener("change", onTheme);
    document.title = "SkillDock · 设计预览";
    return () => { window.removeEventListener("popstate", onPop); media.removeEventListener("change", onTheme); clearInterval(checkTimer.current); };
  }, []);
  useEffect(() => { if (toast) { const timer = setTimeout(() => setToast(""), 5000); return () => clearTimeout(timer); } }, [toast]);
  useEffect(() => { document.title = "SkillDock · 设计预览"; }, [prefs]);
  useEffect(() => {
    if (state === "boundary" && page === "skills") setSkills(previous => previous.length < 40 ? boundarySkills() : previous);
    if (state === "boundary" && page === "plugins") {
      setPlugins(previous => previous.some(p => p.id === "private-platform-tools") ? previous : [...previous,
        { ...initialPlugins[5], id: "private-platform-tools", name: "private-platform-tools", installed: false, enabled: false, canInstall: false, reason: "私有来源的 SSH 密钥尚未解锁，请先完成本机 Git 授权。" },
        { ...initialPlugins[5], id: "mcp-connection", name: "mcp-connection", description: "只包含 MCP 连接，没有附带技能。", skillCount: 0, installed: false, enabled: false },
      ]);
      setFilters(previous => ({ ...previous, plugins: { ...previous.plugins, tab: "discover" } }));
    }
    if (state === "empty") {
      if (page === "skills") setSkills([]);
      if (page === "plugins") setPlugins(previous => previous.map(p => ({ ...p, installed: false, enabled: false, canInstall: true })));
      if (page === "markets") setMarkets([]);
      if (page === "activity") setActivity([]);
      if (page === "updates") setUpdates(previous => previous.filter(i => i.canCheck).map(i => ({ ...i, status: "current", canApply: false })));
    }
  }, [state, page]);

  function navigate(nextPage: Page, nextState: State = "normal", event?: MouseEvent) {
    event?.preventDefault();
    const url = new URL(location.href); url.searchParams.set("page", nextPage);
    if (nextState === "normal") url.searchParams.delete("state"); else url.searchParams.set("state", nextState);
    history.pushState({}, "", url); setRoute({ page: nextPage, state: nextState }); setDetail(null); setOperationError("");
    main.current?.scrollTo({ top: 0 });
  }
  function addRecord(action: string, target: string, message: string, path?: string, item?: Skill) {
    const id = crypto.randomUUID();
    if (item) removed.current.set(id, item);
    setActivity(previous => [{ id, action, target, message, path, createdAt: new Date().toISOString(), status: "success", canRestore: !!item }, ...previous]);
  }
  const allSkills = useMemo(() => skills.map(item => {
    const parentDisabled = item.pluginId && plugins.find(p => p.id === item.pluginId)?.enabled === false;
    return { ...item, ...(parentDisabled ? { enabled: false, canToggle: false, reason: "所属插件已禁用。先启用插件，即可调整这项技能；原来的单项选择已保留。" } : {}), duplicateNames: skills.filter(other => other.id !== item.id && other.name === item.name).map(other => other.id) };
  }), [skills, plugins]);
  const activeSkills = allSkills.filter(item => item.scope !== "project" || item.path.startsWith(project));
  const data = snapshot(activeSkills, plugins, markets, activity, project);
  const availableUpdates = updates.filter(item => item.status === "available").length;
  const currentDetail = detail ? isSkill(detail) ? allSkills.find(item => item.id === detail.id) || detail : plugins.find(item => item.id === detail.id) || detail : null;

  async function action(request: Omit<ActionRequest, "mode">): Promise<ActionResult> {
    setBusy(`${request.action}:${request.id || ""}`);
    try {
      await pause();
      switch (request.action) {
        case "tags.set": {
          if (request.target?.kind === "skill") setSkills(items => items.map(item => item.id === request.target?.id ? { ...item, tags: request.tags } : item));
          else setPlugins(items => items.map(item => item.id === request.target?.id ? { ...item, tags: request.tags } : item));
          addRecord("tags.set", tags?.name || request.target?.id || "标签", "标签已保存。"); setToast("标签已保存"); break;
        }
        case "skill.previewInstall": {
          if (!request.source?.startsWith("/") && !/^(https?:\/\/|git@)/.test(request.source || "")) throw new Error("请输入有效的 Git 地址或本地绝对路径。");
          const name = request.source!.replace(/\/$/, "").split("/").pop()!.replace(/\.git$/, "");
          const preview = { id: `skill-${name}`, name, description: "为日常工作提供可复用的流程与指南。", source: request.source!, target: `/Users/demo/.codex/skills/${name}`, files: 3, bytes: 8192, ref: request.ref || "main", commit: "a83cf2e" };
          if (skills.some(item => item.scope === "user" && item.name === name)) throw new Error("这个安装目录已存在。请保留原文件，或选择其他来源。");
          installPreview.current = preview; return { message: "预览已准备", preview };
        }
        case "plugin.previewMarketplace":
        case "plugin.previewInstall": {
          if (request.action === "plugin.previewInstall" && !request.source?.startsWith("/") && !/^(https?:\/\/|git@)/.test(request.source || "")) throw new Error("请输入有效的 Git 地址或本地绝对路径。");
          const selected = plugins.find(item => item.id === request.id) || { ...initialPlugins[5], id: request.source?.replace(/\/$/, "").split("/").pop()?.replace(/\.git$/, "") || "testany-mrkt" };
          const preview = pluginPreview({ ...selected, name: selected.id }, request.source);
          installPreview.current = preview; return { message: "预览已准备", pluginPreview: preview };
        }
        case "plugin.install":
        case "plugin.installSource": {
          const preview = installPreview.current;
          if (!preview || !("skillDetails" in preview)) throw new Error("请重新预览插件。");
          const item = { ...initialPlugins[5], id: preview.name, name: preview.name, description: preview.description, version: preview.version, installed: true, enabled: true, canInstall: false, canToggle: true, canRemove: true, skillCount: preview.skillDetails.length,
            sourcePath: `/Users/demo/.codex/plugins/cache/testany-agent-skills/${preview.name}/${preview.version}`, sourceInfo: { ...initialPlugins[5].sourceInfo!, source: preview.source, subpath: preview.subpath, ref: preview.ref, commit: preview.commit } };
          setPlugins(previous => previous.some(p => p.id === item.id) ? previous.map(p => p.id === item.id ? item : p) : [...previous, item]);
          setSkills(previous => [...previous, ...preview.skillDetails.map(s => ({ ...initialSkills[0], id: `${item.id}:${s.path}`, name: s.name, description: s.description, pluginId: item.id, sourceLabel: item.id, packagePath: s.path, tags: [], path: `${item.sourcePath}/${s.path}`, enabled: request.enabledSkills?.includes(s.path) ?? true }))]);
          addRecord("plugin.install", item.name, `安装 ${preview.skillDetails.length} 项技能，启用 ${request.enabledSkills?.length ?? preview.skillDetails.length} 项。`);
          setToast(`${item.name} 已安装`); if (state === "empty") navigate(page); break;
        }
        case "skill.install": {
          const preview = installPreview.current;
          if (!preview || !("target" in preview)) throw new Error("请重新预览技能。");
          setSkills(previous => [...previous, { ...initialSkills[4], id: preview.id, name: preview.name, description: preview.description, path: `${preview.target}/SKILL.md`, tags: [], version: undefined }]);
          addRecord("skill.install", preview.name, "技能已安装。"); setToast(`${preview.name} 已安装`); if (state === "empty") navigate(page); break;
        }
        case "skill.previewRemoval": {
          const group = allSkills.filter(item => item.name === request.groupName);
          const removing = group.filter(item => request.ids?.includes(item.id) && item.canRemove);
          const preview = { id: crypto.randomUUID(), name: request.groupName!, remove: removing, keep: group.filter(item => !removing.includes(item)) };
          removalPreview.current = preview; return { message: "移除范围已准备", removalPreview: preview };
        }
        case "skill.removeSelected": {
          const selected = removalPreview.current?.remove || [];
          setSkills(previous => previous.filter(item => !selected.some(s => s.id === item.id)));
          selected.forEach(item => addRecord("skill.remove", item.name, "已移至可恢复区。", item.path, item));
          setToast(`已移除 ${selected.length} 份，其他副本保持原样`); break;
        }
        case "project.select": {
          if (!request.projectDir?.startsWith("/")) throw new Error("请输入绝对路径，以 / 开头。");
          setProject(request.projectDir); setToast("已切换项目，个人技能与插件仍然可见");
          return { message: "项目已切换", projectContext: { requested: request.projectDir, effective: request.projectDir, source: "saved", workingDirectory: request.projectDir, warnings: [] } };
        }
        default: throw new Error(`原型尚未提供这个操作：${request.action}`);
      }
      return { message: "操作已完成" };
    } finally { setBusy(null); }
  }

  async function toggle(item: Entry) {
    setBusy(`toggle:${item.id}`); await pause(240);
    if (isSkill(item)) setSkills(previous => previous.map(s => s.id === item.id ? { ...s, enabled: !s.enabled } : s));
    else setPlugins(previous => previous.map(p => p.id === item.id ? { ...p, enabled: !p.enabled } : p));
    addRecord(isSkill(item) ? "skill.toggle" : "plugin.toggle", item.name, `${item.enabled ? "已禁用" : "已启用"}。${isSkill(item) ? "其他技能保持原样。" : "插件内的单项选择已保留。"}`);
    setToast(`${item.name} ${item.enabled ? "已禁用" : "已启用"} · 新会话生效`); setBusy(null);
  }
  function checkAll() {
    if (progress !== null) return;
    setProgress(0); let value = 0;
    checkTimer.current = setInterval(() => { value += 20; setProgress(value); if (value >= 100) { clearInterval(checkTimer.current); setTimeout(() => { setProgress(null); setLastCheck("刚刚"); setToast(`检查完成 · ${availableUpdates} 项可更新`); }, 400); } }, 500);
  }
  async function applyUpdate(items: UpdateItem[]) {
    setBusy("update"); await pause(750);
    setUpdates(previous => previous.map(item => items.some(s => s.target.id === item.target.id) ? { ...item, status: "current", canApply: false, installedVersion: item.availableVersion || item.installedVersion, message: "已是最新版本。" } : item));
    setPlugins(previous => previous.map(item => { const updated = items.find(s => s.target.kind === "plugin" && s.target.id === item.id); return updated ? { ...item, version: updated.availableVersion || item.version } : item; }));
    items.forEach(item => addRecord("update.apply", item.name, `${item.installedVersion} → ${item.availableVersion} · 更新完成。`));
    setBusy(null); setToast(`${items.length} 项更新完成`);
  }
  async function confirmAction() {
    if (!confirm) return; setOperationError(""); setBusy("confirm"); await pause();
    const item = confirm.item;
    if (confirm.kind === "restore" && "canRestore" in item) {
      if (state === "boundary") { setOperationError("原路径已存在同名文件。请先处理目标目录，再重试恢复；现有文件不会被覆盖。"); setBusy(null); return; }
      const restored = removed.current.get(item.id);
      if (restored) setSkills(previous => [...previous, restored]);
      setActivity(previous => previous.map(a => a.id === item.id ? { ...a, canRestore: false } : a));
      addRecord("activity.restore", item.target, "已恢复到原安装位置。", item.path); setToast(`${item.target} 已恢复`);
    } else if (confirm.kind === "market" && "pluginCount" in item) {
      setMarkets(previous => previous.filter(m => m.id !== item.id)); setToast("来源已移除，已安装插件保持原样"); addRecord("marketplace.remove", item.name, "移除了来源，保留已安装插件。");
    } else if ("name" in item && !("pluginCount" in item)) {
      if (isSkill(item)) { setSkills(previous => previous.filter(s => s.id !== item.id)); addRecord("skill.remove", item.name, "已移至可恢复区。", item.path, item); }
      else { setPlugins(previous => previous.map(p => p.id === item.id ? { ...p, installed: false, enabled: false, canInstall: true } : p)); setSkills(previous => previous.filter(s => s.pluginId !== item.id)); addRecord("plugin.remove", item.name, "已卸载插件及其附带技能。"); }
      setDetail(null); setToast(`${item.name} 已移除`);
    }
    setBusy(null); setConfirm(null);
  }
  function openDetail(item: Entry) { setDetail(item); setDetailTab("overview"); }
  function resetData() { setSkills(initialSkills); setPlugins(initialPlugins); setMarkets(initialMarkets); setActivity(initialActivity); setUpdates(initialUpdates); setFilters({ skills: freshFilter(), plugins: freshFilter() }); setProject(projectRoot); navigate(page); setPreviewTools(false); setToast("示例数据已重置"); }
  const descriptions: Record<Page, string> = { skills: "为你的工作，找到合适的能力。", plugins: "把相关的技能与工具，一起管理。", markets: "好工具，来自值得信任的来源。", updates: "看看新变化，其余交给计划。", activity: "每次变化，都有迹可循。" };
  const titleCount = ["loading", "error"].includes(state) ? "—" : state === "empty" ? 0 : page === "skills" ? activeSkills.length : page === "plugins" ? plugins.filter(p => p.installed).length : markets.length;
  const nav = [{ id: "skills", icon: Layers3 }, { id: "plugins", icon: Box }, { id: "markets", icon: Globe2 }, { id: "updates", icon: ArrowDownToLine }, { id: "activity", icon: History }] as const;

  return <div className="sd-prototype" data-theme={theme} data-skilldock-theme={theme} onKeyDown={event => {
    const current = event.target as HTMLElement;
    if (current.getAttribute("role") !== "tab" || !["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
    const tabs = [...(current.closest('[role="tablist"]')?.querySelectorAll<HTMLButtonElement>('[role="tab"]') || [])];
    const position = tabs.indexOf(current as HTMLButtonElement);
    const index = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (position + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    event.preventDefault(); tabs[index]?.focus(); tabs[index]?.click();
  }}>
    <aside className="sd-sidebar">
      <a href="/prototype/?page=skills" className="sd-brand" onClick={event => navigate("skills", "normal", event)}><span className="dock-mark"><i /><i /><i /></span><span>SkillDock</span></a>
      <div className="sidebar-caption">资料库</div>
      <nav aria-label="主导航">{nav.map(({ id, icon: Icon }) => <a key={id} href={`/prototype/?page=${id}`} aria-current={page === id ? "page" : undefined} className={`sd-nav ${page === id ? "is-active" : ""}`} onClick={event => navigate(id, "normal", event)}><Icon size={18} strokeWidth={1.7} /><span>{t(pageNames[id])}</span>{id === "updates" && availableUpdates > 0 && <span className="nav-count" aria-label={`${availableUpdates} 项可更新`}>{availableUpdates}</span>}</a>)}</nav>
      <div className="sidebar-project"><div className="sidebar-caption">当前项目</div><ProjectPicker project={project} catalog={projects} disabled={!!busy} onSelect={path => void action({ action: "project.select", projectDir: path })} onBrowse={() => setProjectOpen(true)} /><p>个人技能与插件始终可见</p></div>
      <div className="sidebar-bottom"><button className="preferences-link" aria-label="偏好设置" title="偏好设置" onClick={() => setPreferencesOpen(true)}><Settings2 size={17} /><span>偏好设置</span></button><div className="sidebar-divider" /><span className="product-credit">A Testany Product</span><button className="prototype-label" onClick={() => setPreviewTools(true)}>设计预览 <ChevronRight size={12} /></button></div>
    </aside>
    <main className="sd-main" ref={main}>
      <header className="workspace-heading"><div><div className="heading-title"><h1>{t(pageNames[page])}</h1>{["skills", "plugins", "markets"].includes(page) && <span className="title-count">{titleCount}</span>}</div><p>{descriptions[page]}</p></div>
        <div className="heading-actions">{page === "skills" || page === "plugins" ? <><Button variant="ghost" className="refresh-button" aria-label="刷新清单" busy={busy === "refresh"} onClick={async () => { setBusy("refresh"); await pause(650); setBusy(null); setToast("清单已刷新"); }}><RefreshCw size={16} /></Button><Button variant="primary" onClick={() => setInstall({ kind: page === "skills" ? "skill" : "plugin" })}><Plus size={16} />{page === "skills" ? "安装技能" : "安装插件"}</Button></> : page === "markets" ? <Button variant="primary" onClick={() => setMarketOpen(true)}><Plus size={16} />添加来源</Button> : page === "updates" ? <Button onClick={checkAll} busy={progress !== null}><RefreshCw size={15} />检查全部</Button> : <span className="muted small">仅显示这台电脑的操作</span>}</div>
      </header>
      <div className="mobile-project"><ProjectPicker project={project} catalog={projects} disabled={!!busy} onSelect={path => void action({ action: "project.select", projectDir: path })} onBrowse={() => setProjectOpen(true)} /></div>
      <div className="page-content"><PageState page={page} state={state} onReset={() => navigate(page)} onAdd={() => page === "activity" ? navigate("skills") : page === "markets" ? setMarketOpen(true) : setInstall({ kind: page === "plugins" ? "plugin" : "skill" })}>
        {(page === "skills" || page === "plugins") && <Library key={page} kind={page} items={page === "skills" ? activeSkills : plugins} filter={filters[page]} onFilter={patch => setFilters(previous => ({ ...previous, [page]: { ...previous[page], ...patch } }))} onDetail={openDetail} onTags={item => setTags({ kind: isSkill(item) ? "skill" : "plugin", ...item })} onDuplicate={setDuplicates} onToggle={item => void toggle(item)} onInstall={item => setInstall({ kind: "plugin", item })} busy={busy} />}
        {page === "markets" && <MarketsWorkspace markets={markets} plugins={plugins} state={state} onInstall={item => setInstall({ kind: "plugin", item })} onRemove={item => setConfirm({ kind: "market", item })} onRefresh={async item => { await pause(650); setToast(`${item.displayName || item.name} 已同步`); addRecord("marketplace.refresh", item.name, "已刷新来源。已安装插件保持原样。"); }} />}
        {page === "updates" && <UpdatesWorkspace items={updates} state={state} schedule={schedule} lastCheck={lastCheck} progress={progress} busy={!!busy} onSchedule={() => setScheduleOpen(true)} onApply={applyUpdate} onConnect={setSourceItem} onHistory={() => navigate("activity")} />}
        {page === "activity" && <ActivityWorkspace items={activity} state={state} onRestore={item => { setOperationError(""); setConfirm({ kind: "restore", item }); }} />}
      </PageState></div>
      <footer className="workspace-footer"><span><Check size={12} />仅在当前预览中操作</span><button onClick={() => setPreviewTools(true)}>示例数据 · 设计预览<SlidersHorizontal size={12} /></button></footer>
    </main>
    {currentDetail && !confirm && <Modal title={currentDetail.name} drawer className="detail-modal" onClose={() => setDetail(null)}>
      <div className="detail-scroll"><div className="detail-intro"><ItemIcon name={currentDetail.name} large /><div><span className="muted small">{isSkill(currentDetail) ? currentDetail.sourceLabel : "插件"}</span><h3>{currentDetail.name}</h3>{currentDetail.version && <span className="version-label">v{currentDetail.version}</span>}</div></div><p className="detail-description">{currentDetail.description}</p>
        <div className="detail-tabs" role="tablist" aria-label="详情内容">{["overview", "source", "content"].map((id, i) => <button role="tab" aria-selected={detailTab === id} key={id} onClick={() => setDetailTab(id)}>{["概览", "来源", isSkill(currentDetail) ? "技能正文" : "附带技能"][i]}</button>)}</div>
        {detailTab === "overview" && <><div className="setting-row"><div><strong>{currentDetail.enabled === null ? "待核实" : currentDetail.enabled ? "已启用" : "已禁用"}</strong><p>{isSkill(currentDetail) ? "只影响这一项技能" : "插件总开关，保留单项技能的选择"}</p></div><Switch checked={!!currentDetail.enabled} disabled={!currentDetail.canToggle || !!busy} label={`${currentDetail.enabled ? "禁用" : "启用"} ${currentDetail.name}`} onChange={() => void toggle(currentDetail)} /></div>{!currentDetail.canToggle && <p className="field-hint">{currentDetail.reason}</p>}
          <div className="detail-section"><h4>标签</h4><TagStrip subject={{ kind: isSkill(currentDetail) ? "skill" : "plugin", ...currentDetail }} disabled={!!busy} onEdit={() => { setDetail(null); setTags({ kind: isSkill(currentDetail) ? "skill" : "plugin", ...currentDetail }); }} /></div>
          <div className="detail-section"><h4>安装位置</h4><code className="path-block">{isSkill(currentDetail) ? currentDetail.path : currentDetail.sourcePath}</code></div>
          {isSkill(currentDetail) && !!currentDetail.duplicateNames?.length && <Notice tone="warning" action={<Button variant="ghost" onClick={() => { setDetail(null); setDuplicates(currentDetail.name); }}>整理副本<ChevronRight size={13} /></Button>}>发现 {currentDetail.duplicateNames.length + 1} 份同名技能</Notice>}
          {isSkill(currentDetail) && currentDetail.pluginId && <button className="detail-link" onClick={() => { const p = plugins.find(p => p.id === currentDetail.pluginId); if (p) openDetail(p); }}><Box size={17} /><span>所属插件<strong>{currentDetail.pluginId}</strong></span><ChevronRight size={16} /></button>}
        </>}
        {detailTab === "source" && <><div className="detail-section"><h4>更新来源</h4>{currentDetail.sourceInfo ? <><p className="path-block">{currentDetail.sourceInfo.source}</p><dl className="metadata"><dt>仓库内目录</dt><dd>{currentDetail.sourceInfo.subpath}</dd><dt>分支</dt><dd>{currentDetail.sourceInfo.ref}</dd><dt>Commit</dt><dd><code>{currentDetail.sourceInfo.commit}</code></dd><dt>验证方式</dt><dd>安装记录与来源核对</dd></dl></> : <Notice>未找到安装来源记录。可以在更新页关联 Git 地址。</Notice>}</div></>}
        {detailTab === "content" && (isSkill(currentDetail) ? <div className="content-document"><h3>{currentDetail.name}</h3><p>{currentDetail.description}</p><h4>使用方式</h4><p>在需要这项能力时调用技能，读取相关上下文后按步骤完成任务。</p><h4>完成标准</h4><p>保留清晰的交付物，记录实际执行结果，并说明尚未核实的部分。</p><small className="muted">正文为本轮设计使用的示例内容。</small></div> : <div className="contained-skills">{allSkills.filter(s => s.pluginId === currentDetail.id).map(s => <div key={s.id}><ItemIcon name={s.name} /><span><strong>{s.name}</strong><small>{s.enabled ? "已启用" : "已禁用"}</small></span><Switch label={`启用 ${s.name}`} checked={!!s.enabled} disabled={!currentDetail.enabled || !!busy} onChange={() => void toggle(s)} /></div>)}{!allSkills.some(s => s.pluginId === currentDetail.id) && <p className="field-hint">这个预览数据集未加载该插件的技能正文。安装预览可演示逐项选择。</p>}</div>)}
      </div><div className="modal-footer detail-footer"><Button onClick={() => { setDetail(null); navigate("updates"); }}><ArrowDownToLine size={15} />检查更新</Button><Button variant="ghost" disabled={!currentDetail.canRemove} title={!currentDetail.canRemove ? "插件附带或系统技能需由所属管理器移除" : undefined} onClick={() => setConfirm({ kind: "remove", item: currentDetail })}><Trash2 size={15} />{isSkill(currentDetail) ? "移除" : "卸载"}</Button></div>
    </Modal>}
    {install && <InstallDialog kind={install.kind} data={data} initialPlugin={install.item} initialMarket={install.market} busy={busy} action={action} onClose={() => setInstall(null)} onMarket={() => { setReturnToInstall({ ...install, market: true }); setInstall(null); setMarketOpen(true); }} />}
    {tags && <TagsDialog subject={tags} suggestions={[...new Set([...skills, ...plugins].flatMap(s => s.tags || []))]} busy={!!busy} execute={action} onClose={() => setTags(null)} />}
    {duplicates && <DuplicateSkillsDialog name={duplicates} skills={allSkills} busy={busy} action={action} onClose={() => setDuplicates(null)} onPlugin={id => { setDuplicates(null); const item = plugins.find(p => p.id === id); if (item) { navigate("plugins"); openDetail(item); } }} />}
    {projectOpen && <ProjectDialog project={project} catalog={projects} busy={busy} action={action} onClose={() => setProjectOpen(false)} />}
    {marketOpen && <MarketDialog onClose={() => { setMarketOpen(false); if (returnToInstall) { setInstall(returnToInstall); setReturnToInstall(null); } }} onSave={async input => { await pause(); setMarkets(previous => [...previous, { id: crypto.randomUUID(), name: input.name, displayName: input.name, source: input.source, type: input.source.startsWith("/") ? "local" : "git", pluginCount: 0, canRefresh: true, canRemove: true }]); addRecord("marketplace.add", input.name, "已添加来源。"); setMarketOpen(false); if (state === "empty") navigate(page); if (returnToInstall) { setInstall(returnToInstall); setReturnToInstall(null); } setToast("来源已添加"); }} />}
    {scheduleOpen && <ScheduleDialog value={schedule} items={updates.filter(i => i.canAutoApply)} onClose={() => setScheduleOpen(false)} onSave={next => { setSchedule(next); setScheduleOpen(false); setToast("更新计划已保存"); }} />}
    {sourceItem && <SourceDialog item={sourceItem} onClose={() => setSourceItem(null)} onSave={() => { setUpdates(previous => previous.map(i => i.target.id === sourceItem.target.id ? { ...i, route: "skill-source", canCheck: true, canAutoApply: true, status: "current", message: "来源已关联。" } : i)); setSourceItem(null); setToast("更新来源已关联"); }} />}
    {confirm && <Modal title={confirm.kind === "restore" ? "恢复这项技能？" : confirm.kind === "market" ? "移除这个来源？" : "确认移除"} onClose={() => { if (!busy) setConfirm(null); }}><div className="modal-body"><h3>{"target" in confirm.item ? confirm.item.target : confirm.item.name}</h3><p className="dialog-description">{confirm.kind === "restore" ? "恢复到原来的安装位置。已有文件不会被覆盖。" : confirm.kind === "market" ? "已安装的插件会保留；来源移除后将无法从这里发现新插件。" : "scope" in confirm.item ? "移至可恢复区，稍后可在操作记录中恢复。" : "这会卸载整个插件及其附带技能。需要时可从原来源重新安装。"}</p>{"path" in confirm.item && <code className="path-block">{confirm.item.path}</code>}{operationError && <p className="field-error" role="alert">{operationError}</p>}</div><div className="modal-footer"><Button disabled={!!busy} onClick={() => setConfirm(null)}>取消</Button><Button variant={confirm.kind === "restore" ? "primary" : "danger"} busy={!!busy} onClick={() => void confirmAction()}>{confirm.kind === "restore" ? "恢复技能" : "确认移除"}</Button></div></Modal>}
    {preferencesOpen && <Modal title="偏好设置" onClose={() => setPreferencesOpen(false)}><div className="modal-body"><h3 className="form-section-title">外观</h3><div className="theme-options">{([{ id: "light", label: "浅色", icon: Sun }, { id: "dark", label: "深色", icon: Moon }, { id: "system", label: "跟随系统", icon: Monitor }] as const).map(({ id, label, icon: Icon }) => <button key={id} aria-pressed={prefs.theme === id} className={prefs.theme === id ? "selected" : ""} onClick={() => setPreferences({ theme: id })}><span className={`theme-mini theme-${id}`}><i /><i /></span><span><Icon size={14} />{label}{prefs.theme === id && <Check size={13} />}</span></button>)}</div><div className="setting-row"><div><strong>界面语言</strong><p>技能名称与来源内容保留原文</p></div><select aria-label="界面语言" value={prefs.language} onChange={event => setPreferences({ language: event.target.value as "zh" | "en" | "ja" })}><option value="zh">简体中文</option><option value="en">English</option><option value="ja">日本語</option></select></div><p className="field-hint">本轮以中文设计稿为准。复用组件保留三语言；新增页面文案将在设计确认后完成翻译。</p><div className="about-product"><span className="dock-mark"><i /><i /><i /></span><div><strong>SkillDock</strong><span>A Testany Product</span></div><span className="license-label">AGPL-3.0-only</span></div></div><div className="modal-footer"><span className="muted small">外观偏好自动保存</span><Button variant="primary" onClick={() => setPreferencesOpen(false)}>完成</Button></div></Modal>}
    {previewTools && <Modal title="设计预览" onClose={() => setPreviewTools(false)}><div className="modal-body"><Notice>这是独立的交互原型。安装、移除和计划只改变示例数据。</Notice><label className="field"><span>当前页面状态</span><select value={state} onChange={event => navigate(page, event.target.value as State)}>{["normal", "loading", "empty", "error", "boundary"].map((s, i) => <option key={s} value={s}>{["正常", "加载", "空数据", "读取失败", "边界情况"][i]}</option>)}</select></label><p className="field-hint">也可以通过地址参数 ?page=skills&state=boundary 直接打开。刷新页面会恢复示例业务数据。</p><Button onClick={resetData}>重置全部示例数据</Button></div><div className="modal-footer"><Button variant="primary" onClick={() => setPreviewTools(false)}>回到预览</Button></div></Modal>}
    {toast && <div className="sd-toast" role="status"><Check size={16} /><span>{toast}</span><button aria-label="关闭提示" onClick={() => setToast("")}><X size={14} /></button></div>}
  </div>;
}

function Library({ kind, items, filter, onFilter, onDetail, onTags, onToggle, onDuplicate, onInstall, busy }: { kind: "skills" | "plugins"; items: Entry[]; filter: Filter; onFilter: (patch: Partial<Filter>) => void; onDetail: (item: Entry) => void; onTags: (item: Entry) => void; onToggle: (item: Entry) => void; onDuplicate: (name: string) => void; onInstall: (item: Plugin) => void; busy: string | null }) {
  const skill = kind === "skills";
  const source = (item: Entry) => isSkill(item) ? item.sourceLabel : item.marketplace;
  const duplicates = items.filter(item => isSkill(item) && !!item.duplicateNames?.length);
  const filtered = items.filter(item => (filter.tab === "all" ? isSkill(item) || item.installed : filter.tab === "enabled" ? item.enabled : filter.tab === "duplicates" ? isSkill(item) && item.duplicateNames?.length : !isSkill(item) && !item.installed)
    && `${item.name} ${item.description} ${source(item)}`.toLowerCase().includes(filter.search.toLowerCase()) && (filter.source === "all" || source(item) === filter.source) && matchesTags(item.tags, filter.tags));
  const shown = filtered.slice(0, filter.visible);
  const tabs = [{ id: "all", label: skill ? "全部技能" : "已安装", count: items.filter(i => isSkill(i) || i.installed).length }, { id: "enabled", label: "已启用", count: items.filter(i => i.enabled).length }, skill ? { id: "duplicates", label: "有同名", count: duplicates.length } : { id: "discover", label: "可安装", count: items.filter(i => !isSkill(i) && !i.installed).length }];
  return <>
    <div className="library-tabs library-filter-tabs" role="group" aria-label={skill ? "技能分类" : "插件分类"}><LibraryFilters items={tabs.map(tab => ({ ...tab, icon: null }))} selected={filter.tab} onChange={tab => onFilter({ tab, visible: 20 })} /></div>
    <div className="library-toolbar"><label className="search-field"><Search size={16} /><input aria-label={skill ? "搜索技能" : "搜索插件"} type="search" value={filter.search} onChange={event => onFilter({ search: event.target.value, visible: 20 })} placeholder={skill ? "搜索名称、用途或来源" : "搜索插件名称或用途"} /><kbd>⌕</kbd></label><div className="toolbar-filters"><label className="source-select"><SlidersHorizontal size={14} /><select aria-label="筛选来源" value={filter.source} onChange={event => onFilter({ source: event.target.value, visible: 20 })}><option value="all">全部来源</option>{[...new Set(items.map(source))].map(name => <option value={name} key={name}>{name}</option>)}</select><ChevronDown size={12} /></label><TagFilter items={items} selected={filter.tags} onChange={tags => onFilter({ tags, visible: 20 })} /><ViewSwitch value={filter.view} onChange={view => onFilter({ view })} /></div></div>
    {filter.tab === "duplicates" && <Notice action={<span className="small">按安装路径区分</span>}>同名不一定是重复内容。打开“整理副本”，选择具体保留或移除项。</Notice>}
    {!!filtered.length && filter.view === "list" && <div className="list-columns"><span>名称与用途</span><span>来源</span><span>标签</span><span>状态</span></div>}
    {filtered.length ? <div className={`entry-collection ${filter.view === "grid" ? "entry-grid" : "entry-list"}`}>{shown.map(item => <article className="library-entry" key={item.id}>
      <button className="entry-main" onClick={() => onDetail(item)} aria-label={`查看 ${item.name} 详情`}><ItemIcon name={item.name} /><span><span className="entry-name">{item.name}{!isSkill(item) && item.version && <small>{item.version}</small>}</span><span className="entry-description">{item.description}</span>{isSkill(item) && filter.tab === "duplicates" && <code className="entry-path">{item.path.replace("/Users/demo", "~")}</code>}</span></button>
      <div className="entry-source"><span>{isSkill(item) ? item.scope === "plugin" ? <Box size={13} /> : <FolderOpen size={13} /> : <Globe2 size={13} />}{source(item)}</span>{!isSkill(item) && <small>{item.skillCount} 项技能</small>}{isSkill(item) && !!item.duplicateNames?.length && <button className="duplicate-link" onClick={() => onDuplicate(item.name)}><Copy size={12} />整理副本 · {item.duplicateNames.length + 1}</button>}{!isSkill(item) && !item.canInstall && !item.installed && <small className="blocked-reason">{item.reason}</small>}</div>
      <TagStrip subject={{ kind: isSkill(item) ? "skill" : "plugin", ...item }} disabled={!!busy} onEdit={() => onTags(item)} />
      <div className="entry-status" title={item.reason}>{!isSkill(item) && !item.installed ? <Button disabled={!item.canInstall} onClick={() => onInstall(item)}>安装<Plus size={12} /></Button> : <><span>{item.enabled === null ? "待核实" : item.enabled ? "已启用" : "已禁用"}</span><Switch label={`${item.enabled ? "禁用" : "启用"} ${item.name}${isSkill(item) ? `（${item.path}）` : ""}`} checked={!!item.enabled} disabled={!item.canToggle || !!busy} onChange={() => onToggle(item)} /></>}</div>
    </article>)}</div> : <NoResults onClear={() => onFilter(freshFilter())} />}
    <CollectionFooter visible={filter.visible} total={filtered.length} onMore={() => onFilter({ visible: filter.visible + 20 })} />
  </>;
}
