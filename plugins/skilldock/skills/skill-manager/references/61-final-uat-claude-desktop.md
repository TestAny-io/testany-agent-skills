# 0.11.0 最终 UAT：在 Claude 桌面应用中安装、打开与更新 SkillDock（给另一台电脑上的 Claude）

> 这份说明交给另一台电脑上 Claude 桌面版（Code 标签页）中的 Claude 执行，用户在旁操作界面。
> 前提：已按 [60](60-v17-real-codex-update.md) 完成 V17，这台电脑上 Codex 中的 SkillDock 已是 0.11.0、数据已迁移。
> 目的：核对 PRD 中待 Owner 的验收项——AC-017 第 1 项（添加本仓库 marketplace 后从插件浏览器安装 SkillDock）、第 3 项（不用终端也能更新）、AC-008 第 3 项（安装后没有 SkillDock 的插件错误）；并记下界面上的实际名称与路径，用于 README 定稿。
> 代码来源：公开仓库 `TestAny-io/testany-agent-skills` 的分支 `feature/skilldock-0.11-cross-agent`，尚未发布到 `main`。
>
> **修订（2026-10-12）**：按第一部分（第 3～6 节）的实测结果修订，上一版 sha256 `7a489bd276dbc70f47e382fad7f7f13397f315e50badbc7deeb937f7bf8eb283`（提交 `6d9d519`）。改动：第 3、4、5 节写入桌面应用中的实际入口；第 6 节第 1 项改为桌面应用的核对方式，第 4 项改正预期，新增第 5 项（只读读回慢请求的分段计时）；第 7 节改为桌面应用的路径并分两次推送；第 8 节改为就地切换。**已做完第 3～6 节的，从第 6 节第 5 项继续。**

## 1. 这次会真实改动什么（先读给用户听）

- 在 Claude 中添加本仓库的 marketplace（固定到开发分支），并把 SkillDock 安装到 Claude（用户范围）；
- 之后从 Claude 打开的 SkillDock 与 Codex 中的是同一个实例、同一份数据；
- 0.11.0 发布后，要把这个 marketplace 改回跟随 `main`（第 8 节）。

每一步改动之前先告诉用户，等用户同意。遇到与本说明不符的情况，停下来问用户。

## 2. 边界

- 记录放在 `~/skilldock-uat-final/`。
- 不打印完整的配置文件（`~/.claude/settings.json`、`~/.claude.json` 等），需要核对时只列名称。
- 只用于“读回”的命令行查询可以在 Bash 中运行；**安装与更新本身请用户在界面中完成**，这正是要验证的内容。确实做不到时，把原因记下来再改用命令行，并在汇报中说明。

## 3. 准备（只读）

```bash
mkdir -p "$HOME/skilldock-uat-final"
pick() { for c in "$@"; do if [ -n "$c" ] && [ -x "$c" ] && "$c" --version >/dev/null 2>&1; then echo "$c"; return 0; fi; done; return 1; }
CLAUDE=$(pick "$CLAUDE_CODE_EXECPATH" "$(command -v claude)" || find "$HOME/Library/Application Support/Claude/claude-code" -path '*/claude.app/Contents/MacOS/claude' -type f 2>/dev/null | sort -r | while IFS= read -r c; do "$c" --version >/dev/null 2>&1 && { echo "$c"; break; }; done)
echo "Claude 命令行：${CLAUDE:-（未找到可运行的）}"; "$CLAUDE" --version
NAMES='let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const v=JSON.parse(s);const a=Array.isArray(v)?v:(v.installed??v.marketplaces??[]);for(const x of a)console.log(" ",x.id??x.name,x.scope??"",x.version??"",x.enabled??"")}catch{console.log("  （读取失败）")}})'
echo "== Claude 插件"; "$CLAUDE" plugin list --json | node -e "$NAMES"
echo "== Claude marketplace"; "$CLAUDE" plugin marketplace list --json | node -e "$NAMES"
```

- 如果 marketplace 列表中**已有** `testany-agent-skills`：记下它现在的来源（`"$CLAUDE" plugin marketplace list --json` 中该项的 source 字段，只看仓库与 ref），告诉用户。它指向 `main` 时**不必移除**：按第 4 节再添加一次带 `#分支` 的来源，同名 marketplace 会就地改为该分支，从它安装的插件不受影响（2026-10-10 实测）。
- 如果 Claude 中已装有 SkillDock：记下版本与来源，问用户怎么处理后再继续。

## 4. 添加本仓库 marketplace（改动 Claude，先征得同意）

请用户在 Claude 桌面应用的 Code 标签页里，在对话框中输入：

