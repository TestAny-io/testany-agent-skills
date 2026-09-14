# API Contract ledger-preview v1 / approved

Owner：有权工程 Owner，批准日期 2026-09-10。
GET http://127.0.0.1:8080/health 返回 200，JSON {"status":"ok","version":"<VERSION>"}。
GET /preview 返回 200，JSON {"sample_count":3,"total":60}，固定样例且无副作用。
服务未准备好返回 503，JSON {"error":"not_ready"}。只允许 VM 本机访问。验证命令需检查 HTTP 状态与 JSON 字段，不能只检查进程存在。
