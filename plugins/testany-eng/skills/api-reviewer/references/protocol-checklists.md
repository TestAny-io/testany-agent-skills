# 协议检查清单

本清单按协议列出 Must/Should/Nice。只加载适用章节。

- **Must 缺失 → P0**
- **Should 缺失 → P1**
- **Nice 缺失 → P2**

## 目录

1. Contract Index（多协议）
2. 通用检查
3. HTTP/REST
4. GraphQL
5. gRPC
6. 事件/消息
7. WebSocket/SSE
8. Webhook
9. SDK/Library
10. 文件格式
11. IPC/CLI

---

## 1. Contract Index（多协议）

**Must**
- Index 元信息（名称、版本、状态、Owner）
- Contract 清单（协议类型、文档链接、版本、状态）
- 共享规则（认证/授权、错误码体系、版本与兼容策略、幂等/重试、限流）
- 跨协议一致性映射（核心模型、事件与接口对应）
- PRD→Contract 覆盖总表

**Should**
- 主要消费者列表
- 变更记录与兼容性说明

**Nice**
- 弃用计划与时间表

---

## 2. 通用检查

**Must**
- 范围与非范围（In/Out of scope）
- Owner 与数据所有权声明
- 主要消费者与调用方向
- 认证/授权模型（或明确不需要）
- 错误模型（结构、码表、语义）
- 版本与兼容性规则
- 核心数据模型定义（字段类型/必选/约束）

**Should**
- 幂等规则与重试语义
- 限流/配额策略
- 观测字段（correlationId/traceId）
- 示例（请求/响应/事件）
- 合规/PII/敏感字段标注

**Nice**
- 性能/SLO 目标
- SLA/支持策略

---

## 3. HTTP/REST

**Must**
- Base URL/版本策略
- Endpoint 清单（方法 + 路径）
- 请求/响应 Schema（含必填与约束）
- 状态码与错误码语义
- 认证/授权方式

**Should**
- 分页策略与字段（或明确不分页）
- 过滤/排序/搜索约定
- 幂等键策略（对创建/更新）
- 限流/重试/超时说明
- 并发控制（ETag/If-Match 等）
- 示例请求/响应

**Nice**
- 批量操作规范
- 字段级权限/脱敏说明

---

## 4. GraphQL

**Must**
- Schema SDL
- Query/Mutation/Subscription 清单
- 类型与输入定义（含 nullability）
- 认证/授权模型
- 错误结构与语义
- 分页策略（Connection/Offset 等）

**Should**
- 复杂度/深度限制
- 版本与弃用策略（@deprecated）
- 示例查询与响应
- 限流/配额策略

**Nice**
- Persisted Query 策略

---

## 5. gRPC

**Must**
- .proto 定义
- Service/Method 清单
- Request/Response Message 结构
- 错误状态映射（Status + Details）
- Deadline/Timeout 策略
- 流式语义（Unary/Streaming）
- 认证/授权方式

**Should**
- 字段编号与保留规则（兼容性）
- 幂等/重试策略
- Metadata 约定
- 示例调用

**Nice**
- Health Check/Reflection 支持说明

---

## 6. 事件/消息

**Must**
- 事件类型/Topic/Queue 命名
- Producer/Consumer 所有权
- Payload Schema 与版本策略
- 交付语义（至少一次/至多一次）
- 顺序/分区策略
- 重试/DLQ 策略
- 幂等/去重键

**Should**
- 兼容性规则（向后/向前）
- Retention/过期策略
- 示例事件

**Nice**
- Schema Registry 位置

---

## 7. WebSocket/SSE

**Must**
- 连接方式与 URL
- 认证/授权与握手流程
- 消息类型与 Payload Schema
- 错误消息格式
- 心跳/保活策略
- 重连策略

**Should**
- 顺序保证与幂等说明
- 限流/背压策略
- 示例消息

**Nice**
- Presence/状态同步说明

---

## 8. Webhook

**Must**
- 事件类型与 Payload Schema
- 订阅/回调地址管理
- 签名/验签机制
- 重试策略与退避
- 幂等/重复投递处理

**Should**
- 顺序语义
- 示例 payload

**Nice**
- 验证/测试端点

---

## 9. SDK/Library

**Must**
- 公共 API 列表与签名
- 版本与兼容性策略
- 错误/异常类型
- 线程安全/异步语义（如适用）
- 运行环境与依赖范围

**Should**
- 弃用策略与迁移指引
- 示例代码
- 凭证/配置管理说明

**Nice**
- 性能或资源占用说明

---

## 10. 文件格式

**Must**
- 文件结构与 Schema
- 编码/字符集
- 版本标识
- 必填/可选字段与约束
- 校验规则

**Should**
- 大小限制与拆分规则
- 压缩/加密策略
- 示例文件

**Nice**
- 向前/向后兼容策略

---

## 11. IPC/CLI

**Must**
- 命令/子命令列表
- 参数/选项与默认值
- 输入/输出格式
- Exit Code 与错误语义
- 权限/鉴权要求（如适用）

**Should**
- 版本与兼容策略
- 环境变量支持
- 示例命令

**Nice**
- Shell Completion 支持
