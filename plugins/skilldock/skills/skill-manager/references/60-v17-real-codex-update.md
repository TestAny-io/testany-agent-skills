# V17：在真实 Codex 中把 SkillDock 从 0.10.3 更新到 0.11.0（给另一台电脑上的 Codex）

> 这份说明交给另一台电脑上的 Codex 执行，用户在旁操作界面。
> 目的：完成 HLD 9.3 的 V17——“真实 Codex 中，插件更新后原生入口的长连接进程是否保留，以及转交是否生效”，结果用于校正 PRD Q9 的说法，是 0.11.0 发布前的关口之一（HLD 11A 第 3 条）。
> 代码来源：公开仓库 `TestAny-io/testany-agent-skills` 的分支 `feature/skilldock-0.11-cross-agent`（提交 `122ef9f` 或之后），尚未发布到 `main`。

## 1. 这次会真实改动什么（先读给用户听）

与上次试用不同，这次**会改动这台电脑上正在使用的 SkillDock**：

- Codex 中的 SkillDock 从 0.10.3 更新到 0.11.0（来自上面的开发分支）；
- SkillDock 的数据目录 `~/.local/share/skilldock` 会被 0.11.0 迁移到新格式。迁移后 0.10.x 不能再使用这个目录（0.10.3 会提示更新，0.10.2 会拒绝启动），计划、来源记录、操作记录与偏好都保留；
- Codex 配置 `~/.codex/config.toml` 中 `testany-agent-skills` 这个 marketplace 可能会加一行 `ref`，指向开发分支。0.11.0 发布后要把这一行去掉（第 8 节）。

每一步改动之前，先告诉用户要改什么，等用户同意。用户不同意就停下，什么都不改。

## 2. 边界

- 所有记录与备份放在 `~/skilldock-v17/`。
- 不打印完整的配置文件；需要核对时用第 3 节的脚本只读一个键。
- 不改 shell 配置、git 或 npm 的全局配置，不全局安装任何包。
- 不永久删除任何东西；需要移走的移到废纸篓。
- 遇到与本说明不符的情况（命令不存在、输出看不懂、要改动的范围超出本说明），停下来问用户。

## 3. 准备（只读）

```bash
mkdir -p "$HOME/skilldock-v17"
# 只采用实际能运行的命令行：PATH 中的包装脚本可能已损坏
pick() { for c in "$@"; do if [ -n "$c" ] && [ -x "$c" ] && "$c" --version >/dev/null 2>&1; then echo "$c"; return 0; fi; done; return 1; }
CODEX=$(pick "$(command -v codex)" /Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex /Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex /Applications/ChatGPT.app/Contents/Resources/codex /Applications/Codex.app/Contents/Resources/codex-cli/bin/codex /Applications/Codex.app/Contents/Resources/codex)
echo "Codex 命令行：${CODEX:-（未找到可运行的）}"; "$CODEX" --version
CONFIG="${CODEX_HOME:-$HOME/.codex}/config.toml"
STATE="$HOME/.local/share/skilldock"
# 只读 testany-agent-skills 这个 marketplace 的 ref 一项
REF='const t=require("fs").readFileSync(process.argv[1],"utf8");const s=t.split(/\n(?=\[)/).find(x=>x.startsWith("[marketplaces.testany-agent-skills]"));const r=s&&s.match(/^ref\s*=\s*"([^"]*)"/m);console.log(s?"ref = "+(r?r[1]:"（未设置）"):"（没有这个 marketplace 段）")'
node -e "$REF" "$CONFIG"
"$CODEX" plugin list --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const v=JSON.parse(s);for(const x of (Array.isArray(v)?v:v.installed??[]))if(String(x.id??x.name).startsWith("skilldock"))console.log(x.id??x.name,x.version??"",x.enabled??"")})'
ls "$STATE" 2>/dev/null; ls "$HOME/Library/LaunchAgents" 2>/dev/null | grep -i skilldock
```

确认：

