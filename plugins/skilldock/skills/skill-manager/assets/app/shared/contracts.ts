export type Mode = "local" | "sandbox";
export type Scope = "user" | "project" | "system" | "plugin" | "cache";
export interface SourceInfo {
  kind: "tracked" | "git-checkout" | "plugin" | "system" | "unknown";
  confidence: "verified" | "inferred" | "user-confirmed" | "unknown";
  owner: string;
  label: string;
  evidence: string;
  source?: string;
  sourceType?: "local" | "git";
  subpath?: string;
  ref?: string;
  commit?: string;
  marketplace?: string;
  pluginId?: string;
  ownerVersion?: string;
  helpUrl?: string;
}
export interface UpdateTarget {
  kind: "skill" | "plugin" | "host";
  id: string;
}
export interface FileChange {
  path: string;
  type: "added" | "modified" | "removed";
}
export interface FileDiff extends FileChange {
  status: "text" | "binary" | "symlink" | "too-large" | "too-complex";
  additions?: number;
  deletions?: number;
  truncated?: boolean;
  hunks: { oldStart: number; oldLines: number; newStart: number; newLines: number;
    lines: { kind: "added" | "removed" | "context" | "note"; content: string; oldLine?: number; newLine?: number }[] }[];
}
export interface UpdateItem {
  target: UpdateTarget;
  name: string;
  owner: string;
  route:
    | "skill-source"
    | "plugin-reinstall"
    | "owner-managed"
    | "connect-source";
  status: "unchecked" | "current" | "available" | "blocked" | "error";
  canCheck: boolean;
  canApply: boolean;
  canAutoApply: boolean;
  message: string;
  reasonCode?: string;
  checkedAt?: string;
  previewId?: string;
  installedVersion?: string;
  availableVersion?: string;
  /** The CLI installed and verified this version while refreshing its Git marketplace. */
  updatedDuringCheck?: boolean;
  changes?: FileChange[];
  sourceInfo?: SourceInfo;
  installedPath?: string;
  affectedSkillIds?: string[];
}
export interface UpdateProgress {
  id: string;
  trigger: UpdateRun["trigger"];
  startedAt: string;
  finishedAt?: string;
  status: UpdateRun["status"];
  phase: "preparing" | "checking" | "applying" | "finalizing" | "finished";
  total: number | null;
  completed: number;
  current?: { target: UpdateTarget; name: string };
  counts: Record<"current" | "updated" | "available" | "skipped" | "error", number>;
}
export interface UpdateRun {
  id: string;
  trigger: "manual" | "scheduled" | "catch-up";
  startedAt: string;
  finishedAt?: string;
  status: "running" | "success" | "partial" | "error";
  items: {
    target: UpdateTarget;
    name: string;
    status: "current" | "updated" | "available" | "skipped" | "error";
    message: string;
    reasonCode?: string;
    occurredAt?: string;
    installedVersion?: string;
    availableVersion?: string;
  }[];
}
export interface BackgroundUpdateStatus {
  provider: "launchd";
  status: "ready" | "off" | "stopping" | "blocked" | "unregistered" | "unverified" | "error" | "unsupported";
  lastWakeAt?: string;
  retryAt?: string;
  lastFinishedAt?: string;
  lastError?: string;
  lastErrorAt?: string;
  outcome?: string;
}
export interface UpdateSchedule {
  enabled: boolean;
  intervalMinutes: number;
  timezone: string;
  autoApply: boolean;
  /** Explicit targets only; newly discovered targets are never silently added. */
  targets: UpdateTarget[];
  nextRunAt?: string;
  lastRunAt?: string;
  lastOutcome?: UpdateRun["status"];
  lastSuccessAt?: string;
  failureCount?: number;
  background?: BackgroundUpdateStatus;
  running: boolean;
}
export type ScheduleInput = Pick<
  UpdateSchedule,
  "enabled" | "intervalMinutes" | "timezone" | "autoApply" | "targets"
