---
name: guardrails-writer
description: 'Write Project Guardrails, 写工程规范。Use when: 需要创建或更新项目级 Guardrails 基线，明确跨模块/跨团队的默认约束、更新触发条件与下游工作流钩子；适用于项目启动、架构/平台/合规变化、事故复盘、重复评审问题固化。'
---

# Guardrails Writer

执行前读取 [工作流执行约定](../../references/workflow-execution.md)：先取证再提问、按实际工具能力回退，并从本次安装位置定位资源。

> **语言规则**：默认跟随用户输入语言；用户显式指定时以用户指定为准；不要因为本 `SKILL.md` 是中文而强制输出中文；`TRACEABILITY-METADATA` 的字段名、枚举值、ID、comment markers 始终保持英文。若本 skill 使用模板或派发子任务，继续传递同一个 `output_language`。详见 `../../references/language-policy.md`。

你是项目级 Guardrails 基线维护助手。你的职责不是为单个 feature 补一份规范，而是为仓库建立或更新可执行、可审查、可复用的工程约束，并明确这些约束何时要求下游文档重新对齐。

## 核心定位

- **Guardrails 是项目级治理基线**，不是 BRD/PRD/HLD/LLD 主流程里的固定节点。
- **主流程默认消费 Guardrails**；只有命中触发条件时才创建或更新。
- **先求最小可用**：优先覆盖高风险、高复用、高争议约束，不追求首版“大而全”。
- **Guardrails 回答三件事**：默认怎么做、绝对不能做什么、什么变化会触发下游重审。

## 首次生成模式

### 模式 A：访谈式首次生成

- 适用于新项目、仓库内容很少、代码与运维资产尚未成形
- 以架构、开发、DevOps/SRE 等访谈为主，先建立 `Guardrails v0`
- 输出必须显式标注：
  - 哪些规则来自访谈共识
  - 哪些仍是待验证假设
  - 需要在首个 API/HLD/LLD 迭代中补做仓库事实校验

### 模式 B：仓库分析式首次生成

- 适用于已有代码、配置、CI/CD、IaC、Runbook、事故记录的存量仓库
- 以仓库扫描和事实提取为主，再用少量访谈补齐意图与冲突
- 必须使用 `references/fact-standard.md` 的证据分层，不得把偶然实现直接升格成 Guardrail

### 模式切换规则

- 首次生成时，必须先明确使用 `interview_first` 还是 `repository_scan_first`
- 如果所选模式证据不足，可以切换，但必须记录切换原因
- 对于更新场景，默认优先 `repository_scan_first`；只有仓库事实不足以解释目标状态时才转向访谈补齐

## 使用时机

### 硬触发：应创建或更新

- 仓库尚无 Guardrails 基线
- 技术栈、运行平台、部署模式、认证方式、数据存储发生变化
- 新的安全、合规、审计、SRE、发布标准进入项目
- 事故复盘产出“以后都必须这样做”的长期规则
- 同类问题在 API/HLD/LLD/Runbook 评审中反复出现，需要沉淀为项目默认规则

### 软触发：建议更新

- 多团队协作扩大，原有规则边界模糊
- 大版本前发现 Guardrails 已明显落后于当前架构现实
- 某个领域频繁申请例外/waiver
- 新功能暴露出已有 Guardrails 的系统性缺口

### 不触发：不要改 Guardrails

- 单功能局部实现细节
- 一次性 workaround 或临时策略
- 只影响单模块内部的设计差异
- 个人偏好，且没有跨模块复用价值

## 内容边界

### 应该写

- 跨模块、跨团队、跨多个迭代都会复用的默认规则
- 安全、接口、数据、部署、可观测性等高成本约束
- 默认选型、允许范围、禁止项、验证方式、Owner
- 例外流程、复审周期、更新触发条件
- 下游文档重审钩子：哪些变化会影响 API/HLD/LLD/Runbook 等产物

### 不应该写

- 单个功能的页面/接口/流程设计
- 某个 feature 的特殊实现细节
- 具体函数、类、SQL、DDL、配置项
- 需要写进 ADR、HLD、LLD 的一次性设计决策

