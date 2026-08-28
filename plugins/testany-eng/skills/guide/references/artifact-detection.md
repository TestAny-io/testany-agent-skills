# Artifact Detection Guide

本指南定义 `guide` 在扫描项目文档时如何识别 artifact 类型、状态、审查证据与推荐置信度。

## 目标

Guide 需要把仓库中的文档与证据，归一化为可用于路由的结构化状态：

- `artifact_type`
- `status`
- `evidence_level`
- `confidence`
- `chosen_candidate`

Guide 不需要做到“100% 自动理解所有文档”，但必须做到：

1. 优先依赖强证据
2. 在弱证据下显式标注低置信度
3. 在歧义会改变推荐时主动向用户确认

## 总体检测顺序

对每个候选文档，按以下顺序检测：

1. **TRACEABILITY-METADATA**
2. **文档内状态字段**
3. **审查/准出证据**
4. **标题与文件名关键词**
5. **目录上下文**

如果上一级已经足够确定，不要继续用弱证据推翻强证据。

## 证据等级

| 等级 | 名称 | 典型信号 | 说明 |
|------|------|----------|------|
| E1 | 强证据 | `TRACEABILITY-METADATA`、明确 `artifact.type`、明确 `status` | 优先级最高 |
| E2 | 审查证据 | 准出证书、审查报告、明确“通过/不通过” | 用于确认 `approved/in_review` |
| E3 | 结构证据 | 文档标题、章节结构、模板特征 | 可辅助确认 artifact 类型 |
| E4 | 启发式 | 文件名、目录名、邻近文件 | 只在前三级不足时使用 |

## 状态归一化

所有文档状态必须统一映射为：

- `missing`
- `draft`
- `in_review`
- `approved`
- `unknown`

### 状态映射规则

| 原始信号 | 归一化状态 |
|----------|------------|
| `status: approved` | `approved` |
| `status: in_review` | `in_review` |
| `status: draft` | `draft` |
| 标题含“准出证书”且明确通过 | `approved` |
| 标题含“审查报告”且未发现通过结论 | `in_review` |
| 文档存在，但无批准证据 | `draft` |
| 只能弱匹配到类型，无法确认状态 | `unknown` |

### 同义词映射

以下词汇可按等价处理：

- `approved`：`已批准`、`准出`、`通过`
- `in_review`：`in review`、`reviewing`、`评审中`、`审核中`
- `draft`：`草稿`、`初稿`、`draft`

如果同一文档同时出现冲突状态：

- 优先以 `TRACEABILITY-METADATA` 中的 `artifact.status` 为准
- 其次以最新的审查/准出证据为准
- 再次才看正文顶部的表格/标题状态

## Artifact 识别规则

### 1. BRD

强信号：

- 标题含 `BRD`
- 文档结构偏业务需求、背景、目标、成功指标、范围与约束

弱信号：

- 文件名含 `brd`
- 内容强调业务价值、stakeholder、现状量化

状态来源：

- 文档正文顶部状态表
- 若无统一元数据，则以文档内“初稿/已审核/已批准”为主

### 2. USER_JOURNEY

强信号：

- `TRACEABILITY-METADATA` 中 `artifact.type: USER_JOURNEY`
- `schema.profile: journey-profile-v1`
- 标题含 `Journey` / `User Journey`
- 含步骤流转、异常路径、边界情况、Mermaid 流程图

弱信号：

- 文件名含 `journey`、`user-journey`、`uc`

注意：

- 不要把单个页面流程说明误判成正式 User Journey 基线
- 若 metadata 存在，状态优先取 `artifact.status`

### 3. PRD

强信号：

- `TRACEABILITY-METADATA` 中 `artifact.type: PRD`
- `schema.profile: prd-profile-v1`

辅助信号：

- 标题含 `PRD`
- 有需求列表、验收标准、影响范围、追溯元数据块

状态来源：

- 优先 `artifact.status`
- 其次 `PRD 准出证书`
- 再次文档状态行

### 4. API_CONTRACT

强信号：

- OpenAPI / AsyncAPI / GraphQL schema / `.proto` / 契约 index
- 标题或内容明确为 API Contract

弱信号：

- 文件名含 `openapi`、`swagger`、`asyncapi`、`contract`、`schema`、`proto`

注意：

- 不要把普通接口设计章节误判成正式 API Contract
- 没有 reviewer 或明确 `approved` 证据时，默认只算 `draft`

### 5. HLD

强信号：

- `TRACEABILITY-METADATA` 中 `artifact.type: HLD`
- `schema.profile: hld-profile-v1`

辅助信号：

- 标题含 `HLD`
- 内容包含架构决策、模块关系、风险、发布策略

### 6. TEST_STRATEGY

强信号：

