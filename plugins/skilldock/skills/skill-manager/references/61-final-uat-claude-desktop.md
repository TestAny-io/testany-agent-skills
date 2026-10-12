# 0.11.0 最终 UAT：在 Claude 桌面应用中安装、打开与更新 SkillDock（给另一台电脑上的 Claude）

> 这份说明交给另一台电脑上 Claude 桌面版（Code 标签页）中的 Claude 执行，用户在旁操作界面。
> 前提：已按 [60](60-v17-real-codex-update.md) 完成 V17，这台电脑上 Codex 中的 SkillDock 已是 0.11.0、数据已迁移。
> 目的：核对 PRD 中待 Owner 的验收项——AC-017 第 1 项（添加本仓库 marketplace 后从插件浏览器安装 SkillDock）、第 3 项（不用终端也能更新）、AC-008 第 3 项（安装后没有 SkillDock 的插件错误）；并记下界面上的实际名称与路径，用于 README 定稿。
> 代码来源：公开仓库 `TestAny-io/testany-agent-skills` 的分支 `feature/skilldock-0.11-cross-agent`，尚未发布到 `main`。
>
> **修订（2026-10-12）**：按第一部分（第 3～6 节）的实测结果修订，上一版 sha256 `7a489bd276dbc70f47e382fad7f7f13397f315e50badbc7deeb937f7bf8eb283`（提交 `6d9d519`）。改动：第 3、4、5 节写入桌面应用中的实际入口；第 6 节第 1 项改为桌面应用的核对方式，第 4 项改正预期，新增第 5 项（只读读回慢请求的分段计时）；第 7 节改为桌面应用的路径并分两次推送；第 8 节改为就地切换；第 9 节汇报表相应增删（去掉 Errors 一行，增加计时与两次更新的行）。
>
> **修订 r3（2026-10-12）**：按评审 [62](62-cross-agent-uat-fix-review.md) 修订，上一版 sha256 `22f3a345631de2185365146c21abb65209b23c2b5f30a2b62a17dc86258e8b92`（提交 `73c438a`）。改动：续做起点改到第 6 节第 4 项的“启用管理”；第 6 节第 1 项、第 8 节第 2 项的读回改为只打印所需字段；第 7 节新增第 5 项（核对页面顶部的旧提示，并说明修复前启动的实例会继续带着它），原第 5 项顺延为第 6 项；第 9 节加一行。
>
> **修订 r4（2026-10-12）**：按第二部分的实测修订第 7 节，上一版 sha256 `eefc21001b131a78b5ae366b591c63e1a3423b301189800e98a42981c498a63a`（提交 `141d917`）。桌面应用没有刷新 marketplace 的入口，对同一来源再添加会失败，且只按声明的版本号识别插件更新；SkillDock 在 Claude 侧不声明版本（以提交摘要为版本），桌面应用的 Update 不可用。Owner 2026-10-12 决定 0.11.0 保持现状、在条目中声明版本放入 0.11.1。第 7 节因此改为在 SkillDock 的“更新”页检查并应用。同时按复核 [62 r2](62-cross-agent-uat-fix-review-r2.md)：第 7 节第 5 项把核对安装目录与停止实例拆成两步，并改正旧提示何时消失的说法；第 8 节第 2 项与第 3 节改为从 `known_marketplaces.json` 按键只读该项的来源（命令行输出中读不到 ref）。补记 r3：第 9 节汇报表另加了“旧提示核对”一行。
>
> **修订 r5（2026-10-12）**：按第二部分的更正修订，上一版 sha256 `caffbe9a2685e7b083ece26ab58d62f027b851e0d09f50c9b7840cefe3642f22`（提交 `b1903be`）。桌面应用**有**刷新 marketplace 的入口：Plugins 页 **+ Add ▾** → **Manage marketplaces** → 该 marketplace 行的 **⋮** → **Check for updates**（同一菜单另有 **Remove**，没有修改来源的入口）。r4 中“没有刷新入口”的说法作废；第 4 节写入菜单原文；第 7 节改为先用该入口刷新、核对 Update 仍不可用，再在 SkillDock 的“更新”页应用。
>
> **修订 r6（2026-10-12）**：按复核 [62 r3](62-cross-agent-uat-fix-review-r3.md) 修订，上一版 sha256 `107ae4d6af16e65767ff39dfb1891865077c13ccc439405a5f2412921825507f`（提交 `e1516d0`）。改动：第 7 节开头写明两次推送都要改动 `plugins/skilldock/` 下的文件、不要用“Agent 环境”页的一键更新；第 7 节第 4 项与第 5 项第 3 小项改为在新开或已重载的会话中调用；第 8 节第 2 项的对照读数改为切换前必做，读取失败只报“读取失败”，git 形态的来源打印去掉凭证的主机与路径；续做起点改为写明两部分已做到哪里。更正前几版说明：r4、r5 也改了第 9 节汇报表（r4 改写一行、加两行，r5 改写一行），r4 说明中的“补记 r3”应为“r3 还改写了第一条修订说明（补上第 9 节汇报表的增删）并把续做起点移出该说明”；“`plugin marketplace list --json` 的输出不含 ref”应为“从该输出中读不到 ref”。
>
> **修订 r7（2026-10-12）**：按 Check for updates 补测结果修订，上一版 sha256 `5f4bd5f596946c3fc9275e66fec9a1d87f5fa7465dac0502c7b6ab3de752ee76`（提交 `4abe81f`，与本次一起推送）。桌面应用刷新 marketplace 时会往已装目录写入合成的 `.claude-plugin/plugin.json`，修复前 SkillDock 因此报“本地修改”；修复后的预期写入第 7 节第 6 项第 2 小项。
>
> **修订 r8（2026-10-12）**：按复核 [63](63-cross-agent-synthesized-manifest-review.md) 与修复后重测修订，上一版 sha256 `06fb73d8a35f1734c77b0b15e41ebd90e08e66e0483c1645db15bccfa3d27234`（提交 `4d3a858`）。检查由正在运行的实例执行：修复要先经一次更新装上、实例换到新代码后才生效；第 7 节第 6 项第 2 小项写明这一点与重测时的做法；进度改为实际情况；r7 说明中“未推送”更正为与本次一起推送。
>
> **修订 r9（2026-10-12）**：按复核 [63 r2](63-cross-agent-synthesized-manifest-review-r2.md) 修订，上一版 sha256 `d08bd0717c27606a06da389e90771c85b5db7c0f2076c5d40fe43eb3ede7f361`（提交 `d2034fd`）。第 7 节第 6 项第 2 小项改正：合成清单从 `4d3a858` 起不计入，`.DS_Store` 从 `d2034fd` 起不计入（对来源自带 Claude 清单的插件从下一个提交起才完全成立）；核对实例代码改为读启动记录的 `runtime`。进度更新：第 4 步已通过。
>
> **修订 r10（2026-10-12）**：按复核 [63 r3](63-cross-agent-synthesized-manifest-review-r3.md) 更正措辞，上一版 sha256 `1415a01c51fa6e13b7b8ed41c2f2abaca33126e9229dbb7ce8307dc573cb3401`（提交 `c223730`）：r9 说明中的“第 4 步”指第 7 节第 6 项。
>
> **修订 r11（2026-10-12，发布之后）**：按收尾的实测（[65](65-post-release-wrapup.md)）更正第 8 节，上一版 sha256 `2a4d7b77554748278b17e0786f18626c3c2eba5aee3cd88812617fadd36a4214`（提交 `8dc2347`）。第 2 项的就地切换在装过带分支来源的电脑上不成立，改为说明原因并直接走第 3 项；读回的预期改为只看 `hasRef`；补上同源插件一并卸载、运行实例要停一次两点。第 1～7、9 节未改；UAT 已于发布前执行完毕，这次更正只为以后照此收尾的人。
>
> **进度**：第一部分（2026-10-10）做完第 3～6 节；第二部分（2026-10-12）做完第 6 节第 4、5 项，第 7 节第 2～6 项与第 7A 节。第 7 节第 6 项修复前失败（合成清单被判为本地修改），修复后用 `d2034fd` 重做通过：桌面应用 Check for updates 拉到新提交并写入合成清单，修复后的实例检查与应用都正常，读回 `d2034fdc537f`，没有用终端。剩下第 8 节（发布后）。

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

