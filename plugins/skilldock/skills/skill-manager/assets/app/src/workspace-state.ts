export type WorkspacePage = "skills" | "plugins" | "markets" | "updates" | "activity" | "agents";
export type Inspection = { kind: "skill" | "plugin"; id: string } | null;
export interface WorkspaceState {
  page: WorkspacePage;
  queries: Record<WorkspacePage, string>;
  scope: string;
  duplicatesOnly: boolean;
  skillTags: string[];
  pluginTags: string[];
  metric: "all" | "enabled" | "standalone" | "attention";
  view: "grid" | "list";
  pluginFilter: "installed" | "available" | "all" | "enabled";
  marketFilter: string;
  inspection: Inspection;
  scroll: Partial<Record<WorkspacePage, number>>;
  sidebarCollapsed: boolean;
}
const key = "skilldock.workspace.v1";
const pages: WorkspacePage[] = ["skills", "plugins", "markets", "updates", "activity", "agents"];
export function loadWorkspace(): WorkspaceState {
  let saved: Partial<WorkspaceState> = {};
  try { saved = JSON.parse(localStorage.getItem(key) || "{}") || {}; } catch { /* Optional view state. */ }
  const string = (value: unknown, fallback: string) => typeof value === "string" ? value : fallback;
  const strings = (value: unknown) => Array.isArray(value) ? value.filter((v): v is string => typeof v === "string").slice(0, 100) : [];
  return {
    page: pages.includes(saved.page!) ? saved.page! : "skills",
    queries: Object.fromEntries(pages.map(page => [page, string(saved.queries?.[page], "")])) as WorkspaceState["queries"],
    scope: string(saved.scope, "all"), duplicatesOnly: saved.duplicatesOnly === true,
    skillTags: strings(saved.skillTags), pluginTags: strings(saved.pluginTags),
    metric: ["all", "enabled", "standalone", "attention"].includes(saved.metric!) ? saved.metric! : "all",
    view: saved.view === "grid" ? "grid" : "list",
    pluginFilter: ["installed", "available", "all", "enabled"].includes(saved.pluginFilter!) ? saved.pluginFilter! : "installed",
    marketFilter: string(saved.marketFilter, "all"),
    inspection: saved.inspection && ["skill", "plugin"].includes(saved.inspection.kind) && typeof saved.inspection.id === "string" ? saved.inspection : null,
    scroll: Object.fromEntries(pages.map(page => [page, Math.max(0, Number.isFinite(saved.scroll?.[page]) ? saved.scroll![page]! : 0)])),
    sidebarCollapsed: saved.sidebarCollapsed === true,
  };
}
export function saveWorkspace(value: WorkspaceState) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* The interface also works with storage disabled. */ }
}
