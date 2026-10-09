import { CompatibilityWarnings } from "./CompatibilityWarnings";
import { matchesPlugin, pluginTitle } from "./plugin-presentation";
import { ExternalLink } from './ExternalLink';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import packageInfo from "../package.json";
import brandIcon from "./native-icon.svg";
import brandWordmark from "./brand-wordmark.svg";
import { apiFetch, nativeMode, openDownload } from "./transport";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Blocks,
  BookOpen,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Code2,
  Copy,
  Database,
  FileCode2,
  FileText,
  Folder,
  FolderOpen,
  GitBranch,
  Globe2,
  History,
  Layers3,
  Loader2,
  LockKeyhole,
  Monitor,
  Moon,
  Sun,
  Palette,
  PanelLeft,
  MoreHorizontal,
  Info,
  Tag,
  Download,
  Package,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ServerCog,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Terminal,
  Trash2,
  X,
} from "lucide-react";
import type {
  ActionRequest,
  ActionResult,
  Marketplace,
  Mode,
  Plugin,
  Scope,
  Skill,
  Snapshot,
  UpdatePreview,
  NativeRule,
} from "../shared/contracts";

import {
  usePreferences,
  setPreferences,
  type Theme,
  type Language,
} from "./preferences";
import { t, locale, ServiceMessage, requestError } from "./i18n";
import { Modal } from "./Modal";
import { IconProvider, ProviderIcon } from "./ProviderIcon";
import { Inspector, CommandMenu, type DesktopCommand } from "./DesktopUI";
import { loadWorkspace, saveWorkspace, type Inspection, type WorkspaceState } from "./workspace-state";
import { UpdatesWorkspace } from "./UpdatesWorkspace";
import { DiffBrowser } from "./DiffBrowser";
import { DuplicateSkillsDialog } from "./DuplicateSkillsDialog";
import { GitSourceFields, ResolvedGitSource, GitAccessHelp } from "./GitSourceFields";
import { useRuntimeConnection } from "./useRuntimeConnection";
import { TagStrip, TagFilter, TagsDialog, matchesTags, type TagSubject } from "./Tags";

import { ProjectPicker, ProjectDialog } from "./ProjectControls";
import { InstallDialog } from "./InstallDialog";
import { LibraryFilters, ViewSwitch, CollectionFooter } from "./LibraryUI";
import { NativeConfirmDialog, type NativeConfirmation } from "./NativeConfirm";
import { AgentFilter, AgentBadges, AgentSplit, ClaudePluginFacts, ClaudeSkillFacts, MarketAutoUpdate, matchesAgent, showsAgents, objectAgents, type AgentFilterValue } from "./AgentUI";
import { AgentEnvironments } from "./AgentEnvironments";
import { creationAgent, requestAgent, requestRevision, stateUrl } from "./agent-requests";

type Page = "skills" | "plugins" | "markets" | "updates" | "activity" | "agents";
type Metric = "all" | "enabled" | "standalone" | "attention";
type Dialog =
  | { type: "tags"; subject: TagSubject }
  | { type: "duplicates"; name: string }
  | { type: "install" }
  | { type: "plugin-install"; plugin?: Plugin; market?: boolean }
  | { type: "market"; fromInstall?: boolean }
  | { type: "preferences" }
  | { type: "project" }
  | { type: "update"; preview: UpdatePreview }
  | { type: "native-confirm"; confirmation: NativeConfirmation }
  | {
      type: "confirm";
      title: string;
      description: string;
      target: string;
      request: Omit<ActionRequest, "mode">;
      danger?: boolean;
      label: string;
      affected?: string[];
      affectedTitle?: string;
    };
type Toast = { kind: "success" | "error"; message: string };
const scopeLabels: Record<Scope, string> = {
  user: "个人技能",
  project: "项目技能",
  system: "系统内置",
  plugin: "插件技能",
  cache: "插件缓存",
};
const nav = [
  {
    id: "skills",
    label: "技能库",
    icon: Layers3,
    english: "YOUR CAPABILITIES",
    description: "在一个地方，整理你的 Codex 能力。",
  },
  {
    id: "plugins",
    label: "插件",
    icon: Blocks,
    english: "PLUGINS",
    description: "按功能扩展你的工作台，管理插件及其技能。",
  },
  {
    id: "markets",
    label: "市场来源",
    icon: Globe2,
    english: "MARKETPLACES",
    description: "连接值得信任的来源，发现更多好用的能力。",
  },
  {
    id: "updates",
    label: "更新",
    icon: ArrowDownToLine,
    english: "KEEP IT FRESH",
    description: "先了解变化，再把新的能力带进工作流。",
  },
  {
    id: "activity",
    label: "操作记录",
    icon: History,
    english: "ACTIVITY",
    description: "每一次变化都有记录，需要时也能回到之前。",
  },
  {
    id: "agents",
    label: "Agent 环境",
    icon: ServerCog,
    english: "AGENT ENVIRONMENTS",
    description: "查看本机的 Agent 环境与 SkillDock 对它们的管理。",
  },
] as const;
const actionNames: Record<string, string> = {
  "skill.removeSelected": "移除选中的同名技能",
  "schedule.configure": "修改更新计划",
  "schedule.reconcile": "恢复更新计划绑定",
  "skill.connectSource": "关联更新来源",
  "plugin.update": "更新插件",
  "plugin.checkUpdate": "检查插件更新",
  "skill.toggle": "调整技能状态",
  "skill.install": "安装技能",
  "skill.update": "更新技能",
  "skill.remove": "移除技能",
  "activity.restore": "恢复内容",
  "plugin.install": "安装插件",
  "plugin.installSource": "安装插件",
  "plugin.remove": "卸载插件",
  "plugin.toggle": "调整插件状态",
  "marketplace.add": "添加来源",
  "marketplace.refresh": "刷新来源",
  "marketplace.remove": "移除来源",
};
const iconSet = [
  Code2,
  FileText,
  Sparkles,
  Terminal,
  BookOpen,
  Database,
  FileCode2,
  Settings2,
];
function skillVisual(name: string) {
  const number = [...name].reduce((n, c) => n + c.charCodeAt(0), 0);
  return { Icon: iconSet[number % iconSet.length], color: number % 5 };
}
function formatDate(value?: string) {
  if (!value) return t("尚未记录");
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString(locale(), {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
}
function classNames(...values: (string | false | undefined)[]) {
  return values.filter(Boolean).join(" ");
}

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await apiFetch(path, {
    credentials: "same-origin",
    ...options,
  });
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error(t("服务返回了无法读取的响应，请检查服务是否仍在运行。"));
  }
  if (!response.ok) {
    const payload = data as { error?: { message?: string; code?: string; nativeRules?: NativeRule[] } };
    throw Object.assign(requestError(
      payload.error?.code || "HTTP_ERROR",
      payload.error?.message || `HTTP ${response.status}`,
    ), { code: payload.error?.code, nativeRules: payload.error?.nativeRules });
  }
  return data as T;
}

type Session = { token: string; defaultMode: Mode };
async function readSession(): Promise<Session> {
  const value = await api<unknown>("/api/session");
  if (!value || typeof value !== "object")
    throw new Error("服务返回了无效的会话配置，请刷新重试。");
  const session = value as Partial<Session>;
  if (
    typeof session.token !== "string" ||
    !session.token.trim() ||
    (session.defaultMode !== "local" && session.defaultMode !== "sandbox")
  )
    throw new Error("服务返回了无效的会话配置，请刷新重试。");
  return session as Session;
}

function Button({
  children,
  className = "",
  variant = "secondary",
  busy,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  busy?: boolean;
}) {
  return (
    <button
      {...props}
      className={classNames("button", `button-${variant}`, className)}
      disabled={props.disabled || busy}
    >
      {busy && <Loader2 size={15} className="spin" />}
      {children}
    </button>
  );
}
function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "green" | "orange" | "red";
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
function Empty({
  icon: Icon = Search,
  title,
  description,
  children,
}: {
  icon?: typeof Search;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon size={28} strokeWidth={1.5} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {children}
    </div>
  );
}
function Toggle({
  checked,
  disabled,
  label,
  reason,
  busy,
  onChange,
}: {
  checked: boolean | null;
  disabled?: boolean;
  label: string;
  reason?: string;
  busy?: boolean;
  onChange: () => void;
}) {
  if (checked === null)
    return (
      <span className="unknown-state" title={reason ? t(reason) : undefined}>
        <CircleAlert size={13} />
        {t("未核实")}
      </span>
    );
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={
        disabled
          ? (reason ? t(reason) : undefined) || t("此项目由原管理器维护")
          : label
      }
      disabled={disabled || busy}
      className={classNames("toggle", checked && "is-on", busy && "is-busy")}
      onClick={onChange}
    >
      <span>{busy && <Loader2 size={10} className="spin" />}</span>
    </button>
  );
}

