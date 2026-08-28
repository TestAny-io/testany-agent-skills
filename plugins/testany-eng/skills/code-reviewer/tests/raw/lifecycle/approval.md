# 恢复执行的完成阶段

审批记录：DEC-L-04；需求负责人已批准本文件中的 Candidate 范围。

本次在已有 ordinary 流程之外增加 resume 流程。调用入口为
`python3 runtime.py ordinary|resume released|blocked STATE_DIRECTORY`。

冻结的不变量：两条路径均须先成功释放本次本地锁，再发布 PASS；发布 PASS 时锁
不得仍被持有。释放失败必须返回非零，保留锁并且不得发布 PASS。成功 exit 0，
释放失败 exit 3，未知路径 exit 2。终态错误不能被清理阶段吞掉。

批准预算：MODIFY 本地完成阶段 helper 和测试；KEEP 本地文件锁及运行协议。
新增远程锁、API、数据库、服务、后台任务和部署修改均为 NONE。
必要源码证据为 helper、runtime 及两条路径的本地测试。必要本地门禁：
`python3 -m unittest discover -p 'test_*.py'`，以及成功/释放失败的定向检查。

runtime 使用真实临时文件的 unlink；blocked 模式用同名目录触发文件系统释放错误。
输入目录由测试调用者新建；锁获取和多进程互斥不在本次案例范围。
这是缩小的状态转换案例，不模拟集群锁、数据库事务或线上部署。