- Codex 中 SkillDock 为 0.10.3，来自 `testany-agent-skills`；
- 数据目录中**没有** `generation.json`（还未迁移）；
- Claude 中如果也装了 SkillDock，版本不低于 0.10.3（否则 0.11.0 会在门槛处停下）。用 `claude plugin list --json` 只看名称与版本；没有 Claude 命令行时跳过。

把结果告诉用户。

## 4. 备份（先征得同意）

```bash
cp -R "$STATE" "$HOME/skilldock-v17/state-backup"
cp "$CONFIG" "$HOME/skilldock-v17/config.toml.backup"
```

这两份备份只留在这台电脑上，用于万一需要回到 0.10.3；不要上传或转述其内容。

## 5. 打开 0.10.3 的原生入口并记下基准

请用户在 Codex 中打开 **More / Explore → SkillDock**，确认页面能正常加载，然后**保持这个页面开着、不要重启 Codex**。然后记录：

```bash
RECORD='const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(JSON.stringify({url:r.url,pid:r.pid,format:r.format??null,status:r.status??null}))'
node -e "$RECORD" "$STATE/launcher.json"
URL=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).url)' "$STATE/launcher.json")
curl -s "$URL/api/health" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const h=JSON.parse(s);console.log(JSON.stringify({appVersion:h.appVersion??null,apiVersion:h.apiVersion??null,dataGeneration:h.dataGeneration??null,pid:h.pid,instanceId:h.instanceId}))})'
ps -axo pid,etime,command | grep -i skilldock | grep -v grep
date
```

`ps` 的输出中，命令行含 `assets/native` 或 `native.sh` 的是 Codex 原生入口的长连接进程，含 `runtimes` 的是 SkillDock 服务。把这几行（进程号、已运行时间、命令行）记下来。

## 6. 把 marketplace 指向开发分支并更新（改动 Codex，先征得同意）

**保持 SkillDock 原生页面开着。**

1. 先试命令行自带的方式：

   ```bash
   "$CODEX" plugin marketplace add TestAny-io/testany-agent-skills --ref feature/skilldock-0.11-cross-agent --json
   node -e "$REF" "$CONFIG"
   ```

   如果 `ref` 已显示为 `feature/skilldock-0.11-cross-agent`，跳到第 3 步。

2. 如果输出 `alreadyAdded: true` 而 `ref` 没变：告诉用户需要在 `config.toml` 的 `[marketplaces.testany-agent-skills]` 段中加一行 `ref = "feature/skilldock-0.11-cross-agent"`（已在第 4 步备份），同意后运行：

   ```bash
   node -e 'const fs=require("fs");const [f,ref]=process.argv.slice(1);const L=fs.readFileSync(f,"utf8").split("\n");const h=L.findIndex(l=>l.trim()==="[marketplaces.testany-agent-skills]");if(h<0){console.log("没有这个 marketplace 段，未修改");process.exit(1)}let e=L.findIndex((l,i)=>i>h&&/^\s*\[/.test(l));if(e<0)e=L.length;const i=L.slice(h+1,e).findIndex(l=>/^\s*ref\s*=/.test(l));if(i>=0)L[h+1+i]=`ref = "${ref}"`;else L.splice(h+1,0,`ref = "${ref}"`);fs.writeFileSync(f+".tmp-skilldock",L.join("\n"));fs.renameSync(f+".tmp-skilldock",f);console.log("已设置 ref")' "$CONFIG" "feature/skilldock-0.11-cross-agent"
   node -e "$REF" "$CONFIG"
   ```

3. 刷新 marketplace 并更新插件：

   ```bash
   "$CODEX" plugin marketplace upgrade testany-agent-skills --json
   "$CODEX" plugin add skilldock@testany-agent-skills --json
   "$CODEX" plugin list --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const v=JSON.parse(s);for(const x of (Array.isArray(v)?v:v.installed??[]))if(String(x.id??x.name).startsWith("skilldock"))console.log(x.id??x.name,x.version??"",x.enabled??"")})'
   date
   ```

   应显示 SkillDock 0.11.0。命令报错时把输出交给用户，不要换别的办法重试。

## 7. 观察（V17 本体）

每一项都记下时间、看到的现象，以及第 5 节同样的三条记录（启动记录、健康检查、`ps`）。

