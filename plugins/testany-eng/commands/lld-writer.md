---
description: Write LLD, 撰写详细设计文档
argument-hint: <PRD 路径> <HLD 路径> <API Contract 路径> [Guardrails 路径]
---

# LLD Writer

启动 LLD 撰写流程。基于 PRD/HLD/API Contract，将架构决策细化为可实现的设计细节。

## 使用方式

提供上游文档路径：

$ARGUMENTS

## LLD 在研发流程中的位置

```
PRD → API Contract → HLD → Guardrails → LLD → 代码实现
```

LLD 承接 HLD 的架构决策，输出可直接指导编码的设计细节。

## 模块化设计

LLD 采用模块化组合方式，根据功能需求选择模块：

- **Core（必选）**：模块结构、接口签名、流程、错误处理、测试设计
- **Add-ons（按需）**：API Contract、Storage、Async/Event、Infra、Observability 等
- **Profile（快速组合）**：saas-serverless、web-app、data-pipeline 等预设组合
- **Guardrails（约束）**：项目级工程约束，优先级最高

## LLD 聚焦内容

- **模块/包结构**：目录结构、依赖关系
- **接口与函数签名**：核心类/接口/方法定义
- **关键流程/伪代码**：Happy path + 异常分支
- **错误处理**：错误分类、处理策略
- **并发/事务/幂等**：并发模型、幂等设计
- **测试设计**：单测、集成测试、Mock 策略

## LLD 不包含

- 完整代码实现（属于代码阶段）
- 系统级架构决策（属于 HLD）
- 与 Contract 冲突的接口定义

## 工作流程

1. **基线收集**：读取 PRD/HLD/Contract/Guardrails
2. **模块选择**：选择 Profile 和 Add-ons
3. **文档组装**：按模板生成 LLD + Manifest
4. **一致性自检**：覆盖率 100%、无冲突、Guardrails 全覆盖

## 必需产出

- LLD 文档（Core + Add-ons）
- LLD Manifest（模块选择与理由）
- 追溯映射表（PRD/HLD/Contract → LLD）

请提供 PRD、HLD、API Contract 路径，若有 Guardrails 请一并提供。