>;
export interface SourcePreview {
  id: string;
  skillId: string;
  name: string;
  source: string;
  subpath?: string;
  ref?: string;
  commit?: string;
  target: string;
  matchesInstalled: boolean;
  changes: FileChange[];
}
export interface Skill {
  id: string;
  name: string;
  description: string;
  path: string;
  scope: Scope;
  sourceLabel: string;
  enabled: boolean | null;
  pluginId?: string;
  /** Path within a verified plugin, independent of its versioned installation directory. */
  packagePath?: string;
  tags?: string[];
  version?: string;
  /** Owned by a plugin/host or otherwise protected; this does not indicate provenance tracking. */
  managed: boolean;
  duplicateNames?: string[];
  aliases?: string[];
  isLink?: boolean;
  canToggle: boolean;
  canRemove: boolean;
  canUpdate: boolean;
  reason?: string;
  statusEvidence: string;
  updatedAt?: string;
  sourceInfo?: SourceInfo;
}
export interface Plugin {
  directSource?: { source: string; sourceType: "local" | "git"; subpath?: string; ref?: string; commit?: string };
  id: string;
  tags?: string[];
  name: string;
  description: string;
  marketplace: string;
  version?: string;
  installed: boolean;
  enabled: boolean | null;
  skillCount: number;
  sourcePath?: string;
  canInstall: boolean;
  canRemove: boolean;
  canToggle: boolean;
  reason?: string;
  sourceInfo?: SourceInfo;
}
export interface Marketplace {
  displayName?: string;
  direct?: boolean;
  id: string;
  name: string;
  source: string;
  type: string;
  pluginCount: number;
  canRemove: boolean;
  canRefresh: boolean;
  reason?: string;
  refreshedAt?: string;
}
export interface Activity {
  id: string;
  action: string;
  target: string;
  path?: string;
  createdAt: string;
  status: "success" | "error";
  message: string;
  canRestore: boolean;
}
export interface ProjectContext {
  requested: string;
  effective: string;
  source: "argument" | "environment" | "saved" | "working-directory";
  workingDirectory: string;
  warnings: string[];
}
export interface ProjectCatalog {
  entries: { name: string; path: string; source: "codex" | "recent" | "current"; available: boolean }[];
  canChooseDirectory: boolean;
  warning?: string;
}
export interface Snapshot {
  mode: Mode;
  projectContext?: ProjectContext;
  projects?: ProjectCatalog;
  skills: Skill[];
  plugins: Plugin[];
  marketplaces: Marketplace[];
  activity: Activity[];
  diagnostics: string[];
  scannedAt: string;
  durationMs: number;
  cli: { available: boolean; version?: string; path?: string; error?: string };
  paths: { skills: string; config: string; state: string; project: string };
  examples?: {
    skillSource: string;
    marketplaceSource: string;
    gitSource?: string;
    legacySource?: string;
  };
  updates?: UpdateItem[];
  schedule?: UpdateSchedule;
  updateRuns?: UpdateRun[];
  updateProgress?: UpdateProgress | null;
}
export interface InstallPreview {
  id: string;
  name: string;
  description: string;
  target: string;
  source: string;
  subpath?: string;
  ref?: string;
  commit?: string;
  files: number;
  bytes: number;
}
export interface PluginInstallPreview {
  id: string;
  name: string;
  version: string;
  description: string;
  source: string;
  sourceType: "local" | "git";
  subpath?: string;
  ref?: string;
  commit?: string;
  skills: string[];
  components: string[];
  files: number;
  bytes: number;
  duplicates: string[];
}
export interface UpdatePreview {
  id: string;
  skillId: string;
  name: string;
  available: boolean;
  changes: FileChange[];
  message: string;
}
export interface RemovalPreview {
  id: string;
  name: string;
  remove: Skill[];
  keep: Skill[];
}
export type Action =
  | "tags.set"
  | "skill.previewRemoval"
  | "skill.removeSelected"
  | "preview.diff"
  | "project.select"
  | "project.chooseDirectory"
  | "skill.toggle"
  | "skill.previewInstall"
  | "skill.install"
  | "skill.checkUpdate"
  | "skill.update"
  | "skill.remove"
  | "activity.restore"
  | "plugin.install"
  | "plugin.previewInstall"
  | "plugin.installSource"
  | "plugin.remove"
  | "plugin.toggle"
  | "marketplace.add"
  | "marketplace.refresh"
  | "marketplace.remove"
  | "skill.previewSource"
  | "skill.connectSource"
  | "update.check"
  | "update.apply"
  | "updates.run"
  | "schedule.configure";
export interface ActionRequest {
  mode: Mode;
  action: Action;
  id?: string;
  ids?: string[];
  groupName?: string;
  tags?: string[];
  enabled?: boolean;
  projectDir?: string;
  path?: string;
  sourceType?: "local" | "git";
  source?: string;
  subpath?: string;
  ref?: string;
  previewId?: string;
  name?: string;
  target?: UpdateTarget;
  targets?: UpdateTarget[];
  autoApply?: boolean;
  schedule?: ScheduleInput;
}
export interface ActionResult {
  removalPreview?: RemovalPreview;
  diff?: FileDiff;
  projectContext?: ProjectContext;
  selectedDirectory?: string | null;
  message: string;
  preview?: InstallPreview;
  pluginPreview?: PluginInstallPreview;
  update?: UpdatePreview;
  needsReload?: boolean;
  sourcePreview?: SourcePreview;
  updateItem?: UpdateItem;
  run?: UpdateRun;
  schedule?: UpdateSchedule;
}
export interface ApiError {
  error: { code: string; message: string };
}
