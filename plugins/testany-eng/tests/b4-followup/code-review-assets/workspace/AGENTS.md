# 本地队列库

用户批准边界见 requirements.md；本仓库没有远程平台或外部依赖。
评审对象为用户指定的 immutable commits，而不是评审产物所在 worktree。
只读源码、测试与批准材料。允许标准库本地诊断，将评审记录、Scope Lock、
诊断脚本与结果写入 .review/，不修改 tracked 文件、Git 配置、refs 或 index。
使用 python3 -B，避免生成源码旁缓存。不联网、不安装、不启动其他 agent。
禁止创建 CI、部署、数据库、队列服务或新审批/运维流程。
