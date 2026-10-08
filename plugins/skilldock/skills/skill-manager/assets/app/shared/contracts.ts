export type Mode = "local" | "sandbox";
export type Scope = "user" | "project" | "system" | "plugin" | "cache";
/** Cross-agent types follow API-SDX-001 36c. Absent agent fields mean Codex (API version 1). */
export type Agent = "codex" | "claude";
export type AgentManagement = "enabled" | "read-only" | "unconfirmed";
export type ClaudeSettingsLayer = "user" | "project" | "local" | "managed";
export type ClaudePluginScope = ClaudeSettingsLayer;
export type SkillVisibility = "enabled" | "disabled" | "name-only" | "user-invocable-only";
export type Protection = "managed" | "synced" | "system";
export interface AgentEnvironment {
  agent: Agent;
  /** Computed on every discovery; never persisted. */
  installed: boolean;
  management: AgentManagement;
  reason?: string;
  roots: { config: string; pluginCache: string; skills: string; origin?: "explicit" | "session" | "default" };
  cli: { available: boolean; version?: string; path?: string; error?: string };
  skilldock?: { version: string; running: boolean; canUpdate: boolean; reason?: string };
  /** Known host behaviour, e.g. desktop sessions disabling plugin auto-update. */
  notes?: string[];
}
/** Claude plugin installation identity (DEC-SDX-023); object IDs, targets and bindings derive from it. */
export interface ClaudeInstallation {
  scope: ClaudePluginScope;
  projectPath?: string;
  /** Directory of a skills-directory plugin (name@skills-dir). */
  skillsDir?: string;
  readOnlyReason?: string;
}
/** Which settings layer decides a plugin's enablement or a skill's visibility. */
export interface EnablementSource {
  decidedBy: ClaudeSettingsLayer | "default";
  overriddenBy?: Exclude<ClaudeSettingsLayer, "user">;
  /** Forced by managed settings or required by the organisation; cannot be disabled. */
  locked?: boolean;
}
/** Native host rule carried by previews, confirmations and CONFIRMATION_REQUIRED errors. */
export interface NativeRule {
  kind: "scope" | "dependencies" | "affected-plugins" | "data-removal" | "visibility" | "reload";
  message: string;
  items?: string[];
}
/** One side of a skill directory discovered by both agents; the sides are independent. */
export interface SkillSide {
  path: string;
  scope: Scope;
  enabled: boolean | null;
  visibility?: SkillVisibility;
  enablement?: EnablementSource;
  canToggle: boolean;
  canRemove: boolean;
  canUpdate: boolean;
  /** Present only when canRemove is true. */
  removeKind?: "link" | "directory";
  reason?: string;
  protection?: Protection;
  /** Lets the UI tell which side changed; writes send the object's top-level revision. */
  revision?: string;
}
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
  agent?: Agent;
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
  agent?: Agent;
  warnings?: string[];
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
export interface ProviderIcon {
  /** Known plugin identity, resolved by the backend; never an arbitrary URL. */
  remote?: string;
  small?: string;
  large?: string;
  dark?: string;
}
export type IconAssets = Record<string, string>;

