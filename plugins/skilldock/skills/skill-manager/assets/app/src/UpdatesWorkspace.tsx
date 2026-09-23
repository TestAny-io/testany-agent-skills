import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  Clock3,
  Link2,
  RefreshCw,
  Search,
  Settings2,
} from "lucide-react";
import type {
  ActionRequest,
  ActionResult,
  ScheduleInput,
  Skill,
  Snapshot,
  SourcePreview,
  UpdateItem,
  UpdateTarget,
} from "../shared/contracts";
import { Modal } from "./Modal";
import { ServiceMessage, t as translate } from "./i18n";
import { UpdateProgress } from "./UpdateProgress";
import { SourceProvenance } from "./SourceProvenance";
import { DiffBrowser } from "./DiffBrowser";
import { GitSourceFields, ResolvedGitSource } from "./GitSourceFields";
import "./UpdatesWorkspace.css";

type Language = "zh" | "en" | "ja";
const copy = {
  zh: {
    checkOnly: "仅检查更新",
    autoMode: "检查并自动应用",

    bundledManager: "Codex 内置插件",
    runtimeManager: "Codex 工作区运行时",
    remoteManager: "Codex 远程插件管理器",
    marketplace: "市场",

    sourceRequired: "请填写来源路径或 Git 地址。",
    added: "新增",
    removed: "删除",
    modified: "修改",
    pluginManager: "Codex 插件管理器",
    gitWorkspace: "Git 工作区",
    userManager: "用户",

    title: "全部更新渠道",
    intro:
      "已有安装也在这里。技能随自己的来源更新，插件附带技能随整个插件更新。",
    checkAll: "检查全部",
    search: "搜索更新对象",
    empty: "没有匹配的更新对象",
    schedule: "自动更新",
    scheduleIntro: "选好对象与周期，后台会定时检查，并按你的设置自动应用更新。",
    configure: "设置计划",
    background: "后台任务",
    backgroundReady: "运行正常",
    backgroundOff: "未注册",
    backgroundStopping: "正在停止",
    backgroundBlocked: "已被 macOS 禁用",
    backgroundUnregistered: "未成功注册，请重新保存计划",
    backgroundUnverified: "尚未确认执行，请检查后台权限或重新保存计划",
    backgroundError: "执行失败，需要处理",
    backgroundUnsupported: "此系统暂不支持后台任务",
    backgroundWake: "最近唤起",
    backgroundConsent: "开启后会注册当前用户的 macOS 后台任务。关闭计划会移除任务，当前单项完成后停止。",
    lastSuccess: "上次成功检查",
    retrying: "失败后将按退避时间重试",

    on: "已启用",
    off: "未启用",
    running: "正在运行",
    next: "下次运行",
    last: "上次运行",
    none: "尚未记录",
    lifecycle:
      "由 macOS 在后台按需执行，完成即退出；无需打开 SkillDock 或 Codex。重启并登录后自动恢复，休眠或离线错过的检查会补做。实际开始时间可能比计划晚最多约 5 分钟。",
    interval: "检查周期（小时）",
    customInterval: "自定义间隔（小时）",
    hours: "小时",
    customHint: "支持小数，例如0.25、1.5或2小时。",
    hourly: "每小时",
    daily: "每24小时",
    weekly: "每168小时",
    custom: "自定义",
    zone: "显示时区",
    enable: "启用这个计划",
    auto: "发现更新后自动应用",
    autoHelp:
      "仅更新所选对象。存在本地修改、来源或安装身份变化时跳过并保留原因；新增安装不会自动加入。",
    targets: "更新对象",
    selectAll: "选择当前全部可用对象",
    clear: "清空选择",
    save: "保存计划",
    cancel: "取消",
    noTargets: "启用计划前至少选择一个可更新对象。",
    intervalError: "请输入0.25至168小时，且换算后须为整数分钟。",
    selected: "已选择",
    allTargets: "个对象",
    settingsMissing: "服务未返回计划状态，请刷新清单。",
    path: "安装位置",
    source: "更新来源",
    owner: "管理器",
    version: "已安装版本",
    latest: "来源版本",
    evidence: "来源证据",
    unknown: "未提供",
    affected: "附带技能",
    details: "查看详情",
    check: "检查更新",
    apply: "确认更新",
    preview: "更新预览",
    current: "已是最新",
    available: "有可用更新",
    unchecked: "尚未检查",
    blocked: "需要处理",
    error: "检查失败",
    "skill-source": "按技能更新",
    "plugin-reinstall": "按整个插件更新",
    "owner-managed": "由宿主管理",
    "connect-source": "需要关联来源",
    connect: "关联更新来源",
    connectIntro:
      "为已有技能补充更新来源。先比较来源与已安装内容；确认关联只保存来源与当前基线，不立即替换文件。",
    sourceType: "来源类型",
    local: "本地目录",
    git: "Git 仓库",
    sourceField: "来源路径或仓库地址",
    subpath: "仓库内子目录（可选）",
    ref: "分支或标签（可选）",
    previewSource: "比较来源",
    confirmSource: "确认关联",
    matched: "来源内容与已安装技能一致。",
    changed: "来源与已安装内容不同。确认关联后，后续更新将可应用这些差异。",
    sourceChanged: "修改来源",
    openOwner: "查看官方更新方式",
    explain: "查看原始说明",
    noChanges: "没有文件变化。",
    checking: "操作中…",
    runs: "最近更新记录",
    manual: "手动",
    scheduled: "定时",
    "catch-up": "恢复后补跑",
    success: "完成",
    partial: "部分完成",
    updated: "已更新",
    skipped: "已跳过",
    runError: "失败",
    verified: "已核实",
    inferred: "根据元数据推导",
    "user-confirmed": "用户已确认",
    "confidence-unknown": "来源未知",
    "connect-hint":
      "安装目录可见，但没有足够的原始安装记录。关联可信来源后即可检查更新。",
    "host-hint":
      "此项随所属宿主更新。查看下方管理器、来源证据及可用的官方更新方式。",
    "ready-hint":
      "可从已核实来源检查更新；应用前会再次检查本机文件是否发生变化。",
    result: "运行结果",
    selectedOnly: "计划仅适用于已选择的安装。",
    cadence: "间隔从每轮完成时计算，时区用于显示时间。",
  },
  en: {
    checkOnly: "Check only",
    autoMode: "Check and apply automatically",

    bundledManager: "Codex bundled plugins",
    runtimeManager: "Codex workspace runtime",
    remoteManager: "Codex remote plugin manager",
    marketplace: "Marketplace",

    sourceRequired: "Enter a source path or Git URL.",
    added: "Added",
    removed: "Removed",
    modified: "Modified",
    pluginManager: "Codex plugin manager",
    gitWorkspace: "Git working tree",
    userManager: "User",

    title: "All update channels",
    intro:
      "Existing installations are included. Skills follow their source; bundled skills update with their whole plugin.",
    checkAll: "Check all",
    search: "Search update targets",
    empty: "No matching update targets",
    schedule: "Automatic updates",
    scheduleIntro:
      "Choose targets and a frequency. The background task checks and applies updates according to your settings.",
    configure: "Configure schedule",
    background: "Background task",
    backgroundReady: "Working normally",
    backgroundOff: "Not registered",
    backgroundStopping: "Stopping",
    backgroundBlocked: "Disabled by macOS",
    backgroundUnregistered: "Not registered. Save the schedule again.",
    backgroundUnverified: "Execution not confirmed. Check background permissions or save the schedule again.",
    backgroundError: "Execution failed — action needed",
    backgroundUnsupported: "Background tasks are not supported on this system yet",
    backgroundWake: "Last wake",
    backgroundConsent: "Enabling registers a macOS background task for your user account. Disabling removes it after the current item safely finishes.",
    lastSuccess: "Last successful check",
    retrying: "Failures retry with increasing delays",

    on: "Enabled",
    off: "Disabled",
    running: "Running",
    next: "Next run",
    last: "Last run",
    none: "Not recorded",
    lifecycle:
      "macOS runs updates on demand, then the task exits. SkillDock and Codex can stay closed. Scheduling resumes after restarting and signing in, with catch-up after sleep or offline periods. Runs may start up to about 5 minutes after the planned time.",
    interval: "Check interval (hours)",
    customInterval: "Custom interval (hours)",
    hours: "hours",
    customHint: "Decimals are supported, such as 0.25, 1.5 or 2 hours.",
    hourly: "Every hour",
    daily: "Every 24 hours",
    weekly: "Every 168 hours",
    custom: "Custom",
    zone: "Display time zone",
    enable: "Enable this schedule",
    auto: "Automatically apply available updates",
    autoHelp:
      "Only selected installations are updated. Local edits or a changed source or installation identity cause a skip with an explanation. New installations are not added automatically.",
    targets: "Update targets",
    selectAll: "Select all currently eligible targets",
    clear: "Clear selection",
    save: "Save schedule",
    cancel: "Cancel",
    noTargets:
      "Select at least one eligible target before enabling the schedule.",
    intervalError:
      "Enter 0.25–168 hours, equivalent to a whole number of minutes.",
    selected: "Selected",
    allTargets: "targets",
    settingsMissing:
      "The service did not return schedule status. Refresh the inventory.",
    path: "Installed at",
    source: "Update source",
    owner: "Manager",
    version: "Installed version",
    latest: "Source version",
    evidence: "Source evidence",
    unknown: "Not provided",
    affected: "Bundled skills",
    details: "View details",
    check: "Check for updates",
    apply: "Apply update",
    preview: "Update preview",
    current: "Up to date",
    available: "Update available",
    unchecked: "Not checked",
    blocked: "Action needed",
    error: "Check failed",
    "skill-source": "Update this skill",
    "plugin-reinstall": "Update the whole plugin",
    "owner-managed": "Managed by host",
    "connect-source": "Connect a source",
    connect: "Connect update source",
    connectIntro:
      "Add a source for an existing skill. Compare it with the installed files first. Connecting saves the source and current baseline without replacing files.",
    sourceType: "Source type",
    local: "Local directory",
    git: "Git repository",
    sourceField: "Source path or repository URL",
    subpath: "Repository subdirectory (optional)",
    ref: "Branch or tag (optional)",
    previewSource: "Compare source",
    confirmSource: "Confirm connection",
    matched: "The source matches the installed skill.",
    changed:
      "The source differs from the installed files. Connecting allows subsequent updates to apply these changes.",
    sourceChanged: "Edit source",
    openOwner: "Official update instructions",
    explain: "View original details",
    noChanges: "No file changes.",
    checking: "Working…",
    runs: "Recent update runs",
    manual: "Manual",
    scheduled: "Scheduled",
    "catch-up": "Catch-up",
    success: "Completed",
    partial: "Partially completed",
    updated: "Updated",
    skipped: "Skipped",
    runError: "Failed",
    verified: "Verified",
    inferred: "Inferred from metadata",
    "user-confirmed": "Confirmed by user",
    "confidence-unknown": "Source unknown",
    "connect-hint":
      "The installation path is known, but the original source is not recorded. Connect a trusted source to check for updates.",
    "host-hint":
      "This item follows its host’s update process. See the manager, source evidence and available official update instructions below.",
    "ready-hint":
      "Updates can be checked against a verified source. Local changes are checked again before applying.",
    result: "Run result",
    selectedOnly: "This schedule applies only to the selected installations.",
    cadence:
      "The interval starts when a run finishes. The time zone controls displayed times.",
  },
  ja: {
    checkOnly: "更新の確認のみ",
    autoMode: "確認して自動適用",

    bundledManager: "Codex 付属プラグイン",
    runtimeManager: "Codex ワークスペースランタイム",
    remoteManager: "Codex リモートプラグイン管理",
    marketplace: "マーケットプレイス",

    sourceRequired: "ソースのパスまたは Git URL を入力してください。",
    added: "追加",
    removed: "削除",
    modified: "変更",
    pluginManager: "Codex プラグイン管理",
    gitWorkspace: "Git 作業ツリー",
    userManager: "ユーザー",

    title: "すべての更新経路",
    intro:
      "既存のインストールも表示します。スキルは取得元から、付属スキルはプラグイン全体で更新します。",
    checkAll: "すべて確認",
    search: "更新対象を検索",
    empty: "一致する更新対象がありません",
    schedule: "自動更新",
    scheduleIntro:
      "対象と間隔を選択すると、バックグラウンドで確認し、設定に従って更新を適用します。",
    configure: "スケジュール設定",
    background: "バックグラウンドタスク",
    backgroundReady: "正常に動作中",
    backgroundOff: "未登録",
    backgroundStopping: "停止中",
    backgroundBlocked: "macOSにより無効化されています",
    backgroundUnregistered: "未登録です。設定を再保存してください。",
    backgroundUnverified: "実行を未確認です。バックグラウンド権限を確認するか設定を再保存してください。",
    backgroundError: "実行失敗・対応が必要です",
    backgroundUnsupported: "このOSのバックグラウンドタスクは未対応です",
    backgroundWake: "最終起動",
    backgroundConsent: "有効にすると、このユーザーのmacOSバックグラウンドタスクを登録します。無効にすると現在の項目の処理を終えて停止・登録解除します。",
    lastSuccess: "前回の確認成功",
    retrying: "失敗時は間隔を延ばして再試行します",

    on: "有効",
    off: "無効",
    running: "実行中",
    next: "次回の実行",
    last: "前回の実行",
    none: "未記録",
    lifecycle:
      "macOSが必要なときだけ更新を実行し、完了後に終了します。SkillDockやCodexを開く必要はありません。再起動・ログイン後に自動再開し、スリープやオフライン中の確認を補います。予定時刻から約5分遅れる場合があります。",
    interval: "確認間隔（時間）",
    customInterval: "カスタム間隔（時間）",
    hours: "時間",
    customHint: "0.25、1.5、2時間など、小数も指定できます。",
    hourly: "1時間ごと",
    daily: "24時間ごと",
    weekly: "168時間ごと",
    custom: "カスタム",
    zone: "表示タイムゾーン",
    enable: "このスケジュールを有効にする",
    auto: "利用可能な更新を自動適用する",
    autoHelp:
      "選択したインストールのみ更新します。ローカルの編集、取得元やインストールの識別情報の変更がある場合は理由を記録してスキップします。新規インストールは自動追加されません。",
    targets: "更新対象",
    selectAll: "現在更新可能な対象をすべて選択",
    clear: "選択を解除",
    save: "設定を保存",
    cancel: "キャンセル",
    noTargets: "有効にする前に更新可能な対象を1つ以上選択してください。",
    intervalError:
      "0.25〜168時間で、分に換算すると整数になる値を入力してください。",
    selected: "選択済み",
    allTargets: "件",
    settingsMissing:
      "サービスからスケジュール情報が返されませんでした。一覧を更新してください。",
    path: "インストール先",
    source: "更新元",
    owner: "管理元",
    version: "インストール済みバージョン",
    latest: "更新元のバージョン",
    evidence: "取得元の根拠",
    unknown: "未提供",
    affected: "付属スキル",
    details: "詳細を表示",
    check: "更新を確認",
    apply: "更新を適用",
    preview: "更新プレビュー",
    current: "最新です",
    available: "更新があります",
    unchecked: "未確認",
    blocked: "対応が必要",
    error: "確認に失敗",
    "skill-source": "スキル単位で更新",
    "plugin-reinstall": "プラグイン全体を更新",
    "owner-managed": "ホストが管理",
    "connect-source": "取得元の関連付けが必要",
    connect: "更新元を関連付け",
    connectIntro:
      "既存スキルの更新元を登録します。最初にインストール済みファイルと比較してください。確認後は取得元と現在の基準を保存し、ファイルは直ちに置き換えません。",
    sourceType: "取得元の種類",
    local: "ローカルフォルダー",
    git: "Gitリポジトリ",
    sourceField: "取得元のパスまたはリポジトリURL",
    subpath: "リポジトリ内のサブフォルダー（任意）",
    ref: "ブランチまたはタグ（任意）",
    previewSource: "取得元を比較",
    confirmSource: "関連付けを確定",
    matched: "取得元とインストール済みスキルは一致しています。",
    changed:
      "取得元とインストール済みファイルに差分があります。関連付け後の更新では、この差分を適用できるようになります。",
    sourceChanged: "取得元を編集",
    openOwner: "公式の更新手順",
    explain: "元の詳細を表示",
    noChanges: "ファイルの変更はありません。",
    checking: "処理中…",
    runs: "最近の更新履歴",
    manual: "手動",
    scheduled: "定期",
    "catch-up": "再開後の確認",
    success: "完了",
    partial: "一部完了",
    updated: "更新済み",
    skipped: "スキップ",
    runError: "失敗",
    verified: "確認済み",
    inferred: "メタデータから推定",
    "user-confirmed": "ユーザー確認済み",
    "confidence-unknown": "取得元不明",
    "connect-hint":
      "インストール先は分かりますが、元の取得元は記録されていません。信頼できる取得元を関連付けると更新を確認できます。",
    "host-hint":
      "この項目はホスト側の更新に従います。管理元、取得元の根拠、公式の更新手順を確認してください。",
    "ready-hint":
      "確認済みの取得元から更新を確認できます。適用前にローカルファイルの変更を再確認します。",
    result: "実行結果",
    selectedOnly: "この設定は選択したインストールのみに適用されます。",
    cadence:
      "各実行の完了時から間隔を計算します。タイムゾーンは時刻の表示に使用します。",
  },
} as const;
type Key = keyof typeof copy.zh;
const targetKey = (target: UpdateTarget) => `${target.kind}:${target.id}`;
type IntervalChoice = "1" | "24" | "168" | "custom";
const intervalChoiceFor = (minutes: number): IntervalChoice =>
  minutes === 60
    ? "1"
    : minutes === 1440
      ? "24"
      : minutes === 10080
        ? "168"
        : "custom";
