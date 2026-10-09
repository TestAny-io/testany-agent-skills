# 阶段 3 首次试用（UAT）说明

> 适用分支：`feature/skilldock-0.11-cross-agent`（本地，未推送），提交 `ab66271` 及之后
> 目的：在独立的数据目录中试用跨 Agent 的只读清单与“Agent 环境”页，不影响正在使用的 SkillDock（端口 4771、数据目录 `~/.local/share/skilldock`）。

## 1. 试用前提

- **两边的 SkillDock 都不能低于 0.10.3。** 0.11 的迁移门槛会检查本机 Codex 与 Claude 中装的 SkillDock，只要有一侧低于 0.10.3，就不接管新的数据目录（启动时退出码 4，并给出更新步骤）。请先在 Codex（以及装过的话，Claude）中把 SkillDock 更新到 0.10.3。
- **首次启动会准备依赖。** 启动器会在试用数据目录里执行 `npm ci`；本机 npm 缓存里没有的依赖会从 npm 源下载。
- **试用实例读取你真实的 Codex 与 Claude。** 只读取，不改动 Claude。但 Codex 默认是“已启用管理”（因为你的 Codex 装了 SkillDock）。在试用实例里对 Codex 对象做的启用、停用、移除、安装，会像平时一样真的改动 Codex。只想看、不想改的话，先在“Agent 环境”页把 Codex 设为只读。
- **不要在试用实例里开启更新计划。** 开启后，它会为试用数据目录注册一个后台任务。如果已经开启，试用结束前在更新页关闭即可。

## 2. 启动

在终端中运行（把最后的项目路径换成你常用的项目目录）：

```bash
SKILLDOCK_STATE_DIR="$HOME/.local/share/skilldock-uat" PORT=4781 /bin/sh "/Users/kailaichen/Downloads/source code/testany-agent-skills/plugins/skilldock/skills/skill-manager/scripts/launch.sh" start --project "$HOME"
```

成功后会输出 `http://127.0.0.1:4781`。在浏览器中打开它。

## 3. 建议核对的内容

1. **侧栏的“Agent 环境”页**
   - 应看到 Codex（已启用管理）与 Claude（只读）两张卡片。
   - 每张卡片显示配置根、技能与插件数量、命令行路径与版本，以及该侧 SkillDock 的版本。
   - Claude 卡片上有“桌面应用会话不会自动更新插件”的说明。
   - 点“查看路径”，核对配置根、个人技能、插件缓存三个位置是否正确。
2. **技能库**
   - 顶部有“全部 / Codex / Claude”筛选，计数与你的实际情况相符。
   - 只属于 Claude 的技能带 Claude 标识，开关不可用，并说明“这一版只读取 Claude”。
   - 两边共用的技能（例如通过链接共用的目录）只出现一次，带两个标识，并分别显示两边的状态。
   - 你在 Claude 中用 `/skills` 设为“仅名称”或关闭的技能，显示的可见性与来源层级（用户、项目、本地）应当正确。
3. **插件**
   - Claude 插件显示安装范围（用户、项目、本地）和“由哪一层设置决定”。
   - 由 claude.ai 同步或组织托管的插件显示锁形标识。
4. **市场来源**
   - Claude 的 marketplace 显示“自动更新：开/关”，以及是否为默认值、插件数和最近刷新时间。
5. **启用 Claude 管理（可选）**
   - 点 Claude 卡片上的“启用管理”，确认框会说明这一版仍只读，并列出启用后可能写入的位置。
   - 确认后状态变为“已启用管理”。这一步只写试用数据目录里的设置，不改 Claude 的任何文件。
6. **Codex 设为只读（可选）**
   - 在 Codex 卡片上“停用管理”后，Codex 对象的开关、移除、更新应用、恢复都变为不可用，并说明原因。
   - 这时在更新页检查插件更新，结果会注明“没有刷新来源，也没有改动 Codex”。
7. **语言**：在偏好设置中切到英文或日文，新页面与提示不应残留中文。

## 4. 已知限制（这一版）

- Claude 中的技能、插件、marketplace 都只读：不能安装、启停、更新、移除，也不能加标签或加入更新计划，随阶段 4、5 开放。
- 两边共用的技能被移除或更新时，还不会提示“会同时影响 Codex 与 Claude”（随阶段 4 实现）。移除的内容照常进入可恢复区，可以在操作记录中恢复。
- “一键更新另一侧的 SkillDock”还没有实现；版本落后时只显示手动更新的步骤。
- 只读状态下的检查结果会保留到下一次检查；重新启用 Codex 管理后，请重新检查一次。

## 5. 停止与清理

```bash
SKILLDOCK_STATE_DIR="$HOME/.local/share/skilldock-uat" PORT=4781 /bin/sh "/Users/kailaichen/Downloads/source code/testany-agent-skills/plugins/skilldock/skills/skill-manager/scripts/launch.sh" stop
```

试用数据都在 `~/.local/share/skilldock-uat`。不再需要时，把这个目录移到废纸篓即可。你正在使用的 SkillDock 与其数据不受影响。

## 6. 反馈

试用中看到的任何不对，请直接告诉我：截图、或者描述在哪一页、看到什么、预期什么都可以。
