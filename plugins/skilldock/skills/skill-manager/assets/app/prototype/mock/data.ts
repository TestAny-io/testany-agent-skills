// [PROTOTYPE] Fictional local inventory. These fixtures never read a real machine.
import type { Activity, FileDiff, Marketplace, Plugin, PluginInstallPreview, ProjectCatalog, Skill, Snapshot, UpdateItem } from "../../shared/contracts";

export const projectRoot = "/Users/demo/Projects/testany-agent-skills";
const userRoot = "/Users/demo/.codex/skills";
const cacheRoot = "/Users/demo/.codex/plugins/cache";
const source = "https://github.com/TestAny-io/testany-agent-skills";

function skill(id: string, name: string, description: string, scope: Skill["scope"], tags: string[], options: Partial<Skill> = {}): Skill {
  const pluginId = options.pluginId;
  const version = options.version || (pluginId === "skilldock" ? "0.7.0" : pluginId === "testany-llm" ? "1.2.0" : "2.5.0");
  const marketplace = pluginId === "team-writing" ? "team-workflows" : pluginId === "browser-tools" ? "openai-curated" : "testany-agent-skills";
  return {
    id, name, description, scope, tags, enabled: true,
    path: scope === "plugin" ? `${cacheRoot}/${marketplace}/${pluginId}/${version}/skills/${name}/SKILL.md`
      : scope === "project" ? `${projectRoot}/.agents/skills/${name}/SKILL.md`
        : `${userRoot}/${scope === "system" ? ".system/" : ""}${name}/SKILL.md`,
    sourceLabel: pluginId || { user: "个人技能", project: "当前项目", system: "Codex 内置", plugin: "插件附带", cache: "插件缓存" }[scope],
    managed: ["plugin", "system"].includes(scope), canToggle: scope !== "system", canRemove: ["user", "project"].includes(scope),
    canUpdate: scope !== "system", statusEvidence: "配置已核实",
    sourceInfo: { kind: pluginId ? "plugin" : scope === "system" ? "system" : "tracked", confidence: "verified", owner: pluginId || "skilldock", label: pluginId || "Git 仓库", evidence: "安装时记录的来源", source, subpath: `plugins/testany-eng/skills/${name}`, ref: "main", commit: "a83cf2e" },
    ...options,
  };
}

export const initialSkills: Skill[] = [
  skill("prd", "prd-writer", "把产品想法整理成清晰、可验收的需求文档。", "plugin", ["产品", "常用"], { pluginId: "testany-eng" }),
  skill("prototype", "prototype-designer", "设计可交互的界面原型，验证视觉方向与操作流程。", "plugin", ["设计", "常用"], { pluginId: "testany-eng" }),
  skill("review", "code-reviewer", "基于需求与设计审查代码，给出可执行的修改建议。", "plugin", ["研发"], { pluginId: "testany-eng" }),
  skill("prompt-personal", "prompt-optimizer", "为 ChatGPT、Claude 和 Gemini 优化提示词。", "user", ["写作", "常用"], { duplicateNames: ["prompt-plugin"], sourceInfo: undefined }),
  skill("playwright", "playwright", "在真实浏览器里执行流程、检查页面并截取画面。", "user", ["测试"], { version: "1.4.0" }),
  skill("docs", "openai-docs", "查询 OpenAI 官方文档，获取准确的产品与 API 信息。", "system", ["研发"], { reason: "由 Codex 管理，请随 Codex 更新。" }),
  skill("prompt-plugin", "prompt-optimizer", "撰写和改进提示词，支持多个模型与使用场景。", "plugin", ["写作"], { pluginId: "testany-llm", duplicateNames: ["prompt-personal"], version: "1.2.0" }),
  skill("api", "api-reviewer", "检查接口契约的一致性、错误处理和兼容性。", "plugin", ["研发"], { pluginId: "testany-eng", enabled: false }),
  skill("writing-personal", "technical-writing", "把复杂技术写成易读、准确的团队文档。", "user", ["写作"], { duplicateNames: ["writing-project"] }),
  skill("writing-project", "technical-writing", "项目专用的文档风格、术语与交付约定。", "project", ["写作", "项目规范"], { enabled: false, duplicateNames: ["writing-personal"] }),
  skill("imagegen", "imagegen", "生成与编辑图片，为产品表达提供视觉素材。", "system", ["设计"], { reason: "由 Codex 管理，请随 Codex 更新。" }),
  skill("manager", "skill-manager", "打开 SkillDock，管理本机的技能、插件与更新。", "plugin", ["工具"], { pluginId: "skilldock", version: "0.7.0" }),
  ...["draft-writer", "content-reviewer", "style-guide"].map((name, i) => skill(`team-${i}`, name, ["起草面向读者的清晰内容。", "检查术语、结构和事实依据。", "保持团队写作风格一致。"][i], "plugin", ["团队", "写作"], { pluginId: "team-writing", version: "1.3.2" })),
  ...["browser-check", "page-snapshot"].map((name, i) => skill(`browser-${i}`, name, ["验证浏览器中的关键操作路径。", "截取页面状态，保存交互证据。"][i], "plugin", ["测试"], { pluginId: "browser-tools", version: "1.0.0" })),
];