const hoursForMinutes = (minutes: number) => String(minutes / 60);
function minutesForHours(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const hours = Number(value);
  if (!Number.isFinite(hours) || hours < 0.25 || hours > 168) return undefined;
  const minutes = hours * 60;
  const wholeMinutes = Math.round(minutes);
  // Remove only IEEE-754 arithmetic noise (for example 1.1 × 60).
  // Actual fractions of a minute must never be silently rounded.
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(minutes)) * 4;
  return Math.abs(minutes - wholeMinutes) <= tolerance
    ? wholeMinutes
    : undefined;
}
interface Props {
  data: Snapshot;
  runPending: boolean;
  focusTarget?: string;
  onClearFocus: () => void;
  busy: boolean;
  language: Language;
  execute: (
    request: Omit<ActionRequest, "mode">,
  ) => Promise<ActionResult | undefined>;
  onDetails: (skill: Skill) => void;
  onRefresh: () => void;
}

export function UpdatesWorkspace({
  data,
  runPending,
  focusTarget,
  onClearFocus,
  busy,
  language,
  execute,
  onDetails,
  onRefresh,
}: Props) {
  const t = (key: Key) => copy[language][key];
  const [search, setSearch] = useState("");
  const [batchRunning, setBatchRunning] = useState(data.updateProgress?.status === "running");
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<ScheduleInput>();
  const [intervalChoice, setIntervalChoice] = useState<IntervalChoice>("24");
  const [customHours, setCustomHours] = useState("24");
  const [error, setError] = useState<{ key: Key } | { service: string }>();
  const [preview, setPreview] = useState<UpdateItem>();
  const [connecting, setConnecting] = useState<UpdateItem>();
  const [sourceType, setSourceType] = useState<"local" | "git">("local");
  const [source, setSource] = useState("");
  const [subpath, setSubpath] = useState("");
  const [ref, setRef] = useState("");
  const [sourcePreview, setSourcePreview] = useState<SourcePreview>();
  const refreshRef = useRef(onRefresh);
  refreshRef.current = onRefresh;
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (
        !busy &&
        !editing &&
        !preview &&
        !connecting &&
        document.visibilityState === "visible"
      )
        refreshRef.current();
    }, 10000);
    return () => window.clearInterval(timer);
  }, [busy, editing, preview, connecting, data.mode]);
  const items = data.updates || [];
  const eligible = items.filter((item) =>
    form?.autoApply ? item.canAutoApply : item.canCheck,
  );
  const shown = useMemo(
    () =>
      items.filter((item) =>
        (!focusTarget || item.target.kind === "plugin" && item.target.id === focusTarget) && `${item.name} ${item.owner} ${item.installedPath || ""} ${item.sourceInfo?.source || ""}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [items, search, focusTarget],
  );
  useEffect(() => {
    setEditing(false);
    setPreview(undefined);
    setConnecting(undefined);
    setError(undefined);
    setSearch("");
  }, [data.mode]);
  const date = (value?: string) =>
    value
      ? new Intl.DateTimeFormat(
          { zh: "zh-CN", en: "en-US", ja: "ja-JP" }[language],
          {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone: data.schedule?.timezone || undefined,
          },
        ).format(new Date(value))
      : t("none");
  const safeRun = async (request: Omit<ActionRequest, "mode">) => {
    setError(undefined);
    try {
      return await execute(request);
    } catch (e) {
      setError({ service: e instanceof Error ? e.message : String(e) });
      return undefined;
    }
  };
  const openSchedule = () => {
    const schedule = data.schedule;
    if (!schedule) {
      setError({ key: "settingsMissing" });
      return;
    }
    setForm({
      enabled: schedule.enabled,
      intervalMinutes: schedule.intervalMinutes,
      timezone: schedule.timezone,
      autoApply: schedule.autoApply,
      targets: [...schedule.targets],
    });
    setIntervalChoice(intervalChoiceFor(schedule.intervalMinutes));
    setCustomHours(hoursForMinutes(schedule.intervalMinutes));
    setEditing(true);
    setError(undefined);
  };
  const check = async (item: UpdateItem) => {
    const result = await safeRun({
      action: "update.check",
      target: item.target,
    });
    if (result?.updateItem) {
      setPreview(result.updateItem);
      onRefresh();
    }
  };
  const connect = (item: UpdateItem) => {
    setConnecting(item);
    setSourcePreview(undefined);
    setError(undefined);
    setSourceType(item.sourceInfo?.sourceType || "local");
    setSource(item.sourceInfo?.source || "");
    setSubpath(item.sourceInfo?.subpath || "");
    setRef(item.sourceInfo?.ref || "");
  };
  const technical = (message?: string) =>
    message ? (
      <div className="uw-message">
        <ServiceMessage value={message} />
      </div>
    ) : null;
  const changes = (list?: SourcePreview["changes"]) =>
    list?.length ? (
      <ul className="uw-changes">
        {list.map((change) => (
          <li key={change.path}>
            <span aria-label={t(change.type)}>
              {change.type === "added"
                ? "+"
                : change.type === "removed"
                  ? "−"
                  : "~"}
            </span>
            <code>{change.path}</code>
          </li>
        ))}
      </ul>
    ) : (
      <p>{t("noChanges")}</p>
    );
  const hint = (item: UpdateItem) =>
    item.route === "connect-source"
      ? t("connect-hint")
      : item.route === "owner-managed"
        ? t("host-hint")
        : t("ready-hint");
  const manager = (owner: string) => {
    const labels: Record<string, Key> = {
      "Codex plugin manager": "pluginManager",
      "Git working tree": "gitWorkspace",
      User: "userManager",
      "Codex bundled plugins": "bundledManager",
      "Codex workspace runtime": "runtimeManager",
      "Codex remote plugin manager": "remoteManager",
    };
    if (owner.startsWith("Marketplace · "))
      return `${t("marketplace")} · ${owner.slice(14)}`;
    return owner ? (labels[owner] ? t(labels[owner]) : owner) : t("unknown");
  };
  const background = data.schedule?.background;
  const backgroundLabel: Record<string, Key> = {
    ready: "backgroundReady", off: "backgroundOff", stopping: "backgroundStopping",
    blocked: "backgroundBlocked", unregistered: "backgroundUnregistered", unverified: "backgroundUnverified",
    error: "backgroundError", unsupported: "backgroundUnsupported",
  };
  const needsAttention = data.schedule?.enabled && background && !["ready", "off", "stopping"].includes(background.status);
  const statusLabel = (status: string) =>
    status in copy.zh ? t(status as Key) : status;
  return (
    <div className="updates-workspace">
      <section className="uw-schedule" aria-label={t("schedule")}>
        <div className="uw-heading">
          <span className="uw-symbol">
            <Clock3 size={22} />
          </span>
          <div>
            <h2>{t("schedule")}</h2>
            <p>{t("scheduleIntro")}</p>
          </div>
          <span
            className={`badge badge-${needsAttention ? "orange" : data.schedule?.enabled ? "green" : "neutral"}`}
          >
            {batchRunning
              ? t("running")
              : needsAttention
                ? t(backgroundLabel[background!.status])
                : data.schedule?.enabled
                ? t("on")
                : t("off")}
          </span>
        </div>
        <div className="uw-schedule-summary">
          <span>
            {t("next")}
            <strong>{date(background?.retryAt || data.schedule?.nextRunAt)}</strong>
          </span>
          <span>
            {t("last")}
            <strong>{date(data.schedule?.lastRunAt)}</strong>
          </span>
          <button
            className="button button-secondary"
            onClick={openSchedule}
            disabled={busy}
          >
            <Settings2 size={15} />
            {t("configure")}
          </button>
        </div>
        {data.schedule && (
          <p className="uw-plan-summary">
            <strong>
              {t(data.schedule.autoApply ? "autoMode" : "checkOnly")}
            </strong>
            <span>
              {t("interval")}: {hoursForMinutes(data.schedule.intervalMinutes)}
            </span>
            <span>
              {t("selected")} {data.schedule.targets.length} {t("allTargets")}
            </span>
            <span>{data.schedule.timezone}</span>
          </p>
        )}
        {background && (
          <div className={`uw-background-status${needsAttention ? " needs-attention" : ""}`} role="status">
            <div><strong>{t("background")}</strong><span>{t(backgroundLabel[background.status])}</span></div>
            <div><span>{t("backgroundWake")}</span><span>{date(background.lastWakeAt)}</span></div>
            <div><span>{t("lastSuccess")}</span><span>{date(data.schedule?.lastSuccessAt)}</span></div>
            {!!data.schedule?.failureCount && <p>{t("retrying")}</p>}
            {background.lastError && <ServiceMessage value={background.lastError} />}
          </div>
        )}
        <p className="uw-service-note">{t("lifecycle")}</p>
      </section>
      <div className="uw-section-heading">
        <div>
          <h2>
            {t("title")}{" "}
            <span className="badge badge-neutral">{items.length}</span>
          </h2>
          <p>{t("intro")}</p>
        </div>
        <button
          className="button button-secondary"
          disabled={busy || batchRunning || !items.some((item) => item.canCheck)}
          onClick={() =>
            void safeRun({ action: "updates.run", autoApply: false })
          }
        >
          <RefreshCw size={15} className={busy ? "spin" : ""} />
          {t("checkAll")}
        </button>
      </div>
      <UpdateProgress key={data.mode} mode={data.mode} seed={data.updateProgress} pending={runPending} onComplete={() => refreshRef.current()} onRunningChange={setBatchRunning} />
      {focusTarget && <div className="uw-focused-plugin"><div><strong>{data.plugins.find(plugin => plugin.id === focusTarget)?.name || focusTarget}</strong>
        <p>{translate("更新整个插件及其附带技能")}</p></div><button className="text-button" onClick={onClearFocus}>{translate("查看全部更新对象")}</button></div>}
      <label className="uw-search">
        <Search size={17} />
        <input
          type="search"
          aria-label={t("search")}
          placeholder={t("search")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      {error && !editing && !preview && !connecting && (
        <div role="alert" className="field-error">
          {"key" in error ? (
            t(error.key)
          ) : (
            <ServiceMessage value={error.service} error />
          )}
        </div>
      )}
      <div className="uw-list">
        {shown.map((item) => (
          <article className="uw-item update-row" key={targetKey(item.target)}>
            <div className="uw-item-heading">
              <div>
                <h3>{item.name}</h3>
                <span className="uw-route">{t(item.route)}</span>
              </div>
              <span
                className={`badge badge-${item.status === "available" ? "orange" : item.status === "current" ? "green" : "neutral"}`}
              >
                {statusLabel(item.status)}
              </span>
            </div>
            <dl className="uw-facts">
              <div>
                <dt>{t("owner")}</dt>
                <dd>{manager(item.owner)}</dd>
              </div>
              <div>
                <dt>{t("version")}</dt>
                <dd>{item.installedVersion || t("unknown")}</dd>
              </div>
              <div className="uw-full">
                <dt>{t("path")}</dt>
                <dd>
                  <code>{item.installedPath || t("unknown")}</code>
                </dd>
              </div>
              <div className="uw-full">
                <dt>{t("source")}</dt>
                <dd>
                  {item.sourceInfo?.source ? (
                    <code>{item.sourceInfo.source}</code>
                  ) : (
                    <ServiceMessage
                      value={item.sourceInfo?.label || t("unknown")}
                    />
                  )}
                  {item.sourceInfo?.commit && (
                    <code className="uw-commit">
                      {item.sourceInfo.commit.slice(0, 12)}
                    </code>
                  )}
                </dd>
              </div>
            </dl>
            <p className="uw-hint">{hint(item)}</p>
            {technical(item.message)}
            {item.sourceInfo && (
              <details className="uw-evidence">
                <summary>
                  {t("evidence")} ·{" "}
                  {t(
                    item.sourceInfo.confidence === "unknown"
                      ? "confidence-unknown"
                      : item.sourceInfo.confidence,
                  )}
                </summary>
                {technical(item.sourceInfo.evidence)}
                <code>
                  {item.sourceInfo.ref || item.sourceInfo.subpath || ""}
                </code>
              </details>
            )}
            {!!item.affectedSkillIds?.length && (
              <details className="uw-related">
                <summary>
                  {t("affected")} · {item.affectedSkillIds.length}
                </summary>
                <div>
                  {item.affectedSkillIds.map((id) => {
                    const skill = data.skills.find((s) => s.id === id);
                    return skill ? (
                      <button
                        className="button button-ghost"
                        key={id}
                        onClick={() => onDetails(skill)}
                      >
                        {skill.name}
                      </button>
                    ) : null;
                  })}
                </div>
              </details>
            )}
            <div className="uw-item-actions">
              {item.target.kind === "skill" &&
                (() => {
                  const skill = data.skills.find(
                    (s) => s.id === item.target.id,
                  );
                  return skill ? (
                    <button
                      className="button button-ghost"
                      onClick={() => onDetails(skill)}
                    >
                      {t("details")}
                    </button>
                  ) : null;
                })()}
              {item.route === "connect-source" &&
                item.target.kind === "skill" && (
                  <button
                    className="button button-secondary"
                    disabled={busy}
                    onClick={() => connect(item)}
                  >
                    <Link2 size={15} />
                    {t("connect")}
                  </button>
                )}
              {item.sourceInfo?.helpUrl &&
                /^https:\/\/(?:learn\.chatgpt\.com|developers\.openai\.com|git-scm\.com)\//.test(
                  item.sourceInfo.helpUrl,
                ) && (
                  <a
                    className="button button-ghost"
                    href={item.sourceInfo.helpUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t("openOwner")}
                  </a>
                )}
              {item.canCheck && (
                <button
                  className="button button-secondary"
                  disabled={busy}
                  onClick={() => void check(item)}
                >
                  <RefreshCw size={15} />
                  {t("check")}
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
      {!shown.length && (
        <div className="empty-state">
          <h3>{t("empty")}</h3>
          <button className="button button-secondary" onClick={onRefresh}>
            {t("checkAll")}
          </button>
        </div>
      )}
      {!!data.updateRuns?.length && (
        <section className="uw-runs">
          <h2>{t("runs")}</h2>
          {data.updateRuns.slice(0, 8).map((run) => (
            <details key={run.id}>
              <summary>
                <span>
                  {statusLabel(run.trigger)} · {date(run.startedAt)}
                </span>
                <span className="badge badge-neutral">
                  {statusLabel(run.status)}
                </span>
              </summary>
              <ul>
                {run.items.map((item, i) => (
                  <li key={`${targetKey(item.target)}:${i}`}>
                    <strong>{item.name}</strong>
                    <span>{statusLabel(item.status)}</span>
                    {technical(item.message)}
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </section>
      )}
      {editing && form && (
        <Modal
          title={t("configure")}
          onClose={() => !busy && setEditing(false)}
          wide
        >
          <form
            noValidate
            onSubmit={async (e) => {
              e.preventDefault();
              const intervalMinutes =
                intervalChoice === "custom"
                  ? minutesForHours(customHours)
                  : Number(intervalChoice) * 60;
              if (intervalMinutes === undefined) {
                setError({ key: "intervalError" });
                return;
              }
              if (form.enabled && !form.targets.length) {
                setError({ key: "noTargets" });
                return;
              }
              const result = await safeRun({
                action: "schedule.configure",
                schedule: { ...form, intervalMinutes },
              });
              if (result) setEditing(false);
            }}
          >
            <div className="modal-body uw-form">
              <p>{t("selectedOnly")}</p>
              <p className="uw-service-note">{t("backgroundConsent")}</p>
              <label className="uw-check">
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(e) =>
                    setForm({ ...form, enabled: e.target.checked })
                  }
                />
                {t("enable")}
              </label>
              <div className="uw-frequency">
                <div className="uw-interval-fields">
                  <label className="field">
                    <span>{t("interval")}</span>
                    <select
                      aria-label={t("interval")}
                      value={intervalChoice}
                      onChange={(e) => {
                        setIntervalChoice(e.target.value as IntervalChoice);
                        if (
                          error &&
                          "key" in error &&
                          error.key === "intervalError"
                        )
                          setError(undefined);
                      }}
                    >
                      <option value="1">{t("hourly")}</option>
                      <option value="24">{t("daily")}</option>
                      <option value="168">{t("weekly")}</option>
                      <option value="custom">{t("custom")}</option>
                    </select>
                  </label>
                  {intervalChoice === "custom" && (
                    <label className="field">
                      <span>{t("customInterval")}</span>
                      <span className="uw-hours-input">
                        <input
                          type="number"
                          inputMode="decimal"
                          aria-label={t("customInterval")}
                          min="0.25"
                          max="168"
                          step="any"
                          value={customHours}
                          onChange={(e) => {
                            setCustomHours(e.target.value);
                            if (
                              error &&
                              "key" in error &&
                              error.key === "intervalError"
                            )
                              setError(undefined);
                          }}
                        />
                        <span aria-hidden="true">{t("hours")}</span>
                      </span>
                      <small>{t("customHint")}</small>
                    </label>
                  )}
                </div>
                <div>
                  <span>{t("zone")}</span>
                  <strong>{form.timezone}</strong>
                  <small>{t("cadence")}</small>
                </div>
              </div>
              <label className="uw-check">
                <input
                  type="checkbox"
                  checked={form.autoApply}
                  onChange={(e) =>
                    setForm({ ...form, autoApply: e.target.checked })
                  }
                />
                {t("auto")}
              </label>
              <p className="uw-hint">{t("autoHelp")}</p>
              <fieldset className="uw-targets">
                <legend>
                  {t("targets")} · {t("selected")} {form.targets.length}{" "}
                  {t("allTargets")}
                </legend>
                <div className="uw-target-tools">
                  <button
                    className="button button-ghost"
                    type="button"
                    onClick={() =>
                      setForm({
                        ...form,
                        targets: eligible.map((item) => item.target),
                      })
                    }
                  >
                    {t("selectAll")}
                  </button>
                  <button
                    className="button button-ghost"
                    type="button"
                    onClick={() => setForm({ ...form, targets: [] })}
                  >
                    {t("clear")}
                  </button>
                </div>
                {items
                  .filter(
                    (item) =>
                      (form.autoApply ? item.canAutoApply : item.canCheck) ||
                      form.targets.some(
                        (target) =>
                          targetKey(target) === targetKey(item.target),
                      ),
                  )
                  .map((item) => (
                    <label className="uw-check" key={targetKey(item.target)}>
                      <input
                        type="checkbox"
                        checked={form.targets.some(
                          (target) =>
                            targetKey(target) === targetKey(item.target),
                        )}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            targets: e.target.checked
                              ? [...form.targets, item.target]
                              : form.targets.filter(
                                  (target) =>
                                    targetKey(target) !==
                                    targetKey(item.target),
                                ),
                          })
                        }
                      />
                      <span>
                        {item.name}
                        <small>{t(item.route)}</small>
                        <code>{item.installedPath || t("unknown")}</code>
                      </span>
                    </label>
                  ))}
              </fieldset>
              {error && (
                <div role="alert" className="field-error">
                  {"key" in error ? (
                    t(error.key)
                  ) : (
                    <ServiceMessage value={error.service} error />
                  )}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="button button-secondary"
                disabled={busy}
                onClick={() => setEditing(false)}
              >
                {t("cancel")}
              </button>
              <button
                type="submit"
                className="button button-primary"
                disabled={busy}
              >
                {busy ? t("checking") : t("save")}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {preview && (
        <Modal
          title={t("preview")}
          onClose={() => !busy && setPreview(undefined)}
          wide
        >
          <div className="modal-body uw-form">
            <h3>{preview.name}</h3>
            <dl className="uw-facts">
              <div className="uw-full">
                <dt>{t("path")}</dt>
                <dd>
                  <code>{preview.installedPath || t("unknown")}</code>
                </dd>
              </div>
              <div className="uw-full">
                <dt>{t("source")}</dt>
                <dd>
                  <code>{preview.sourceInfo?.source || t("unknown")}</code>
                </dd>
              </div>
            </dl>
            <span className="badge badge-neutral">
              {statusLabel(preview.status)}
            </span>
            {preview.installedVersion && (
              <p>
                {t("version")}: {preview.installedVersion} →{" "}
                {preview.availableVersion || t("unknown")}
              </p>
            )}
            {technical(preview.message)}
            {changes(preview.changes)}
            {preview.previewId && preview.changes?.length ? <DiffBrowser key={preview.previewId} previewId={preview.previewId} changes={preview.changes} execute={execute} /> : null}
            {error && (
              <div role="alert" className="field-error">
                {"key" in error ? (
                  t(error.key)
                ) : (
                  <ServiceMessage value={error.service} error />
                )}
              </div>
            )}
          </div>
          <div className="modal-footer">
            <button
              className="button button-secondary"
              disabled={busy}
              onClick={() => setPreview(undefined)}
            >
              {t("cancel")}
            </button>
            {preview.status === "available" &&
              preview.canApply &&
              preview.previewId && (
                <button
                  className="button button-primary"
                  disabled={busy}
                  onClick={async () => {
                    const result = await safeRun({
                      action: "update.apply",
                      target: preview.target,
                      previewId: preview.previewId,
                    });
                    if (result) {
                      setPreview(undefined);
                      onRefresh();
                    }
                  }}
                >
                  <ArrowDownToLine size={15} />
                  {busy ? t("checking") : t("apply")}
                </button>
              )}
          </div>
        </Modal>
      )}
      {connecting && (
        <Modal
          title={t("connect")}
          onClose={() => !busy && setConnecting(undefined)}
          wide
        >
          <form
            noValidate
            onSubmit={async (e) => {
              e.preventDefault();
              if (!sourcePreview && !source.trim()) {
                setError({ key: "sourceRequired" });
                return;
              }
              const result = await safeRun(
                sourcePreview
                  ? {
                      action: "skill.connectSource",
                      id: connecting.target.id,
                      previewId: sourcePreview.id,
                    }
                  : {
                      action: "skill.previewSource",
                      id: connecting.target.id,
                      sourceType,
                      source: source.trim(),
                      ...(subpath.trim() ? { subpath: subpath.trim() } : {}),
                      ...(sourceType === "git" && ref.trim() ? { ref: ref.trim() } : {}),
                    },
              );
              if (result?.sourcePreview) setSourcePreview(result.sourcePreview);
              else if (result && sourcePreview) setConnecting(undefined);
            }}
          >
            <div className="modal-body uw-form">
              <p>{t("connectIntro")}</p>
              <h3>{connecting.name}</h3>
              <SourceProvenance
                source={connecting.sourceInfo}
                language={language}
              />
              <dl className="uw-facts">
                <div className="uw-full">
                  <dt>{t("path")}</dt>
                  <dd>
                    <code>
                      {sourcePreview?.target ||
                        connecting.installedPath ||
                        t("unknown")}
                    </code>
                  </dd>
                </div>
              </dl>
              {sourcePreview ? (
                <>
                  <p>
                    {sourcePreview.matchesInstalled
                      ? t("matched")
                      : t("changed")}
                  </p>
                  <code>{sourcePreview.source}</code>
                  <ResolvedGitSource source={sourcePreview} />
                  {changes(sourcePreview.changes)}
                  <DiffBrowser key={sourcePreview.id} previewId={sourcePreview.id} changes={sourcePreview.changes} execute={execute} />
                  <button
                    className="button button-ghost"
                    type="button"
                    disabled={busy}
                    onClick={() => setSourcePreview(undefined)}
                  >
                    {t("sourceChanged")}
                  </button>
                </>
              ) : (
                <>
                  <label className="field">
                    <span>{t("sourceType")}</span>
                    <select
                      value={sourceType}
                      onChange={(e) =>
                        setSourceType(e.target.value as "local" | "git")
                      }
                    >
                      <option value="local">{t("local")}</option>
                      <option value="git">{t("git")}</option>
                    </select>
                  </label>
                  {sourceType === "git" ? <GitSourceFields source={source} subpath={subpath} gitRef={ref} setSource={setSource} setSubpath={setSubpath} setRef={setRef} /> : <>
                  <label className="field">
                    <span>{t("sourceField")}</span>
                    <input
                      value={source}
                      required
                      onChange={(e) => setSource(e.target.value)}
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </label>
                  <label className="field">
                    <span>{t("subpath")}</span>
                    <input
                      value={subpath}
                      onChange={(e) => setSubpath(e.target.value)}
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </label>
                  </>}

                </>
              )}
              {error && (
                <div role="alert" className="field-error">
                  {"key" in error ? (
                    t(error.key)
                  ) : (
                    <ServiceMessage value={error.service} error />
                  )}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button
                className="button button-secondary"
                type="button"
                disabled={busy}
                onClick={() => setConnecting(undefined)}
              >
                {t("cancel")}
              </button>
              <button
                className="button button-primary"
                type="submit"
                disabled={busy}
              >
                {busy
                  ? t("checking")
                  : sourcePreview
                    ? t("confirmSource")
                    : t("previewSource")}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