- `TRACEABILITY-METADATA` 中 `artifact.type: TEST_STRATEGY`
- `schema.profile: test-strategy-profile-v1`

辅助信号：

- 标题含 `Test Strategy`
- 内容强调分层、范围、环境、入口/出口标准

### 7. LLD

强信号：

- `TRACEABILITY-METADATA` 中 `artifact.type: LLD`
- `schema.profile: lld-profile-v1`

辅助信号：

- 标题含 `LLD`
- 内容含模块设计、接口签名、伪代码、错误处理、测试设计

### 8. TEST_SPEC

强信号：

- `TRACEABILITY-METADATA` 中 `artifact.type: TEST_SPEC`
- `schema.profile: test-spec-profile-v1`

辅助信号：

- 标题含 `Test Spec` / `Test Package`
- 内容含测试矩阵、详细 case、环境数据、追溯矩阵

#### Testany Automation Handoff（嵌入于 TEST_SPEC）

Guide 不把它当成独立 artifact，但在 `TEST_SPEC = approved` 时，应该额外检查文档中是否存在：

- 标题 `Testany Automation Handoff`
- 或 YAML block 顶层 key 为 `testany_automation_handoff`

状态归一化：

| 原始信号 | 归一化结果 |
|----------|------------|
| `status: ready` | automation branch `ready` |
| `status: partial` | automation branch `partial` |
| `status: not_planned` | automation branch `not_planned` |
| section 缺失或无法解析 | automation branch `unknown` |

使用规则：

- `ready`：当用户目标涉及 Testany 自动化时，可以直接推荐 `/case-writing`
- `partial`：可推荐 `/case-writing`，但要注明仍有 handoff 缺口
- `not_planned`：默认保持文档主线，不主动推荐 `/case-writing`
- `unknown`：若用户明确要 Testany 自动化，优先回到 `/test-spec-writer` 补 handoff；必要时才以 `low confidence` 推荐 `/case-writing`

### 9. RUNBOOK

强信号：

- 标题含 `Runbook`
- 内容包含部署、回滚、监控、故障处理、值班信息

弱信号：

- 文件名含 `runbook`

### 10. IMPLEMENTATION_CANDIDATE

这是 Git/源码工件，不是普通文档。**不得因为仓库存在 HEAD commit 就自动判定 Candidate 存在。**

强信号：

- 用户显式提供 base/Candidate SHA 或要求 review 当前精确 worktree
- review request / Exec Plan 明确绑定 repository、base、Candidate、tree
- Code Review report/certificate 明确绑定 exact Candidate

弱信号：

- 文件名含 `code-review`、`review-request`、`exec-plan`
- feature branch 存在，但没有明确说明哪个 commit 是 Candidate

状态来源：

| 证据 | 状态 |
|------|------|
| mutable worktree 尚无有效 snapshot-bound approval comment，或旧 snapshot 已漂移 | `draft` |
| exact Candidate + review request，无批准结论 | `in_review` |
| exact Candidate + `APPROVED` Code Review certificate | `approved` |
| mutable/mixed Candidate + `APPROVED` Mixed / Mutable Worktree Review Comment，且逐仓核对 immutable SHA/tree，并对每个 mutable repo 用该行记录的 resolved script、完整 argv 重算 `WORKTREE@sha256` 后逐字匹配 | `approved`（仅该组逐仓 binding；不是 immutable certificate） |
| 只有 feature branch/普通 commit | `unknown`，不能主动推荐 Code Review |

Code Review approval 只表示源码准出；不得据此把 CI、merge、deployment 或 release 标记为 approved。

Code Reviewer v2 的 terminal 可引用唯一 Review Record。先读取并校验该 record 的版本/摘要，再解析其 Scope Lock、逐仓 binding、coverage 和 prior chain；内嵌 record 必须完整。不要要求报告重复所有附录，也不要接受只给摘要的 record。复用 source/local evidence 不等于继承旧 approval，新 Candidate 仍需自己的评审绑定和 verdict。

Code Review terminal 选择不使用“certificate 高于 report”或“approved 高于其他状态”的通用偏好。Guide 必须按 Review ID、Candidate/snapshot、Scope Lock 与 `prior_terminal_chain` 验证 immediate-terminal lineage，并选择链上最新 terminal。若 terminal 以内嵌 envelope 提供，先按宿主的 Skill 资源解析规则定位已安装 `code-reviewer` 的绝对目录；Claude plugin 可解析为 `${CLAUDE_PLUGIN_ROOT}/skills/code-reviewer`，Codex 等宿主必须使用其提供的 skill locator，不得假设该环境变量存在。绑定所解析 `scripts/terminal_artifact_envelope.py` 的绝对路径和 SHA-256 后，使用同一脚本先执行 `verify <file>`，再执行 `extract <file>` 取得原始 bytes 后解析；`verify` 的 PASS 行不是 terminal 内容。较新的 `CHANGES_REQUIRED / SCOPE_DECISION_REQUIRED / EVIDENCE_BLOCKED` 会使较旧 approval 失效。无法建立唯一、完整的 terminal chain 时状态为 `unknown`。