function plugin(id: string, description: string, version: string, skillCount: number, tags: string[], installed = true, marketplace = "testany-agent-skills"): Plugin {
  return { id, name: id, description, version, skillCount, tags, marketplace, installed, enabled: installed,
    canInstall: !installed, canRemove: installed, canToggle: installed,
    sourcePath: `${cacheRoot}/${marketplace}/${id}/${version}`,
    sourceInfo: { kind: "plugin", confidence: "verified", owner: id, label: marketplace, evidence: "Marketplace 安装记录", source, ref: "main", commit: "a83cf2e", subpath: `plugins/${id}` },
  };
}

export const initialPlugins: Plugin[] = [
  plugin("testany-eng", "从需求、设计到代码评审，让软件交付有章可循。", "2.5.0", 4, ["研发", "常用"]),
  plugin("testany-llm", "把日常想法变成结构清晰、效果稳定的提示词。", "1.2.0", 1, ["写作"]),
  plugin("skilldock", "你的技能与插件，都在一个清晰的工作空间里。", "0.7.0", 1, ["工具"]),
  plugin("team-writing", "团队共享的写作风格、术语表与内容审核规范。", "1.3.2", 3, ["写作", "团队"], true, "team-workflows"),
  { ...plugin("browser-tools", "浏览器操作、页面检查与端到端测试。", "1.0.0", 2, ["测试"], true, "openai-curated"), enabled: false },
  plugin("testany-mrkt", "从产品定位到内容创作，连接产品与用户。", "1.1.0", 3, ["产品", "写作"], false),
  plugin("release-notes", "根据变更生成面向用户的版本说明。", "1.0.2", 1, ["研发"], false, "team-workflows"),
];

export const initialMarkets: Marketplace[] = [
  { id: "testany", name: "testany-agent-skills", displayName: "Testany", source, type: "git", pluginCount: 4, canRemove: true, canRefresh: true, refreshedAt: "2026-09-28T01:30:00+08:00" },
  { id: "openai", name: "openai-curated", displayName: "OpenAI", source: "Codex 官方目录", type: "managed", pluginCount: 1, canRemove: false, canRefresh: false, reason: "由 Codex 管理，无需手动刷新。" },
  { id: "team", name: "team-workflows", displayName: "Team workflows", source: "git@github.com:example-team/workflows.git", type: "git", pluginCount: 2, canRemove: true, canRefresh: true, refreshedAt: "2026-09-28T01:30:00+08:00" },
];

export const initialUpdates: UpdateItem[] = [
  { target: { kind: "plugin", id: "testany-eng" }, name: "testany-eng", owner: "Testany", route: "plugin-reinstall", status: "available", canCheck: true, canApply: true, canAutoApply: true, installedVersion: "2.5.0", availableVersion: "2.6.0", message: "完善原型设计与评审流程，补充边界状态和视觉验收。", changes: [{ path: "skills/prototype-designer/SKILL.md", type: "modified" }, { path: "skills/prototype-designer/references/visual-design-guide.md", type: "added" }], affectedSkillIds: ["prd", "prototype", "review", "api"] },
  { target: { kind: "plugin", id: "skilldock" }, name: "skilldock", owner: "Testany", route: "plugin-reinstall", status: "available", canCheck: true, canApply: true, canAutoApply: true, installedVersion: "0.7.0", availableVersion: "0.8.0", message: "支持在 Codex 主内容区打开，按需启动与恢复连接。", changes: [{ path: "skills/skill-manager/SKILL.md", type: "modified" }] },
  { target: { kind: "skill", id: "playwright" }, name: "playwright", owner: "GitHub", route: "skill-source", status: "current", canCheck: true, canApply: false, canAutoApply: true, installedVersion: "1.4.0", message: "已是最新版本。" },
  { target: { kind: "plugin", id: "testany-llm" }, name: "testany-llm", owner: "Testany", route: "plugin-reinstall", status: "current", canCheck: true, canApply: false, canAutoApply: true, installedVersion: "1.2.0", message: "已是最新版本。" },
  { target: { kind: "skill", id: "prompt-personal" }, name: "prompt-optimizer", owner: "个人技能", route: "connect-source", status: "unchecked", canCheck: false, canApply: false, canAutoApply: false, message: "这份个人技能没有来源记录，关联后可检查更新。" },
];

