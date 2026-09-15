# SkillDock 源码独立审查记录

结论：**本次明确范围的源码审查通过，可交由用户进行 UAT。开放 P0：0；开放 P1：0。** 9 个历史 P1 发现均已按实际修复和独立复验关闭。日期：2026-09-14。此结论不是用户验收、真实环境写入验证或外部发布批准。

## 依据、对象与独立性

用户要求在当前仓库按产品需求、界面设计、工程设计、实现和验证顺序交付初版，再由用户 UAT。本轮依据 `01-product-requirements.md`、`02-interface-design.md`、`03-engineering-design.md`、共享契约和 `00-local-capabilities.md`，进行源码只读审查与临时目录反例验证。

完整读取范围：`scripts/launch.mjs` 和 `assets/app/server/` 下的 files、config、cli、scanner、fixtures、service、index 七个模块；读取 `shared/contracts.ts`，后端安全/生命周期测试与 launcher 测试。另对 `src/App.tsx` 的请求、mode 切换、安装/更新预览、删除确认、正文显示和批量插件列表等副作用相关路径作定向核对。App.tsx 的摘要记录整个文件，但覆盖声明限于上述路径，不冒充整个前端逐行审核。

`product_review` agent 未修改这些实现或测试；修复由 root 和后端作者完成。反例只操作新建的临时 fixture 并在结束时清理。launcher 反例仅停止本次测试创建并核实身份的 child。未修改真实用户配置、技能、插件安装或 marketplace 状态。

## 历史发现与整改结果

下表保留初次观察到的失败、影响与整改方向；“关闭”表示已读取最终修复并独立执行相关验证，不是仅引用作者的通过声明。同一根因的后续反例沿用原 ID。

| ID | 级别 / 状态 | 位置 | 实际失败、影响与最小修复 |
|---|---|---|---|
| SR-001 | P1 / 已独立复验关闭 | `cli.mjs: readMarketplace` | marketplace.json 与插件目录做了真实路径检查，但 plugin.json 自身的链接没有检查。临时market内manifest链接到market外JSON，解析被接受并将外部description带回。违反来源链接边界；应检查每个被读取manifest的realpath仍在市场根，越界/悬空fail closed |
| SR-002 | P1 / 已独立复验关闭 | `scanner.mjs: 已安装插件扫描` | 固定扫描`directory/skills`，忽略合法manifest.skills自定义组件。临时插件声明`./custom-skills`并含1个有效skill，结果skills=0、skillCount=0。会漏掉清单及卸载影响；应按真实组件发现规则解析默认/显式路径，无法支持的组合明确受限，不冒充完整0项 |
| SR-003 | P1 / 已独立复验关闭 | `scanner.mjs: config读取与enabled推导` | 无效TOML被catch后回退`{}`，独立skill被显示为enabled=true、canToggle=true，并声称“文件发现 + Codex 持久配置”。临时反例已复现。应标识配置证据不可用、enabled=null，并关闭依赖该配置的写控件 |
| SR-004 | P1 / 已独立复验关闭 | `launch.mjs: spawn后写启动记录` | child健康后，启动记录写入/rename失败会抛错，但未终止本次新child且没有可用记录。隔离反例返回launchError=true、childStillRunning=true、recordExists=false；后续status/stop无法管理。修复以registered标记包住spawn后退出，未完成注册时停止本次child、等待exit，3秒后仅对该句柄升级终止。独立重跑EISDIR回归通过，health=null且端口可重绑定 |
| SR-005 | P1 / 已独立复验关闭 | `scanner.mjs: 保护根和别名归属` | CODEX_HOME为symlink且用户`.agents/skills`别名指向已验证plugin cache/skills时，保护根词法路径与记录realpath不一致，后续verified-plugin别名也未收紧已有记录，结果scope=user/canRemove=true/managed=false/pluginId=null。应canonicalize保护根，所有别名继承最严格所有权与可操作能力 |
| SR-006 | P1 / 已独立复验关闭 | `service.mjs: activity.restore` | 更新后将skills父目录改为指向sandbox外同内容副本的链接，update恢复分支只比内容指纹不验父路径，返回success并将sandbox外文件恢复为v1。所有恢复类型应核对稳定允许根、真实父路径与保护范围，不只验内容 |
| SR-007 | P1 / 已独立复验关闭 | `cli.mjs: version解析` / `service.mjs: plugin.install` | manifest.version被任意String化后直接用于目标路径。合法演练market携带含`../`的version，经marketplace.add和plugin.install即可在sandbox外新建skill，无需外部篡改目录。应验证market/name/version为安全单段标识，并对最终目标及其父路径做canonical边界检查；卸载和恢复同样验证 |
| SR-008 | P1 / 已独立复验关闭 | `cli.mjs: CodexAdapter.list投影` | 既有CLI市场的marketplaceSource.source直接原值进入GUI Snapshot。fake CLI source含虚构`https://user:FIXTURE_SECRET@host/repo`时，公开source仍包含该凭证。应在公共投影剥离URL凭证/敏感查询，不能仅靠新增来源validateSource；后台真实来源与展示值分开 |
| SR-009 | P1 / 已独立复验关闭 | `service.mjs: sandbox插件重装` / `scanner.mjs: sandboxCatalog` | 正常安装→禁用→卸载→重装后，registry默认enabled=true，但旧config.toml插件enabled=false，GUI与持久配置矛盾。安装应明确保留旧状态或在事务中显式启用，并统一读回事实源 |

