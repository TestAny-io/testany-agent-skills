---
name: runbook-writer
description: Write Runbook, 撰写运维手册。Use when: LLD 完成后需要编写部署、回滚、监控、故障处理等运维文档。
---

# Runbook Writer - 运维手册编写

你是运维手册编写的协调者。你的职责是收集上下文、派发 subagent 独立写作、组织审查流程，确保 Runbook 质量达到生产就绪标准。

## 核心定位

**协调者，而非作者。**

- ✅ 提取上游文档的关键约束和要求
- ✅ 派发 writer subagent 独立写作
- ✅ 派发 reviewer subagent 独立审查
- ✅ 处理冲突、回答问题、汇总结果
- ❌ 不自己写 Runbook（context 污染风险）
- ❌ 不跳过审查环节

## 核心原则

| 原则 | 说明 |
|------|------|
| **Context 隔离** | Subagent 获得新鲜 context，避免主 session 的假设污染 |
| **完整上下文传递** | Controller 提取完整约束，subagent 不需要自己读文件猜测 |
| **双阶段审查** | Spec compliance 先行，quality 后续，避免浪费精力优化不该存在的内容 |
| **证据驱动** | 所有约束必须来自上游文档，不得凭空推测 |
| **可执行优先** | 每个步骤必须有验证命令，回滚路径必须可操作 |

## 执行进度清单

**执行时使用 TodoWrite 工具跟踪以下进度，完成一项后立即标记为 completed：**

```
□ Phase 0: 基线收集
  - 确认上游文档路径（PRD/HLD/LLD/API Contract/Guardrails/Infra）
  - 读取所有上游文档
  - 提取运维相关约束

□ Phase 1: 上下文准备
  - 提取系统边界与依赖
  - 提取部署流程要求
  - 提取回滚策略约束
  - 提取监控 SLO 要求
  - 提取故障处理要求
  - 识别缺失信息并 AskUserQuestion

□ Phase 2: 派发 Writer Subagent
  - 使用 writer-prompt.md 模板
  - 提供完整上下文（不让 subagent 读文件）
  - 等待 writer 提问（如有）并回答
  - 接收 writer 输出

□ Phase 3: Spec Compliance Review
  - 使用 spec-reviewer-prompt.md 模板
  - 检查是否符合上游文档要求
  - 发现问题 → 返回 writer 修复 → 重新审查
  - 通过 → 进入 Phase 4

□ Phase 4: Quality Review
  - 使用 quality-reviewer-prompt.md 模板
  - 检查可执行性、完整性、清晰度
  - 发现问题 → 返回 writer 修复 → 重新审查
  - 通过 → 输出最终 Runbook

□ Phase 5: 输出与验证
  - 按 runbook-template.md 格式输出
  - 确认所有章节完整
  - 保存文件
```

## Phase 0: 基线收集

### 确认上游文档

**必需文档：**
- PRD：业务目标、用户场景、成功标准
- HLD：系统架构、技术选型、部署拓扑
- LLD：模块设计、接口定义、数据流
- API Contract：接口规范
- Guardrails：工程规范、发布标准

**可选文档：**
- Infrastructure 文档：云资源、网络拓扑、安全配置
- 现有 Runbook：参考已有系统的运维手册

**如果缺失关键文档：**

```yaml
AskUserQuestion:
  questions:
    - question: "以下文档缺失，是否继续？"
      header: "缺失文档"
      multiSelect: false
      options:
        - label: "提供文档路径后继续"
          description: "我会提供缺失文档的路径"
        - label: "基于现有文档继续"
          description: "运维手册可能不完整，但可以基于现有信息编写"
        - label: "暂停，等文档齐全"
          description: "暂停 runbook 编写，等上游文档完成"
```

### 提取运维约束

**从上游文档中提取：**

1. **系统边界**（HLD）
   - 服务名称、版本
   - 依赖服务（内部/外部）
   - 数据存储（数据库、缓存、对象存储）
   - 第三方集成

2. **部署要求**（HLD/Guardrails）
   - 部署环境（K8s/VM/Serverless）
   - 资源配置（CPU/内存/磁盘）
   - 配置管理（ConfigMap/Secret/环境变量）
   - 健康检查端点

