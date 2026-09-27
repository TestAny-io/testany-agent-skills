# Plugin 发现与发布维护

在新增/删除/重命名 skill、调整 marketplace/plugin manifest、组件路径、symlink、安装发现或准备合并远程 `main` 时读取本文件。**合并远程 `main` 就是发布**，普通文案或局部实现只要纳入该次合并，同样执行适用的发布准备；仅本地或功能分支开发不因此自动合并或安装。

## 事实源与结构

仓库按领域聚合 plugin：testany-eng、testany-llm、testany-mrkt、testany-bot。SkillDock 按用户确认作为独立软件分发于 skilldock 插件，仅包含一个应用入口；其他领域规则不变。
技能位于 `plugins/<plugin>/skills/<skill>/SKILL.md`，slash 入口位于同 plugin 的 `commands/`。
仓库不再内置 skill-creator 初始化/校验/打包脚本；使用已有资源和实际可用校验器，不假设存在旧工具。

对外事实源为根 README 与各 plugin README；安装发现事实源为 marketplace、默认组件约定及存在时的 plugin.json。下述规则从原全局说明迁移，未改变发现语义。

## Plugin 注册与 Skill 发现


`.claude-plugin/marketplace.json` 按领域注册聚合 plugin，`source` 指向对应的 `plugins/<plugin-name>`：

```json
{
  "plugins": [
    {
      "name": "testany-eng",
      "description": "研发流程与导航工具集……",
      "source": "./plugins/testany-eng"
    }
  ]
}
```