SR-002 的最终修复覆盖两类组件来源：manifest 自定义路径，以及仅在 marketplace entry 中声明的 `strict:false + skills`。演练安装将相对组件根持久化并映射到缓存，因此移除市场来源后已安装技能仍可发现；本机 adapter 核对市场 entry 和 CLI 来源，无法证明完整映射时给出诊断并禁用卸载。

SR-006 的 delta 不止验证恢复入口。最终实现在启动时保存 state、Codex 与各受管 skill 根的 canonical 路径、device/inode；扫描拒绝变更根，写入前再次核对固定根和演练实际范围。恢复还核对原父目录身份、备份指纹和目标是否被修改/占用。

SR-007 的最终复验同时覆盖版本穿越及 mkdir 前检查。父目录尚不存在时，也重新解析最近已存在祖先和缺失尾路径。`plugins`、`plugins/cache`、`plugins/cache/market` 被重定向时，在创建任何外部目录之前拒绝；staging、quarantine 和配置备份也使用该检查。

## 独立执行的验证

使用固定 Node v22.14.0，在 `assets/app` 目录运行：

```sh
node --test tests/backend-security.test.mjs tests/backend-lifecycle.test.mjs tests/launcher.test.mjs
```

最终结果：**35 项通过，0 失败，0 跳过，0 取消；32 个顶层测试及 3 个子测试，总耗时 3.292 秒。** 审查对象 13 个文件在测试前后摘要一致。此前执行的 25 项回归与 launcher 后续 6 项回归是中间证据，不与最终 35 项累加。

实际断言覆盖了隔离文件/配置的安装、启禁、更新、删除、恢复；本地 Git commit 解析；同名冲突、来源/目标变化、跨 mode 预览；系统与缓存所有权、别名去重；无效配置 unknown；TOML CRLF、注释、其他条目和插件元数据保留；外部配置变更保留；CLI argv/JSON、超时以及变更后读回失败的 error journal；Host、Origin、token、Content-Type、任意文件读取拒绝；来源凭证过滤；启动记录、端口占用、PID 身份与真正退出。

在测试集合之外，另外独立重放了整改期间的原始路径反例。最终输出：

```json
{"case":"marketplace-declared-skill-install-and-remove-source","installed":true,"skillCount":1,"diagnostics":[]}
{"case":"sandbox-swapped-parent-remove","error":"NOT_FOUND","outsideUnchanged":true}
{"case":"plugin-install-ancestor-link","prefix":"plugins","code":"ROOT_BOUNDARY","outsideEntries":[]}
{"case":"plugin-install-ancestor-link","prefix":"plugins/cache","code":"ROOT_BOUNDARY","outsideEntries":[]}
{"case":"plugin-install-ancestor-link","prefix":"plugins/cache/starter-market","code":"ROOT_BOUNDARY","outsideEntries":[]}
```

