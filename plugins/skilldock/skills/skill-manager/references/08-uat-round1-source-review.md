# SkillDock 第一轮 UAT 变更源码审查

结论：**本次后端与 HTTP/共享契约范围的源码审查通过，可合并整合验证证据后交用户第二轮 UAT。开放 P0：0；开放 P1：0。** 三个 P1 发现均按实际修复和独立复验关闭。日期：2026-09-14。原 `05-source-review.md` 仅证明其记录的初版对象，不自动覆盖本轮代码。本结论不是前端全部源码审查、真实环境写入验证、用户验收或外部发布批准。

## 依据与独立性

本轮依据用户第一轮 UAT 的六项反馈及 `07-uat-round1-changes.md`，审查来源接入、按所有者更新、持续自动更新、HTTP 契约与既有文件/配置保护。用户已授权实施到再次交付 UAT；源码审查不代替用户 UAT，也不授权测试修改真实技能库。

本轮完整审查新增 `sources.mjs`、`scheduler.mjs`，以及 `service.mjs` 的来源接入、包更新、公共 action、调度连接、暂存清理和现有事务交互；核对 `cli.mjs`、`scanner.mjs`、`fixtures.mjs`、`index.mjs` 的当前版本及共享契约。`config.mjs` 和 `files.mjs` 与初版已完整审查的字节摘要相同，既有保护语义沿用并在本轮回归中执行。实际候选共九个 server 模块、一个契约和三个后端测试文件。

`product_review` 只读审查后端实现和测试，并在新建临时目录中执行反例；后端修改由 `local_capabilities` 完成。本轮 `product_review` 实现了许可证、源码归档和 launcher 的快照分发，因此不对这些部分自行声称独立审查。root 已独立读取相应实现、运行 11 项归档/launcher 测试；整合 HTTP 下载和实际运行版对应性另由 root 记录。前端视觉、全部浏览器旅程与本机只读清单验证也不冒称为本审查者的源码覆盖。

确认的产品边界：`canRemove`、`canToggle` 不推导更新权限。用户要求插件按包更新，且 root 明确允许已核实本地来源的 bundled 包经官方 CLI 更新；远程托管包与宿主内置技能仍按所属管理器的实际能力提供入口。此项按本轮授权和独立更新能力判断，不沿用初版的卸载限制作为更新禁令。

## 发现、反例与整改

| ID | 级别 / 当前状态 | 触发与实际影响 | 整改及独立证据 |
|---|---|---|---|
| R1-SR-001 | P1 / 原反例复验关闭 | `schedule.configure` 在磁盘保存前改变内存计划。临时 `updates.json` 置为目录使保存返回 EISDIR，移除障碍后到期仍执行，形成未成功保存却生效的计划 | 改为先持久化 proposed 配置，再发布到计时器可见状态，并保留在途运行字段。独立原反例输出 `code=EISDIR, performed=0` |
| R1-SR-002 | P1 / 独立复验关闭 | Git 市场检查自行创建新 clone 根，计划绑定却使用旧 clone 路径。实际第一轮包升级成功，第二轮永久 `TARGET_BINDING_CHANGED`；同市场其他包也会受影响 | 绑定原市场来源、类型与包相对位置，排除本服务暂存根变化；应用前重新核绑定。最终独立执行两个包连续两轮升级、第三轮 current 的回归通过 |
| R1-SR-003 | P1 / 独立复验关闭 | Git skill 的自动检查即使 current 仍永久保留完整 `staging/repository/.git`，已消费/过期预览也不清理。独立三轮均 current，而暂存目录与 Git 仓库数 2→3→4，长期后台运行持续占用磁盘 | 无变化立即清理、成功消费后清理、30 分钟过期及遗留暂存根回收。市场新 registry 提交后保留当前根、活跃预览引用根与最近两个未引用根；固定 state 边界核验先于删除。最终原反例三轮暂存目录均为 0；重定向 staging 时外部 sentinel 保留；回归断言用户原来源及 quarantine 备份不变 |

另已主动验证来源重新关联后的旧更新预览：先检查来源 A，再关联 B 且保持已安装字节相同，最后应用 A 的预览，返回 `SOURCE_RELINKED`。最终实现同时保存来源身份和目标目录身份，避免仅比较内容指纹而接管新对象。

P2 投影一致性建议也已修正并独立验证：旧 observation 不再覆盖外部更新后新扫描到的 `installedVersion`，版本或路由变化使旧 observation 失效。测试输入新安装版本 3.0.0、旧检查版本 1.0.0，输出 `installedVersion=3.0.0, status=unchecked, canApply=false`。

## 独立执行证据

使用固定 Node v22.14.0，在 `assets/app` 目录独立运行：

```sh
node --test tests/backend-security.test.mjs tests/backend-lifecycle.test.mjs tests/backend-updates.test.mjs
```

最终结果：**45 项通过，0 失败、0 跳过、0 取消；39 个顶层测试及 6 个子测试，总耗时 11.528 秒。** 下面 13 个候选对象在最终测试和原反例 delta 前后摘要一致。此前新增更新测试的 15 项通过是中间证据，不与最终 45 项累加。