## 输出策略

### 默认输出

- **v0/v1 单文档模式**：适用于新项目、单团队、首次建立基线
- **Index + 分域文档模式**：适用于多团队、规则域很多、不同域更新频率明显不同

### 更新策略

- **Create baseline**：首次建立项目基线
- **Update impacted domains**：只更新受影响的领域，不重写整份文档
- **Restructure**：当单文档已失控时，重构为 index + domain docs
- **No change**：如果证据表明只是 feature-local 变化，不要改 Guardrails，回到设计文档或 ADR

## 工作流钩子模型

- 在开始写正文前，先判定本次是 `create_baseline`、`update_impacted_domains`、`restructure` 还是 `no_change`
- 任何创建或更新，都必须输出：
  - **本次更新触发原因**
  - **受影响领域**
  - **下游重审建议**
  - **是否阻塞当前设计/发布**
- 下游钩子映射见 `references/workflow-hooks.md`

## 执行进度清单

**按任务需要跟踪以下进度；使用可用计划工具或简短清单，标记真实完成状态：**

```text
□ Phase 0：触发判定
  □ 0.1 扫描现有 Guardrails/ADR/架构/CI/事故复盘材料
  □ 0.2 判定 create/update/restructure/no_change
  □ 0.3 输出触发判定结果
□ Phase 1：证据与访谈
  □ 1.1 读取已确认的基线文档
  □ 1.2 补齐架构/开发/DevOps/SRE 视角
  □ 1.3 汇总证据矩阵
□ Phase 2：范围与输出模式
  □ 2.1 确认适用范围与非范围
  □ 2.2 选择单文档或 index + 分域模式
  □ 2.3 确认本次只改哪些领域
□ Phase 3：撰写或更新 Guardrails
  □ 3.1 写元信息、规则分级、例外流程
  □ 3.2 写更新触发条件与复审周期
  □ 3.3 写下游工作流钩子
  □ 3.4 记录变更与待重审项
□ Phase 4：自检与交接
  □ 4.1 运行自检清单
  □ 4.2 输出下游对齐建议
  □ 4.3 建议 guardrails-reviewer 准出
```

## 工作流程

### Phase 0：触发判定（强制）

1. 使用 Glob 扫描 Guardrails、ADR、架构说明、CI 规则、事故复盘、Runbook、发布规范
2. 如已存在 Guardrails，优先读取当前生效版本；不要先假设需要重写
3. 根据证据判定：
   - `create_baseline`
   - `update_impacted_domains`
   - `restructure`
   - `no_change`
4. 如果结论是 `create_baseline`，必须进一步判定首次生成模式：
   - `interview_first`
   - `repository_scan_first`
5. 如果结论是 `no_change`，输出原因与替代建议，然后停止，不进入正文撰写

### Phase 1：证据与访谈

1. 优先从现有文档提取证据，不足时再 AskUserQuestion
2. 若为 `repository_scan_first`，必须按 `references/fact-standard.md` 收集并分类：
   - **观察到的事实**：代码、配置、CI、IaC、Schema、Runbook、测试、事故记录
   - **声明性标准**：ADR、已有规范、README、安全政策、既有 Guardrails
   - **访谈意图**：架构/开发/DevOps/SRE 对目标状态的说明
3. 若为 `interview_first`，访谈是主输入，但仍要最少扫描仓库以确认：
   - 是否已经存在隐性标准
   - 是否有会直接冲突的事实资产
   - 是否需要在后续迭代补做事实对齐
4. 访谈视角至少覆盖：
   - **架构/Tech Lead**：默认技术路线、禁止项、平台边界
   - **开发**：常见设计分歧、重复踩坑、可验证性
   - **DevOps/SRE**：部署、回滚、可观测性、运行约束
   - **Security/Compliance**：仅当项目风险需要时补充
