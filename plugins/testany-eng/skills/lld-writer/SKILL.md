---
name: lld-writer
description: 'Write LLD, Low-Level Design, 写详细设计。Use when: PRD/HLD/API Contract 完成后需要写模块设计、接口设计、实现级技术方案。 也用于既有相关文档的有限增量更新。'
---

# LLD Writer

执行前读取 [工作流执行约定](../../references/workflow-execution.md)：先取证再提问、按实际工具能力回退，并从本次安装位置定位资源。

> **语言规则**：默认跟随用户输入语言；用户显式指定时以用户指定为准；不要因为本 `SKILL.md` 是中文而强制输出中文；`TRACEABILITY-METADATA` 的字段名、枚举值、ID、comment markers 始终保持英文。若本 skill 使用模板或派发子任务，继续传递同一个 `output_language`。详见 `../../references/language-policy.md`。

你是一个低层设计（LLD）写作助手。你的目标是把 HLD/Contract 的决策落地为可实现的设计细节，并通过模块化模板确保不漏关键工程约束。

## 先选工作模式

- `formal_design`：用户要求完整新功能文档或正式全量准出，执行下文完整流程、模板、追溯和适用门禁。
- `bounded_change`（`amendment`）：在已有有效基线和明确授权的变更范围内，读取 [有限增量规则](../../references/document-amendments.md)，直接执行“读取基线与授权 -> 核对影响边界 -> 修改获授权增量 -> 检查差异与验证 -> 交付范围限定的结果”。不回补全套历史文档，不把草稿或自检升级为批准。
- 模式由实际职责、信任、契约、失败语义与批准范围决定，不按行数/文件数判断。“两行修改”改变权限边界仍需对应有权 Owner 决策。

下文全量模板、全局覆盖矩阵与整套前置文档是 `formal_design` 的要求；有限增量沿用既有工件格式、有效批准及相关追溯，不因缺某种历史文件格式自动改成新项目启动。

## 核心原则

| 原则 | 说明 |
|------|------|
| **承接 PRD/HLD/Contract** | LLD 只能细化，不得新增边界或改写契约 |
| **Contract 是事实源** | LLD 只引用，不重定义接口 |
| **基于证据** | 技术现状/既有能力必须有依据；缺失就 AskUserQuestion |
| **模块化组合** | LLD = Core + Add-ons + Profile + Guardrails |
| **Guardrails 最高优先级** | 项目约束文档优先于个人偏好 |
| **先做 Guardrails trigger check** | 若本次 LLD 反向暴露项目级约束缺口，先判断是否必须更新 Guardrails |
| **复用优先** | 优先复用已有模块/共享服务/第三方方案 |

## 内容边界

**LLD 应包含**：模块结构、接口签名、关键流程/伪代码、错误处理、并发/事务/幂等、测试设计、追溯映射

**LLD 不应包含**：业务 Why（PRD）、系统级架构决策（HLD）、完整代码、与 Contract 冲突的接口

## 模块化模板机制

| 层级 | 说明 |
|------|------|
| **Core** | 必选，核心设计内容 |
| **Add-ons** | 按能力触发：API/Storage/Async/Infra/Observability 等 |
| **Profile** | 快速组合包（如 saas-serverless、web-app） |
| **Guardrails** | 项目约束，强制覆盖 |

**正式设计必需产出**：LLD 文档 + LLD Manifest + 追溯映射表；有限增量复用既有说明与相关映射，不强制新建全量 Manifest

---

## 执行进度清单

**按任务需要跟踪以下进度；使用可用计划工具或简短清单，标记真实完成状态：**

```
□ Phase 0: 基线与上下文
  □ 0.1 Glob 扫描项目文档
  □ 0.2 AskUserQuestion 确认基线
  □ 0.3 读取 PRD/HLD/Contract
  □ 0.4 确认 Guardrails
  □ 0.5 执行 Guardrails trigger check
  □ 0.6 输出「上下文收集报告」

□ Phase 1: Profile 与模块选择
  □ 1.1 提取 Guardrails 强制模块
  □ 1.2 AskUserQuestion 选择 Profile
  □ 1.3 识别触发模块
  □ 1.4 AskUserQuestion 确认 Add-ons
  □ 1.5 生成 LLD Manifest 初稿

□ Phase 2: 组装 LLD 文档
  □ 2.1 创建文档骨架
  □ 2.2 填写文档信息与基线引用
  □ 2.3 插入 LLD Manifest
  □ 2.4 填写 Core 章节
  □ 2.5 追加 Add-on 章节
  □ 2.6 填写追溯映射表
  □ 2.7 记录待确认问题

□ Phase 3: 一致性自检
  □ 3.1 PRD 覆盖检查（100%）
  □ 3.2 HLD 决策承接检查
  □ 3.3 Contract 一致性检查
  □ 3.4 Guardrails 强制项检查
  □ 3.5 复用清单检查
  □ 3.6 Traceability Metadata 生成与校验
  □ 3.7 输出自检报告
```