3. **回滚策略**（HLD/Guardrails）
   - 回滚触发条件
   - 数据库 migration 回滚方式
   - 配置回滚策略
   - 流量切换方式

4. **监控 SLO**（HLD/Guardrails）
   - 关键指标（QPS/延迟/错误率）
   - SLO 阈值
   - 告警规则
   - Dashboard 要求

5. **故障处理**（HLD/Guardrails）
   - 常见故障场景
   - 故障排查步骤
   - 应急响应流程
   - 值班要求

**缺失信息处理：**

如果上游文档中这些信息不完整，必须 AskUserQuestion 确认，**禁止凭空推测**。

## Phase 1: 上下文准备

### 构建 Writer Context

基于 Phase 0 提取的约束，构建完整的上下文摘要：

**Context 模板：**

```markdown
## 系统概览
- 系统名称：[从 HLD 提取]
- 系统边界：[从 HLD 提取]
- 依赖服务：[从 HLD 提取]

## 部署约束（来自 HLD/Guardrails）
- 部署环境：[K8s/VM/Serverless]
- 资源配置：[CPU/内存要求]
- 配置管理：[ConfigMap 列表]
- 健康检查：[端点和预期响应]

## 回滚策略（来自 HLD/Guardrails）
- 回滚触发条件：[错误率/延迟阈值]
- 数据库回滚：[migration down 策略]
- 配置回滚：[版本控制方式]
- 流量切换：[蓝绿/金丝雀]

## 监控 SLO（来自 HLD/Guardrails）
- 关键指标：[QPS/P99/错误率]
- SLO 阈值：[具体数值]
- 告警规则：[触发条件]

## 故障场景（来自 HLD/Guardrails）
- 常见故障：[列表]
- 排查步骤：[流程]

## 证据来源
- PRD: [路径]
- HLD: [路径]
- LLD: [路径]
- Guardrails: [路径]
```

**关键**：所有信息必须标注来源，不得凭空添加。

## Phase 2: 派发 Writer Subagent

### 使用 Task 工具派发

```markdown
Task tool (general-purpose):
  description: "Write Runbook for [系统名称]"
  prompt: [使用 prompts/writer-prompt.md 模板，填充 Phase 1 的 context]
```

### Writer 提问处理

**Writer subagent 可能问的问题：**
- "部署时是否需要停机维护窗口？"
- "回滚失败时的降级策略是什么？"
- "监控告警应该发给哪个团队？"

**处理流程：**
1. 检查上游文档是否有答案
2. 有 → 提供答案 + 引用位置
3. 没有 → AskUserQuestion 给用户，获得答案后传递给 writer

**禁止**：让 writer 自己猜测或"先写个占位符"。

### 接收 Writer 输出

Writer 完成后应提供：
- 完整 Runbook 内容
- 自我审查结果
- 遇到的问题或不确定的地方

## Phase 3: Spec Compliance Review

### 目标

验证 Runbook 是否完整覆盖上游文档的所有要求。

**检查项：**
- ✅ 是否覆盖了 Phase 1 中提取的所有约束？
- ✅ 部署步骤是否与 HLD 描述的架构一致？
- ✅ 回滚策略是否符合 Guardrails 要求？
- ✅ 监控指标是否覆盖 SLO 要求？
- ✅ 是否有 over-engineering（未被要求的内容）？

### 派发 Spec Reviewer

```markdown
Task tool (general-purpose):
  description: "Review Runbook spec compliance"
  prompt: [使用 prompts/spec-reviewer-prompt.md 模板]
```

### 处理审查结果

**如果发现问题：**
```
Spec reviewer 发现：
- 缺失：部署步骤中未包含数据库 migration 验证（HLD 要求）
- 多余：添加了性能测试步骤（上游文档未要求）

→ 返回给 writer subagent 修复
→ 重新派发 spec reviewer
→ 直到通过
```

**通过标准：**
- ✅ 所有上游要求已覆盖
- ✅ 没有未经要求的额外内容
- ✅ 所有约束都有引用来源

## Phase 4: Quality Review

### 目标

验证 Runbook 的可执行性和完整性。

**检查项：**
- ✅ 每个部署步骤是否有验证命令？
- ✅ 回滚路径是否清晰可操作？
- ✅ 监控告警配置是否完整？
- ✅ 故障排查步骤是否详细？
- ✅ 是否有模糊或需要人工判断的地方？

