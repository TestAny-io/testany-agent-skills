# RECEIPT-SCHEMA v1.1 candidate

Owner / producer：作业导出器团队（周衡）；consumer：本机 receipt-reader。
原生 schema：receipt.schema.json；已批准基线：receipt.v1.schema.json v1.0，见 ../docs/approvals.json r-101。
需求来源：PRD-RECEIPT v1.1，批准 r-102；适用标准：GR-RECEIPT v1.0，批准 r-103。
本轮范围为新可选 request_id；排除新命令、HTTP、账号、持久化模型和发布策略。

## 格式与版本

文件为一个 UTF-8 JSON object，无 BOM、不压缩、不加密，最大 4096 字节，无分片。
格式版本为 receipt-json/1；v1.0/v1.1 是兼容的 schema 文档修订，线上文件不增加版本字段。
job_id 为 UUID，status 仅 completed，二者必填。request_id 可省略，不能为 null，
长度 1..64，仅小写 a-z、0-9 和连字符，作为非敏感关联标识，不保证跨作业唯一性。
不输出 schema 未列字段；消费者继续忽略未知字段，不对字段顺序作假设。

## 边界与错误

文件权限为 0600，生产者和消费者同一 OS 作业账户；不传输到远端，不涉及 bearer 凭据。
非 UTF-8、无效 JSON、缺必填字段、值不符合 schema、超限文件均拒绝，返回本地 INVALID_RECEIPT；
读文件权限不足为 ACCESS_DENIED；不生成半成功回执。格式不合法不重试，I/O 重试由原调用方控制。
重复读取无副作用；无网络限流、配额或分页，4096 字节上限不变。不包含 PII、token 或用户输入正文。

## 兼容与追溯

沿用 v1 必填项和语义，仅增加非必填字段；无字段删除/重命名、迁移或弃用。
所有现有消费者仅 receipt-reader，源码 ../consumer/reader.py；旧 reader 不读取 request_id。
REQ-RECEIPT-01 -> job_id/status；REQ-RECEIPT-02 -> request_id 的类型、长度、字符约束及可省略性。
示例 ../examples/receipt.json（带 request_id）及 ../examples/receipt-without-id.json（不带）。
本模块一直使用上述表述追溯，无 TRACEABILITY-METADATA；本轮不迁移历史格式。