Mutable/mixed approval 必须枚举 terminal 中的全部 repository rows。对每个实际 mutable repo，先证明当前 resolved `code-reviewer/scripts/snapshot_worktree.py` 的 SHA-256 与该 repo 行记录的 script digest 逐字相等（否则取回记录版本；两者都做不到即 stale），再复用该行完整 argv（base、exclude、candidate-ignored、mutable-baseline 全部相同）并逐字核对输出摘要；对每个 immutable repo，只核对 exact Candidate SHA/tree，不运行或伪造 snapshot。只有所有行都匹配才保持 `approved`；任一 repo 的 script/argv/snapshot/SHA/tree 漂移、缺失或无法重算，都使整个 mixed comment stale，并归一化为 `draft` 或 `unknown`，不得只验证其中一仓或把旧 comment 当成重复批准依据。

### 11. PROTOTYPE

强信号：

- 存在 `_prototype-manifest.md`
- 存在 prototype 沙箱目录与 prototype 专属 README / 交付摘要

弱信号：

- 文件名或目录名含 `prototype`

注意：

- 原型是“目录级工件”，不能只凭单个 Markdown 文件判定

### 12. GUARDRAILS

强信号：

- 标题含 `Guardrails`
- 文档内容包含规则分级、例外流程、验证方式、下游钩子

弱信号：

- 文件名含 `guardrails`、`engineering-standards`

注意：

- 不要把单个 feature 的实现规范误判为项目级 Guardrails

## 审查证据识别

### 准出证书

识别为“强批准证据”的条件：

- 标题含 `准出证书`
- 或标题含 `certificate`
- 且正文明确写出 `通过` / `approved` / `准出`

### 审查报告

识别为“评审中/已评审未通过证据”的条件：

- 标题含 `审查报告`
- 或标题含 `review report`
- 且正文列出问题清单、P0/P1/P2、门禁结论

注意：

- “有审查报告”不等于“已批准”
- “审查报告 + 问题清单”通常更接近 `in_review`

## 候选选择与去重

同一 artifact 类型可能找到多个候选时，按以下顺序选“当前有效候选”：

1. `approved` 优先于 `in_review`
2. `in_review` 优先于 `draft`
3. 强证据优先于弱证据
4. 时间更新更晚者优先
5. 用户显式提供的路径优先

如果两个候选都像“当前有效版”，且会影响下一步推荐，必须 AskUserQuestion。

## 置信度规则

### High

满足任一：

- 有 `TRACEABILITY-METADATA` + 明确 `artifact.type`
- 有明确准出证书或 `artifact.status`
- 文档结构与文件名、目录上下文一致，且无冲突信号

### Medium

满足任一：

- 无元数据，但有清晰标题与结构证据
- 有审查报告但缺少统一状态字段
- 文件名和内容匹配度高，但缺少正式证书

### Low

满足任一：

- 只有文件名关键词
- 目录上下文弱匹配
- 存在多个冲突候选，暂未澄清

Guide 在 `low confidence` 下可以给建议，但必须显式标注并列出待确认项。

## 前端仓库识别（Prototype 分支）

以下信号可用于判断是否应展示 Prototype 分支：

强信号：

- 根目录存在 `package.json`
- 存在 `src/`、`app/`、`pages/`、`components/`
- 依赖中出现 React / Vue / Next.js / Nuxt / Vite / Angular

弱信号：

- 文档中频繁提到页面、路由、组件、交互状态
- 用户明确说“前端仓库”“页面原型”“UI 流程”

如果只有弱信号，Prototype 建议必须标注 `low confidence`。

## Guardrails 触发识别

Guide 不负责完整判断 Guardrails 内容是否过期，但可以用以下信号决定是否提示：

强触发：

- 用户明确提到架构/平台/合规/部署方式变化
- 用户明确提到事故复盘
- 仓库中反复出现 Guardrails 相关 reviewer 问题

弱触发：

- 项目已有多份设计文档，但无任何 Guardrails 基线
- 有 Guardrails 文件，但明显缺失规则分级、例外流程、下游钩子

弱触发只能作为补充建议，不要抢占主链路第一推荐。

## 禁止误判

- 不要把普通开发笔记当成 HLD/LLD 基线
- 不要把临时评审评论当成准出证书
- 不要把 feature-local 文档当成 Guardrails
- 不要因为文件名像 `spec` 就自动当成 Test Spec
- 不要把任意 HEAD/feature branch 自动当成待审 Implementation Candidate
- 不要把 Code Review approval 当成部署或发布批准
