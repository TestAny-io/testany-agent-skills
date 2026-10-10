# SkillDock 0.11 试用：给 Claude 桌面版的操作说明（用户的另一台电脑）

> 这份说明交给那台电脑上 Claude 桌面版（Code 标签页）中的 Claude 执行。它是用户的日常电脑，Codex 中装着正在使用的 SkillDock 0.10.3（Claude 中若也装了 SkillDock，同样不要使用或改动它）。
> 目标：在一个独立的试用目录中运行 0.11 开发版，供用户在浏览器中试用；试完把这台电脑恢复到试用前的样子，不留任何开发用的配置。
> 代码来源：公开仓库 `TestAny-io/testany-agent-skills` 的分支 `feature/skilldock-0.11-cross-agent`（尚未发布到 `main`）。

## 1. 边界（先读）

所有试用文件只放在一个目录里：`~/skilldock-uat`

| 子目录或文件 | 用途 |
|------|------|
| `src/` | 克隆下来的代码 |
| `state/` | 0.11 试用实例的数据目录 |
| `project/` | 试用时用的空项目目录 |
| `npm-cache/` | 安装依赖时的 npm 缓存 |
| `baseline.txt` | 试用前记下的 Codex、Claude 中插件、marketplace、技能的名称 |

不要做的事：

- 不改 shell 配置（`~/.zshrc`、`~/.bash_profile` 等）、git 全局配置、npm 全局配置；不全局安装任何包。需要的环境变量一律写在命令前面，只对那一条命令有效。
- 不把克隆目录添加为 Codex 或 Claude 的 marketplace，不把它安装成插件。
- 不使用、不改动已安装的 SkillDock（Codex 中的 0.10.3，以及 Claude 中如果也有的那份）：不经它们的入口或技能打开 SkillDock，不碰数据目录 `~/.local/share/skilldock`，不向端口 4771 上的服务发请求。
- 试用页面的“Agent 环境”页上如果出现“一键更新 SkillDock”，不要点：它会改动已安装的 SkillDock。
- 不运行开发测试（`npm test` 等），那是开发电脑上的事。
- 不打印完整的配置文件（例如 `~/.codex/config.toml`、`~/.claude/settings.json`）；需要核对时只列名称。
- 不永久删除任何东西；清理时移到废纸篓。
- 每一步要改动这台电脑（删除、卸载、移除）之前，先告诉用户要改什么，等用户同意。

## 2. 权限与会话

- 下载代码和首次安装依赖需要联网；启动要写主目录下的 `~/skilldock-uat`。Claude 桌面版会请用户批准这些命令，逐条说明用途后再请求批准；不要请用户放宽与本次试用无关的权限，也不要改 Claude 的设置。
- 从 Claude 会话中启动时，启动器会把这个会话使用的 Claude 配置目录与命令行路径记进试用数据目录（`~/skilldock-uat/state`，这是设计如此），清理时随目录一起移除；它不会改 Claude 自己的配置。
- 服务在后台运行，**对话结束后它仍在运行**。试用告一段落时，提醒用户按第 8 步停止；用户暂时不清理的话，至少先停止服务。
- 如果启动命令返回成功，但随后 `status` 显示服务没有在运行，请把第 5 步的启动命令交给用户，让用户在自己的“终端”里运行。

## 3. 检查前提

```bash
node -v
git --version
```

`node -v` 须为 v22.12 或更高；没有 Node 或版本太低时，告诉用户先安装（是否安装由用户决定，不要自行安装）。

## 4. 记录试用前的基线（只记名称）

