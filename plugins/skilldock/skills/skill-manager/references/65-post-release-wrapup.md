# 0.11.0 发布后的收尾：UAT 电脑改回跟随 main

> 日期：2026-10-12（0.11.0 合并 `838b619` 之后）
> 执行：UAT 电脑上 Claude 桌面应用（Code 标签页）中的 Claude，按 [61](61-final-uat-claude-desktop.md) r10 第 8 节与 [60](60-v17-real-codex-update.md) 第 8 节执行，用户在旁操作界面；本文由执行者根据当时的逐步读回整理。原始记录随测试目录移入废纸篓（Owner 决定不另存），本文是它的要点。
> 环境：Claude 桌面应用自带命令行 2.1.295；Codex 桌面应用内置 `codex-cli 0.162.0-alpha.17.2`。
> 写法：实测到的写“读回”；推断的写明“推断”；没有做的写明“未做”。

## 1. 结论

**四步都完成；Claude 一侧没有按 61 第 8 节第 2 项就地切换，改走第 3 项（移除后重装）。**

| 步骤 | 结果 |
|------|------|
| Claude 改回 `main`（61 第 8 节） | 完成，经移除后重装。来源不带 ref，副本在 `main` 的 `838b619` |
| Codex 改回 `main`（60 第 8 节） | 完成，`config.toml` 只删了 `ref` 一行 |
| 自动更新计划重新选择 SkillDock | 完成，绑定指向当前的 Codex 安装 |
| 清理 `~/skilldock-uat-final` 与 `~/skilldock-v17` | 完成，移到废纸篓，未永久删除 |

收尾后的状态：Claude 中 `skilldock@testany-agent-skills` 为 `838b6191431a`、已启用；Codex 中 `skilldock` 为 0.11.0、已启用；运行中的实例是发布版代码；两侧都是“已启用管理”，数据目录、计划与操作记录未受影响。

## 2. Claude 一侧

### 2.1 就地切换被拒

对照读回（61 第 8 节第 1 项的命令）：`{"source":"github","repo":"TestAny-io/testany-agent-skills","hasRef":true,"ref":"feature/skilldock-0.11-cross-agent"}`，符合预期。

在 Plugins 页 **+ Add ▾** → **Add marketplace** 填 `TestAny-io/testany-agent-skills`（不带 `#分支`）点 **Sync**，界面显示 **“Failed to add marketplace.”**，重试一次相同。读回未变：来源仍带 ref，副本仍在开发分支，三个插件都在。

桌面应用日志只有：

```
[CCDMarketplacePluginManagerCLI] Adding marketplace: https://github.com/TestAny-io/testany-agent-skills
[HostCLIRunner] Command completed with exit code 1
[warn] [CCDMarketplacePluginManagerCLI] Unrecognized git clone error output: Adding marketplace…
[warn] [CustomPlugins] add_marketplace (ccd_host_cli) failed: MARKETPLACE_ERROR:UNKNOWN
```

为取得真实报错，经用户知情把同一条命令在终端原样执行一次（同样失败，无改动）：

```
✘ Failed to add marketplace: Cannot add marketplace "testany-agent-skills": its source doesn't match its extraKnownMarketplaces entry in user or managed settings; add it from the source that entry lists, or change the entry.
```

根因（只按键读取了这一项）：`~/.claude/settings.json` 的 `extraKnownMarketplaces` 中有 `testany-agent-skills = {"source":{"source":"github","repo":"TestAny-io/testany-agent-skills","ref":"feature/skilldock-0.11-cross-agent"}}`。只要这条声明在，从与它不一致的来源添加同名 marketplace 就会被拒：实测的是不带分支的添加（界面两次、终端一次，桌面应用实际传的是 https 地址）；带 `#main` 的写法没有实测，按报错文字推断同样被拒。

两点补充：

- 用户填的是 `owner/repo`，桌面应用传给命令行的是完整的 https 地址。2026-10-10 成功就地改到开发分支的那次，传的是带 `#分支` 的简写。
- `settings.json` 的最后修改时间是 2026-10-12 08:58:32，与当天上午第二次“对同一来源再 Add + Sync”失败的时间一致，据此推断那次界面显示失败的添加改写过这个文件。声明最初是 10-10 添加带分支的来源时写入，还是 10-12 上午写入，无法从现有信息判断。

另做了一项只读诊断：在临时目录浅克隆 `main`（`838b619`），`claude plugin validate` 对 marketplace 与 `plugins/skilldock` 均通过，排除了清单本身的问题。

### 2.2 移除后重装（61 第 8 节第 3 项）

1. **Manage marketplaces** → `testany-agent-skills` 行的 **⋮** → **Remove**。日志：`Removed 3 plugin(s) for marketplace "testany-agent-skills" from installed_plugins.json` → `Removed "testany-agent-skills" from known_marketplaces.json` → `reload_plugins broadcast (remove_marketplace)`。读回：marketplace 记录、本地副本、`settings.json` 中的那条声明与 `enabledPlugins` 中的相关项**都已删除**；skilldock、testany-eng、testany-bot-for-claude 已卸载；其他 marketplace 的插件不受影响；插件缓存目录下三个子目录留着；SkillDock 实例不受影响。
2. **Add marketplace** 再填 `TestAny-io/testany-agent-skills`，**Sync** 成功。
3. 在 **Discover** 中对 **Skilldock** 与 **Testany eng** 点 **Add**。日志在安装 skilldock 时再次出现 `Synthesized plugin.json for skilldock (strict:false marketplace plugin)`。

读回：

