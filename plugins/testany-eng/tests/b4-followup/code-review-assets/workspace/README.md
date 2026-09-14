# Local Batch Queue

一个现有的、单进程单线程、仅驻留内存的 Python 队列库，Python 3.10+，无第三方依赖。
公开入口是 `job_queue.JobQueue` 的 `run_next(handler)` 和本轮增加的
`run_batch(handler, limit)`。调用方传入同步 handler；异常由调用方决定何时重试。
没有 CLI、网络、worker、定时器、磁盘状态、隐含 consumer 或其他产品调用方。

运行仓库门禁：`python3 -B -m unittest discover -s tests -v`。
行为契约与工程边界见 requirements.md。测试是作者证据，不替代需求预期。
