# 阶段 4、5 合并试用（UAT）说明

> 适用分支：`feature/skilldock-0.11-cross-agent`（本地，未推送），提交 `2e8dd42` 及之后（阶段 4、5 的编码与代码评审都已完成：最近一次合并复审见 [52](52-cross-agent-phase5-review-r2.md)）
> 目的：在独立的数据目录中试用 Claude 一侧的修改功能（阶段 4）与更新、后台计划、SkillDock 自身的一键更新（阶段 5），不影响正在使用的 SkillDock（端口 4771、数据目录 `~/.local/share/skilldock`）。
> 这次试用与阶段 3 不同：**试用实例会真的改动 Claude**（在 Claude 管理已启用时）。请按第 1 节的建议，用专门准备的测试对象试。

## 1. 试用前提与安全建议

- **两边的 SkillDock 都不能低于 0.10.3**，否则启动时退出码 4。试用数据目录 `~/.local/share/skilldock-uat` 在阶段 3 试用时已经接管过，不会再经过迁移门槛。
- **试用实例读写你真实的 Codex 与 Claude。**
  - Codex：默认“已启用管理”，启用、停用、移除、安装、更新都会真的改动 Codex。
  - Claude：Claude 中装有 SkillDock 时默认“已启用管理”，否则为只读。启用后，安装、启停、卸载、更新、添加或移除 marketplace 都会真的改动 Claude（`~/.claude/settings.json`、插件缓存等）。
  - 只想看、不想改：在“Agent 环境”页把对应一侧设为只读。
- **建议用测试对象试修改功能**：例如新建一个临时技能目录（只含一个 `SKILL.md`）、一个临时的本地 marketplace 或测试插件，试完再移除。移除的技能进入可恢复区，可在操作记录中恢复；卸载 Claude 插件默认删除插件数据，确认框中可选择保留。
- **更新计划**：开启计划会为试用数据目录注册一个后台任务。想试计划时，试完在更新页关闭计划；关闭后后台任务会被移除。
- **首次启动后的重启**：试用实例若仍在运行旧代码，用第 2 节的 `restart` 重启。

## 2. 启动与重启

```bash
SKILLDOCK_STATE_DIR="$HOME/.local/share/skilldock-uat" PORT=4781 /bin/sh "/Users/kailaichen/Downloads/source code/testany-agent-skills/plugins/skilldock/skills/skill-manager/scripts/launch.sh" restart --project "$HOME"
```

成功后会输出 `http://127.0.0.1:4781`，在浏览器中打开。实例没有运行时，`restart` 同样会启动它。

## 3. 建议核对的内容

### 3.1 Claude 管理（阶段 4）

1. **“Agent 环境”页**
   - Claude 卡片：启用管理的确认框列出启用后可能写入的位置；启用后状态变为“已启用管理”。
   - 停用 Claude 管理时，若 SkillDock 曾为“单插件来源”生成过本地 marketplace，确认框提供“一并清理”（默认不勾）。
2. **Claude 技能**
   - 安装：在技能库中选 Claude，从本地目录或 Git 安装到个人技能目录或当前项目的 `.claude/skills`。
   - 启停与可见性：开关写入 Claude 设置；“仅名称”“仅用户可调用”等可见性按来源层级显示。
   - 移除与恢复：移除后在操作记录中恢复。
   - 两边共用的技能：修改时确认框提示“两侧看到的内容都会改变”；两侧关联了不同来源时，更新被拒绝并说明冲突。
3. **Claude 插件**
   - 从 marketplace 安装：选择安装范围（用户、项目、本地）；安装后可启停、卸载（卸载确认框有“保留插件数据”）。
   - 从本地目录或 Git 安装：来源带 Claude manifest 时作为技能目录插件放入技能目录；不带时，SkillDock 生成一个本地 marketplace（名称以 `skilldock-` 开头），只允许用户或本地范围。
4. **Claude marketplace**：添加、刷新、移除（移除会卸载从它安装的插件，确认框会说明）。

### 3.2 更新与后台计划（阶段 5）

1. **更新页中的 Claude 对象**
   - Claude 技能、技能目录插件与从 marketplace 安装的 Claude 插件都出现在列表中，可以检查更新。
   - 插件内容变了而版本号没变时，提示“请维护者递增版本”（Claude 只在版本变化时更新）。
   - 没有版本号的插件更新前会先复制一份，供需要时手动恢复。
   - 由 claude.ai 同步或组织托管的对象，以及来源为命令、需要凭证命令或项目目录已不存在的插件，不可检查，并说明原因。
   - 可以点开 Claude 插件更新的逐文件差异。
2. **SkillDock 生成的本地 marketplace 中的插件**：从原始来源检查与更新。
3. **后台计划**
   - 计划中可以加入 Claude 目标；Claude 管理停用、或 Claude 命令行不可用时，这些目标显示为暂停。
   - Claude 自己更新了插件，或维护者改 marketplace 条目发布新版之后，计划照常更新，不要求重新选择。
   - 跨侧技能（一侧的技能，内容在另一侧某个插件的目录中）：另一侧已启用管理时，加入自动应用的计划会先要求确认；之前保存、尚未确认的，会在计划区列出，并可点“确认”。
   - 试完请关闭计划。
4. **SkillDock 自身**
   - “Agent 环境”页：某一侧的 SkillDock 比另一侧旧时，该侧显示“一键更新 SkillDock”，确认后经该侧的命令行更新并读回（只读的一侧也可以）。两侧版本相同时不显示。
   - 更新后，正在运行的实例会自动切换到最高版本（从开发目录启动的试用实例不在此列，见第 4 节）。
5. **语言**：在偏好设置中切到英文或日文，新页面与提示不应残留中文。

## 4. 已知限制

- 界面问题不再零碎修改：Owner 决定在 Claude 版完成后整体重新设计，已知问题见 [41-ui-redesign-backlog.md](41-ui-redesign-backlog.md)（含 UI-12：计划区待确认技能的提示只列技能名）。
- 试用实例从开发目录启动，不属于任何已安装的 SkillDock 家族，所以不会因另一侧出现更高版本而自动切换；这项行为由自动化测试覆盖。
- 迁移门槛时的一键更新（另一侧低于 0.10.3 时）只在尚未接管的数据目录上出现；试用数据目录已接管，看不到这一步，已由端到端测试覆盖。
- Claude 可安装插件清单取自本机保存的 marketplace 副本，不调用联网的 `--available` 清单；刷新 marketplace 即更新副本。
- 发布 0.11.0 前须把 `package.json` 版本升为 0.11.0（当前分支仍为 0.10.3）。试用实例从开发目录启动，不受这一点影响。

## 5. 停止与清理

```bash
SKILLDOCK_STATE_DIR="$HOME/.local/share/skilldock-uat" PORT=4781 /bin/sh "/Users/kailaichen/Downloads/source code/testany-agent-skills/plugins/skilldock/skills/skill-manager/scripts/launch.sh" stop
```

- 开过计划的话，先在更新页关闭计划，再停止。
- 试用中对 Claude、Codex 做的改动不会随停止而撤销；用测试对象试过的，请在 SkillDock 或 Claude 中移除。
- 试用数据都在 `~/.local/share/skilldock-uat`；不再需要时，把这个目录移到废纸篓即可。

## 6. 反馈

试用中看到的任何不对，请直接告诉我：截图，或者描述在哪一页、看到什么、预期什么都可以。
