---
description: Write API contract, 撰写接口契约文档
argument-hint: <PRD 或既有契约路径> [批准范围/补充说明]
---

# API Writer

执行前读取 [工作流执行约定](../references/workflow-execution.md)：先取证再提问、按实际工具能力回退，并从本次安装位置定位资源。

启动 API 契约撰写流程。基于 PRD 与边界确认，输出可审查的接口契约文档。


先区分 `formal_design` 与 `bounded_change`/`amendment`；有限增量使用既有有效基线及 Owner 批准，只处理受影响范围，不回补全生命周期文档。详见 `../references/document-amendments.md`；完整流程只适用于正式新功能/全量准出。
## 使用方式

提供正式设计的 PRD，或有限增量的既有契约与批准范围：

$ARGUMENTS

## 支持的契约类型

1. **HTTP/REST API** - OpenAPI 规范
2. **GraphQL API** - GraphQL Schema
3. **gRPC API** - Protocol Buffers
4. **事件/消息协议** - AsyncAPI 规范
5. **WebSocket/SSE** - 实时协议
6. **Webhook** - 回调接口
7. **SDK/Library** - 公共接口
8. **文件格式** - 数据交换格式
9. **IPC/CLI/插件** - 进程间/命令行接口

## 契约聚焦内容

- **接口清单**：路径/事件/函数签名、请求/响应/错误
- **安全与权限**：认证/授权/数据级权限
- **兼容性策略**：版本、弃用、breaking change
- **非功能约束**：SLO、幂等性、分页、限流

## 正式设计工作流程

1. **上下文收集**：读取 PRD，扫描现有 API/规范
2. **边界确认**：服务/模块边界、数据所有权
3. **类型选择**：选择契约类型
4. **契约撰写**：生成契约 + PRD 映射表
5. **一致性自检**：覆盖率、冲突、兼容性检查

优先读取已提供的材料；仅对当前模式必需且仍缺失的输入提问。