```text
/plugin marketplace add TestAny-io/testany-agent-skills#feature/skilldock-0.11-cross-agent
```

记录：这条斜杠命令在桌面应用里是否可用、显示了什么。若桌面应用里有界面上的“添加 marketplace”入口，也请用户试一次并记下菜单名称。都不行时，记下原因，再用 `"$CLAUDE" plugin marketplace add TestAny-io/testany-agent-skills#feature/skilldock-0.11-cross-agent` 完成（汇报中注明用了终端）。

> 实测（2026-10-10，桌面应用 2.1.293）：这条斜杠命令不执行添加，而是打开设置中的 **Plugins** 页（左侧栏 Customize → Plugins，标签 **Yours** / **Discover**）。添加入口在该页右上的 **+ Add ▾** 中：选从 Git 仓库添加的那一项，输入 `TestAny-io/testany-agent-skills#feature/skilldock-0.11-cross-agent`，点 **Sync**。**请用户把这一项菜单的原文告诉你，记进汇报**（README 要照抄）。

读回：`"$CLAUDE" plugin marketplace list --json | node -e "$NAMES"`。

## 5. 从插件浏览器安装（AC-017 第 1 项）

请用户点提示框旁的 **+** → **Plugins** → **Add plugin**，在插件浏览器中找到 SkillDock，选择“为你安装（用户范围）”。

> 实测（2026-10-10）：在 Plugins 页的 **Discover** 中按 marketplace 筛选，SkillDock 显示为 **Skilldock**，点 **Add** 直接装成用户范围，不询问范围；已装的显示 **✓ Added**。

记录：

- 菜单与按钮的实际名称（与上面的写法不同时照实记下）；
- 插件浏览器里是否出现 SkillDock，以及它的说明文字；
- 安装结束时的提示（是否需要 `/reload-plugins`）；
- TeamDesk 在列表中是否注明“仅支持 Codex”。

读回：

```bash
"$CLAUDE" plugin list --json | node -e "$NAMES"
```

应只多出 `skilldock@testany-agent-skills`（已启用），没有安装其他插件。

## 6. 没有错误、能打开、是同一个实例（AC-008 第 3 项）

1. 桌面应用中 `/plugin` 打开的是 Plugins 页，没有 **Errors** 标签页。请用户在 **Yours** 标签页看 Skilldock 一行有没有错误或警告标记，点开它看详情中有没有错误；再读回 `"$CLAUDE" plugin list --json` 中 skilldock 一项有没有错误字段。记录。
2. 新开一个会话（或 `/reload-plugins`），输入 `/skilldock:skill-manager`。SkillDock 应在内置浏览器面板中打开；记录。
3. 核对与 Codex 中的是同一个实例：

   ```bash
   URL=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).url)' "$HOME/.local/share/skilldock/launcher.json")
   curl -s "$URL/api/health" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const h=JSON.parse(s);console.log(JSON.stringify({appVersion:h.appVersion,dataGeneration:h.dataGeneration,instanceId:h.instanceId}))})'
   ```

4. 在 SkillDock 的“Agent 环境”页记录：Codex 与 Claude 两张卡片各自显示的 SkillDock 版本、管理状态、命令行路径。Claude 若在装 SkillDock 之前就已被发现（例如 V17 迁移时），会保持“只读”，这符合设计（HLD 3.6：默认值只在 Agent 第一次出现时确定）；请用户点“启用管理”，再记录。
5. 只读读回第一次打开的慢请求（第一部分中首次读取清单用了约 32 秒）。只取计时行，不打印整个日志：

   ```bash
   grep '读取清单用时' "$HOME/.local/share/skilldock/server.log" | tail -5
   ```

   把输出原样记进汇报（每行列出 `codex-list`、`scan`、`agents`、`claude-list` 各段的毫秒数）。没有输出时也照实记下。

## 7. 不用终端更新（AC-017 第 3 项）

开发者分两次往分支推送（Claude 以 marketplace 的提交摘要作为 SkillDock 的版本，新提交即新版本）：第一次用于 Claude 界面中的更新，第二次用于 SkillDock 自己的更新页。

