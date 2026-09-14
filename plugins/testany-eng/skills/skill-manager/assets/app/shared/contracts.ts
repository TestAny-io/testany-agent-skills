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
  }[];
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
  version?: string;
  /** Owned by a plugin/host or otherwise protected; this does not indicate provenance tracking. */
  managed: boolean;
  duplicateNames?: string[];
  aliases?: string[];
  canToggle: boolean;
  canRemove: boolean;
  canUpdate: boolean;
  reason?: string;
  statusEvidence: string;
  updatedAt?: string;
  sourceInfo?: SourceInfo;
}
export interface Plugin {
  id: string;
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
  createdAt: string;
  status: "success" | "error";
  message: string;
  canRestore: boolean;
}
export interface Snapshot {
  mode: Mode;
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
}
export interface InstallPreview {
  id: string;
  name: string;
  description: string;
  target: string;
  source: string;
  files: number;
  bytes: number;
}
export interface UpdatePreview {
  id: string;
  skillId: string;
  name: string;
  available: boolean;
  changes: FileChange[];
  message: string;
}
export type Action =
  | "skill.toggle"
  | "skill.previewInstall"
  | "skill.install"
  | "skill.checkUpdate"
  | "skill.update"
  | "skill.remove"
  | "activity.restore"
  | "plugin.install"
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
  enabled?: boolean;
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
  message: string;
  preview?: InstallPreview;
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