所有 outside/external 均为审查脚本创建的临时 fixture。SR-001/003/005/007/008/009 的早期反例分别已被 manifest realpath 校验、unknown 状态、canonical 保护根与最严格别名所有权、安全单段版本、公共来源脱敏、重装保留持久禁用状态所封闭，并有当前测试断言。

root 另行发现并修复的两个风险也已复验：TOML 语义比较只排除目标 enabled、多行字符串伪 header 明确拒绝；launcher 停止动作等待已核实 PID 实际退出后才清除记录，超时保留记录。延迟退出 fixture 断言 stop 返回时 PID 已不存在。Git 继承环境反例仅观察到明确 clone 失败，未将其伪称为已证实越界。

## 对象摘要

范围是当前工作树中的新 skill-manager 实现，不是整个仓库或 Git commit 的通过证明。下面是 10 个源码/契约对象和 3 个实际执行测试文件的 SHA-256；摘要相对路径以 skill-manager 为根。集合摘要按路径排序，对每个对象依次输入 UTF-8 路径、NUL、原始文件字节、NUL。

集合 SHA-256：`78a81c642f4762eb33af65ad22ed8ef0a7bc1f3da5b2ec625ddf9201e54e46df`

| 对象 | SHA-256 |
|---|---|
| `assets/app/server/cli.mjs` | `91390ff91b7a42af2db1c7754c0ea28c75ce35756ad09bee5ce37894c8452466` |
| `assets/app/server/config.mjs` | `2da4a6d87733c5853ea0ab65c93708c5a2f9c27caec3d8880d295122fcc4a4de` |
| `assets/app/server/files.mjs` | `3f7118c62d1b2afe7b21411b8e3e728d7635e198883ce06d6aa571eefd7df1cc` |
| `assets/app/server/fixtures.mjs` | `18124168111d0cd4e1c60bc94f5d16ea3df17f35010658bdf73f327d3cd9f741` |
| `assets/app/server/index.mjs` | `3b221a061ec23824cee511bf0bcf780e02f4289d9011e3e6594176d85b4757cb` |
| `assets/app/server/scanner.mjs` | `3121097e122609f48eca51ddb69a2e1da796fb737356381dac7f06dface0cd1d` |
| `assets/app/server/service.mjs` | `3f411d841f4370d8ed93780c51cb7c607bb57afd179a2cb53af9ff7ebbae897d` |
| `assets/app/shared/contracts.ts` | `9709611738753118b0177522cf003fb0e8a76c85e8aa0b70ff5166fef249e10f` |
| `assets/app/src/App.tsx` | `dd6281f5384f480b22542688cde70d3e1a6deb5d5f6f351fe0b9f02f674ca81a` |
| `assets/app/tests/backend-lifecycle.test.mjs` | `a0a5d5ab0590aef242174aa45e6492dba842bde96da9885b1de370e9c4d6605a` |
| `assets/app/tests/backend-security.test.mjs` | `51977a7d26d1869e882e2a999041f329ec1deae81009704d9a2c55163028c27b` |
| `assets/app/tests/launcher.test.mjs` | `45a54fd73185d506bd77bbb939fa69cf188451e3b0d615985248869dc1be075c` |
| `scripts/launch.mjs` | `7de48a2b38a0982d530d7bd73f76a6f3484c0f4d50c7cb57c0b81d3d3a281f48` |

## 验证边界与交接

本机真实清单只读 smoke、全部浏览器旅程和视觉验收由 root 的交付验证记录负责，不算作本审查者执行的上述 35 项测试。真实用户数据写入未执行；用户 UAT 仍按 `06-uat-guide.md` 的 13 项步骤待验收。

当前行为明确保守的部分包括：不支持的 TOML 写法不修改原文；平台托管或无法确认完整组件范围的对象不给出无依据的卸载能力；跨文件系统移动在改动原目录前拒绝。已核验正常输入与目录变化反例，不把本地单用户应用描述成能抵御任意同 UID 对私有状态进行恶意并发篡改的隔离沙箱。

若上述实现或测试对象继续改变，应针对实际 delta 复验后更新摘要；不能把本记录沿用为后续代码或用户 UAT 的自动批准。
