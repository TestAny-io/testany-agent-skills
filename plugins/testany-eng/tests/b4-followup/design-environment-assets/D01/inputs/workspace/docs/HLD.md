# HLD-ARCHIVE v1.3

Owner：周衡（架构负责人）。批准来源：../records/architecture-review.json，消息 a-202、a-203。
关联 PRD：PRD-ARCHIVE v1.1；契约：API-ARCHIVE v1.0。以下为当前移交基线，不是作者提案。

## 1. 组件与依赖

沿用 archive-api、cleanup-worker、PostgreSQL 和既有作业调度器；不引入新服务。
archive-api 校验租户管理员身份及记录 tenant_id；cleanup-worker 使用既有机器角色，仅有本模块到期记录删除权。
所有记录只存在本模块 PostgreSQL 数据集，不进入通用备份、缓存或冷存储。

## 2. 数据生命周期

DEC-ARCHIVE-01：正文及元数据自 completed_at 起保留 30 个完整日，期间管理员可查询。
满 30 日不可查询，cleanup-worker 在随后 1 小时内硬删除。理由：支持月度问题追查。
此处的 30 日同时适用于正文和元数据，没有热/冷分层，也不以访问时间延长。

## 3. 清理流程

FLOW-ARCHIVE-01：调度器通知 worker -> 按 completed_at 和 30 日边界识别到期记录 ->
按 tenant_id 删除 -> 记录既有计数指标。失败保留原记录并由既有调度器重试，查询层仍按到期时间隐藏记录。
删除幂等；应用回滚不恢复已删除数据。既有告警覆盖到期后 1 小时仍未清理的情况。

## 4. 需求映射

| PRD 条目 | 本 HLD |
|----------|--------|
| REQ-ARCHIVE-01 | §2 的查询保留区间 |
| REQ-ARCHIVE-02 | §2、§3 的到期与硬删除 |
| REQ-ARCHIVE-03 | §1 租户边界、§3 失败及重试 |

本模块保留历史表格追溯格式，无机器 metadata block。实现参数和 SQL 留给 LLD。