- 如果 marketplace 列表中**已有** `testany-agent-skills`：记下它现在的来源（只看仓库与 ref，读法见第 8 节第 2 项；`plugin marketplace list --json` 的输出不含 ref），告诉用户。它指向 `main` 时**不必移除**：按第 4 节再添加一次带 `#分支` 的来源，同名 marketplace 会就地改为该分支，从它安装的插件不受影响（2026-10-10 实测）。
- 如果 Claude 中已装有 SkillDock：记下版本与来源，问用户怎么处理后再继续。

## 4. 添加本仓库 marketplace（改动 Claude，先征得同意）

请用户在 Claude 桌面应用的 Code 标签页里，在对话框中输入：

```text
/plugin marketplace add TestAny-io/testany-agent-skills#feature/skilldock-0.11-cross-agent
```

记录：这条斜杠命令在桌面应用里是否可用、显示了什么。若桌面应用里有界面上的“添加 marketplace”入口，也请用户试一次并记下菜单名称。都不行时，记下原因，再用 `"$CLAUDE" plugin marketplace add TestAny-io/testany-agent-skills#feature/skilldock-0.11-cross-agent` 完成（汇报中注明用了终端）。

> 实测（2026-10-10，桌面应用 2.1.293）：这条斜杠命令不执行添加，而是打开设置中的 **Plugins** 页（左侧栏 Customize → Plugins，标签 **Yours** / **Discover**）。添加入口在该页右上的 **+ Add ▾** 中（四项原文：**Add marketplace** / **Manage marketplaces** / **Upload plugin** / **Create with Claude**）：选 **Add marketplace**，输入 `TestAny-io/testany-agent-skills#feature/skilldock-0.11-cross-agent`，点 **Sync**。**Manage marketplaces** 列出本机已添加的 marketplace（只显示仓库，不显示分支），每行 **⋮** 中有 **Check for updates** 与 **Remove**；对同一来源再 **Add marketplace** 会报“Failed to add marketplace.”，刷新请用 **Check for updates**。

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

