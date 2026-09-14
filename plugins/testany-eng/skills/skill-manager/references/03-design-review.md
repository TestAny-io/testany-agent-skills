# SkillDock 界面与工程设计独立审查

结论：**当前初版设计可进入实现。** `technical_verdict: APPROVED`；`scope_status: WITHIN_APPROVED_SCOPE`。未发现阻断性 P0/P1；4 条 P2 建议不阻断。本报告判断当前设计的完整性与可行性，不代表源码、执行终态、正式安装或用户 UAT 已通过。

## 对象、依据与边界

审查日期：2026-09-14；轮次：首次完整审查当前 app 设计；审查者：独立 `product_review` agent。用户在当前任务明确授权完成产品需求、界面设计、工程设计、开发实现与验证，最终由其 UAT。技术选型和本地开发验证属于本次授权，无须在每个文档间重复获得用户批准。

| 已读对象 | SHA-256 |
|---|---|
| `02-interface-design.md` v0.1 | `cc621d110ef08c3a0187068653ef33ad0ed54a4e9371bcf4bc6861696770529a` |
| `03-engineering-design.md` v0.1 | `a06752b6c6f61e1a339ba87c609a181b03b9c32902689f7eed3f223b9e17cd54` |
| `00-local-capabilities.md` | `586b3211ac31c21b6e172653d1802c15e005ba00eae470a925fa10741ce90934` |
| `../assets/app/shared/contracts.ts` | `00357381e3dda15db315b2f6823b9d71391867fd4b38c9ccf3ca91f1bd7775bf` |

上游复用 `PRD-SKILLDOCK-001` v0.1 与 `01-product-review.md` 的需求覆盖。按本仓库 review-boundaries、review-assurance 和 HLD/LLD 的职责、漂移、可行性、安全、恢复、契约检查原则审查。本次用户要求的是完整初版研发交付；本文保留人工需求映射，不伪称已经取得独立机器 HLD/LLD metadata/RTM 准出证书，亦不要求为新 app 补造历史前端或旧系统。

Guardrails trigger check：`no_trigger`。HTTP、凭证保护和文件事务约束限定在 SkillDock；不改变本仓库其他技能的职责或项目级发布标准。无需因一个本地 app 的安全设计新增全仓治理流程。

## 需求与界面覆盖

| 基线 | 界面与工程映射 | 结果 |
|---|---|---|
| REQ-SD-001 | 技能库、来源筛选、抽屉路径/归属/状态证据；scanner 多根与 CLI/cache 分层 | 已覆盖 |
| REQ-SD-002 | 五页面、统计筛选、加载/空/错、720/1440 及 390px、焦点和键盘行为 | 已覆盖；视觉仍须成品核验 |
| REQ-SD-003 | 路径级 skill 开关、包级 plugin 开关、只读徽章、配置读回与重载提示 | 已覆盖；官方配置语法补证见下文 |
| REQ-SD-004 | 本地/Git 来源、子目录/ref、预览确认、暂存、冲突拒绝 | 已覆盖 |
| REQ-SD-005 | 移除确认与影响列表、quarantine、链接本身移动、恢复冲突 | 已覆盖 |
| REQ-SD-006 | 插件/市场页面、真实 CLI 能力检测、来源维护、安装读回 | 已覆盖；无独立 plugin update 不冒充支持 |
| REQ-SD-007 | 更新页、provenance、差异文件预览、本地修改检测、前版恢复 | 已覆盖 |
| REQ-SD-008 | 对象忙碌、非 2xx 错误、成功/失败记录、外部变更保护、恢复 | 已覆盖 |
| REQ-SD-009 | loopback、同源 token、服务端路径归属、文本显示、托管保护 | 已覆盖设计边界；待实现反向测试 |
| REQ-SD-010 | launcher、构建、演练、只读 smoke、测试/截图/UAT | 已覆盖计划；不能预填执行成功 |

界面结构符合在 Codex 右侧工作的场景。导航、详情抽屉、安装对话框和更新预览都有直接操作入口；无需回到对话输入对象名。环境选择始终可见且切换清理对象状态，可降低演练/本机混淆。现代视觉方向已具体到排版、间距、色彩、图标和响应式，不依赖远程字体或图片。

## 架构与实现可行性