```bash
mkdir -p "$HOME/skilldock-uat/project" "$HOME/skilldock-uat/npm-cache"
CODEX=$(command -v codex || ls /Applications/Codex.app/Contents/Resources/codex-cli/bin/codex /Applications/Codex.app/Contents/Resources/codex /Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex /Applications/ChatGPT.app/Contents/Resources/codex 2>/dev/null | head -1)
CLAUDE=${CLAUDE_CODE_EXECPATH:-$(command -v claude || ls "$HOME/Library/Application Support/Claude/claude-code"/*/*/claude.app/Contents/MacOS/claude 2>/dev/null | tail -1)}
NAMES='let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const v=JSON.parse(s);const a=Array.isArray(v)?v:(v.installed??v.marketplaces??[]);for(const x of a)console.log(" ",x.id??(x.name+(x.marketplaceName?"@"+x.marketplaceName:"")),x.scope??"",x.version??"")}catch{console.log("  （读取失败）")}})'
{
  echo "== Codex 插件"; [ -n "$CODEX" ] && "$CODEX" plugin list --json 2>/dev/null | node -e "$NAMES" || echo "  （Codex 命令行不可用）"
  echo "== Codex marketplace"; [ -n "$CODEX" ] && "$CODEX" plugin marketplace list --json 2>/dev/null | node -e "$NAMES" || echo "  （Codex 命令行不可用）"
  echo "== Codex 个人技能"; ls "$HOME/.codex/skills" 2>/dev/null
  echo "== Claude 插件"; [ -n "$CLAUDE" ] && "$CLAUDE" plugin list --json 2>/dev/null | node -e "$NAMES" || echo "  （Claude 命令行不可用）"
  echo "== Claude marketplace"; [ -n "$CLAUDE" ] && "$CLAUDE" plugin marketplace list --json 2>/dev/null | node -e "$NAMES" || echo "  （Claude 命令行不可用）"
  echo "== Claude 个人技能"; ls "$HOME/.claude/skills" 2>/dev/null
  echo "== 后台任务"; ls "$HOME/Library/LaunchAgents" 2>/dev/null | grep -i skilldock
} > "$HOME/skilldock-uat/baseline.txt"
cat "$HOME/skilldock-uat/baseline.txt"
```

把结果给用户看一眼（只有名称，没有配置内容）。

## 5. 下载与启动

```bash
git clone -b feature/skilldock-0.11-cross-agent https://github.com/TestAny-io/testany-agent-skills.git "$HOME/skilldock-uat/src"
```

```bash
npm_config_cache="$HOME/skilldock-uat/npm-cache" SKILLDOCK_STATE_DIR="$HOME/skilldock-uat/state" PORT=4781 /bin/sh "$HOME/skilldock-uat/src/plugins/skilldock/skills/skill-manager/scripts/launch.sh" start --project "$HOME/skilldock-uat/project"
```

- 首次启动会安装依赖，可能要几分钟。成功时输出里有 `http://127.0.0.1:4781`，请用户在浏览器中打开。
- 以退出码 4 结束：说明 Codex 或 Claude 中装着低于 0.10.3 的 SkillDock，0.11 不接管。把输出中的说明告诉用户，**不要**自行加 `SKILLDOCK_UPDATE_AGENT` 重试——那会改动已安装的 SkillDock，须由用户决定。
- 其他失败：把命令、退出码和输出的最后几十行告诉用户（不要包含任何令牌或密码）。

查看是否在运行：

```bash
SKILLDOCK_STATE_DIR="$HOME/skilldock-uat/state" PORT=4781 /bin/sh "$HOME/skilldock-uat/src/plugins/skilldock/skills/skill-manager/scripts/launch.sh" status
```

## 6. 更新（开发者推送了新修正之后）

```bash
git -C "$HOME/skilldock-uat/src" pull --ff-only
git -C "$HOME/skilldock-uat/src" log -1 --oneline
```

```bash
npm_config_cache="$HOME/skilldock-uat/npm-cache" SKILLDOCK_STATE_DIR="$HOME/skilldock-uat/state" PORT=4781 /bin/sh "$HOME/skilldock-uat/src/plugins/skilldock/skills/skill-manager/scripts/launch.sh" restart --project "$HOME/skilldock-uat/project"
```

把 `log -1` 显示的提交号告诉用户，便于对照。

## 7. 试用

由用户在浏览器中操作，你在旁协助：