1. 桌面应用中 `/plugin` 打开的是 Plugins 页，没有 **Errors** 标签页。请用户在 **Yours** 标签页看 Skilldock 一行有没有错误或警告标记，点开它看详情中有没有错误；再只读回 skilldock 一项（只打印版本、启用状态，以及错误或警告类字段的名称与条数）：

   ```bash
   "$CLAUDE" plugin list --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const v=JSON.parse(s);const a=Array.isArray(v)?v:(v.installed??v.plugins??[]);const x=a.find(i=>(i.id??i.name)==="skilldock@testany-agent-skills");if(!x)return console.log("未找到 skilldock");const f=Object.keys(x).filter(k=>/error|warn/i.test(k)).map(k=>[k,Array.isArray(x[k])?x[k].length:typeof x[k]]);console.log(JSON.stringify({id:x.id??x.name,version:x.version,enabled:x.enabled,errorFields:f}))})'
   ```

   记录。
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

开发者分两次往分支推送（Claude 以 marketplace 的提交摘要作为 SkillDock 的版本，新提交即新版本）。桌面应用可以刷新 marketplace（**+ Add ▾** → **Manage marketplaces** → **⋮** → **Check for updates**），但只按声明的版本号识别插件更新，SkillDock 的 Update 不可用（2026-10-12 实测），所以更新在 SkillDock 的“更新”页应用：检查时 SkillDock 也会自己刷新 marketplace，应用时经 Claude 命令行更新，用户全程不用终端。

注意：“新提交即新版本”只指 Claude 侧的版本号；SkillDock 按内容判断有没有更新，开发者的两次推送都要改动 `plugins/skilldock/` 下的文件，否则检查会显示“已安装内容与来源一致”。两侧的应用版本都是 0.11.0，不要用“Agent 环境”页的一键更新（它按应用版本比较，会说没有更新的 SkillDock）。