Claude Code 会自动发现 plugin 根目录 `skills/<skill-name>/SKILL.md`；`plugin.json` 本身在上游规范中可选，本仓库为版本、描述和明确组件配置而保留。`plugin.json.skills` 通常在默认 `skills/` 之外**追加**发现范围；marketplace entry 在默认 `strict: true` 下可继续补充并合并组件。`strict: false` 时 marketplace entry 是完整组件 authority，若 `plugin.json` 同时声明组件则冲突并 fail closed。只有当 marketplace entry 的 `source` 解析到 marketplace root，且该 entry 自身 `skills` 列出实际存在的特定子目录时，这些路径才按官方例外成为完整集合；列 `./skills/`/plugin root 保持全量扫描，全部列出路径均不存在时回退默认扫描。一旦显式声明，路径必须是 `.`（plugin root）或以 `./` 开头的非空相对路径/路径数组，`null` 不是“未声明”。同一 marketplace 内可用 symlink 复用 skill/resource；dangling target 或越出 marketplace root 的 target 必须 fail closed。`commands` 等其他组件遵循各自合并规则。在既有领域中新增 skill 时，应增加 `skills/<skill-name>/`，而不是新增 marketplace plugin；只有新建独立领域级 plugin 时才增加 marketplace 条目。上游规则见 [Claude Code Plugins reference](https://code.claude.com/docs/en/plugins-reference) 与 [Plugin marketplace strict mode](https://code.claude.com/docs/en/plugin-marketplaces#strict-mode)。

Plugin version 只能保留一个 authority，三选一：仅在 marketplace entry 声明、仅在 `plugin.json` 声明，或两处都省略并使用 source resolved version；绝不能同时在 marketplace entry 与 `plugin.json` 声明。显式版本每次发布必须递增，否则安装端会继续复用旧 cache。

SkillDock 和 TeamDesk 使用 Codex 的 `.codex-plugin/plugin.json`；其他插件保留 `.claude-plugin/plugin.json`。仓库校验器同时识别两种位置，但同一个插件若同时存在两份 manifest 则拒绝，避免重复 authority。校验器也接受 Codex 的 `{"source":"local","path":"./plugins/example"}` 来源描述，保留相同的相对路径及越界检查。共享的 `.claude-plugin/marketplace.json` 继续使用两种宿主都支持的字符串相对来源：Claude 的本机校验器不接受 Codex 的 local 对象。Codex 的 `policy` 字段在 Claude 中会被忽略；不能把 Codex 实际安装通过表述成 Claude 全部能力通过。格式依据 [OpenAI plugin 文档](https://learn.chatgpt.com/docs/plugins) 和 [Claude plugin sources](https://code.claude.com/docs/en/plugin-marketplaces#plugin-sources)，安装行为以本轮真实 CLI 证据为准。

## 变更与本地检查

1. 读取本次涉及的 marketplace entry、source 路径和可选 plugin.json，按上面的 authority 规则确定实际组件范围，不仅按目录名称推断。
2. 新增/删除/重命名 skill 同步 commands（存在时）、根/plugin README、发现配置（有显式清单时）及 CHANGELOG。不为了新增既有领域的 skill 新建一个 plugin。
3. 修改行为说明时同步受影响入口、引用、模板及对外描述，避免主文件与参考材料互相恢复旧规则。
4. 按影响范围执行本地检查：JSON/YAML、相关链接、skill frontmatter、资源路径/图标、现有相关测试。使用仓库 `plugins/testany-eng/scripts/validate_codex_compat.py --profile repository` 检查实际发现集合及已审计的字段子集；它通过不代表宿主安装或真实平台行为已验证。字段与宿主范围见下节。
5. symlink 需核对真实 target 和 marketplace root 边界，不把当前进程能读到文件当安装合法；缺失/越界必须 fail closed。
6. 记录哪些检查实际运行、哪些未运行及原因。工具缺失不自动安装，不编造测试通过。

## Frontmatter 校验范围

- `--profile repository`（默认）：必需 name/description，加公共可选字段 license/compatibility/metadata/allowed-tools；明确支持 Claude 的 argument-hint、列表形式 allowed-tools 与一次性 prompt Stop hook 子集。未知字段、重复 YAML 键、错误类型和不受支持的 hook 结构必须报错，不是接受所有宿主扩展。
- `--profile portable`：同一套必填、类型与发现检查，但不接受 Claude 扩展，allowed-tools 仅接受标准字符串。它是字段可移植性检查，不是完整官方认证；宿主差异不能被静默删除后冒充原文件通过。
- 加 `--format json` 输出实际 profile、错误、Claude 扩展清单及 `host_runtime_verified: false`。扩展被识别不等于 Codex 实现了参数补全或 Claude hook。
- 系统 skill-creator 的 `quick_validate.py` 是另一套窄白名单，当前甚至不接受公共规范的 compatibility。原文件被它拒绝时保留原始失败记录；合法 Claude 字段按上述分层检查，不改用户已安装校验器、不将配置塞入 metadata 假装宿主会执行。
- 当前 Stop hook 子集只接受 `Stop -> hooks -> type: prompt`，handler 必须 `once: true`，可带正数 timeout 与 statusMessage；这是仓库针对有限交付检查的维护政策，不是完整 Claude schema。新增其他类型/事件须补充规则、来源和正反例，不直接放宽白名单。

来源：[Agent Skills 字段规范](https://agentskills.io/specification)、[Claude frontmatter](https://code.claude.com/docs/en/skills#frontmatter-reference)、[Claude hook 的 once 与生命周期](https://code.claude.com/docs/en/hooks#hooks-in-skills-and-agents)。Claude skill hook 默认延续到后续轮次；once 仅在成功运行后注销，失败、阻止或超时仍可保留，因此有限补救还需重入及任务范围保护。它不能挪成 plugin 全局 hook，也不能只挪到与 skill 同名、可能被 skill 优先覆盖的 command。

## Main 即发布

本仓库以远程 `main` 分发。**任何内容进入远程 `main` 即已发布**，包括 skill、应用、脚本、文档、资源、测试和仓库规则。不能把一次合并当成“仅源码更新”而等以后再升版，也无需等 tag、GitHub Release 或用户安装才承认发布。仅本地或功能分支修改可暂记 `Unreleased`；准备合并时必须完成对应发布准备。

用户明确授权合并 `main`，即授权该次仓库发布及必要的版本、记录和验证工作，不另拆一个“发布许可”重复询问。仅有本地编辑或 feature 分支 push 授权时，不自行扩大为 main 合并。本机安装、缓存刷新和其他外部操作仍按已有任务授权执行，不能由 main 发布自动推导。

### 影响范围与版本

- 相对最新远程 `main` 检查完整候选差异，依据 marketplace source、实际组件范围和共享资源引用定位受影响插件，不能只看当前提交或顶层目录名。
- 受影响插件的显式版本必须高于远程 `main` 的对应版本；分支之前已升过版，也要防止并行 PR 导致同版本内容不同。保持单一 version authority；采用 source resolved version 的插件必须核实解析结果随该次提交变化，不能凭空新增第二 authority。
- 插件内随包分发的 README、图片、规则和其他资源变化也必须升版，不设“仅文档”或“小修复”例外；共享文件或发现配置改变多个插件时，逐个评估并递增受影响版本。
- 根级文档、仓库规则和测试也随 main 发布并进入本轮记录；若不影响任何插件的分发内容、发现或运行行为，可不改插件版本，但需在 PR 中说明影响范围，不能把这类合并称为“未发布”。不为未受影响的插件空升版本。
- 默认按 SemVer 决定增量：修复及文档/资源更新升 patch，新增兼容能力升 minor，不兼容变更按 major 处理；更具体的用户约定优先。TeamDesk 保留每次本地迭代升 patch、每次合并远程 main 升 minor、major 由用户决定的规则，见 [TeamDesk 版本规则](../plugins/teamdesk/AGENTS.md#版本规则)。同一次发布的多个提交不要求反复递增。

### 合并前与合并后

1. **取最新基线**：刷新远程 `main`，保留工作区已有修改，确认本轮允许范围；只检查、提交和发布属于本轮的内容，不用 reset/checkout 覆盖其他工作。
2. **同步发布内容**：在待合并分支完成版本递增；核对根/plugin README、marketplace、plugin.json，以及存在时的应用版本、锁文件和界面版本。只同步实际受影响项，历史版本记录保留原值。
3. **整理变更记录**：将本次发布项从 `Unreleased` 移到带插件版本和日期的记录；没有独立版本号的仓库规则/文档变更使用日期记录，不虚构仓库级版本。不要把无关历史条目一并标成已完成验收。
4. **验证后合并**：执行相关本地检查与仓库发现校验，核对版本唯一性及相对当前 main 的递增。在 PR 写明受影响插件、前后版本与实际验证；合并前再核实目标基线和检查状态，必要时更新候选。版本或必要检查未完成，不能先合并后补票。
5. **读回发布结果**：核实 PR 已合并、远程 `main` 包含预期提交，以及对应 commit 上的插件版本和发布记录；报告实际发布版本与提交。main 发布不等于本机安装、缓存刷新或真实宿主行为验证已完成。