1. 告诉用户：请通知开发者“已装好，可以推第一个提交”。开发者确认推送后再继续。
2. 先只读确认 Claude 还没有自动拿到新版本：`"$CLAUDE" plugin list --json | node -e "$NAMES"`（应仍为 `e7bf95a311b9`）。
3. 请用户在 Plugins 页找到刷新 marketplace 的入口（可能在 **+ Add ▾**、筛选菜单，或 **Yours** 中 marketplace 分组的菜单里；找不到时可以在 Discover 中对 `testany-agent-skills` 再执行一次第 4 节的添加并点 **Sync**），刷新后若 Skilldock 显示有更新，按界面提示更新。记录：入口与按钮的原文、显示的结果；整个过程没有用终端。
4. 读回版本是否变化：`"$CLAUDE" plugin list --json | node -e "$NAMES"`（应变为新提交的摘要）。在当前会话中再调用一次 `skilldock:skill-manager`，确认正常、仍沿用同一实例（第 6 节第 3 项的读回）。
5. 告诉用户：请通知开发者“可以推第二个提交”。开发者确认后，请用户在 SkillDock 的“更新”页找到 Claude 中的 skilldock，点 **检查更新**，有更新时按提示应用。记录：检查结果、应用结果、读回的版本；界面上的提示原文。

## 7A. 新接通的界面路径：从本地目录把插件装到 Claude（可选，建议做）

这条界面路径在开发分支上刚接通，之前没有实测过。用一个临时的测试插件试，试完卸载：

1. 准备一个只含一个技能、带 Claude manifest 的测试插件（不涉及任何真实插件）：

   ```bash
   P="$HOME/skilldock-uat-final/uat-local-plugin"
   mkdir -p "$P/.claude-plugin" "$P/skills/uat-hello"
   printf '{"name":"uat-local-plugin","version":"0.0.1","description":"SkillDock UAT test plugin"}\n' > "$P/.claude-plugin/plugin.json"
   printf -- '---\nname: uat-hello\ndescription: SkillDock UAT test skill.\n---\nSay hello.\n' > "$P/skills/uat-hello/SKILL.md"
   echo "$P"
   ```

2. 请用户在 SkillDock 的“插件”页点“安装插件”，选“本地目录”，填上面打印的路径。记录：窗口里是否出现“安装到 Codex / 安装到 Claude”的选择（两侧都启用管理时应出现，默认 Codex）；选 Claude 后预览说明了什么（带 Claude manifest 的会放进 Claude 的个人技能目录）。
3. 确认安装后，读回：`ls "$HOME/.claude/skills"` 中出现 `uat-local-plugin`；`"$CLAUDE" plugin list --json | node -e "$NAMES"` 中出现 `uat-local-plugin@skills-dir`。
4. 请用户在 SkillDock 中卸载这个测试插件（它进入可恢复区），再确认 `~/.claude/skills` 中已没有它。

## 8. 0.11.0 发布之后

开发者合并到 `main` 并通知后，把 marketplace 改回跟随 `main`（经用户同意）：

1. 在 Plugins 页 **+ Add ▾** 中按第 4 节的方式再添加一次 `TestAny-io/testany-agent-skills`（不带 `#分支`），点 **Sync**；
2. 读回：`"$CLAUDE" plugin marketplace list --json` 中该项的 source 不再带 ref；`"$CLAUDE" plugin list --json | node -e "$NAMES"` 中 SkillDock 与 testany-eng 都还在；
3. 若没有就地切换（来源仍带 ref），再经用户同意移除该 marketplace（会卸载从它安装的插件，确认框会列出）、重新添加并从插件浏览器重新安装。数据目录不受影响，计划与记录都在。
4. 提醒用户：Codex 一侧的自动更新计划里，SkillDock 这一项因 V17 期间安装目录变化而每次跳过（“旧计划不接管新对象，请重新选择”），在按 [60](60-v17-real-codex-update.md) 第 8 节改回 `main` 之后，到 SkillDock 的“更新”页重新选择它。

确认正常后，经用户同意把 `~/skilldock-uat-final` 移到废纸篓。

## 9. 汇报

| 项 | 结果 |
|----|------|
| 添加 marketplace：斜杠命令在桌面应用中是否可用；有无界面入口；是否用了终端 | |
| 插件浏览器：是否出现 SkillDock；菜单与按钮的实际名称 | |
| 安装后：只多出 SkillDock、已启用；是否需要重载 | |
| Plugins 页 Yours 中 Skilldock 有无错误标记；`plugin list` 有无错误字段 | |
| `/skilldock:skill-manager` 是否在内置浏览器中打开；与 Codex 是否同一实例 | |
| “Agent 环境”页：两侧版本、Claude 管理状态（启用前后） | |
| `server.log` 中“读取清单用时”的计时行（原样） | |
| Claude 界面中刷新 marketplace 并更新：入口原文、结果、版本是否变化 | |
| SkillDock 更新页更新 Claude 中的 SkillDock：检查与应用结果、读回版本 | |
| （7A）从本地目录装插件到 Claude：是否出现 Agent 选择、安装位置、卸载后是否清干净 | |
| TeamDesk 是否注明“仅支持 Codex” | |
| 其他异常或与 README 写法不同的地方 | |
