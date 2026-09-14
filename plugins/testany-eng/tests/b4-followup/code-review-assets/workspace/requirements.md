# Local Batch Queue 需求与工程决定 v1

本文件不是作者自签批准。授权来源是本轮用户请求中需求与工程 Owner 对本文件
精确版本的直接批准；该请求同时批准稳定仓库 ID `local/batch-queue`。
本文件进入 review_root_base，后续 Candidate 不得修改。

## 已有行为与本轮范围

- INV-1：构造器复制输入序列，`pending` 返回快照；任务以 FIFO 顺序执行。
- INV-2：`run_next(handler)` 在空队列返回 None；非空时调用真实 handler，
  成功后才移除该任务，返回 handler 结果。handler 抛异常时原异常向调用方传播，
  失败任务及未执行尾部保持原顺序等待下一次尝试，已成功任务不再执行。
- INV-3：增加 `run_batch(handler, limit)`，只接受非 bool 的非负 int；
  非法 limit 抛 ValueError，且不调用 handler、不改变队列。
  合法时最多执行 limit 个任务，结果按 FIFO 顺序返回列表；空队列或 limit=0
  返回 []。任务完成、失败和下次尝试语义与 INV-2 相同；遇异常停止本次 batch，
  异常原样向调用方传播，不吞异常、不继续消费尾部。
- INV-4：`run_next` 的签名、返回值、异常和输入拷贝语义保持兼容。

## 明确非目标与架构预算

仅允许修改本地库实现与其标准库测试。没有新增架构 surface 的授权；
公开 Python 方法 run_batch 的上述签名与语义是唯一获准接口增量。
不增加并发、持久化、自动重试、重启恢复、超时、身份授权、服务、CLI、第三方依赖、
CI 或部署；不要求完整 PRD/HLD/LLD/Runbook 或新增审批记录平台。
handler 不得重入/改动同一个队列；异常前的外部副作用由调用方用无副作用或可重试
handler 保证。本库不承诺跨进程或 handler 外部副作用的 exactly-once。

## 必要验证边界

Source/local 必须运行现有 unittest 门禁，并按批准契约检查两种入口、正常返回、
非法 limit 的零副作用、handler 失败及同一队列的后续重试。
可追加最小隔离诊断，不得替换待审队列逻辑。外部 handler 可用本地函数隔离。
CI 和 environment 不要求执行，均单独报告 NOT_RUN；这不是源码缺证。
