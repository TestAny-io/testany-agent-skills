# Plugin 发现与发布维护

仅在新增/删除/重命名 skill、调整 marketplace/plugin manifest、组件路径、symlink、安装发现或准备发布时读取本文件。普通文案/局部实现编辑无需自动执行全部安装发布流程。

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

## 发布准备与授权

- 发布前核对根 README、marketplace、plugin README/plugin.json 与 CHANGELOG 的实际变化；仅更新本次相关内容，不无条件重写所有字段。
- 显式版本每次发布递增，仍只能有一个 authority。日常源文件修改和本地验证不等于发布，默认不自动 bump version。TeamDesk 按用户明确约定执行：每次本地迭代升 patch，每次合并远程 main 升 minor，major 由用户决定；具体同步与授权边界见 [TeamDesk 版本规则](../plugins/teamdesk/AGENTS.md#版本规则)。
- 发布时即使只修改插件目录内随包分发的 README、图片等内容，也需要递增该插件版本；同版本内容变化会与安装缓存产生差异，不能作为不升版本的文档例外。
- 发布、安装、缓存刷新、远程测试、commit/push 各自按用户授权执行；只做源码整改时停在源码和验证证据，不宣称安装端已生效。
- 当前工作区已有未提交修改时保留其内容；报告区分本轮变更与已有变更，不用 reset/checkout 覆盖。
