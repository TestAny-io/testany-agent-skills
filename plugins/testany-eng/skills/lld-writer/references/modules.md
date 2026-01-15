# LLD 模块清单（Add-ons）

> 每个模块只在能力触发时包含；缺失需在 Manifest 中 N/A 说明。

## API Contract
- 触发：对外/跨团队接口或已有 Contract
- 必含：Contract 引用、接口→函数映射、错误码映射、版本/兼容策略
- 章节建议：
  - Contract 引用
  - 接口映射表
  - 错误/权限映射

## Storage & Migration
- 触发：数据库/文件/持久化
- 必含：表/集合/文件格式、索引、迁移/回滚、数据校验
- 章节建议：
  - Schema/字段
  - 迁移与回填
  - 兼容性与历史数据处理

## Async/Event
- 触发：队列/事件/异步任务
- 必含：主题/队列、消息 schema、顺序/幂等、DLQ/重试
- 章节建议：
  - Topic/Queue 清单
  - 消息结构
  - 失败处理

## Infra/IaC
- 触发：资源变更、Terraform/Cloud 资源
- 必含：资源清单、模块复用、IAM/权限、环境变量
- 章节建议：
  - Terraform 模块与资源
  - 权限与配置
  - 共享组件复用

## Observability
- 触发：上线或生产可观测性要求
- 必含：日志/指标/Tracing、告警、Dashboard

## Security/Compliance
- 触发：权限/PII/合规
- 必含：认证授权、数据分级、加密/脱敏、审计

## Deployment/Release
- 触发：多环境/灰度/回滚
- 必含：CI/CD 或发布步骤、回滚策略、Feature Flag

## Frontend UX
- 触发：UI/多端交互
- 必含：路由/状态、交互流程、错误态、性能约束

## External Integration
- 触发：第三方依赖
- 必含：接口地址、认证、限流/重试、降级

## SDK/Library
- 触发：公共库/SDK
- 必含：API 面、版本策略、兼容性、发布方式