export default function App() {
  const { language } = usePreferences();
  const [mode, setMode] = useState<Mode | null>(null);
  const modeRef = useRef<Mode | null>(null);
  const [saved] = useState(loadWorkspace);
  const [page, setPage] = useState<Page>(saved.page);
  const [inspection, setInspection] = useState<Inspection>(saved.inspection);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(saved.sidebarCollapsed);
  const [menu, setMenu] = useState<{ x: number; y: number; subject: { kind: "skill"; item: Skill } | { kind: "plugin"; item: Plugin } } | null>(null);
  const menuOrigin = useRef<HTMLElement | null>(null);
  const main = useRef<HTMLElement>(null);
  const scrollPositions = useRef(saved.scroll);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const { connection, paused } = useRuntimeConnection(mode !== null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  // 36c §5: the multi-agent view is asked for only from a service with API version 2.
  const multiAgentRef = useRef(false);
  const [agentFilter, setAgentFilter] = useState<AgentFilterValue>("all");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [queries, setQueries] = useState(saved.queries);
  const query = queries[page];
  const setQuery = (value: string) => setQueries(previous => ({ ...previous, [page]: value }));
  const [scope, setScope] = useState(saved.scope);
  const [duplicatesOnly, setDuplicatesOnly] = useState(saved.duplicatesOnly);
  const [skillTags, setSkillTags] = useState<string[]>(saved.skillTags);
  const [pluginTags, setPluginTags] = useState<string[]>(saved.pluginTags);
  const [updateFocus, setUpdateFocus] = useState<string>();
  const [metric, setMetric] = useState<Metric>(saved.metric);
  const [view, setView] = useState<"grid" | "list">(saved.view);
  const [pluginFilter, setPluginFilter] = useState<
    "installed" | "available" | "all" | "enabled"
  >(saved.pluginFilter);
  const [marketFilter, setMarketFilter] = useState(saved.marketFilter);
  const pluginScopeKey = JSON.stringify([
    mode,
    query,
    marketFilter,
    pluginFilter,
    pluginTags,
  ]);
  const [pluginWindow, setPluginWindow] = useState({
    key: pluginScopeKey,
    limit: 48,
  });
  const pluginLimit =
    pluginWindow.key === pluginScopeKey ? pluginWindow.limit : 48;
  const skillScopeKey = JSON.stringify([mode, query, metric, scope, skillTags, duplicatesOnly]);
  const [skillWindow, setSkillWindow] = useState({ key: skillScopeKey, limit: 48 });
  const skillLimit = skillWindow.key === skillScopeKey ? skillWindow.limit : 48;
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const busyRef = useRef<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [showPaths, setShowPaths] = useState(false);
  const [updates, setUpdates] = useState<Record<string, UpdatePreview>>({});
  const tokenRef = useRef("");
  const requestSeq = useRef(0);
  const currentNav = nav.find((item) => item.id === page)!;
  const viewState = useRef<WorkspaceState>(saved);
  viewState.current = { page, queries, scope, duplicatesOnly, skillTags, pluginTags, metric, view, pluginFilter, marketFilter, inspection, scroll: scrollPositions.current, sidebarCollapsed };
  useEffect(() => { saveWorkspace(viewState.current); }, [page, queries, scope, duplicatesOnly, skillTags, pluginTags, metric, view, pluginFilter, marketFilter, inspection, sidebarCollapsed]);
  useEffect(() => {
    const persist = () => saveWorkspace(viewState.current);
    window.addEventListener("pagehide", persist);
    return () => { clearTimeout(scrollTimer.current); persist(); window.removeEventListener("pagehide", persist); };
  }, []);
  useLayoutEffect(() => {
    if (snapshot && main.current) main.current.scrollTop = scrollPositions.current[page] || 0;
  }, [page, !!snapshot]);
  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if (event.defaultPrevented || dialog || document.querySelector('.overlay, .command-menu, .inspector[aria-modal="true"]') || !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "f") return;
      const field = main.current?.querySelector<HTMLInputElement>('.search-field input, .uw-search input');
      if (field) { event.preventDefault(); field.focus(); field.select(); }
    }
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [dialog, page]);
  function inspectSkill(skill: Skill) { setInspection({ kind: "skill", id: skill.id }); }
  function inspectPlugin(plugin: Plugin) { setInspection({ kind: "plugin", id: plugin.id }); }
  function closeMenu() { setMenu(null); menuOrigin.current?.focus({ preventScroll: true }); }
  function openMenu(event: React.MouseEvent, subject: NonNullable<typeof menu>["subject"]) {
    event.preventDefault();
    menuOrigin.current = event.currentTarget.tagName === "ARTICLE" ? event.currentTarget.querySelector<HTMLElement>(".skill-card-open") : event.currentTarget as HTMLElement;
    const rect = event.currentTarget.getBoundingClientRect();
    setMenu({ x: event.clientX || rect.left, y: event.clientY || rect.bottom, subject });
  }
  function navigateRows(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!(event.target instanceof HTMLElement) || !event.target.matches(".skill-card-open")) return;
    const entries = [...event.currentTarget.querySelectorAll<HTMLButtonElement>(".skill-card-open")];
    const index = entries.indexOf(event.target as HTMLButtonElement);
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? entries.length - 1 : Math.max(0, Math.min(entries.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)));
    entries[next]?.focus({ preventScroll: true });
    entries[next]?.scrollIntoView({ block: "nearest" });
    if (inspection) entries[next]?.click();
  }

  async function refresh() {
    const seq = ++requestSeq.current;
    setLoading(true);
    setLoadError("");
    try {
      const session = await readSession();
      if (seq !== requestSeq.current) return;
      const targetMode = session.defaultMode;
      if (modeRef.current && modeRef.current !== targetMode) {
        setSnapshot(null);
        setDialog(null);
        setUpdates({});
      }
      modeRef.current = targetMode;
      setMode(targetMode);
      tokenRef.current = session.token;
      const health = await api<{ apiVersion?: number }>("/api/health").catch(() => null);
      multiAgentRef.current = (health?.apiVersion ?? 1) >= 2;
      if (health && !multiAgentRef.current) setToast({ kind: "error", message: t("SkillDock 服务版本较旧，请更新。") });
      const result = await api<Snapshot>(stateUrl(targetMode, health?.apiVersion));
      if (seq === requestSeq.current && modeRef.current === targetMode) {
        setSnapshot(result);
        setInspection(current => current && (current.kind === "skill" ? result.skills : result.plugins).some(item => item.id === current.id) ? current : null);
      }
    } catch (error) {
      if (seq === requestSeq.current) setLoadError((error as Error).message);
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
    return () => {
      requestSeq.current++;
    };
  }, []);
  useEffect(() => {
    const reconnect = () => {
      setDialog(null);
      setUpdates({});
      void refresh();
    };
    window.addEventListener("skilldock:reconnected", reconnect);
    return () => window.removeEventListener("skilldock:reconnected", reconnect);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(
      () => setToast(null),
      toast.kind === "error" ? 12000 : 8000,
    );
    return () => window.clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    setPluginWindow({ key: pluginScopeKey, limit: 48 });
  }, [pluginScopeKey]);
  useEffect(() => {
    try { sessionStorage.setItem("skilldock.page", page); } catch { /* Optional UI preference. */ }
  }, [page]);

  function navigate(next: Page) {
    setPage(next);
    setUpdateFocus(undefined);
    setInspection(null);
    setMenu(null);
    setDialog(null);
  }
  async function action(
    request: Omit<ActionRequest, "mode">,
  ): Promise<ActionResult | undefined> {
    if (busyRef.current) return undefined;
    if (paused) throw new Error(t("SkillDock 正在重新连接，请稍后再操作。"));
    const capturedMode = modeRef.current;
    if (!capturedMode) throw new Error("工作空间尚未就绪，请重新读取清单。");
    let sentRevision: string | undefined;
    const key = `${request.action}:${request.id || ""}`;
    busyRef.current = key;
    setBusy(key);
    try {
      const session = await readSession();
      if (
        session.defaultMode !== capturedMode ||
        modeRef.current !== capturedMode
      )
        throw new Error("工作空间已变化，请重新读取清单后重试。");
      tokenRef.current = session.token;
      sentRevision = multiAgentRef.current ? requestRevision(request, snapshot) : undefined;
      const result = await api<ActionResult>("/api/actions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-SkillDock-Token": tokenRef.current,
        },
        body: JSON.stringify({ ...request, ...(multiAgentRef.current ? { agent: requestAgent(request, snapshot), expectedRevision: sentRevision } : {}), mode: capturedMode }),
      });
      if (modeRef.current !== capturedMode) return undefined;
      if (result.update && request.id)
        setUpdates((previous) => ({
          ...previous,
          [request.id!]: result.update!,
        }));
      if (
        !result.preview && !result.pluginPreview &&
        request.action !== "project.chooseDirectory" &&
        !result.update &&
        !result.sourcePreview &&
        !result.removalPreview &&
        !result.diff &&
        !result.updateItem
      ) {
        if (
          request.action === "skill.update" ||
          request.action === "skill.remove" ||
          request.action === "skill.removeSelected" ||
          request.action === "activity.restore" ||
          request.action === "project.select"
        )
          setUpdates({});
        const savedSchedule =
          request.action === "schedule.configure" ? result.schedule : undefined;
        const message = savedSchedule?.enabled
          ? `已启用固定 ${savedSchedule.intervalMinutes / 60} 小时周期，${savedSchedule.targets.length} 个明确目标；${savedSchedule.autoApply ? "自动应用已验证更新。" : "仅检查。"}`
          : result.message;
        setToast({
          kind: (result.run && result.run.status !== "success") || (result.remoteInstall && !result.remoteInstall.installed) ? "error" : "success",
          message:
            (result.run ? t(result.run.status === "success" ? "更新检查已完成" : result.run.status === "partial" ? "更新检查部分完成" : "更新检查未完成") : message) +
            (result.needsReload && result.agent !== "claude" ? " 新的 Codex 会话或重载后生效。" : ""),
        });
        await refresh();
      }
      return result;
    } catch (error) {
      // The service asks the user first: show what the change touches, then send it again.
      const { code, nativeRules } = error as { code?: string; nativeRules?: NativeRule[] };
      if (code === "CONFIRMATION_REQUIRED" && Array.isArray(nativeRules) && modeRef.current === capturedMode) {
        // The confirmed request carries the revision the user saw, so what was confirmed is what runs.
        setDialog({ type: "native-confirm", confirmation: { request: { ...request, ...(sentRevision !== undefined ? { expectedRevision: sentRevision } : {}) }, message: (error as Error).message, rules: nativeRules } });
        return undefined;
      }
      if (modeRef.current === capturedMode) {
        setToast({ kind: "error", message: (error as Error).message });
        void refresh();
        throw error;
      }
      return undefined;
    } finally {
      busyRef.current = null;
      setBusy(null);
    }
  }
  function run(request: Omit<ActionRequest, "mode">) {
    void action(request).catch(() => {});
  }
  function manageDuplicates(name: string) {
    setInspection(null);
    setDialog({ type: "duplicates", name });
  }
  function editTags(kind: "skill" | "plugin", item: Skill | Plugin) {
    setDialog({ type: "tags", subject: { kind, id: item.id, name: 'marketplace' in item ? pluginTitle(item) : item.name, tags: item.tags, path: "path" in item ? item.path : item.id } });
  }
  function toggleSkill(skill: Skill) {
    run({ action: "skill.toggle", id: skill.id, enabled: !skill.enabled });
  }
  function confirmRemovePlugin(plugin: Plugin) {
    // Claude names the native rules itself (36c 7.3); its confirmation follows from the service.
    if (!objectAgents(plugin).includes("codex")) { run({ action: "plugin.remove", id: plugin.id }); return; }
    setDialog({ type: "confirm", title: t("卸载这个插件？"), description: t("该插件及其 {v0} 个已发现技能将通过包管理入口卸载。此操作不能通过技能恢复记录撤销，需要从市场重新安装。", { v0: plugin.skillCount }), target: plugin.id, request: { action: "plugin.remove", id: plugin.id }, danger: true, label: t("确认卸载"), affected: snapshot?.skills.filter(skill => skill.pluginId === plugin.id).map(skill => `${skill.name} — ${skill.path}`) });
  }
  function confirmRemoveSkill(skill: Skill) {
    if (skill.duplicateNames?.length) {
      manageDuplicates(skill.name);
      return;
    }
    setDialog({
      type: "confirm",
      title: t(skill.removeKind === "link" ? "移除这个技能链接？" : "移除这个技能？"),
      description: t(skill.removeKind === "link" ? "仅移除这个链接，目标内容保留。" : "技能将移到本应用的可恢复区。之后可以在「操作记录」恢复；如果它是链接，来源目录会保留。"),
      target: skill.path,
      request: { action: "skill.remove", id: skill.id },
      danger: true,
      label: t("移至可恢复区"),
    });
  }
  async function checkUpdate(skill: Skill) {
    try {
      const result = await action({
        action: "skill.checkUpdate",
        id: skill.id,
      });
      if (result?.update) setDialog({ type: "update", preview: result.update });
    } catch {
      /* shown in live notification */
    }
  }
  function copy(value: string) {
    void navigator.clipboard
      .writeText(value)
      .then(() => setToast({ kind: "success", message: t("路径已复制。") }))
      .catch(() =>
        setToast({
          kind: "error",
          message: t("浏览器暂时无法复制，请选中路径手动复制。"),
        }),
      );
  }
  const data = snapshot?.mode === mode ? snapshot : null;
  const showAgentDimension = showsAgents(data?.agents);
  const effectiveAgent: AgentFilterValue = showAgentDimension ? agentFilter : "all";
  const skills = data?.skills || [];
  const counts = {
    all: skills.length,
    enabled: skills.filter((s) => s.enabled === true).length,
    standalone: skills.filter(
      (s) => s.scope === "user" || s.scope === "project",
    ).length,
    attention: skills.filter(
      (s) => s.enabled === null || (s.duplicateNames?.length || 0) > 0,
    ).length,
  };
  const filteredSkills = useMemo(
    () =>
      skills.filter((skill) => {
        const words =
          `${skill.name} ${skill.description} ${t(skill.sourceLabel)} ${skill.path}`.toLowerCase();
        return (
          words.includes(query.toLowerCase()) &&
          matchesAgent(skill, effectiveAgent) &&
          matchesTags(skill.tags, skillTags) &&
          (scope === "all" || skill.scope === scope) &&
          (!duplicatesOnly || !!skill.duplicateNames?.length) &&
          (metric !== "enabled" || skill.enabled === true) &&
          (metric !== "standalone" ||
            skill.scope === "user" ||
            skill.scope === "project") &&
          (metric !== "attention" ||
            skill.enabled === null ||
            (skill.duplicateNames?.length || 0) > 0)
        );
      }),
    [skills, query, scope, metric, skillTags, duplicatesOnly, language, effectiveAgent],
  );
  const inPluginCategory = (plugin: Plugin) =>
    pluginFilter === "all" ||
    (pluginFilter === "installed"
      ? plugin.installed
      : pluginFilter === "enabled" ? plugin.installed && plugin.enabled === true : !plugin.installed);
  // Counts follow the Agent filter, so each side's numbers are never summed together.
  const agentPlugins = (data?.plugins || []).filter(plugin => matchesAgent(plugin, effectiveAgent));
  const filteredPlugins = agentPlugins.filter(
    (plugin) =>
      inPluginCategory(plugin) &&
      (marketFilter === "all" || plugin.marketplace === marketFilter) &&
      matchesTags(plugin.tags, pluginTags) &&
      matchesPlugin(plugin, query),
  );
  const visibleMarkets = (data?.marketplaces || []).filter(market => matchesAgent(market, effectiveAgent));
  const visibleActivity = (data?.activity || []).filter(item => effectiveAgent === "all" || (item.agent ?? "codex") === effectiveAgent);
  const agentCounts = (list: { agents?: ("codex" | "claude")[] }[]): Record<AgentFilterValue, number> =>
    ({ all: list.length, codex: list.filter(item => objectAgents(item).includes("codex")).length, claude: list.filter(item => objectAgents(item).includes("claude")).length });
  const pageAgentCounts = page === "skills" ? agentCounts(skills) : page === "plugins" ? agentCounts((data?.plugins || []).filter(inPluginCategory))
    : page === "markets" ? agentCounts(data?.marketplaces || []) : agentCounts((data?.activity || []).map(item => ({ agents: [item.agent ?? "codex"] })));
  const pluginMatchesOutsideFilter = query.trim() && !filteredPlugins.length ? (data?.plugins || []).filter(plugin => matchesPlugin(plugin, query)).length : 0;
  const availableUpdates = data?.updates
    ? data.updates.filter((item) => item.status === "available").length
    : Object.values(updates).filter((update) => update.available).length;
  // The title counts what the Agent filter shows; with both Agents shown, each side's share too.
  const titleObjects: { agents?: ("codex" | "claude")[] }[] | null = page === "skills" ? skills : page === "plugins" ? (data?.plugins || []).filter(plugin => plugin.installed) : page === "markets" ? data?.marketplaces || [] : null;
  const titleCount = !data ? "" : titleObjects ? titleObjects.filter(item => matchesAgent(item, effectiveAgent)).length
    : page === "activity" ? visibleActivity.length : page === "agents" ? data.agents?.length ?? "" : availableUpdates || "";
  const titleSplit = titleObjects && showAgentDimension && effectiveAgent === "all" ? agentCounts(titleObjects) : null;
  const displaySkill = inspection?.kind === "skill" ? skills.find(skill => skill.id === inspection.id) : null;
  const displayPlugin = inspection?.kind === "plugin" ? data?.plugins.find(plugin => plugin.id === inspection.id) : null;
  function showOwningPlugin(id?: string) {
    const plugin = data?.plugins.find(item => item.id === id);
    if (plugin) { navigate("plugins"); setPluginFilter("all"); setQueries(previous => ({ ...previous, plugins: "" })); setPluginTags([]); setMarketFilter("all"); setInspection({ kind: "plugin", id: plugin.id }); }
  }
  const commands: DesktopCommand[] = menu ? (() => {
    const { kind, item } = menu.subject;
    const common: DesktopCommand[] = [
      { label: t("查看详情"), icon: <Info size={15} />, run: () => setInspection({ kind, id: item.id }) },
      { label: t("编辑标签"), icon: <Tag size={15} />, disabled: !!busy || !objectAgents(item).includes("codex"), run: () => editTags(kind, item) },
      { label: t(item.enabled ? "禁用" : "启用"), icon: <CircleCheck size={15} />, disabled: !item.canToggle || !!busy || paused, run: () => run({ action: kind === "skill" ? "skill.toggle" : "plugin.toggle", id: item.id, enabled: !item.enabled }) },
      { label: t("管理更新"), icon: <RefreshCw size={15} />, disabled: !objectAgents(item).includes("codex"), run: () => { navigate("updates"); setUpdateFocus(item.id); } },
    ];
    if (kind === "skill") {
      const skill = item as Skill;
      if (skill.duplicateNames?.length) common.push({ label: t("管理同名技能"), icon: <Copy size={15} />, run: () => manageDuplicates(skill.name) });
      common.push({ label: t(skill.removeKind === "link" ? "移除链接" : "移除技能"), icon: <Trash2 size={15} />, danger: true, disabled: !skill.canRemove || !!busy, run: () => confirmRemoveSkill(skill) });
    } else {
      const plugin = item as Plugin;
      common.push(plugin.installed ? { label: t("卸载"), icon: <Trash2 size={15} />, danger: true, disabled: !plugin.canRemove || !!busy, run: () => confirmRemovePlugin(plugin) } : { label: t("安装插件"), icon: <Plus size={15} />, disabled: !plugin.canInstall || !!busy, run: () => setDialog({ type: "plugin-install", plugin }) });
    }
    return common;
  })() : [];

  return (
    <IconProvider assets={data?.iconAssets}><div className={classNames("app-shell", !!(displaySkill || displayPlugin) && "has-inspector", sidebarCollapsed && "sidebar-collapsed")}>
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(event) => {
            event.preventDefault();
            navigate("skills");
          }}
          aria-label={t("SkillDock 首页")}
        >
          <span className="brand-mark" aria-hidden="true" style={{ maskImage: `url(${JSON.stringify(brandIcon)})`, WebkitMaskImage: `url(${JSON.stringify(brandIcon)})` }} />
          <span className="brand-wordmark" aria-hidden="true" style={{ maskImage: `url(${JSON.stringify(brandWordmark)})`, WebkitMaskImage: `url(${JSON.stringify(brandWordmark)})` }} />
        </a>
        <div className="nav-caption">{t("资料库")}</div>
        <nav aria-label={t("主导航")}>
          {nav.filter(item => item.id !== "agents" || !!data?.agents).map((item) => (
            <button
              key={item.id}
              className={classNames("nav-item", page === item.id && "active")}
              aria-label={t(item.label)}
              title={t(item.label)}
              aria-current={page === item.id ? "page" : undefined}
              onClick={() => navigate(item.id)}
            >
              <item.icon size={19} strokeWidth={1.8} />
              <span>{t(item.label)}</span>
              {item.id === "updates" && availableUpdates > 0 && (
                <span className="nav-count">{availableUpdates}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-project">
          <div className="nav-caption">{t("当前项目")}</div>
          {data && mode === "local" && <ProjectPicker project={data.paths.project} catalog={data.projects} disabled={!!busy || paused}
            onSelect={projectDir => { setInspection(null); run({ action: "project.select", projectDir }); }} onBrowse={() => setDialog({ type: "project" })} />}
          {data && mode !== "local" && <code title={data.paths.project}>{data.paths.project.split("/").filter(Boolean).at(-1)}</code>}
          {data && <button className="text-button directory-trigger" aria-expanded={showPaths} onClick={() => setShowPaths(value => !value)}><Info size={13} />{showPaths ? t("收起目录") : t("查看目录")}</button>}
        </div>
        <div className="sidebar-bottom">
          <button className="nav-item preferences-trigger" aria-label={t("外观与语言")} title={t("外观与语言")} onClick={() => setDialog({ type: "preferences" })}><Settings2 size={18} /><span>{t("偏好设置")}</span></button>
          <div className="sidebar-version"><span>A Testany Product</span><span>v{packageInfo.version}</span></div>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <button className="icon-button sidebar-toggle" aria-label={t(sidebarCollapsed ? "展开侧边栏" : "收起侧边栏")} title={t(sidebarCollapsed ? "展开侧边栏" : "收起侧边栏")} aria-expanded={!sidebarCollapsed} onClick={() => setSidebarCollapsed(value => !value)}><PanelLeft size={19} /></button>
          <div className="workspace-title"><h1>{t(currentNav.label)}{data && <span className="title-count">{titleCount}</span>}{titleSplit && <AgentSplit counts={titleSplit} />}</h1><p>{t({ skills: "浏览、整理与管理你的技能", plugins: "扩展工作流，管理插件与附带技能", markets: "管理插件的发现与安装来源", updates: "检查变化，让你的工具保持最新", activity: "查看操作结果，恢复之前的内容", agents: "查看本机的 Agent 环境与 SkillDock 对它们的管理" }[page])}</p></div>
          <div className="heading-actions">
            {showAgentDimension && ["skills", "plugins", "markets", "activity"].includes(page) && <AgentFilter value={agentFilter} onChange={setAgentFilter} counts={pageAgentCounts} />}
            <Button variant="ghost" busy={loading} onClick={() => void refresh()} disabled={!!busy} aria-label={t("刷新清单")} title={t("刷新清单")}>{!loading && <RefreshCw size={17} />}</Button>
            {page === "skills" && <Button variant="primary" onClick={() => setDialog({ type: "install" })} disabled={!data || !!busy}><Plus size={16} />{t("安装技能")}</Button>}
            {page === "plugins" && <Button variant="primary" onClick={() => setDialog({ type: "plugin-install" })} disabled={!data || !!busy}><Plus size={16} />{t("安装插件")}</Button>}
            {page === "markets" && <Button variant="primary" onClick={() => setDialog({ type: "market" })} disabled={!data || !!busy}><Plus size={16} />{t("添加来源")}</Button>}
          </div>
        </header>
        <main id="main-content" ref={main} onScroll={event => {
          scrollPositions.current[page] = event.currentTarget.scrollTop;
          clearTimeout(scrollTimer.current);
          scrollTimer.current = setTimeout(() => saveWorkspace(viewState.current), 180);
        }}>
          {connection && <div className={`runtime-notice ${connection.status === "failed" ? "runtime-notice-error" : ""}`} role="status">
            {connection.status === "failed" ? <CircleAlert size={18} /> : <Loader2 size={18} className="spin" />}
            <div><strong>{t(connection.status === "preparing" ? "正在准备新版 SkillDock…" : connection.status === "restarting" ? "正在重启，界面将自动恢复…" : connection.status === "failed" ? "新版未能启动，请重新打开 SkillDock 后重试。" : "连接已中断，正在自动重连…")}</strong>{connection.status === "failed" && connection.message && <p><ServiceMessage value={connection.message} /></p>}</div>
          </div>}
          {data && mode === "local" && <div className="compact-project"><span>{t("当前项目")}</span><ProjectPicker project={data.paths.project} catalog={data.projects} disabled={!!busy || paused} onSelect={projectDir => { setInspection(null); run({ action: "project.select", projectDir }); }} onBrowse={() => setDialog({ type: "project" })} /><button className="icon-button" aria-label={t("查看目录")} aria-expanded={showPaths} onClick={() => setShowPaths(value => !value)}><Info size={15} /></button></div>}
          {data?.projectContext?.warnings.map(warning => <div key={warning} className="project-notice" role="status"><CircleAlert size={15} /><span>{t(warning)}</span></div>)}
          {showPaths && data && (
            <div className="paths-panel">
              {data.projectContext && <div><span>{t("目录来源")}</span><code>{t({ argument: "启动参数", environment: "环境变量", saved: "界面保存的选择", "working-directory": "启动工作目录", record: "上次运行的项目", home: "主目录" }[data.projectContext.source])}</code></div>}
              {data.projectContext && <div><span>{t("请求目录")}</span><code>{data.projectContext.requested}</code></div>}
              {data.cli.path && <div><span>Codex CLI</span><code>{data.cli.path}</code></div>}
              {Object.entries(data.paths).filter((entry): entry is [string, string] => typeof entry[1] === "string").map(([key, value]) => (
                <div key={key}>
                  <span>
                    {(
                      {
                        skills: t("技能目录"),
                        config: t("配置文件"),
                        state: t("应用数据"),
                        project: t("当前项目"),
                        cache: t("插件缓存目录"),
                      } as Record<string, string>
                    )[key] || key}
                  </span>
                  <code>{value}</code>
                  <button
                    className="icon-button"
                    aria-label={t("复制{v0}路径", { v0: key })}
                    onClick={() => copy(value)}
                  >
                    <Copy size={14} />
                  </button>
                </div>
              ))}
              {data.locations?.filter(item => item.real).map(item => <div key={item.directory}><span>{t(item.label)}</span><code>{item.directory}{item.real !== item.directory && <><br />{t("实际目录")} · {item.real}</>}</code></div>)}
            </div>
          )}
          {busy && (
            <div className="operation-progress" role="status">
              <Loader2 size={14} className="spin" />
              {t("正在处理操作，请稍候…")}
            </div>
          )}
          {loadError && (
            <div className="error-banner" role="alert">
              <CircleAlert size={18} />
              <div>
                <strong>{t("无法刷新清单")}</strong>
                <ServiceMessage value={loadError} error />
              </div>
              <Button onClick={() => void refresh()} busy={loading}>
                {t("重试")}
              </Button>
            </div>
          )}
          {!!data?.diagnostics.length && (
            <details className="diagnostics">
              <summary>
                <CircleAlert size={15} />
                <span>
                  {data.diagnostics.length}
                  {t("条来源提示")}
                </span>
                <span className="diagnostics-hint">
                  {t("部分来源需要关注")}
                </span>
                <ChevronDown size={14} />
              </summary>
              <ul>
                {data.diagnostics.map((message, index) => (
                  <li key={index}>
                    <ServiceMessage value={message} />
                  </li>
                ))}
              </ul>
            </details>
          )}
          {loading && !data ? (
            <div
              className="skeleton-wrap"
              role="status"
              aria-label={t("正在读取清单")}
            >
              {nativeMode && <p>{t("正在启动 SkillDock 并读取清单，首次准备可能需要一些时间…")}</p>}
              <div className="skeleton-stats">
                {[1, 2, 3, 4].map((n) => (
                  <div className="skeleton" key={n} />
                ))}
              </div>
              <div className="skeleton-toolbar skeleton" />
              <div className="skeleton-grid">
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <div className="skeleton" key={n} />
                ))}
              </div>
              <span className="sr-only">{t("正在读取技能与来源…")}</span>
            </div>
          ) : !data ? (
            <Empty
              icon={FolderOpen}
              title={t("暂时无法打开工作空间")}
              description={t(
                "请确认本地 SkillDock 服务正在运行，然后重新读取清单。",
              )}
            >
              <Button onClick={() => void refresh()}>
                <RefreshCw size={15} />
                {t("重新读取")}
              </Button>
            </Empty>
          ) : (
            <>
              {page === "skills" && (
                <>
                  <LibraryFilters selected={metric} onChange={setMetric} items={[
                    { id: "all", label: "全部技能", count: counts.all, icon: <Layers3 size={16} /> },
                    { id: "enabled", label: "已启用", count: counts.enabled, icon: <CircleCheck size={16} /> },
                    { id: "standalone", label: "个人与项目", count: counts.standalone, icon: <Folder size={16} /> },
                    { id: "attention", label: "状态待确认", count: counts.attention, icon: <CircleAlert size={16} /> },
                  ]} />
                  {metric === "standalone" && <p className="category-explanation">{t("按技能管理；插件附带技能随所属插件管理与更新。")}</p>}
                  {metric === "attention" && <p className="category-explanation">{t("只包含安装状态未知或存在同名技能的项目；系统或宿主管理本身不代表异常。")}</p>}
                  <div className="toolbar">
                    <SearchField
                      query={query}
                      setQuery={setQuery}
                      placeholder={t("搜索名称、用途或路径…")}
                    />
                    <label className="select-control">
                      <SlidersHorizontal size={15} />
                      <span className="sr-only">{t("筛选技能来源")}</span>
                      <select
                        value={scope}
                        onChange={(event) => setScope(event.target.value)}
                        aria-label={t("筛选技能来源")}
                      >
                        <option value="all">{t("全部来源")}</option>
                        {Object.entries(scopeLabels).map(([id, label]) => (
                          <option key={id} value={id}>
                            {t(label)}
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={13} />
                    </label>
                    <button
                      type="button"
                      className="duplicate-filter"
                      aria-pressed={duplicatesOnly}
                      aria-describedby={duplicatesOnly ? "duplicate-filter-hint" : undefined}
                      onClick={() => setDuplicatesOnly((value) => !value)}
                    >
                      <Copy size={15} aria-hidden="true" />
                      {t("仅显示重复")}
                    </button>
                    <TagFilter items={skills} selected={skillTags} onChange={setSkillTags} />
                    <ViewSwitch value={view} onChange={setView} />
                  </div>
                  {duplicatesOnly && (
                    <p className="duplicate-filter-hint" id="duplicate-filter-hint">
                      {t("同名技能按安装路径分别显示，可选择“管理同名技能”处理。")}
                    </p>
                  )}
                  <div className="collection-heading">
                    <h2>
                      {metric === "all"
                        ? t("你的技能")
                        : {
                            enabled: t("已启用的技能"),
                            standalone: t("个人与项目技能"),
                            attention: t("状态待确认的技能"),
                          }[metric]}
                      <span>{filteredSkills.length}</span>
                    </h2>
                    <span>{t("名称 · 来源 · 状态")}</span>
                  </div>
                  {filteredSkills.length ? (
                    <><div
                      onKeyDown={navigateRows} className={view === "grid" ? "skill-grid" : "skill-list"}
                    >
                      {filteredSkills.slice(0, skillLimit).map((skill) => {
                        const { Icon, color } = skillVisual(skill.name);
                        return (
                          <article
                            key={skill.id}
                            onContextMenu={event => openMenu(event, { kind: "skill", item: skill })}
                            className={classNames(
                              "skill-card",
                              inspection?.id === skill.id && "is-selected",
                              skill.enabled === false && "skill-disabled",
                            )}
                          >
                            <button
                              className="skill-card-open"
                              aria-pressed={inspection?.id === skill.id}
                              onClick={() =>
                                inspectSkill(skill)
                              }
                              aria-label={t("查看 {v0} 详情", {
                                v0: skill.name,
                              })}
                            >
                              <div className="skill-card-heading">
                                <ProviderIcon icon={skill.icon} className={`skill-icon tone-${color}`}>
                                  <Icon size={21} strokeWidth={1.6} /></ProviderIcon>
                                <div>
                                  <h3>{skill.name}</h3>
                                  <span className="skill-kind">
                                    {t(scopeLabels[skill.scope])}
                                    {skill.version ? ` · ${skill.version}` : ""}
                                  </span>
                                </div>
                                <ChevronRight
                                  className="card-chevron"
                                  size={17}
                                />
                              </div>
                              <p className="skill-description">
                                {skill.description ||
                                  t(
                                    "这个技能尚未提供描述。打开详情查看 SKILL.md。",
                                  )}
                              </p>
                            </button>
                            <TagStrip subject={{ ...skill, kind: "skill" }} disabled={!!busy || !objectAgents(skill).includes("codex")} onEdit={() => editTags("skill", skill)} />
                            {(showAgentDimension || skill.visibility || skill.perAgent) && <div className="agent-line">{showAgentDimension && <AgentBadges agents={skill.agents} />}<ClaudeSkillFacts skill={skill} /></div>}
                            {!!skill.duplicateNames?.length && <code className="skill-instance-path">{skill.path}</code>}
                            <SkillReason
                              skill={skill}
                              onDuplicates={() => manageDuplicates(skill.name)}
                              onDetails={() =>
                                inspectSkill(skill)
                              }
                              onPlugin={() => showOwningPlugin(skill.pluginId)}
                            />
                            <div className="skill-card-footer">
                              <span
                                className="source-tag"
                                title={t(skill.sourceLabel)}
                              >
                                {skill.scope === "plugin" ||
                                skill.scope === "cache" ? (
                                  <Package size={12} />
                                ) : skill.scope === "system" ? (
                                  <LockKeyhole size={12} />
                                ) : (
                                  <Folder size={12} />
                                )}
                                {t(skill.sourceLabel)}
                              </span>
                              <div className="card-status">
                                {!!skill.duplicateNames?.length && (
                                  <CircleAlert
                                    size={14}
                                    className="attention-icon"
                                    aria-label={t("有同名技能")}
                                  />
                                )}
                                <Toggle
                                  checked={skill.enabled}
                                  disabled={!skill.canToggle || !!busy}
                                  busy={busy === `skill.toggle:${skill.id}`}
                                  label={`${skill.enabled ? t("禁用") : t("启用")} ${skill.name}`}
                                  reason={
                                    skill.reason ? t(skill.reason) : undefined
                                  }
                                  onChange={() => toggleSkill(skill)}
                                />
                                <button className="icon-button row-more" aria-label={t("{v0} 的更多操作", { v0: skill.name })} aria-haspopup="menu" onClick={event => openMenu(event, { kind: "skill", item: skill })}><MoreHorizontal size={17} /></button>
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div><CollectionFooter visible={skillLimit} total={filteredSkills.length} onMore={() => setSkillWindow({ key: skillScopeKey, limit: skillLimit + 48 })} /></>
                  ) : (
                    <Empty
                      title={
                        skills.length
                          ? t("没有找到匹配的技能")
                          : t("你的技能库，准备就绪")
                      }
                      description={
                        skills.length
                          ? duplicatesOnly
                            ? t("当前筛选下没有重复技能。可关闭“仅显示重复”，或调整其他筛选条件。")
                            : t("试试其他关键词，或调整来源与状态筛选。")
                          : t("从本地文件夹或 Git 仓库安装第一个技能。")
                      }
                    >
                      <Button
                        onClick={() => {
                          if (skills.length) {
                            setQuery("");
                            setScope("all");
                            setMetric("all");
                            setSkillTags([]);
                            setDuplicatesOnly(false);
                          } else setDialog({ type: "install" });
                        }}
                      >
                        {skills.length ? t("清除筛选") : t("安装第一个技能")}
                      </Button>
                    </Empty>
                  )}
                </>
              )}
              {page === "plugins" && (
                <>
                  {data.directoryError && <div className="notice" role="status"><CircleAlert size={18} /><p><ServiceMessage value={data.directoryError} /></p></div>}
                  {!data.cli.available && (
                    <div className="notice">
                      <Terminal size={18} />
                      <div>
                        <strong>{t("Codex CLI 暂不可用")}</strong>
                        <p>
                          {(data.cli.error ? t(data.cli.error) : undefined) ||
                            t(
                              "插件操作需要可工作的 Codex CLI。独立技能仍可照常管理。",
                            )}
                        </p>
                      </div>
                    </div>
                  )}
                  <LibraryFilters selected={pluginFilter} onChange={setPluginFilter} items={[
                    { id: "all", label: "全部插件", count: agentPlugins.length, icon: <Blocks size={16} /> },
                    { id: "enabled", label: "已启用", count: agentPlugins.filter(item => item.installed && item.enabled === true).length, icon: <CircleCheck size={16} /> },
                    { id: "installed", label: "已安装", count: agentPlugins.filter(item => item.installed).length, icon: <Package size={16} /> },
                    { id: "available", label: "未安装", count: agentPlugins.filter(item => !item.installed).length, icon: <Download size={16} /> },
                  ]} />
                  {pluginFilter === "available" && <p className="category-explanation">{t(effectiveAgent === "claude"
                    ? "未安装：Claude 已添加的 Marketplace 中尚未安装的插件，取自 Claude 在本机保存的副本；这一版只能查看。"
                    : "未安装：已连接 Marketplace 中可发现的插件；也可直接从 Git 或本地目录安装单个插件。")}</p>}
                  <div className="toolbar">
                    <SearchField
                      query={query}
                      setQuery={setQuery}
                      placeholder={t("搜索插件或市场…")}
                    />
                    <label className="select-control">
                      <Globe2 size={15} />
                      <select
                        aria-label={t("筛选插件市场")}
                        value={marketFilter}
                        onChange={(event) =>
                          setMarketFilter(event.target.value)
                        }
                      >
                        <option value="all">{t("全部市场")}</option>
                        {[
                          ...new Set(
                            data.plugins.map((plugin) => plugin.marketplace),
                          ),
                        ].map((name) => (
                          <option key={name} value={name}>{data.marketplaces.find(item => item.name === name)?.displayName || name}</option>
                        ))}
                      </select>
                      <ChevronDown size={13} />
                    </label>
                    <TagFilter items={data.plugins} selected={pluginTags} onChange={setPluginTags} />
                    <ViewSwitch value={view} onChange={setView} />
                  </div>
                  <div className="collection-heading">
                    <h2>
                      {pluginFilter === "available"
                        ? t("发现插件")
                        : t("插件清单")}
                      <span>{filteredPlugins.length}</span>
                    </h2>
                    <span>{t("名称 · 来源 · 状态")}</span>
                  </div>
                  {filteredPlugins.length ? (
                    <>
                      <div onKeyDown={navigateRows} className={view === "grid" ? "skill-grid" : "skill-list"}>
                        {filteredPlugins.slice(0, pluginLimit).map((plugin) => (
                          <PluginCard
                            key={plugin.id}
                            plugin={plugin}
                            showAgents={showAgentDimension}
                            onEditTags={() => editTags("plugin", plugin)}
                            busy={busy}
                            onToggle={() =>
                              run({
                                action: "plugin.toggle",
                                id: plugin.id,
                                enabled: !plugin.enabled,
                              })
                            }
                            selected={inspection?.id === plugin.id}
                            onMenu={event => openMenu(event, { kind: "plugin", item: plugin })}
                            onDetails={() => inspectPlugin(plugin)}
                            onInstall={() => setDialog({ type: "plugin-install", plugin })}
                          />
                        ))}
                      </div>
                      <CollectionFooter visible={pluginLimit} total={filteredPlugins.length} onMore={() => setPluginWindow({ key: pluginScopeKey, limit: pluginLimit + 48 })} />
                    </>
                  ) : (
                    <Empty icon={Blocks} title={t(data.plugins.length ? "没有找到匹配的插件" : "这里还没有插件")} description={t(data.plugins.length ? "试试其他关键词，或调整来源与状态筛选。" : "从本地目录、Git 仓库或 Marketplace 安装第一个插件。")}>
                      {!!pluginMatchesOutsideFilter && <Button variant="primary" onClick={() => { setMarketFilter('all'); setPluginFilter('all'); setPluginTags([]); }}>{t('查看全部匹配（{v0} 项）', { v0: pluginMatchesOutsideFilter })}</Button>}
                      <Button onClick={() => { if (data.plugins.length) { setQuery(""); setMarketFilter("all"); setPluginFilter("all"); setPluginTags([]); } else setDialog({ type: "plugin-install" }); }}>{t(data.plugins.length ? "清除筛选" : "安装插件")}</Button>
                    </Empty>
                  )}
                </>
              )}
              {page === "markets" && (
                <>
                  <div className="section-intro">
                    <div className="section-intro-icon">
                      <Globe2 size={26} strokeWidth={1.4} />
                    </div>
                    <div>
                      <h2>{t("让好的能力，有迹可循。")}</h2>
                      <p>
                        {t(
                          "来源记录告诉你插件来自哪里。刷新 Git 市场只更新目录信息，插件更新由各自管理入口处理。",
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="collection-heading">
                    <h2>
                      {t("已连接来源")}
                      <span>{data.marketplaces.length}</span>
                    </h2>
                    <span>{t("本地目录与 Git 仓库")}</span>
                  </div>
                  {data.marketplaces.length ? (
                    <div className="market-list">
                      {visibleMarkets.map((market) => (
                        <MarketCard
                          key={market.id}
                          market={market}
                          showAgents={showAgentDimension}
                          busy={busy}
                          onRefresh={() =>
                            run({
                              action: "marketplace.refresh",
                              id: market.id,
                            })
                          }
                          onBrowse={() => {
                            navigate("plugins");
                            setPluginFilter("all");
                            setMarketFilter(market.name);
                            if (showAgentDimension) setAgentFilter(objectAgents(market)[0]);
                            setQueries(previous => ({ ...previous, plugins: "" }));
                            setPluginTags([]);
                          }}
                          onRemove={() => !objectAgents(market).includes("codex") ? run({ action: "marketplace.remove", id: market.id }) :
                            setDialog({
                              type: "confirm",
                              title: t("移除这个市场来源？"),
                              description: t(
                                "此操作会取消该来源的注册。已经安装的插件不会因此全部卸载；需要时可以重新添加来源。",
                              ),
                              target: market.source,
                              request: {
                                action: "marketplace.remove",
                                id: market.id,
                              },
                              danger: true,
                              label: t("移除来源"),
                            })
                          }
                        />
                      ))}
                    </div>
                  ) : (
                    <Empty
                      icon={Globe2}
                      title={t("连接你的第一个来源")}
                      description={t(
                        "添加本地或 Git 市场，统一浏览其中的插件。",
                      )}
                    >
                      <Button
                        variant="primary"
                        onClick={() => setDialog({ type: "market" })}
                      >
                        <Plus size={15} />
                        {t("添加来源")}
                      </Button>
                    </Empty>
                  )}
                </>
              )}
              {page === "updates" && (
                <UpdatesWorkspace
                  data={data}
                  runPending={busy === "updates.run:"}
                  focusTarget={updateFocus}
                  onClearFocus={() => setUpdateFocus(undefined)}
                  busy={!!busy}
                  language={language}
                  execute={action}
                  onDetails={(skill) => inspectSkill(skill)}
                  onRefresh={() => void refresh()}
                />
              )}
              {page === "agents" && (
                <AgentEnvironments environments={data.agents ?? []} skills={data.skills} plugins={data.plugins} busy={!!busy || paused}
                  onRun={request => run(request)}
                  onConfirm={spec => setDialog({ type: "confirm", ...spec })} />
              )}
              {page === "activity" && (
                <>
                  <div className="collection-heading">
                    <h2>
                      {t("最近的变化")}
                      <span>{data.activity.length}</span>
                    </h2>
                  </div>
                  {data.activity.length ? (
                    <div className="activity-list">
                      {visibleActivity.map((item) => (
                        <article className="activity-item" key={item.id}>
                          <span
                            className={classNames(
                              "activity-icon",
                              item.status === "error" && "failed",
                            )}
                          >
                            {item.status === "success" ? (
                              <Check size={17} />
                            ) : (
                              <X size={17} />
                            )}
                          </span>
                          <div className="activity-info">
                            <div className="activity-title">
                              <h3>
                                {t(actionNames[item.action] || item.action)}
                              </h3>
                              <time dateTime={item.createdAt}>
                                {formatDate(item.createdAt)}
                              </time>
                            </div>
                            <div className="activity-target">{item.target}</div>
                            {item.path && <code className="activity-path">{item.path}</code>}
                            <ServiceMessage
                              value={item.message}
                              code={item.reasonCode}
                              error={item.status === "error"}
                            />
                          </div>
                          <div className="activity-actions">
                            <Badge
                              tone={item.status === "success" ? "green" : "red"}
                            >
                              {item.status === "success"
                                ? t("已完成")
                                : t("未完成")}
                            </Badge>
                            {item.canRestore && (
                              <Button
                                disabled={!!busy}
                                onClick={() =>
                                  setDialog({
                                    type: "confirm",
                                    title: t("恢复这次操作之前的内容？"),
                                    description: t(
                                      "恢复前会检查目标位置。如果已有新内容或后续改动，应用会保留当前文件并提示冲突。",
                                    ),
                                    target: item.path || item.target,
                                    request: {
                                      action: "activity.restore",
                                      id: item.id,
                                    },
                                    label: t("确认恢复"),
                                  })
                                }
                              >
                                <RotateCcw size={14} />
                                {t("恢复")}
                              </Button>
                            )}
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <Empty
                      icon={History}
                      title={t("清爽的开始")}
                      description={t(
                        "安装、启禁、移除和恢复的结果都会保存在这里。先从浏览技能库开始吧。",
                      )}
                    >
                      <Button onClick={() => navigate("skills")}>
                        {t("浏览技能库")}
                        <ArrowRight size={15} />
                      </Button>
                    </Empty>
                  )}
                </>
              )}
              <footer className="page-footer">
                <span>
                  <span className="tiny-dot" />
                  SkillDock
                </span>
                <span>
                  {loading
                    ? t("正在刷新…")
                    : t("上次读取 {v0}", { v0: formatDate(data.scannedAt) })}
                  <span className="footer-divider">·</span>
                  {Math.round(data.durationMs)} ms
                </span>
              </footer>
            </>
          )}
        </main>
      </div>

      {dialog?.type === "tags" && data && <TagsDialog key={`${mode}:${dialog.subject.kind}:${dialog.subject.id}`} subject={dialog.subject}
        suggestions={[...data.skills, ...data.plugins].flatMap(item => item.tags || [])} busy={!!busy} execute={action} onClose={() => setDialog(null)} />}
      {dialog?.type === "project" && data && <ProjectDialog project={data.paths.project} catalog={data.projects} busy={busy} action={action} onClose={() => setDialog(null)} />}
      {dialog?.type === "plugin-install" && data && <InstallDialog kind="plugin" data={data} initialPlugin={dialog.plugin} initialMarket={dialog.market} busy={busy} action={action} onClose={() => setDialog(null)} onMarket={() => setDialog({ type: "market", fromInstall: true })} />}
      {displayPlugin && data && <PluginDetail plugin={displayPlugin} skills={data.skills.filter(skill => skill.pluginId === displayPlugin.id)} busy={busy}
        onClose={() => setInspection(null)} onSkill={inspectSkill} onRemove={() => confirmRemovePlugin(displayPlugin)}
        onInstall={() => setDialog({ type: "plugin-install", plugin: displayPlugin })} onToggle={() => run({ action: "plugin.toggle", id: displayPlugin.id, enabled: !displayPlugin.enabled })}
        onUpdates={() => { navigate("updates"); setUpdateFocus(displayPlugin.id); }} />}
      {dialog?.type === "preferences" && (
        <PreferencesDialog onClose={() => setDialog(null)} />
      )}
      {dialog?.type === "duplicates" && data && <DuplicateSkillsDialog
        key={`${mode}:${dialog.name}`} name={dialog.name} skills={data.skills} busy={busy} action={action}
        onClose={() => setDialog(current => current === dialog ? null : current)}
        onPlugin={showOwningPlugin}
      />}
      {displaySkill && mode && (
        <SkillDetail
          skill={displaySkill}
          mode={mode}
          busy={busy}
          onClose={() => setInspection(null)}
          onEditTags={() => editTags("skill", displaySkill)}
          onToggle={() => toggleSkill(displaySkill)}
          onRemove={() => confirmRemoveSkill(displaySkill)}
          onUpdate={() => void checkUpdate(displaySkill)}
          onCopy={copy}
          onDuplicates={() => manageDuplicates(displaySkill.name)}
          onPlugin={() => showOwningPlugin(displaySkill.pluginId)}
        />
      )}
      {dialog?.type === "install" && data && (
        <InstallDialog kind="skill" data={data} onMarket={() => setDialog({ type: "market" })}
          agents={(data.agents ?? []).filter(item => item.installed && item.management === "enabled").map(item => item.agent)}
          busy={busy}
          action={action}
          onClose={() =>
            setDialog((current) => (current === dialog ? null : current))
          }
        />
      )}
      {dialog?.type === "market" && data && (
        <MarketDialog
          busy={busy}
          action={action}
          agents={(data?.agents ?? []).filter(item => item.installed && item.management === "enabled").map(item => item.agent)}
          onClose={() =>
            setDialog((current) => (current === dialog ? dialog.fromInstall ? { type: "plugin-install", market: true } : null : current))
          }
        />
      )}
      {dialog?.type === "native-confirm" && (
        <NativeConfirmDialog confirmation={dialog.confirmation} busy={busy} action={action} onClose={() => setDialog(current => (current === dialog ? null : current))} />
      )}
      {dialog?.type === "confirm" && (
        <ConfirmDialog
          dialog={dialog}
          busy={busy}
          action={action}
          onClose={() =>
            setDialog((current) => (current === dialog ? null : current))
          }
        />
      )}
      {dialog?.type === "update" && (
        <UpdateDialog
          preview={dialog.preview}
          busy={busy}
          action={action}
          onClose={() =>
            setDialog((current) => (current === dialog ? null : current))
          }
        />
      )}
      {menu && <CommandMenu x={menu.x} y={menu.y} commands={commands} onClose={closeMenu} />}
      <div className="toast-region" aria-live="polite" aria-atomic="true">
        {toast && (
          <div
            className={classNames(
              "toast",
              toast.kind === "error" && "toast-error",
            )}
          >
            {toast.kind === "success" ? (
              <CircleCheck size={19} />
            ) : (
              <CircleAlert size={19} />
            )}
            <ServiceMessage
              value={toast.message}
              error={toast.kind === "error"}
            />
            <button
              className="icon-button"
              onClick={() => setToast(null)}
              aria-label={t("关闭通知")}
            >
              <X size={16} />
            </button>
          </div>
        )}
      </div>
    </div></IconProvider>
  );
}

function SearchField({
  query,
  setQuery,
  placeholder,
}: {
  query: string;
  setQuery: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="search-field">
      <Search size={17} />
      <span className="sr-only">{t("搜索")}</span>
      <input
        type="search"
        aria-label={t("搜索")}
        placeholder={placeholder}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {query && (
        <button
          type="button"
          aria-label={t("清空搜索")}
          className="search-clear"
          onClick={() => setQuery("")}
        >
          <X size={14} />
        </button>
      )}
    </label>
  );
}
function PluginCard({ plugin, busy, onToggle, onInstall, onDetails, onEditTags, selected, onMenu, showAgents }: {
  selected: boolean; onMenu: (event: React.MouseEvent) => void; showAgents: boolean;
  plugin: Plugin; busy: string | null; onToggle: () => void; onInstall: () => void; onDetails: () => void; onEditTags: () => void;
}) {
  return <article onContextMenu={onMenu} className={classNames("skill-card", selected && "is-selected", plugin.installed && plugin.enabled === false && "skill-disabled")}>
    <button className="skill-card-open" aria-pressed={selected} onClick={onDetails} aria-label={t("查看 {v0} 详情", { v0: pluginTitle(plugin) })}>
      <div className="skill-card-heading"><ProviderIcon icon={plugin.icon} className="skill-icon tone-2"><Blocks size={21} strokeWidth={1.6} /></ProviderIcon><div><h3>{pluginTitle(plugin)}</h3><span className="skill-kind">{plugin.version || t("版本未提供")} · {t(plugin.installed ? "已安装" : "未安装")}</span></div><ChevronRight className="card-chevron" size={17} /></div>
      <p className="skill-description">{plugin.description || t("这个插件尚未提供描述。请根据来源与附带技能判断是否适合你的工作流。")}</p>
    </button>
    <TagStrip subject={{ ...plugin, name: pluginTitle(plugin), kind: "plugin" }} disabled={!!busy || !objectAgents(plugin).includes("codex")} onEdit={onEditTags} />
    {(showAgents || plugin.installation) && <div className="agent-line">{showAgents && <AgentBadges agents={plugin.agents} />}<ClaudePluginFacts plugin={plugin} /></div>}
    {plugin.enabled === null && plugin.installed && <div className="skill-reason skill-reason-attention"><CircleAlert size={13} /><span>{t("安装或启用状态尚未核实。")}</span></div>}
    <div className="skill-card-footer"><span className="source-tag" title={plugin.marketplace}><Globe2 size={12} />{plugin.directSource ? t("单插件来源") : plugin.marketplace}</span><div className="card-status">
      {plugin.installed ? <Toggle checked={plugin.enabled} disabled={!plugin.canToggle || !!busy} busy={busy === `plugin.toggle:${plugin.id}`} label={`${plugin.enabled ? t("禁用") : t("启用")} ${pluginTitle(plugin)}`} reason={plugin.reason ? t(plugin.reason) : undefined} onChange={onToggle} /> : <Button variant="ghost" disabled={!plugin.canInstall || !!busy} onClick={onInstall}><Plus size={14} />{t("安装插件")}</Button>}
      <button className="icon-button row-more" aria-label={t("{v0} 的更多操作", { v0: pluginTitle(plugin) })} aria-haspopup="menu" onClick={onMenu}><MoreHorizontal size={17} /></button>
    </div></div>
  </article>;
}
function PluginDetail({ plugin, skills, busy, onClose, onToggle, onRemove, onInstall, onUpdates, onSkill }: { plugin: Plugin; skills: Skill[]; busy: string | null; onClose: () => void; onToggle: () => void; onRemove: () => void; onInstall: () => void; onUpdates: () => void; onSkill: (skill: Skill) => void }) {
  return <Inspector title={t("插件详情")} onClose={onClose}>
    <div className="modal-body"><ProviderIcon icon={plugin.icon} className="skill-icon tone-2 inspector-provider-icon" large><Blocks size={26} /></ProviderIcon><h3 className="inspector-object-name">{pluginTitle(plugin)}</h3><p className="dialog-description">{plugin.description || t("未提供描述")}</p><dl className="preview-paths"><dt>{t("版本")}</dt><dd>{plugin.version || t("版本未提供")}</dd><dt>{t("来自")}</dt><dd><code>{plugin.directSource?.source || plugin.marketplace}</code></dd><dt>ID</dt><dd><code>{plugin.id}</code></dd>{plugin.sourcePath && <><dt>{t("来源路径")}</dt><dd><code>{plugin.sourcePath}</code></dd></>}{plugin.installedPath && <><dt>{t("安装路径")}</dt><dd><code>{plugin.installedPath}</code></dd></>}{plugin.realPath && plugin.realPath !== plugin.installedPath && <><dt>{t("实际路径")}</dt><dd><code>{plugin.realPath}</code></dd></>}</dl>
      <CompatibilityWarnings warnings={plugin.warnings} />
      {plugin.directSource && <ResolvedGitSource source={plugin.directSource} />}
      {plugin.installed && <div className="inline-toggle"><Toggle checked={plugin.enabled} disabled={!plugin.canToggle || !!busy} label={`${plugin.enabled ? t("禁用") : t("启用")} ${pluginTitle(plugin)}`} onChange={onToggle} /><span>{t(plugin.enabled === null ? "状态待确认" : plugin.enabled ? "已启用" : "已禁用")}</span></div>}
      {plugin.reason && <div className="dialog-note"><ServiceMessage value={plugin.reason} /></div>}
      {plugin.directory?.installUrl && plugin.installed && <div className="dialog-note"><ExternalLink href={plugin.directory.installUrl} target="_blank" rel="noopener noreferrer">{t('查看官方详情与授权')}</ExternalLink><span>{t(plugin.directory.connected ? '应用连接可用' : '请完成或核实账号授权')}</span></div>}
      {plugin.installed && plugin.installation && <div className="install-components"><strong>{t("附带技能（{v0}）", { v0: plugin.skillCount })}</strong><p className="field-hint">{t("这一版只读取 Claude 插件，附带技能不单独列出。")}</p></div>}
      {plugin.installed && !plugin.installation && <div className="install-components"><strong>{t("附带技能（{v0}）", { v0: skills.length })}</strong><div className="plugin-skill-list">{skills.map(skill => <button className="text-button" key={skill.id} onClick={() => onSkill(skill)}><ProviderIcon icon={skill.icon}><Sparkles size={15} /></ProviderIcon>{skill.name}<ChevronRight size={14} /></button>)}</div></div>}
      <p className="field-hint">{t("插件附带的技能与组件一起安装、更新和卸载。")}</p>
    </div><div className="modal-footer">{plugin.installed ? <><Button variant="danger" disabled={!plugin.canRemove || !!busy} onClick={onRemove}><Trash2 size={15} />{t("卸载")}</Button>{!plugin.installation && <Button disabled={!!busy} onClick={onUpdates}><RefreshCw size={15} />{t("管理更新")}</Button>}</> : <><Button onClick={onClose}>{t("关闭")}</Button><Button variant="primary" disabled={!plugin.canInstall || !!busy} onClick={onInstall}>{t("安装插件")}</Button></>}</div>
  </Inspector>;
}
function MarketCard({
  market,
  busy,
  onRefresh,
  onBrowse,
  onRemove,
  showAgents,
}: {
  showAgents: boolean;
  market: Marketplace;
  busy: string | null;
  onRefresh: () => void;
  onBrowse: () => void;
  onRemove: () => void;
}) {
  return (
    <article className="market-card">
      <ProviderIcon icon={market.icon} className="market-icon">
        {market.type.toLowerCase().includes("git") ? (
          <GitBranch size={24} strokeWidth={1.5} />
        ) : (
          <FolderOpen size={24} strokeWidth={1.5} />
        )}
      </ProviderIcon>
      <div className="market-content">
        <div className="market-title">
          <h3>{market.displayName || market.name}</h3>
          <Badge>
            {market.type === "local"
              ? t("本地目录")
              : market.type === "git"
                ? t("Git 仓库")
                : market.type}
          </Badge>
        </div>
        <code className="market-source">{market.source}</code>
        <div className="market-meta">
          <span>
            {market.pluginCount}
            {t("个插件")}
          </span>
          <span>
            {t("最近刷新：")}
            {formatDate(market.refreshedAt)}
          </span>
          <MarketAutoUpdate market={market} />
          {showAgents && <AgentBadges agents={market.agents} />}
        </div>
        <CompatibilityWarnings warnings={market.warnings} />
        {market.reason && (
          <div className="capability-reason">
            <CircleAlert size={13} />
            <ServiceMessage value={market.reason} />
          </div>
        )}
      </div>
      <div className="market-actions">
        <Button onClick={onBrowse}>
          {t("浏览插件")}
          <ArrowUpRight size={14} />
        </Button>
        <div>
          <button
            className="icon-button"
            aria-label={t("刷新来源 {v0}", { v0: market.name })}
            disabled={!market.canRefresh || !!busy}
            title={
              !market.canRefresh
                ? (market.reason ? t(market.reason) : undefined) ||
                  t("此来源不支持刷新")
                : t("刷新市场目录")
            }
            onClick={onRefresh}
          >
            {busy === `marketplace.refresh:${market.id}` ? (
              <Loader2 size={16} className="spin" />
            ) : (
              <RefreshCw size={16} />
            )}
          </button>
          <button
            className="icon-button danger-text"
            aria-label={t("移除来源 {v0}", { v0: market.name })}
            disabled={!market.canRemove || !!busy}
            title={
              !market.canRemove
                ? (market.reason ? t(market.reason) : undefined) ||
                  t("此来源由宿主管理")
                : t("移除来源")
            }
            onClick={onRemove}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </article>
  );
}

function SkillDetail({
  skill,
  mode,
  busy,
  onClose,
  onToggle,
  onRemove,
  onUpdate,
  onCopy,
  onPlugin,
  onDuplicates,
  onEditTags,
}: {
  skill: Skill;
  mode: Mode;
  busy: string | null;
  onClose: () => void;
  onToggle: () => void;
  onRemove: () => void;
  onUpdate: () => void;
  onCopy: (value: string) => void;
  onPlugin: () => void;
  onDuplicates: () => void;
  onEditTags: () => void;
}) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    setContent(null);
    void api<{ skill: Skill; content: string }>(
      `/api/skill?mode=${mode}&id=${encodeURIComponent(skill.id)}`,
      { signal: controller.signal },
    )
      .then((result) => setContent(result.content))
      .catch((error) => {
        if (error.name !== "AbortError") setError(error.message);
      });
    return () => controller.abort();
  }, [skill.id, mode, retry]);
  const { Icon, color } = skillVisual(skill.name);
  return (
    <Inspector title={t("技能详情")} onClose={onClose}>
      <div className="drawer-scroll">
        <div className="detail-hero">
          <ProviderIcon icon={skill.icon} className={`skill-icon tone-${color}`} large>
            <Icon size={28} strokeWidth={1.5} /></ProviderIcon>
          <h3>{skill.name}</h3>
          <p>{skill.description || t("未提供描述")}</p>
          <div>
            <Badge>{t(scopeLabels[skill.scope])}</Badge>
            {skill.version && <Badge>{skill.version}</Badge>}
            {skill.canUpdate && <Badge tone="green">{t("已记录来源")}</Badge>}
          </div>
        </div>
        <TagStrip subject={{ ...skill, kind: "skill" }} disabled={!!busy || !objectAgents(skill).includes("codex")} onEdit={onEditTags} />
        <div className="detail-state">
          <div>
            <strong>{t("启用状态")}</strong>
            <span>
              {skill.enabled === null
                ? t("尚未核实")
                : skill.enabled
                  ? t("配置已启用")
                  : t("配置已禁用")}
            </span>
          </div>
          <Toggle
            checked={skill.enabled}
            disabled={!skill.canToggle || !!busy}
            busy={busy === `skill.toggle:${skill.id}`}
            reason={skill.reason ? t(skill.reason) : undefined}
            label={`${skill.enabled ? t("禁用") : t("启用")} ${skill.name}`}
            onChange={onToggle}
          />
        </div>
        <section className="detail-section">
          <h4>{t("来源与位置")}</h4>
          <dl>
            <dt>{t("来源")}</dt>
            <dd>{t(skill.sourceLabel)}</dd>
            {skill.pluginId && (
              <>
                <dt>{t("所属插件")}</dt>
                <dd>
                  <button className="text-button break-all" onClick={onPlugin}>
                    {skill.pluginId}
                    <ArrowUpRight size={13} />
                  </button>
                </dd>
              </>
            )}
            <dt>{t("文件路径")}</dt>
            <dd className="path-value">
              <code>{skill.path}</code>
              <button
                className="icon-button"
                aria-label={t("复制技能路径")}
                onClick={() => onCopy(skill.path)}
              >
                <Copy size={14} />
              </button>
            </dd>
            {skill.realPath && skill.realPath !== skill.path && <><dt>{t("实际路径")}</dt><dd className="path-value"><code>{skill.realPath}</code><button className="icon-button" aria-label={t("复制实际路径")} onClick={() => onCopy(skill.realPath!)}><Copy size={14} /></button></dd></>}
            <dt>{t("状态证据")}</dt>
            <dd>
              <ServiceMessage value={skill.statusEvidence} />
            </dd>
          </dl>
          {skill.reason && (
            <div className="detail-note">
              <LockKeyhole size={14} />
              <ServiceMessage value={skill.reason} />
            </div>
          )}
          {!!skill.duplicateNames?.length && (
            <div className="detail-warning">
              <CircleAlert size={16} />
              <div>
                <strong>{t("发现同名技能")}</strong>
                <p>{t("请根据完整路径区分，操作只作用于当前技能。")}</p>
                <ul>
                  {skill.duplicateNames.map((value, index) => (
                    <li key={index}>{value}</li>
                  ))}
                </ul>
                <Button onClick={onDuplicates} disabled={!!busy}>{t("管理同名技能")}</Button>
              </div>
            </div>
          )}
          {!!skill.aliases?.length && (
            <details className="alias-details">
              <summary>
                {skill.aliases.length}
                {t("个路径别名")}
              </summary>
              {skill.aliases.map((alias) => (
                <code key={alias}>{alias}</code>
              ))}
            </details>
          )}
        </section>
        <section className="detail-section">
          <div className="detail-section-heading">
            <h4>SKILL.md</h4>
            <span>{t("只读预览")}</span>
          </div>
          {error ? (
            <div className="field-error" role="alert">
              <ServiceMessage value={error} error />
              <Button onClick={() => setRetry((value) => value + 1)}>
                {t("重试读取")}
              </Button>
            </div>
          ) : content === null ? (
            <div className="content-loading">
              <Loader2 className="spin" size={17} />
              {t("正在读取技能正文…")}
            </div>
          ) : (
            <pre className="skill-content">{content}</pre>
          )}
        </section>
      </div>
      <div className="drawer-footer">
        <Button
          disabled={!skill.canUpdate || !!busy}
          title={
            !skill.canUpdate
              ? t(skill.isLink ? "请在真实来源目录更新此链接技能。" : "仅对本应用追踪来源的独立技能提供更新")
              : undefined
          }
          busy={busy === `skill.checkUpdate:${skill.id}`}
          onClick={onUpdate}
        >
          <RefreshCw size={15} />
          {t("检查更新")}
        </Button>
        <Button
          variant="danger"
          disabled={!skill.canRemove || !!busy}
          title={
            !skill.canRemove
              ? (skill.reason ? t(skill.reason) : undefined) ||
                t("此技能由所属插件或宿主管理")
              : undefined
          }
          onClick={onRemove}
        >
          <Trash2 size={15} />
          {t(skill.removeKind === "link" ? "移除链接" : "移除技能")}
        </Button>
      </div>
    </Inspector>
  );
}

type ActionHandler = (
  request: Omit<ActionRequest, "mode">,
) => Promise<ActionResult | undefined>;
function MarketDialog({
  busy,
  action,
  agents,
  onClose,
}: {
  busy: string | null;
  action: ActionHandler;
  /** Agents whose management is enabled; a choice appears only with more than one. */
  agents: ("codex" | "claude")[];
  onClose: () => void;
}) {
  const [agent, setAgent] = useState<"codex" | "claude">(agents.includes("codex") || !agents.length ? "codex" : agents[0]);
  const [sourceType, setSourceType] = useState<"local" | "git">("local");
  const [source, setSource] = useState("");
  const [ref, setRef] = useState("");
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const result = await action({
        action: "marketplace.add",
        ...(creationAgent(agents, agent) ? { agent: creationAgent(agents, agent) } : {}),
        sourceType,
        source: source.trim(),
        ...(sourceType === "git" && agent === "codex" && ref.trim() ? { ref: ref.trim() } : {}),
      });
      if (result) onClose();
    } catch (error) {
      setError((error as Error).message);
    }
  }
  return (
    <Modal
      title={t("连接一个市场来源")}
      eyebrow="ADD A MARKETPLACE"
      onClose={onClose}
    >
      <form onSubmit={(event) => void submit(event)}>
        <div className="modal-body">
          <p className="dialog-description">
            {t(
              "添加包含 marketplace manifest 的目录或 Git 仓库。应用会核验来源，再读取其中的插件。",
            )}
          </p>
          <div className="source-choice">
            <button
              type="button"
              className={sourceType === "local" ? "selected" : ""}
              onClick={() => {
                setSourceType("local");
                setSource("");
              }}
            >
              <FolderOpen size={19} />
              <strong>{t("本地市场")}</strong>
            </button>
            <button
              type="button"
              className={sourceType === "git" ? "selected" : ""}
              onClick={() => {
                setSourceType("git");
                setSource("");
              }}
            >
              <GitBranch size={19} />
              <strong>{t("Git 市场")}</strong>
            </button>
          </div>
          <label className="field">
            <span>
              {sourceType === "local" ? t("市场目录路径") : t("Git 仓库地址")}
              <span className="required-dot">*</span>
            </span>
            <input
              required
              autoComplete="off"
              value={source}
              onChange={(event) => setSource(event.target.value)}
              placeholder={
                sourceType === "local"
                  ? "/Users/you/plugin-marketplace"
                  : "https://github.com/owner/marketplace.git"
              }
            />
          </label>
          {agents.length > 1 && (
            <div className="scope-choice" role="radiogroup" aria-label={t("添加到")}>
              {agents.map(item => <label key={item}><input type="radio" name="market-agent" checked={agent === item} onChange={() => setAgent(item)} />{t("添加到 {v0}", { v0: item === "codex" ? "Codex" : "Claude" })}</label>)}
            </div>
          )}
          {sourceType === "git" && agent === "codex" && (
            <label className="field">
              <span>
                {t("分支或标签")}
                <small>{t("可选")}</small>
              </span>
              <input
                autoComplete="off"
                value={ref}
                onChange={(event) => setRef(event.target.value)}
                placeholder={t("默认分支")}
              />
            </label>
          )}
          {sourceType === "git" && <GitAccessHelp />}
          <div className="dialog-note">
            <Package size={16} />
            <p>{t("添加来源后，可以前往「插件」浏览并选择要安装的内容。")}</p>
          </div>
          {error && (
            <div className="field-error" role="alert">
              <CircleAlert size={16} />
              <ServiceMessage value={error} error />
            </div>
          )}
        </div>
        <div className="modal-footer">
          <Button type="button" onClick={onClose} disabled={!!busy}>
            {t("取消")}
          </Button>
          <Button
            type="submit"
            variant="primary"
            busy={!!busy}
            disabled={!source.trim()}
          >
            <Plus size={15} />
            {t("添加来源")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function ConfirmDialog({
  dialog,
  busy,
  action,
  onClose,
}: {
  dialog: Extract<Dialog, { type: "confirm" }>;
  busy: string | null;
  action: ActionHandler;
  onClose: () => void;
}) {
  const [error, setError] = useState("");
  async function confirm() {
    setError("");
    try {
      if (await action(dialog.request)) onClose();
    } catch (error) {
      setError((error as Error).message);
    }
  }
  return (
    <Modal title={dialog.title} eyebrow="REVIEW YOUR ACTION" onClose={onClose}>
      <div className="modal-body">
        <p className="dialog-description">{dialog.description}</p>
        <div className="confirm-target">
          <Folder size={17} />
          <code>{dialog.target}</code>
        </div>
        {!!dialog.affected?.length && (
          <div className="affected-list">
            <h3>
              {dialog.affectedTitle ? t(dialog.affectedTitle) : t("受影响的技能（")}
              {dialog.affectedTitle ? null : <>{dialog.affected.length}）</>}
            </h3>
            <ul>
              {dialog.affected.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        )}
        {error && (
          <div className="field-error" role="alert">
            <CircleAlert size={16} />
            <ServiceMessage value={error} error />
          </div>
        )}
      </div>
      <div className="modal-footer">
        <Button onClick={onClose} disabled={!!busy}>
          {t("取消")}
        </Button>
        <Button
          variant={dialog.danger ? "danger" : "primary"}
          busy={!!busy}
          onClick={() => void confirm()}
        >
          {dialog.danger ? <Trash2 size={15} /> : <Check size={15} />}
          {dialog.label}
        </Button>
      </div>
    </Modal>
  );
}
function UpdateDialog({
  preview,
  busy,
  action,
  onClose,
}: {
  preview: UpdatePreview;
  busy: string | null;
  action: ActionHandler;
  onClose: () => void;
}) {
  const [error, setError] = useState("");
  async function update() {
    setError("");
    try {
      if (
        await action({
          action: "skill.update",
          id: preview.skillId,
          previewId: preview.id,
        })
      )
        onClose();
    } catch (error) {
      setError((error as Error).message);
    }
  }
  return (
    <Modal
      title={preview.available ? t("查看这次更新") : t("已与来源保持一致")}
      eyebrow="REVIEW CHANGES"
      wide
      onClose={onClose}
    >
      <div className="modal-body">
        <div className="update-preview-title">
          <span className="skill-icon tone-1">
            {preview.available ? (
              <GitBranch size={22} />
            ) : (
              <CheckCheck size={22} />
            )}
          </span>
          <div>
            <h3>{preview.name}</h3>
            <ServiceMessage value={preview.message} />
          </div>
        </div>
        {preview.changes.length > 0 && (
          <div className="change-list">
            {preview.changes.map((change) => (
              <div key={change.path}>
                <span className={`change-kind change-${change.type}`}>
                  {
                    {
                      added: t("新增"),
                      modified: t("修改"),
                      removed: t("移除"),
                    }[change.type]
                  }
                </span>
                <code>{change.path}</code>
              </div>
            ))}
          </div>
        )}
        {preview.available && <DiffBrowser key={preview.id} previewId={preview.id} changes={preview.changes} execute={action} />}
        {preview.available && (
          <div className="dialog-note">
            <ShieldCheck size={16} />
            <p>
              {t(
                "更新前保留旧版本。若本地文件已被修改，会停止更新并提示冲突。",
              )}
            </p>
          </div>
        )}
        {error && (
          <div className="field-error" role="alert">
            <CircleAlert size={16} />
            <ServiceMessage value={error} error />
          </div>
        )}
      </div>
      <div className="modal-footer">
        <Button onClick={onClose} disabled={!!busy}>
          {preview.available ? t("暂不更新") : t("完成")}
        </Button>
        {preview.available && (
          <Button variant="primary" busy={!!busy} onClick={() => void update()}>
            <ArrowDownToLine size={15} />
            {t("确认更新")}
          </Button>
        )}
      </div>
    </Modal>
  );
}

function PreferencesDialog({ onClose }: { onClose: () => void }) {
  const current = usePreferences();
  const [downloadError, setDownloadError] = useState("");
  function download(name: "license" | "source") {
    setDownloadError("");
    void openDownload(name).catch(error => setDownloadError(error.message));
  }
  return (
    <Modal title={t("外观与语言")} eyebrow="PREFERENCES" onClose={onClose}>
      <div className="modal-body preferences-body">
        <fieldset className="preference-group">
          <legend>{t("外观")}</legend>
          <p>{t("选择浅色、深色，或跟随系统外观。")}</p>
          <div className="theme-options">
            {(
              [
                { value: "light", label: t("浅色"), Icon: Sun },
                { value: "dark", label: t("深色"), Icon: Moon },
                { value: "system", label: t("跟随系统"), Icon: Monitor },
              ] as const
            ).map(({ value, label, Icon }) => (
              <button
                key={value}
                aria-pressed={current.theme === value}
                className={current.theme === value ? "selected" : ""}
                onClick={() => setPreferences({ theme: value as Theme })}
              >
                <Icon size={21} />
                <span>{t(label)}</span>
                {current.theme === value && <Check size={13} />}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="material-preference"><span><strong>{t("减少透明度")}</strong><small>{t("使用实色背景，让文字和控件更加清晰。")}</small></span><input type="checkbox" checked={current.reduceTransparency} onChange={event => setPreferences({ reduceTransparency: event.target.checked })} /></label>
        <fieldset className="preference-group">
          <legend>{t("界面语言")}</legend>
          <p>{t("技能名称、描述、正文及外部来源内容保留原文。")}</p>
          <label className="field">
            <span>{t("选择语言")}</span>
            <select
              value={current.language}
              onChange={(event) =>
                setPreferences({ language: event.target.value as Language })
              }
            >
              <option value="zh">{t("中文")}</option>
              <option value="en">English</option>
              <option value="ja">{t("日本語")}</option>
            </select>
          </label>
        </fieldset>
        <div className="preference-note">
          <Check size={15} />
          {t("偏好自动保存在当前浏览器，重新打开后继续生效。")}
        </div>
        <section className="license-panel">
          <h3>{t("开放源代码")}</h3>
          <p className="license-copyright">Copyright © 2026 Testany</p>
          <p>
            {t(
              "本软件使用 AGPL-3.0-only 许可证。源码包仅包含本软件，不包含本机技能、配置或应用数据。",
            )}
          </p>
          <p>
            {t(
              "本软件不提供担保。你可以依照 AGPL-3.0-only 的条款复制、修改和再分发；完整条款见许可证。",
            )}
          </p>
          <div>
            <a
              className="button button-secondary"
              href="/api/license"
              onClick={nativeMode ? event => { event.preventDefault(); download("license"); } : undefined}
              target="_blank"
              rel="noopener noreferrer"
            >
              <FileText size={15} />
              {t("许可证")}
            </a>
            <a className="button button-secondary" href="/api/source" download onClick={nativeMode ? event => { event.preventDefault(); download("source"); } : undefined}>
              <Download size={15} />
              {t("对应源码")}
            </a>
          </div>
          {downloadError && <div role="alert"><ServiceMessage value={downloadError} error /></div>}
        </section>
      </div>
      <div className="modal-footer">
        <Button onClick={onClose} variant="primary">
          {t("完成")}
        </Button>
      </div>
    </Modal>
  );
}

function SkillReason({
  skill,
  onDetails,
  onPlugin,
  onDuplicates,
}: {
  skill: Skill;
  onDetails: () => void;
  onPlugin: () => void;
  onDuplicates: () => void;
}) {
  const duplicate = !!skill.duplicateNames?.length;
  const unknown = skill.enabled === null;
  if (!duplicate && !unknown) return null;
  return (
    <div
      className={classNames(
        "skill-reason",
        (duplicate || unknown) && "skill-reason-attention",
      )}
    >
      <div>
        {duplicate || unknown ? (
          <CircleAlert size={13} />
        ) : (
          <LockKeyhole size={13} />
        )}
        <span>
          {duplicate
            ? t("存在同名技能，请按路径区分。")
            : unknown
              ? t("安装或启用状态尚未核实。")
              : skill.pluginId
                ? t("随所属插件统一管理。")
                : t("由系统或宿主管理。")}
        </span>
      </div>
      <button
        className="text-button"
        onClick={
          duplicate ? onDuplicates : skill.pluginId && !unknown ? onPlugin : onDetails
        }
      >
        {duplicate ? t("管理同名技能") : skill.pluginId && !unknown
          ? t("查看所属插件")
          : t("查看路径与状态证据")}
        <ChevronRight size={12} />
      </button>
      {skill.reason && (
        <details>
          <summary>{t("详细原因")}</summary>
          <ServiceMessage value={skill.reason} />
        </details>
      )}
    </div>
  );
}