- 来源：`{"source":"git","host":"github.com/TestAny-io/testany-agent-skills.git","hasRef":false,"ref":null}`。`hasRef` 为 `false`；但 **source 是 `git`（https 地址），不是 61 预期的 `github` + repo**，原因同上（桌面应用换成了完整地址）。`settings.json` 中新的声明为 `{"source":{"source":"git","url":"https://github.com/TestAny-io/testany-agent-skills.git"}}`。
- 副本：`main`，`838b619`。
- 插件：`skilldock@testany-agent-skills | 838b6191431a | user | enabled`；`testany-eng@testany-agent-skills | 2.8.0 | user | enabled`（重装前是 2.0.0）。testany-bot-for-claude 没有装回：它是项目范围的残留安装，项目目录早已不存在，`main` 的清单里也没有这个插件。
- 打开中的会话未重载即恢复 `skilldock:skill-manager` 与 `testany-eng:*`。
- 调用 `skilldock:skill-manager`：启动器 `reused: true`，实例、项目目录不变，无警告。SkillDock 中 Claude 仍是“已启用管理”。
- `/api/health` 的 `installations` 此后列出三项：`claude`、`claude`、`codex`（Claude 出现两次）。原因未查。

## 3. Codex 一侧

用户同意后按 60 第 8 节执行（用了终端）：

1. 先备份 `config.toml`。去掉 `[marketplaces.testany-agent-skills]` 段的 `ref`：与备份比较只少一行 `ref = "feature/skilldock-0.11-cross-agent"`，读回 `ref = （未设置）`。
2. `codex plugin marketplace upgrade testany-agent-skills --json`：退出码 0，`errors: []`；副本到 `main` 的 `838b619`，`plugin.json` 版本 0.11.0。
3. `codex plugin add skilldock@testany-agent-skills --json`：退出码 0，版本 0.11.0；读回 `skilldock 0.11.0`、已启用。

之后 Codex 的副本与 Claude 的 `838b6191431a` 逐文件比较（`assets/app` 与 `scripts`）无差异。

## 4. 实例与计划

- 两侧重装之后**实例没有重启**（同版本不切换，DEC-SDX-008），运行的仍是开发过程中 `4d3a858` 的代码，与发布代码相比 `server/claude-plugin-updates.mjs`、`server/service.mjs` 不同。经用户同意 `stop` 一次；12 秒后由开着的 Codex 原生页面自动拉起（`workingDirectory` 为 `compat/legacy-project`，`running.agent=codex`）。读回：运行目录的 `server` 目录与发布代码无差异，项目目录不变（`source=record`），无警告，技能与已装插件数量与之前一致。
- 自动更新计划：重装前计划中的对象是 `skilldock@testany-agent-skills`，每次因 `TARGET_BINDING_CHANGED` 被跳过。用户在“设置计划”中重新勾选 Codex 的 skilldock 并保存。读回：`bindings` 中该项的 `real` 指向 `~/.codex/plugins/cache/testany-agent-skills/skilldock/0.11.0`，带当前的 inode 与指纹；`nextRunAt` 按保存时间重新起算；后台任务仍注册、状态 `ready`。**重新绑定后是否不再跳过，要看下一次计划运行，本次未验证。**

## 5. V17 补测（[60](60-v17-real-codex-update.md) 中未记录的两项）

- **完整退出 Codex 再打开**：已做。Codex 主进程重启后，SkillDock 的 pid、`instanceId`、`appVersion` 与退出前完全相同，`launcher.json` 未改写；原生页面正常打开；**Appearance & language** 中主题 Dark、语言 English 与退出前一致（用户前后截图确认）。页面上未见报错，接口无警告（“无报错”一项据截图与读回判断，用户没有单独说明）。
- **新开 Codex 聊天输入 `$skill-manager`**：**未做**（Owner 决定不做）。

## 6. 清理

`~/skilldock-uat-final`（最终 UAT 记录）与 `~/skilldock-v17`（V17 记录、数据备份与 Codex 配置备份）经用户同意移到废纸篓，未永久删除。未清理、仍留在那台电脑上的：SkillDock 可恢复区中的测试插件 `uat-local-plugin` 副本、空的 `~/.claude/skills/` 目录、Claude 插件缓存中的旧版本目录。

## 7. 对说明与文档的影响

以下几处与现有文字不符，建议随下一次文档修订处理：

1. **61 第 8 节第 2 项（就地切回）与 README 中相应说法不成立**：装过带分支来源的电脑上，`extraKnownMarketplaces` 的声明会让再次添加被拒，只能走第 3 项。这只影响跟随过开发分支的安装；从未固定过分支的用户不受影响。第 8 节应改为直接移除后重装，并说明界面只显示 “Failed to add marketplace.”。
2. **“同名 marketplace 已存在时，填不同来源会就地改为新来源”需要加条件**：2026-10-10 成立，是因为当时设置里还没有这条声明（推断）；有声明后不成立。
3. **61 第 8 节读回的预期**：经桌面应用添加不带分支的来源，读回是 `source: git` 加 https 地址，不是 `github` + repo；判断是否切换成功只看 `hasRef`。
4. **移除 marketplace 时 testany-eng 等同源插件一并卸载**，重装后取到的是 `main` 上的当前版本（这次是 2.0.0 → 2.8.0）。说明中应提醒。
5. 运行实例在两侧重装后不会换上新代码，要停止一次；Codex 原生页面开着时会自动拉起。60、61 第 8 节可以补一步。

## 8. 未做与未验证

- `$skill-manager` 为同一实例：未做。
- 重新绑定后的计划是否不再跳过 SkillDock：未验证，需看下一次计划运行。
- `/api/health` 的 `installations` 中 Claude 出现两项的原因：未查。
