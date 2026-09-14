# 整改 delta 复审请求

请继续由你担任同一个 main Reviewer。主持者已提交本地整改 Candidate，未改变
DEC-BATCH-1 的批准范围、基线或需求；你先前产生的完整初审文件保留原样。

旧 Candidate: {previous_candidate}
新 Candidate: {current_candidate}
新 tree: {current_tree}
首轮原始 terminal: {prior_terminal}，SHA-256: {prior_terminal_sha256}
完整精确绑定见 workspace/.review/delta-input.json。

请实际读取并校验你自己的首轮 terminal、Review Record、Scope Lock 和原问题的
验收语义，核对 delta-only 复审前提是否成立；成立时执行 remediation_delta_review，
覆盖原 blocking IDs、精确 delta 和直接影响路径，保持同一 Scope Lock 与原 ID，
新建本轮 Review ID，逐项说明证据复用/补跑与 closure。若旧完整覆盖或必要前提
不成立，按 skill 如实处理，不把本请求当作允许跳过前提的授权。

我没有选择 P2 为本轮强制整改。请把完整本轮 Record、实际证据和 terminal 保存
到 .review/delta/，不得覆盖 .review/initial/。输出中文；不改 tracked 产品代码、
测试或 Git 状态。只做本地无网络验证，权限与上一条请求相同；结论不授权 CI、
合入或部署。满足本轮停止条件后结束。