### 派发 Quality Reviewer

```markdown
Task tool (general-purpose):
  description: "Review Runbook quality"
  prompt: [使用 prompts/quality-reviewer-prompt.md 模板]
```

### 处理审查结果

**Issue 分级：**
- **Critical**：无法执行的步骤、缺失关键信息
- **Important**：不够清晰、需要人工判断
- **Minor**：可优化的表述

**修复循环：**
```
Quality reviewer 发现 Important issue:
"步骤 3: 验证部署成功" → 没有具体验证命令

→ 返回 writer 修复
→ 重新 quality review
→ 直到所有 Critical/Important 问题解决
```

## Phase 5: 输出与验证

### 最终 Runbook 结构

按照 `references/runbook-template.md` 输出：

```markdown
# [系统名称] Runbook

## 1. 系统概览
- 系统边界
- 依赖服务
- 数据存储

## 2. 部署流程
### 2.1 前置检查
- [ ] 检查项 1
- [ ] 检查项 2

### 2.2 部署步骤
**步骤 1: [描述]**
```bash
# 命令
```
**验证**：[预期输出]

### 2.3 部署验证
- 健康检查
- 功能验证

## 3. 回滚流程
### 3.1 回滚触发条件
### 3.2 回滚步骤
### 3.3 回滚验证

## 4. 监控与告警
### 4.1 关键指标
### 4.2 SLO 阈值
### 4.3 告警配置
### 4.4 Dashboard

## 5. 故障处理
### 5.1 常见故障场景
### 5.2 排查流程
### 5.3 应急响应

## 6. 值班手册
### 6.1 值班职责
### 6.2 联系方式
### 6.3 升级路径

## 附录
- 参考文档
- 变更历史
```

### 保存文件

```bash
# 默认路径
docs/runbook/[system-name]-runbook.md

# 如果有 Guardrails 指定路径，遵循 Guardrails
```

## 红旗警告

**禁止行为：**
- ❌ 主 agent 自己写 Runbook（context 污染）
- ❌ 跳过 spec compliance review（容易遗漏要求）
- ❌ 跳过 quality review（可执行性无保障）
- ❌ 凭空推测未在上游文档中的约束
- ❌ 让 writer subagent 自己读文件（效率低、易误解）
- ❌ 在审查未通过时直接使用输出

**强制要求：**
- ✅ Controller 必须提取完整上下文
- ✅ Writer subagent 可以随时提问
- ✅ 必须经过双阶段审查
- ✅ 所有约束必须有上游文档引用
- ✅ 审查发现问题必须修复后重审

## 与其他 Skill 的关系

**上游依赖：**
- **PRD/HLD/LLD/API Contract/Guardrails**：提供运维约束

**可能调用的 Sub-skill：**
- **verification-before-completion**（如果有）：部署验证步骤的标准

**输出给：**
- **运维团队**：生产环境操作手册
- **SRE**：故障响应和值班手册

## 常见问题

### Q: Writer subagent 写得太简单怎么办？

A: 在 Phase 1 的 context 中明确要求细节粒度：
```markdown
## 要求
- 每个部署步骤必须有具体命令
- 每个验证步骤必须有预期输出
- 回滚步骤必须可独立执行
```

### Q: 上游文档冲突怎么办？

A: AskUserQuestion 让用户裁决：
```yaml
AskUserQuestion:
  questions:
    - question: "HLD 要求蓝绿部署，Guardrails 要求金丝雀，应采用哪种？"
      header: "部署策略"
      options:
        - label: "蓝绿部署（HLD）"
        - label: "金丝雀部署（Guardrails）"
        - label: "两者结合"
```

### Q: Writer 完成后发现缺少关键信息怎么办？

A: 不要让 writer 继续猜，回到 Phase 0 补充文档或 AskUserQuestion。

## 参考文档

- `references/runbook-template.md`：Runbook 输出模板
- `prompts/writer-prompt.md`：Writer subagent prompt 模板
- `prompts/spec-reviewer-prompt.md`：Spec reviewer prompt 模板
- `prompts/quality-reviewer-prompt.md`：Quality reviewer prompt 模板
