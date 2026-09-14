# API-ARCHIVE v1.0

Owner：周衡；消费者：归档管理页面；批准来源：../records/project-approval.json，g-001。
唯一接口：GET /v1/archive-records/{record_id}。认证使用既有 bearer session；
仅租户管理员可读取本租户记录，无匿名或跨租户查询。
成功 200 返回 record_id、completed_at、body；字段均必填，前两者分别为 UUID、UTC RFC3339，body 为字符串。
401 表示会话无效，403 表示非管理员，404 表示记录不存在、属于别的租户或已到期；
错误体为 {"code": "NOT_FOUND", "message": "Record not available"}，其他错误按对应状态使用 UNAUTHENTICATED、FORBIDDEN。
服务内部数据保留期限不编码为 wire 字段或独立配置，由本模块生命周期基线约束。
这是无副作用的单记录查询，无分页、写入、ETag 或幂等键。本轮不改变 wire、认证或错误语义。
