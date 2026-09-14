# HLD ledger-preview v1 / approved

Owner：同项目有权工程 Owner，批准日期 2026-09-10。
架构为一台隔离 Linux VM、单个 systemd 服务 ledger-preview、Python 3.12。仅监听 127.0.0.1:8080；不依赖数据库、队列、对象存储或第三方服务。
版本位于 /opt/ledger-preview/releases/<version>，current 为指向当前版本的符号链接。配置文件 /etc/ledger-preview/config.env 无秘密，日志进入 journald。运行用户 ledger-preview 为非 root。资源：1 vCPU/256 MB。技术架构不在本轮改变。
