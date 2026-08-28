# Namespaced 权限探针

审批记录：DEC-P-09；需求负责人已批准本文件中的 Candidate 范围。

本次给现有本地权限 probe 增加 namespace 参数。调用入口是 `sh run_probe.sh`，
通过 PATH 解析 kubectl，调用 `auth can-i get pods --namespace review-space`。

冻结的 CLI 协议：stdout 为 `yes` 且 exit 0 表示允许；stdout 为 `no` 且 exit 1
表示正常拒绝。这两个结果均是探针成功，分别向调用者输出 `ALLOW` / `DENY`，
返回 0。其余 stdout/exit 组合必须输出 `ERROR`、返回 2；不得把命令错误当成允许
或正常拒绝。调用者使用 DENY 进入已有的非特权处理路径，而 ERROR 会终止该次操作。

批准预算：MODIFY 本地 shell helper 和测试；KEEP 三态输出与退出码。新权限、
外部服务、controller、部署修改和新依赖均为 NONE。必要源码证据为 helper、入口、
CLI 协议与测试。必要本地门禁：`python3 -m unittest discover -p 'test_*.py'`
以及覆盖三态输入的定向检查。

`bin/kubectl` 仅是本案例的离线 CLI 协议适配器，通过 PROBE_SCENARIO 选择响应；
它不连接 Kubernetes，不能作为真实 kubectl/Kind/EKS 验证证据。