export interface Skill {
  /** Non-empty and sorted; absent means ["codex"]. */
  agents?: Agent[];
  /** Claude-only skills. */
  visibility?: SkillVisibility;
  enablement?: EnablementSource;
  /** Shared skills only, and only for multi-agent clients; top-level fields describe the Codex side. */
  perAgent?: Partial<Record<Agent, SkillSide>>;
  revision?: string;
  protection?: Protection;
  icon?: ProviderIcon;
  id: string;
  name: string;
  description: string;
  path: string;
  realPath?: string;
  configPath?: string;
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
  removeKind?: "link" | "directory";
  canToggle: boolean;
  canRemove: boolean;
  canUpdate: boolean;
  reason?: string;
  statusEvidence: string;
  updatedAt?: string;
  sourceInfo?: SourceInfo;
}
export interface Plugin {
  agents?: Agent[];
  installation?: ClaudeInstallation;
  enablement?: EnablementSource;
  /** Agents for which the plugin ships its own manifest (compatibility evidence). */
  manifests?: Agent[];
  revision?: string;
  protection?: Protection;
  warnings?: string[];
  icon?: ProviderIcon;
  directSource?: { source: string; sourceType: "local" | "git"; subpath?: string; ref?: string; commit?: string };
  id: string;
  tags?: string[];
  name: string;
  displayName?: string;
  keywords?: string[];
  directory?: { appId: string; installUrl?: string; connected: boolean; installPolicy?: string; authPolicy?: string };
  description: string;
  marketplace: string;
  version?: string;
  installed: boolean;
  enabled: boolean | null;
  skillCount: number;
  sourcePath?: string;
  installedPath?: string;
  realPath?: string;
  canInstall: boolean;
  canRemove: boolean;
  canToggle: boolean;
  reason?: string;
  sourceInfo?: SourceInfo;
}
export interface Marketplace {
  agents?: Agent[];
  /** Claude marketplaces: actual auto-update value, whether it is the default, and host notes. */
  autoUpdate?: { enabled: boolean; isDefault: boolean; note?: string };
  revision?: string;
  warnings?: string[];
  /** Only a direct single-plugin source inherits that plugin’s branding. */
  icon?: ProviderIcon;
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
  agent?: Agent;
  id: string;
  action: string;
  target: string;
  path?: string;
  createdAt: string;
  status: "success" | "error";
  message: string;
  reasonCode?: string;
  canRestore: boolean;
}
export interface ProjectContext {
  requested: string;
  effective: string;
  /** "record" and "home" appear only in the 0.10.x handover fallback (API-SDX-001 36b §6.3). */
  source: "argument" | "environment" | "saved" | "record" | "home" | "working-directory";
  workingDirectory: string;
  warnings: string[];
}
export interface ProjectCatalog {
  entries: { name: string; path: string; source: "codex" | "recent" | "current"; available: boolean }[];
  canChooseDirectory: boolean;
  warning?: string;
}
export interface Snapshot {
  /** Returned only when the client requests multiAgent=1. */
  agents?: AgentEnvironment[];
  directoryError?: string;
  iconAssets?: IconAssets;
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
  paths: { skills: string; config: string; state: string; project: string; cache?: string };
  locations?: { directory: string; real: string | null; scope: string; label: string }[];
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
  iconAssets?: IconAssets;
  icon?: ProviderIcon;
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
  agent?: Agent;
  scopes?: ClaudePluginScope[];
  defaultScope?: ClaudePluginScope;
  dependencies?: { id: string; name: string; installed: boolean }[];
  manifests?: Agent[];
  nativeRules?: NativeRule[];
  warnings?: string[];
  iconAssets?: IconAssets;
  icon?: ProviderIcon;
  id: string;
  name: string;
  version: string;
  description: string;
  source: string;
  sourceType: "local" | "git" | "remote";
  remote?: { appId: string; name: string; description: string; installUrl: string };
  subpath?: string;
  ref?: string;
  commit?: string;
  skills: string[];
  skillDetails: { path: string; name: string; description: string; icon?: ProviderIcon }[];
  canSelectSkills: boolean;
  marketplace?: string;
  pluginId?: string;
  components: string[];
  files?: number;
  bytes?: number;
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
  | "plugin.previewMarketplace"
  | "plugin.connectionStatus"
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
  | "schedule.configure"
  | "agent.setManagement"
  | "agent.updateSkilldock"
  | "settings.setClaudeRoot"
  | "settings.setNodePath"
  | "settings.redetectNode";
export interface ActionRequest {
  mode: Mode;
  action: Action;
  /** Present on every multi-agent (API version 2) write; absent means an API version 1 Codex request. */
  agent?: Agent;
  scope?: "user" | "project" | "local";
  confirm?: boolean;
  gitExclude?: boolean;
  keepData?: boolean;
  expectedRevision?: string;
  management?: Exclude<AgentManagement, "unconfirmed">;
  claudeRoot?: { configDir: string; pluginCacheDir: string };
  nodePath?: string;
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
  enabledSkills?: string[];
  name?: string;
  target?: UpdateTarget;
  targets?: UpdateTarget[];
  autoApply?: boolean;
  schedule?: ScheduleInput;
}
export interface ActionResult {
  agent?: Agent;
  nativeRules?: NativeRule[];
  warnings?: string[];
  remoteInstall?: { id: string; name: string; installed: boolean; connected: boolean; installUrl?: string };
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
  /** nativeRules appears only with CONFIRMATION_REQUIRED. */
  error: { code: string; message: string; nativeRules?: NativeRule[] };
}
/** GET /api/health (API-SDX-001 36c §4). Fields marked frozen are read by 0.10.2 and 0.10.3. */
export interface HealthResponse {
  /** Frozen. */
  app: "skilldock";
  pid: number;
  instanceId: string;
  state: string;
  sourceDigest?: string;
  project: string;
  launchProject: string;
  appVersion: string;
  apiVersion: number;
  dataGeneration: number;
  /** Frozen for API version 1 clients: absent, null or the 0.10.x restart status. */
  restart?: { id: string; status: "preparing" | "restarting" | "ready" | "failed"; message?: string; restored?: boolean } | null;
  /** Not frozen. */
  projectContext?: ProjectContext | null;
  minimumCompatibleGeneration?: number;
  installations?: { agent: Agent; marketplace: string; version: string; running: boolean }[];
}
