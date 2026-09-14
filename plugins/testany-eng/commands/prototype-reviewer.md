---
description: Prototype review, 原型评审, 交互原型审查
argument-hint: <沙箱目录路径> [PRD 路径] [User Journey 路径]
---

# Prototype Reviewer

执行前读取 [工作流执行约定](../references/workflow-execution.md)：先取证再提问、按实际工具能力回退，并从本次安装位置定位资源。

启动原型审查流程。作为 prototype 进入 API Contract / HLD 阶段前的独立门禁，审查交互正确性、工程隔离安全性和下游输入质量。
评审先读取 [证据、准出与复审规则](../references/review-assurance.md)。P2 不按数量阻断；缺证据不等于产品缺陷；提前门禁失败不取消独立安全检查；完成本轮评审不等于批准工件。


## 使用方式

提供原型沙箱目录路径（建议同时提供 PRD 和 User Journey 路径）：

$ARGUMENTS

## 原型审查在研发流程中的位置

```text
PRD → UC Journey → Prototype Designer → [Prototype Reviewer] → API Contract → HLD
```

## 四道门审查框架

### 第一道门：上游对齐（P0 阻塞）
- PRD 需求（REQ-*）是否完整映射到页面
- Journey 步骤是否完整映射到页面
- PRD / Journey 齐备性

### 第二道门：原型完整性
- P0 Journey Happy Path 可达性
- 状态矩阵覆盖（正常/加载/空/错误/边界）
- 跨页面导航完整性
- P1/P2 预算裁剪合规

### 第三道门：工程隔离（核心安全检查）
- 沙箱目录完整性
- 沙箱外零未授权变更
- 路由前缀隔离
- 零依赖新增
- 零生产文件改动

### 第四道门：下游可用性
- API Contract 输入质量（数据需求、字段、结构）
- HLD 输入质量（状态管理、缓存、性能）

## 准出门槛

- **P0 = 0**（任一 P0 即阻断）
- **P1 = 0**（任一 P1 即不通过）
- **P2 不按数量阻断**

## 必需产出

- 审查报告（含问题清单和证据）
- 准出证书（通过时）

请提供沙箱目录路径开始审查。建议同时提供 PRD 和 User Journey 路径。