export const initialActivity: Activity[] = [
  { id: "a1", action: "skill.toggle", target: "api-reviewer", createdAt: "2026-09-28T10:42:00+08:00", status: "success", message: "已禁用这一项技能，插件中的其他技能保持原样。", canRestore: false },
  { id: "a2", action: "update.apply", target: "playwright", createdAt: "2026-09-28T09:00:00+08:00", status: "success", message: "1.3.2 → 1.4.0 · 定时任务已完成更新。", canRestore: false },
  { id: "a3", action: "skill.remove", target: "meeting-notes", path: `${userRoot}/meeting-notes/SKILL.md`, createdAt: "2026-09-27T16:20:00+08:00", status: "success", message: "已移至可恢复区。", canRestore: true },
  { id: "a4", action: "plugin.install", target: "testany-eng", createdAt: "2026-09-27T14:18:00+08:00", status: "success", message: "安装完整插件，启用所选技能。", canRestore: false },
];

export const projects: ProjectCatalog = { canChooseDirectory: false, entries: [
  { name: "testany-agent-skills", path: projectRoot, source: "codex", available: true },
  { name: "product-notes", path: "/Users/demo/Projects/product-notes", source: "codex", available: true },
  { name: "archived-website", path: "/Users/demo/Archive/website", source: "recent", available: false },
] };

export function snapshot(skills: Skill[], plugins: Plugin[], marketplaces: Marketplace[], activity: Activity[], project: string): Snapshot {
  return { mode: "local", skills, plugins, marketplaces, activity, projects, diagnostics: [], scannedAt: "2026-09-28T10:45:00+08:00", durationMs: 84,
    cli: { available: true, version: "prototype" }, paths: { skills: userRoot, config: "/Users/demo/.codex/config.toml", state: "/Users/demo/.local/share/skilldock", project },
  };
}

export function pluginPreview(item: Plugin, inputSource = source): PluginInstallPreview {
  const names = item.skillCount === 0 ? [] : item.id === "testany-mrkt" ? ["content-writer", "brand-reviewer", "campaign-planner"] : item.id === "release-notes" ? ["release-notes"] : ["draft-writer", "content-reviewer", "style-guide"];
  return { id: `preview-${item.id}`, name: item.name, version: item.version || "1.0.0", description: item.description,
    source: inputSource, sourceType: inputSource.startsWith("/") ? "local" : "git", subpath: `plugins/${item.id}`, ref: "main", commit: "a83cf2e",
    skills: names, skillDetails: names.map((name, i) => ({ path: `skills/${name}/SKILL.md`, name, description: ["起草清晰、有条理的内容。", "检查准确性、一致性与表达方式。", "为团队内容提供统一的风格指南。"][i] })),
    canSelectSkills: true, components: names.length ? [] : ["mcp"], duplicates: [], files: 12, bytes: 28672,
  };
}

export function diffFor(path: string): FileDiff {
  return { path, type: path.endsWith("guide.md") ? "added" : "modified", status: "text", additions: 3, deletions: 1, hunks: [{ oldStart: 18, oldLines: 3, newStart: 18, newLines: 5, lines: [
    { kind: "context", content: "## 视觉验证", oldLine: 18, newLine: 18 },
    { kind: "removed", content: "完成原型后，检查页面布局。", oldLine: 19 },
    { kind: "added", content: "运行原型，逐页检查排版、层级与操作反馈。", newLine: 19 },
    { kind: "added", content: "覆盖正常、空、加载、错误和边界状态。", newLine: 20 },
    { kind: "added", content: "记录截图和实际交互结果，保留恢复路径。", newLine: 21 },
    { kind: "context", content: "遵循项目设计规范。", oldLine: 20, newLine: 22 },
  ] }] };
}

export const removedExample = skill("meeting", "meeting-notes", "把讨论整理成简明的纪要与下一步行动。", "user", ["写作"]);
export function boundarySkills(): Skill[] {
  return [...initialSkills, skill("long", "cross-platform-accessibility-and-localization-reviewer-跨团队无障碍与多语言规范审查", "审查桌面、小屏、多语言与键盘导航，含缺少元数据的既有安装。", "project", ["超长标签测试与跨团队协作", "无障碍"], { enabled: null, canToggle: false, canUpdate: false, reason: "尚未核实安装状态，请刷新后再操作。", sourceInfo: undefined }),
    ...Array.from({ length: 36 }, (_, i) => skill(`boundary-${i}`, `team-workflow-${String(i + 1).padStart(2, "0")}`, "团队工作流示例，用于检查长清单的扫描与分页体验。", "user", [i % 2 ? "研发" : "写作"]))];
}