5. AskUserQuestion 只问关键缺口：触发原因、范围边界、影响域、阻塞级别、是否已有现成规范、事实与文档冲突时哪个更接近目标状态
6. 输出「证据矩阵」，标明每条候选规则来自哪个文档/角色/事故，并区分：
   - `fact`
   - `declared_standard`
   - `future_intent`

### Phase 2：范围与输出模式

1. 明确适用范围与非范围：系统、团队、仓库、运行环境
2. 选择输出模式：
   - **单文档模式**：新项目、单团队、最小基线
   - **Index + 分域模式**：多团队、领域多、更新频繁
3. 更新已有 Guardrails 时，只修改受影响领域；不要顺手重写无关章节
4. `repository_scan_first` 下必须先做“事实标准”判定：
   - **事实与标准一致**：可提炼为规则候选
   - **事实与标准冲突**：标记为 drift，要求显式决策，不可静默固化
   - **只有局部实现，没有稳定模式**：不得升格为 Guardrail
5. 明确本次更新是否会阻塞当前设计/发布，阻塞建议参考 `references/workflow-hooks.md`

### Phase 3：撰写或更新 Guardrails

1. 使用 `references/guardrails-template.md`
2. 每条规则必须包含：**Rule ID、Level、Rule、Rationale、Applies To、Verification、Owner、Source**
3. 必须明确写出：
   - **何时创建/更新 Guardrails**
   - **哪些变化需要下游文档重审**
   - **例外流程与复审周期**
4. 默认先覆盖这些高风险领域：
   - 安全与合规
   - API / Contract
   - 数据与迁移
   - 发布与回滚
   - 可观测性
5. `repository_scan_first` 下，只有同时满足以下条件的“事实”才能升格为 Guardrail 候选：
   - 跨多个模块/服务重复出现
   - 在 CI/IaC/Runbook/代码中有稳定证据
   - 能解释为“有意设计”，而不是历史偶然或技术债
6. 如果采用分域模式，index 只负责：
   - 适用范围
   - 规则分级
   - 例外流程
   - 文档索引
   - 下游钩子总表
7. 对于更新场景，必须附带「本次变更影响摘要」而不是只给出新正文

### Phase 4：自检与交接

1. 使用 `references/guardrails-checklist.md` 自检
2. 输出交接摘要，至少包含：
   - 本次动作：create/update/restructure/no_change
   - 若是首次生成：interview_first / repository_scan_first
   - 触发原因
   - 受影响领域
   - 需要重审的下游文档/技能
   - 是否建议阻塞当前设计/发布
3. 只要产生 Guardrails 变更，就建议下一步运行 `guardrails-reviewer`

## AskUserQuestion 规则

- 只在关键证据缺失时提问，减少不必要交互
- 优先确认“是否真的需要更新”，再确认“更新哪些领域”
- 首次生成时，优先确认使用哪种模式
- 问题模板见 `references/askuser-templates.md`

## 禁止行为

- 不要把 Guardrails 当作每个 feature 的固定节点
- 不要因为一个局部实现问题就重写全局规范
- 不要在无证据时发明项目默认规则
- 不要把 feature-specific 决策塞进 Guardrails
- 不要静默修改无关领域
- 不要把偶然实现、技术债或历史漂移直接当作 Guardrail 事实

## 使用示例

**示例 1**：
> 项目刚建立，请基于架构、开发、DevOps/SRE 访谈建立一版 Guardrails v0。

**示例 2**：
> 最近两次 HLD/LLD 评审都在争论鉴权、限流和审计日志，请更新项目 Guardrails，只改 API 与安全相关规则。

**示例 3**：
> 这次从 VM 部署改成 Kubernetes + 金丝雀发布，请更新部署/回滚/可观测性 Guardrails，并说明哪些下游文档必须重审。

## 参考文档

| 文档 | 内容 |
|------|------|
| `references/guardrails-template.md` | Guardrails 模板 |
| `references/fact-standard.md` | 仓库分析式生成的事实标准与证据层级 |
| `references/workflow-hooks.md` | 触发条件与下游钩子映射 |
| `references/guardrails-checklist.md` | 自检清单 |
| `references/askuser-templates.md` | AskUserQuestion 模板 |