实际覆盖：既有未知/Git/系统来源、来源关联前后两端变化、旧预览失效；禁用包升级保留状态；同版本内容变化和降级拒绝；显式静态计划、两环境隔离、成功更新后推进自身绑定、目标目录替换跳过；失败保存、重启补一轮、遗留 running 标为未确认；关闭计划让单项完成并停止后续对象；官方 CLI 参数、恢复禁用/读回/JSON 失败的恢复证据；Git 市场多包连续运行。

既有回归同时覆盖原初版文件/配置安装、启禁、删除恢复、同名冲突和跨环境预览、Git 来源、manifest 及受管根链接边界、插件/系统归属、无效配置状态、配置并发变更保留、CLI 不确定执行结果、Host/Origin/token 与任意读取拒绝。包更新测试以临时可执行 fake Codex 验证真实进程 argv 和 JSON/读回链路；不伪称已写入用户真实插件配置。

独立原反例的最终输出另包括：

```json
{"case":"R1-SR-001 failed save stays disabled","code":"EISDIR","performed":0}
{"case":"old update after source rebind","code":"SOURCE_RELINKED"}
{"case":"R1-SR-003 unchanged Git auto rounds","counts":[{"round":1,"status":"current","stagedDirectories":0},{"round":2,"status":"current","stagedDirectories":0},{"round":3,"status":"current","stagedDirectories":0}]}
{"case":"GC refuses redirected staging","outsidePreserved":true}
{"case":"external version refresh invalidates observation","installedVersion":"3.0.0","status":"unchecked","canApply":false}
```

## 最终候选摘要

摘要相对路径以 `skill-manager` 为根，集合摘要按路径排序，依次输入 UTF-8 路径、NUL、原始文件字节、NUL。范围是当前工作树中的这些对象，不是整个 Git commit、全部前端或仓库的批准证明。

集合 SHA-256：`5a6e60238fb318a55e9a14dc457b7332e0d1fb2a0dab02ba3a1e9328d51af2c7`

| 对象 | SHA-256 |
|---|---|
| `assets/app/server/cli.mjs` | `95b8cd248f77e88e7c5e03ad8ea1e5ef88b2e8d316e9f663a52f821381faddd0` |
| `assets/app/server/config.mjs` | `2da4a6d87733c5853ea0ab65c93708c5a2f9c27caec3d8880d295122fcc4a4de` |
| `assets/app/server/files.mjs` | `3f7118c62d1b2afe7b21411b8e3e728d7635e198883ce06d6aa571eefd7df1cc` |
| `assets/app/server/fixtures.mjs` | `18aab99d9c9f6ae56de1f875d899057b3e7f7c029b4e8d71031427ed66f3922a` |
| `assets/app/server/index.mjs` | `d1eff5200fa0127410544f303443a6a8780ac3e5a8890eb0688ac3eacbd071a6` |
| `assets/app/server/scanner.mjs` | `0cbaaed0a87e1db6aacd069b95055baf426d17f2fb8c32d79942c8914d15857e` |
| `assets/app/server/scheduler.mjs` | `afb65fbdeb4bd9c859b0f290c34495e25f145d97fecb76b057b4acfd6cf6c876` |
| `assets/app/server/service.mjs` | `ff4b4af0768dbd73ca896b1dc0a363246252c115a70f14e22557b27b264d8cd3` |
| `assets/app/server/sources.mjs` | `f49742a2a492406340258cead177affdfabdd9a478ee7e352bf3568ccee2b72e` |
| `assets/app/shared/contracts.ts` | `42651968d2e831fe868aa501380aa0558f39ea0f98eec0951bf031899593c24a` |
| `assets/app/tests/backend-lifecycle.test.mjs` | `a0a5d5ab0590aef242174aa45e6492dba842bde96da9885b1de370e9c4d6605a` |
| `assets/app/tests/backend-security.test.mjs` | `51977a7d26d1869e882e2a999041f329ec1deae81009704d9a2c55163028c27b` |
| `assets/app/tests/backend-updates.test.mjs` | `ebbaeb10fe5713925d45965e440b5d026e798536d54012153c654a4aaf3c2fdd` |

## 交接与明确限制

定时计划默认关闭；本轮没有替用户启用真实计划。它依赖本地服务运行，停机/休眠不执行，恢复后最多补一轮，再从结束时间计算间隔。受保护或来源证据不足的对象通过真实所有者入口处理，不能承诺所有管理器都有可调用的更新接口。包级 CLI 操作若已改变内容但状态恢复或读回失败，报告失败/未确认并保留证据，不声称跨外部 CLI 的完全原子回滚。

暂存清理只涉及应用自管临时根；用户源和恢复备份不在回收范围。备份容量保留现有产品语义，不以临时清理为由删除可恢复内容。此本地单用户工具未被描述为能抵御任意同 UID 对私有状态进行恶意并发篡改的安全沙箱。

root 的整合验证负责真实只读清单、界面/语言/主题、源码下载对应性等其实际执行的证据；第二轮 UAT 仍待用户完成。若上述候选对象继续变化，应对实际 delta 复验后更新摘要，不能沿用本记录自动批准后续代码。