1. 告诉用户：请通知开发者“已装好，可以推第一个提交”。开发者确认推送后再继续。
2. 先只读确认 Claude 还没有自动拿到新版本：`"$CLAUDE" plugin list --json | node -e "$NAMES"`（应仍为 `e7bf95a311b9`）。
3. 请用户在 SkillDock 的“更新”页找到 Claude 中的 skilldock（经 Claude 命令行更新），点 **检查更新**；显示有更新时按提示应用。记录：检查与应用的结果、界面提示原文。桌面应用 Plugins 页中 Skilldock 的 Update 是否可用，照实记下。
4. 读回版本是否变化：`"$CLAUDE" plugin list --json | node -e "$NAMES"`（应变为第一个提交的摘要）。新开一个会话（或在当前会话运行 `/reload-plugins`），再调用一次 `skilldock:skill-manager`，确认正常、仍沿用同一实例（第 6 节第 3 项的读回）。
5. 核对页面顶部的旧提示“已跳过无效的项目目录 …/compat/legacy-project（--project）”（第一部分发现，已在 `73c438a` 修复）。先告诉用户：正在运行的实例是用修复前的代码启动的，这条提示会跟着这个实例，复用或隐式重启都不会消失；Codex 一侧在按 [60](60-v17-real-codex-update.md) 第 8 节改回 `main` 之前仍是修复前的启动器。核对方法（停止实例前征得用户同意；之后由 Claude 这份全新启动，首次需要构建运行目录，可能要一两分钟并需要联网）：
   1. 只读取出 Claude 中 skilldock 的安装目录并核对：

      ```bash
      D=$("$CLAUDE" plugin list --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const v=JSON.parse(s);const a=Array.isArray(v)?v:(v.installed??v.plugins??[]);const x=a.find(i=>(i.id??i.name)==="skilldock@testany-agent-skills");console.log(x?.installPath??"")})')
      echo "$D"
      ```

      `D` 为空，或目录名不是刚更新到的版本摘要时，停下来告诉用户，不要停止实例；
   2. 核对无误、用户同意后，再单独停止实例：`sh "$D/skills/skill-manager/scripts/launch.sh" stop`；
   3. 在新开或已重载插件的会话中调用 `skilldock:skill-manager`（由 Claude 这份修复后的启动器全新启动；若提示“此数据目录属于另一个安装来源”，说明会话仍在用旧版本目录，先停下确认是否已重载，不要按提示改用独立数据目录），打开页面，确认顶部没有这条提示；
   4. 再打开 Codex 中的 SkillDock 原生页面（沿用同一实例），确认同样没有；
   5. 之后实例若停止、再由 Codex 原生入口全新启动，提示会重新出现，并跟着那个实例。这属预期：改回 `main` 后，实例下一次由新的启动器全新启动，或在界面中切换项目时消失。
6. 告诉用户：请通知开发者“可以推第二个提交”。开发者确认后：
   1. 请用户在桌面应用中刷新 marketplace：**+ Add ▾** → **Manage marketplaces** → `testany-agent-skills` 行的 **⋮** → **Check for updates**。只读核对本机 marketplace 副本是否已到第二个提交：

      ```bash
      L=$(node -e 'const m=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))["testany-agent-skills"];console.log(m?.installLocation??"")' "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/plugins/known_marketplaces.json")
      git -C "$L" log -1 --format='%h %s'
      ```

      再看 Plugins 页中 Skilldock 的 Update 是否仍不可用（预期不可用：SkillDock 在 Claude 侧不声明版本号，0.11.1 处理）。
   2. 请用户在 SkillDock 的“更新”页对 Claude 中的 skilldock 点 **检查更新**，有更新时按提示应用。上一步之后已装目录里会多出桌面应用合成的 `.claude-plugin/plugin.json`，修复后的 SkillDock 不把它算作本地修改（`4d3a858` 起），也不把访达留下的 `.DS_Store` 算作本地修改（`d2034fd` 起）。检查由正在运行的实例执行：先只读核对实例的代码已含修复——按键读取启动记录的 `runtime`，在该目录的 `server/claude-plugin-updates.mjs` 中查 `SYNTHESIZED_MANIFEST`（要区分是否含 `.DS_Store` 豁免时查 `.DS_Store`）；检查前不要用 Show in Finder 打开这个插件的安装目录；若仍报“相对上次记录有本地修改”，停下来告诉用户，不要删除该文件。注意：两侧应用版本相同时更新不会让实例自行换到新代码，需经用户同意停止实例后由新代码全新启动；开着的 Codex 原生页面会在几十秒内自动拉起后台。记录：检查结果、应用结果、读回的版本（应为第二个提交的摘要）、界面提示原文；整个过程没有用终端。

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

