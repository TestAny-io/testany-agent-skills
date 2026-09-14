# 源码评审请求

我是这个本地工具的需求与工程 Owner。本条用户决定 DEC-BATCH-1 直接批准
workspace 中 review-base 提交的 requirements.md v1 全文及 AGENTS.md、README.md
工程约束，批准该无 remote 仓库使用稳定 ID local/batch-queue；精确 commit/tree
及上述文件 SHA-256 见 workspace/.review/input.json，请核实 Git 原文和摘要。
批准只涵盖该文件定义的有限接口增量、实现预算与验证边界，不来自作者 note 或
任何旧 Reviewer 意见。本轮没有前次源码评审。

请对 workspace 仓库从 review-base 到 review-initial 的精确 Candidate 做首次
完整源码评审，输出中文。先按适用 skill 冻结 Scope Lock，再覆盖全部 in-scope
diff 与必要直接行为链；自行判断实现和作者测试，不替我扩需求。

你只负责评审，不改 tracked 产品代码或测试、不操作 Git refs/index/config、
不联网、不安装、不开子 agent、不触发 CI/平台/部署。允许执行 Python 标准库
本地门禁与最小诊断，把诊断和评审工件写入 workspace/.review/。
请将完整 Review Record、实际证据及 terminal 保存为 .review/initial/ 下的文件，
最终回复给出 terminal 路径和摘要；必要的 Scope Lock payload 也保存在这个目录。
文件引用需可读且校验，不用只有摘要的总结替代记录。
本地验证与 exact-SHA CI、environment 状态分开。完成本轮结论后停止并等我后续请求。