- **职责与依赖**：同源 React 页面和 Node 本地服务足以支持本轮规模；后端分别管理独立 skill 文件与已探测 CLI，无需新增云端或多用户权限体系。数据库、分布式高可用与线上发布迁移不适用本轮。
- **来源与所有权**：技能身份用路径而非名称，真实路径只用于归属/别名判断；系统和托管缓存优先保护。CLI 安装证据优先于 cache/config，符合本机实际存在“有缓存/配置但 CLI 未报告安装”的情况。
- **配置冲突**：原字节备份、写前 hash 复查、局部 TOML 补丁、同目录原子替换与读回有可实现路径。无法安全编辑的语法拒绝写入是明确失败策略。测试需验证完整无关配置字节和注释保留，而非只验证新开关值。
- **目录事务与恢复**：安装预览指纹、更新三方指纹、quarantine 和占用冲突覆盖主要数据丢失路径。工程设计已要求失败后恢复或明确可恢复终态；后续源码审查必须检查目录成功但 provenance/journal 失败的分支，不得仅测 happy path。
- **symlink**：导入禁止越界链接与特殊文件；移除已知用户根链接只移动该链接，不递归移除 target。归属判断应每次提交重新解析有效父路径，不能仅信任预览时路径；latest 别名只算一个实体。
- **loopback 与跨源**：绑定 127.0.0.1、校验 Host/Origin、token header、JSON Content-Type 且无跨源 CORS，能够形成设计要求的浏览器边界。`/api/session` 的 token 不可进入 URL、日志或浏览器持久存储；同源校验必须随实际端口构造，不能用字符串包含匹配。GET 的跨站拒绝也应覆盖 session 与详情读取。
- **CLI**：已有真实 help/version/list 观察足以支持接口适配设计；argv 与 shell:false、白名单命令、超时/输出上限、安装卸载后 list 读回合理。已确认的 CLI 路径不是永恒保证，保持显式二进制及运行时探测。
- **演练与重试**：分 mode 的文件根、记录、预览绑定与前端旧请求丢弃，避免跨环境结果污染。单进程写互斥和冲突返回适合单用户应用；恢复接口依靠记录 ID 和当前指纹，不能接受任意目标路径。

## API 前后端契约检查

四类 HTTP 入口、Mode、Skill/Plugin/Marketplace/Activity、预览与错误对象能够支撑所设计页面。Skill 的 `enabled: boolean | null` 与 `statusEvidence` 可表达未核实状态；`canToggle/canRemove/canUpdate` 与 `reason` 可驱动安全控件。前端能力标记只是展示，后端仍需按当前发现结果重新判断。

`ActionRequest` 当前采用 action enum 加可选字段的宽类型；设计已有 400 参数错误约定，因此没有证据证明一定接受非法调用。但实现不能把 TypeScript 类型视为运行时校验。主要组合为：toggle 必须有对象 ID 和 boolean；remove/checkUpdate 必须有对象 ID；install/update 必须有对应 mode 的未过期 previewId；restore 必须有活动 ID；marketplace.add 必须有受支持来源。预览必须在提交端绑定其对象、来源和 mode。

错误结果统一使用非 2xx 的 `ApiError`，写请求完成后拉取新 state，可保持 toast、清单和活动一致。记录 `error` 时仍可提供已确认的恢复入口；不得因为发生部分文件变更就返回笼统 success。

## 必要能力补证

本机调查明确未观察到 `skills.config` 样本。本轮额外读取官方 [Build skills — Enable or disable local Codex skills](https://learn.chatgpt.com/docs/build-skills#enable-or-disable-local-codex-skills)，确认配置使用 `[[skills.config]]`，`path` 指向 `/path/to/skill/SKILL.md`，`enabled = false`，并要求更改配置后重启 Codex。这里的 path 是文件，不能误写为 skill 目录。

同页还列出用户 `.agents/skills`、仓库各级 `.agents/skills`、`/etc/codex/skills` 和系统来源。后者可作为只读已知根纳入；本机实际兼容目录则继续以调查为证据。官方语法补证不等于已在当前用户配置执行开关；真实写操作仍留给用户，开发测试用隔离配置。

## 可选建议

| ID | kind / 严重度 | 证据、影响与建议 |
|---|---|---|
| SD-DES-001 | optional / P2 | ActionRequest 必填关系未编码进共享类型；建议改为 action 判别 union 或共享校验器，降低并行前后端实现时漏字段风险。无论是否重构类型，服务端均执行上述既定 400 校验 |
| SD-DES-002 | optional / P2 | Plugin 的 `installed` 只有 boolean。若插件列表加入 cache-only 条目，必须增加明确 installationState/statusEvidence，或限定 plugins 数组只容纳 CLI 已确认安装/可用项目，让未知缓存留在只读技能清单；不能把未知状态编码成已确认未安装 |
| SD-DES-003 | optional / P2 | 实算次文案 `#718077` 在 `#f6f7f5` 上为 3.86:1，在白色上为 4.15:1，低于设计的 4.5:1 正文目标；建议辅助文案色加深。橘红 `#e46e43` 对白色为 3.18:1，若使用白色小字按钮也应调整。这不阻断布局实现，成品视觉验收需落实可读性 |
| SD-DES-004 | optional / P2 | Git 设计已有“不运行 hooks / 不接受任意命令”约束，建议明确允许协议/参数长度及导入文件/字节上限，测试 `ext::`、未知 transport、前导 option、越界 subpath 和包含凭证来源的拒绝。避免只依赖 shell:false 就推断所有 Git 传输行为安全 |

## 证据边界与下一步

本轮实际做了设计/契约通读、需求映射、对象摘要、官方配置语法核实和色彩相对亮度计算。没有运行后端、CLI 写操作、UI 点击、构建或测试；设计没有独立 metadata block，本轮也没有声称执行 HLD/LLD trace-lint/RTM。产品 PRD 的既有实际 lint 结果保持有效，设计正文已有 10/10 人工需求映射。

目前无必要产品/架构范围决定或阻断性技术缺口。可以继续已授权实现；验证阶段需证明边界真正执行，而非引用本文充当测试结果。优先检验冲突恢复、跨站请求、受保护路径、导入链接、cache-only 状态和真实/演练隔离。最终 UI 美观与日常可用性由用户 UAT 确认。
