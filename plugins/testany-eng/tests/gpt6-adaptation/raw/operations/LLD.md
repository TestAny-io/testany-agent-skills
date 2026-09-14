# LLD ledger-preview v1 / approved

Owner：有权工程 Owner，批准日期 2026-09-10。
入口 app.py；依赖仅 Python 标准库。发布包为已校验 SHA-256 的目录包，包含 app.py 与 VERSION。启动为 python3 /opt/ledger-preview/current/app.py；systemd unit 已由基础设施团队部署，不在 Runbook 中重写。
切版本：核对新包 SHA-256、在 releases/<version> 放置解包目录、保留旧 current 目标、通过临时 symlink 与同文件系统 mv 原子替换 current，再 systemctl restart ledger-preview。失败回指旧版本并重启。无 migration，也无数据回滚。发布前检查 python3 -m py_compile app.py。