1. **更新后立刻（不刷新页面）**：原生入口的长连接进程是否还在（进程号与第 5 节相同吗）？SkillDock 服务的进程号与版本是否变化？
2. **等待约 2 分钟，期间每 30 秒记录一次**：0.10.3 的服务发现新版本后，会发起重启，由 0.11.0 启动器检查门槛、迁移数据并接管。预期：健康检查的 `appVersion` 变为 `0.11.0`、`dataGeneration` 变为 2，数据目录中出现 `generation.json`。
3. **原生页面**：不重启 Codex，请用户在开着的页面里切换页面或刷新。记录：页面是否自动重连、是否出现“重启中”或错误提示、之后是否出现 0.11 才有的“Agent 环境”页。
4. **关闭再打开入口**：请用户关闭 SkillDock 页面，再从 More / Explore 打开一次，记录结果。
5. **重启 Codex**：请用户完全退出 Codex 再打开，打开 SkillDock，记录 `appVersion` 与页面是否正常。
6. **技能入口**：新建 Codex 任务，输入 `$skill-manager 打开技能管理面板`，确认打开的是同一个实例（健康检查的 `instanceId` 与上一步相同）。
7. **计划与后台**：在“更新”页看计划是否保留；若之前开过计划，看后台状态是否正常；`ls "$HOME/Library/LaunchAgents" | grep -i skilldock` 与第 3 节对比。

出问题时：停下，收集以下内容交给用户与开发者，不要反复重试：

```bash
tail -n 60 "$STATE/server.log"        # 转述时去掉令牌、地址中的账号等
ls "$STATE" "$STATE/compat" 2>/dev/null
node -e 'try{const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(JSON.stringify({id:r.id,status:r.status,restored:r.restored??null,source:r.source}))}catch{console.log("没有 restart.json")}' "$STATE/restart.json"
```

如需回到 0.10.3（由用户决定）：停止 SkillDock、把当前数据目录移到废纸篓、用 `~/skilldock-v17/state-backup` 放回原处、恢复 `config.toml.backup`，再在 Codex 中重新安装 0.10.3。这一步之前务必再问一次用户。

## 8. 0.11.0 发布之后

开发者合并到 `main` 并通知后：

```bash
# 去掉 ref 一行，回到跟随 main
node -e 'const fs=require("fs");const f=process.argv[1];const L=fs.readFileSync(f,"utf8").split("\n");const h=L.findIndex(l=>l.trim()==="[marketplaces.testany-agent-skills]");if(h<0)process.exit(0);let e=L.findIndex((l,i)=>i>h&&/^\s*\[/.test(l));if(e<0)e=L.length;const i=L.slice(h+1,e).findIndex(l=>/^\s*ref\s*=/.test(l));if(i>=0){L.splice(h+1+i,1);fs.writeFileSync(f+".tmp-skilldock",L.join("\n"));fs.renameSync(f+".tmp-skilldock",f);console.log("已去掉 ref")}else console.log("没有 ref，未修改")' "$CONFIG"
"$CODEX" plugin marketplace upgrade testany-agent-skills --json
"$CODEX" plugin add skilldock@testany-agent-skills --json
```

第 6 步若是用命令行的 `--ref` 设置的，去掉 `ref` 的方式以命令行的说明为准（`"$CODEX" plugin marketplace --help`），先告诉用户再做。确认 0.11.0 正常后，经用户同意把 `~/skilldock-v17` 移到废纸篓。

## 9. 汇报

按下表汇报，附上第 5、7 节的原始记录（已去掉敏感信息）：

| 项 | 结果 |
|----|------|
| 更新方式（`--ref` 或改 `config.toml`） | |
| 更新后原生入口的长连接进程是否保留（进程号前后） | |
| 服务何时切到 0.11.0（时间、`appVersion`、`dataGeneration`） | |
| 开着的原生页面：是否自动重连、有无报错、是否出现“Agent 环境” | |
| 关闭再打开入口后 | |
| 重启 Codex 后 | |
| `$skill-manager` 打开的是否同一实例 | |
| 计划、后台任务是否保留 | |
| 其他异常 | |
