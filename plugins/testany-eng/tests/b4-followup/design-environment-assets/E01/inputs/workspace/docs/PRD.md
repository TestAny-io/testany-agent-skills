# PRD-RECEIPT v1.1

Owner：林岚。原始批准：approvals.json，r-102。
现有作业完成回执为本地 JSON 文件，由作业导出器交给本机 receipt-reader；仅当前 OS 作业账户可读。
本轮不涉及 HTTP、远端传输、凭据、跨租户权限或新增消费者。

- REQ-RECEIPT-01（不变）：一个完成回执包含 job_id（UUID）与 status（固定 completed）。
- REQ-RECEIPT-02（本轮）：允许新增可选 request_id，仅用于作业内排查关联。
  取值为 1 至 64 个小写英文字母、数字或连字符；不得包含用户资料或凭据。
  未提供时旧行为不变，不允许 null，不改变成功或失败语义，不以其充当权限或幂等标识。

验收：同一旧 reader 能读取带/不带 request_id 的文件；非法类型或字符不符合契约。
本次仅评审文件格式，批准不包含部署或工具安装。
