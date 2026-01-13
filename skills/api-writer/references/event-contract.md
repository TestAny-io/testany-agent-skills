# 事件/消息契约模板

## 1. 基本信息
- 契约名称:
- 版本:
- 状态:
- Owner:
- Producer/Consumer:

## 2. 范围与边界
- 覆盖能力:
- 数据所有权:

## 3. 事件清单
| 事件名/主题 | Producer | Consumer | Schema 版本 | Key | PRD 条目 |
|------------|----------|----------|-------------|-----|----------|

## 4. 事件 Envelope
- 必须字段: event_id, event_type, occurred_at, version, trace_id
- 编码: JSON/Avro/Protobuf

## 5. 事件定义（逐个）
### {事件名}
- 触发条件:
- Payload schema:
- 顺序/幂等:
- 失败处理: 重试/DLQ
- 示例:

## 6. 兼容性与版本策略
- 向后兼容规则:
- Schema 演进策略:

## 7. 非功能约束
- 延迟/吞吐:
- 保留期:

## 8. 待确认问题
- ...