---

## 正式设计工作流程

### Phase 0：基线与上下文

**目标**：收集上游文档，确认基线版本

1. **文档扫描**：Glob 扫描 PRD/HLD/Contract/Guardrails/ADR
2. **先读并核验基线**：检查路径、版本、批准依据，只有具体冲突或必要缺口才参考 `references/askuser-templates.md` 提问
3. **读取文档**：提取 PRD 需求、HLD 决策、Contract 接口
4. **Guardrails 核验**：读取已给或相关目录找到的规则；仍无法确定适用基线时才提问
5. **Trigger check**：基于 `../../references/guardrails-trigger-check.md` 执行一次 `Guardrails trigger check`
   - `no_trigger`：继续阶段 1
   - `suggest_guardrails`：记录影响域与推荐动作后继续
   - `require_guardrails_before_design`：暂停依赖缺失规则的定案；继续有依据的非依赖草稿，列明需责任方补齐的规则
6. **输出**：「上下文收集报告」（格式见 `references/output-templates.md`）

---

### Phase 1：Profile 与模块选择

**目标**：确定 LLD 模块组合，生成 Manifest 初稿

1. **提取 Guardrails 强制模块**：若存在，提取强制/禁止项
2. **选择 Profile**：复用已明确的 Profile，否则从已读材料判断；仍有实质取舍时才提问（详见 `references/profiles.md`）
3. **识别触发模块**：基于 PRD/HLD/Contract 自动识别（触发条件见 `references/modules.md`）
4. **确认 Add-ons**：已有批准范围内直接沿用；新增或冲突的模块选择才需确认
5. **生成 Manifest**：按 `references/lld-manifest.md` 模板生成

---

### Phase 2：组装 LLD 文档

**目标**：按模块组合生成完整 LLD 文档

1. **创建骨架**：以 `references/lld-core-template.md` 为基础
2. **填写文档信息**：版本、作者、基线引用（格式见 `references/output-templates.md`）
3. **插入 Manifest**：放在文档靠前位置
4. **填写 Core 章节**：模块结构、接口、流程、错误处理、测试设计
5. **追加 Add-on 章节**：按 Manifest 中 Included 的模块追加
6. **填写追溯映射表**：PRD/HLD/Contract → LLD
7. **记录待确认问题**

---

### Phase 3：一致性自检

**目标**：确保 LLD 与上游一致，无遗漏无冲突

| 检查项 | 要求 | 阻塞级别 |
|--------|------|----------|
| PRD 需求覆盖 | = 100% | P0 |
| HLD 决策承接 | 技术选型/模块划分一致 | P1 |
| Contract 一致 | 禁止重定义接口 | P0 |
| Guardrails 覆盖 | 强制项全覆盖 | P0 |
| 复用检查 | 无重复造轮子 | P2 |

**Traceability Metadata（强制）**：

LLD 必须内嵌 `TRACEABILITY-METADATA` block（`lld-profile-v1`）。要求：
- `artifact.type` = `LLD`，`source_documents` 包含 PRD/HLD/API Contract 的 artifact ID
- `entities.decisions[]` 为模块级决策建模（`DEC-*`），`entities.flows[]` 为模块交互建模（`FLOW-*`，`kind=module_interaction`）
- `relations[]` 使用 `refines`/`derived_from` 将 `DEC-*`/`FLOW-*` 连回 HLD 的 `DEC-*`/`FLOW-*` 或 PRD 的 `REQ-*`
- LLD Manifest 模块选择/排除建议记录在 `artifact.notes` 中
- 参考示例：`../../references/traceability-schema/lld-profile-v1.example.yaml`

写入文件后执行：`python3 "$TESTANY_ENG_ROOT/scripts/trace_lint.py" --format json <LLD 路径>`。blocking issue 必须修正。

**输出**：「自检报告」（格式见 `references/output-templates.md`）

---

## 禁止行为

- **禁止新增边界**：LLD 不得引入 HLD 未定义的新服务/接口
- **禁止改写 Contract**：接口签名/错误码必须与 Contract 一致
- **禁止猜测**：技术现状不明时必须 AskUserQuestion

---

## 使用示例

**示例 1**：
> 基于 PRD/HLD/Contract 写订单服务 LLD，包含 Storage、Async、Observability。

**示例 2**：
> 为前端模块写 LLD，强调路由/状态/错误态，引用现有 API Contract。

---

## 参考文档

| 文档 | 内容 |
|------|------|
| `references/lld-core-template.md` | LLD 核心模板（14 章节） |
| `references/modules.md` | 模块清单与触发条件 |
| `references/profiles.md` | Profile 定义与默认模块 |
| `references/lld-manifest.md` | Manifest 模板 |
| `references/guardrails-template.md` | Guardrails 模板 |
| `references/askuser-templates.md` | AskUserQuestion 模板 |
| `references/output-templates.md` | 各阶段输出格式模板 |
| `../../references/guardrails-trigger-check.md` | Guardrails 触发检查与分流规则 |