1. 先只读记下现在的来源，作为对照（从 `plugin marketplace list --json` 中读不到 ref，改为从 Claude 的 marketplace 记录中按键只读这一项的来源，不打印文件其余内容）：

   ```bash
   SRC='try{const m=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))["testany-agent-skills"];if(!m)return console.log("未找到");const s=m.source??{};let host;try{const u=new URL(s.url);host=u.host+u.pathname}catch{}console.log(JSON.stringify({source:s.source,repo:s.repo,host,hasRef:"ref" in s,ref:s.ref??null}))}catch{console.log("读取失败")}'
   node -e "(()=>{$SRC})()" "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/plugins/known_marketplaces.json"
   ```

   应读到 `hasRef` 为 `true`、`ref` 为 `feature/skilldock-0.11-cross-agent`。读不到时说明 ref 不记在这里，停下来问用户，后面不能用 `hasRef` 判断是否切换成功。
2. **不要再用“添加不带分支的同一来源”来就地切换**（r11 更正）。Claude 添加 marketplace 时会在用户设置的 `extraKnownMarketplaces` 中留下声明（命令行 2.1.295 的添加结果写明 “declared in user settings”）；执行 UAT 的电脑上，这条声明带着开发分支的 `ref`（它是哪一次添加写入的没有查清，见 65 第 2.1 节）。只要这条声明在，从与它不一致的来源添加同名 marketplace 就会被拒。桌面应用只显示 “Failed to add marketplace.”，命令行的报错是 `Cannot add marketplace "testany-agent-skills": its source doesn't match its extraKnownMarketplaces entry in user or managed settings…`。2026-10-10 那次就地改到开发分支之所以成功，推断是当时还没有这条声明。
3. 经用户同意在 **Manage marketplaces** → **⋮** → **Remove** 中移除该 marketplace，再在 **+ Add ▾** → **Add marketplace** 中添加 `TestAny-io/testany-agent-skills`（不带 `#分支`）并 **Sync**，然后在 **Discover** 中重新安装。
   - 移除会卸载从它安装的**全部**插件（不只 SkillDock，例如 testany-eng），并删掉上面那条声明；重装后各插件取到的是 `main` 上的当前版本，可能比原来新。先向用户说明。
   - 读回（第 1 项的命令）只看 `hasRef` 为 `false`。经桌面应用添加时它传的是完整的 https 地址，读回是 `source` 为 `git` 加地址，而不是 `github` 加 `repo`。
   - 数据目录不受影响，计划与记录都在。
   - 两侧都重装到同一版本后，运行中的实例不会自己换成新装的代码（同版本不切换）。经用户同意用 `stop` 停一次；Codex 的 SkillDock 原生页面开着时会自动拉起，否则再打开一次。
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
| 桌面应用 Check for updates：marketplace 副本是否到达新提交；之后 Skilldock 的 Update 是否可用 | |
| SkillDock 更新页应用第一个提交：结果、读回版本 | |
| 旧提示核对：从 Claude 全新启动后、再打开 Codex 原生页面，顶部是否都没有“已跳过无效的项目目录” | |
| SkillDock 更新页应用第二个提交（由 SkillDock 刷新 marketplace）：结果、读回版本、是否用了终端 | |
| （7A）从本地目录装插件到 Claude：是否出现 Agent 选择、安装位置、卸载后是否清干净 | |
| TeamDesk 是否注明“仅支持 Codex” | |
| 其他异常或与 README 写法不同的地方 | |