- 试用要点见克隆目录中的清单：`~/skilldock-uat/src/plugins/skilldock/skills/skill-manager/references/51-phase45-uat-guide.md`（其中的命令以本说明第 5、6、8 步为准）。
- 提醒用户：试用实例会**真的改动**这台电脑上的 Codex 与 Claude（在对应一侧“已启用管理”时）。建议用临时的技能、插件或 marketplace 试修改功能；不想改动的一侧，先在“Agent 环境”页设为只读。
- 用户想确认某个操作的效果时，用第 4 步的命令重新列一次名称做对比，不要打印配置文件内容。
- 用户请你代为查看页面时，可以在 Claude 桌面版自带的浏览器中打开 `http://127.0.0.1:4781`；页面上的修改操作（安装、移除、开关、更新、开启计划）由用户自己点，你不要代点。
- 服务的运行日志在 `~/skilldock-uat/state/server.log`；需要排查时只看最后几十行，转述时去掉令牌、地址中的账号等敏感信息。

## 8. 清理（按顺序做，每一项先告诉用户）

1. **在试用页面里收尾**（请用户操作）：
   - 更新页里若开启过计划，先关闭计划（这会注销它的后台任务）；
   - 移除试用中新建的技能、插件、marketplace；
   - 若启用过 Claude 管理、且 SkillDock 为“单插件来源”生成过 marketplace（名称以 `skilldock-` 开头），在“Agent 环境”页停用 Claude 管理时勾选“一并清理”，或在 Marketplace 页移除它们。
2. **停止试用实例**：

   ```bash
   SKILLDOCK_STATE_DIR="$HOME/skilldock-uat/state" PORT=4781 /bin/sh "$HOME/skilldock-uat/src/plugins/skilldock/skills/skill-manager/scripts/launch.sh" stop
   ```

3. **确认没有留下后台任务**：只处理任务文件里含 `skilldock-uat` 的那一个，不碰其他（0.10.3 自己可能也有一个）。

   ```bash
   grep -l "skilldock-uat" "$HOME/Library/LaunchAgents"/io.testany.skilldock.update.*.plist 2>/dev/null
   ```

   有输出时，经用户同意，对每个文件执行：

   ```bash
   launchctl bootout "gui/$(id -u)" "<上面列出的文件>"
   mv "<上面列出的文件>" "$HOME/.Trash/"
   ```

4. **对照基线**：再运行一次第 4 步的命令，但把结果写到别处比较（不要覆盖 `baseline.txt`）：把第 4 步命令块最后两行中的 `baseline.txt` 换成 `after.txt` 后运行，然后：

   ```bash
   diff "$HOME/skilldock-uat/baseline.txt" "$HOME/skilldock-uat/after.txt"
   ```

   - 多出来的插件、marketplace、技能：向用户确认后移除（Codex 用 `"$CODEX" plugin remove <名称>@<marketplace>`、`"$CODEX" plugin marketplace remove <名称>`；Claude 用 `"$CLAUDE" plugin uninstall <名称>@<marketplace> --scope <作用域>`、`"$CLAUDE" plugin marketplace remove <名称>`；技能目录移到废纸篓）。特别留意名称形如 `skilldock-` 加 20 位十六进制的 Claude marketplace，它指向试用目录，试用目录删掉后会成为悬空记录。
   - 少了的东西：告诉用户，由用户决定是否恢复。
   - 试用中改过的启用/停用、可见性等开关，名称列表看不出来；请用户回想是否改过，必要时在 Codex 或 Claude 中改回。
5. **确认没有残留进程**：

   ```bash
   lsof -nP -iTCP:4781 -sTCP:LISTEN
   ps -axo pid,command | grep "skilldock-uat" | grep -v grep
   ```

   都应没有输出；若有，告诉用户，经同意后结束对应进程。
6. **把整个试用目录移到废纸篓**：

   ```bash
   mv "$HOME/skilldock-uat" "$HOME/.Trash/skilldock-uat-$(date +%Y%m%d%H%M%S)"
   ```

7. **最后核对**：
   - 用户照常从 Codex 打开 SkillDock，确认 0.10.3 仍正常工作（Claude 中若也装了 SkillDock，同样确认）；
   - `ls "$HOME/Library/LaunchAgents" | grep -i skilldock` 的结果与基线中“后台任务”一节相同；
   - 告诉用户：废纸篓里的 `skilldock-uat-…` 确认不再需要后，由用户自行清空废纸篓。

## 9. 汇报

每完成一步，用一两句话告诉用户结果。遇到与本说明不符的情况（命令不存在、输出看不懂、要改动的范围超出本说明），停下来问用户，不要自行扩大操作范围。
