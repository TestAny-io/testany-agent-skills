# GR-RECEIPT v1.0

Owner：周衡。原始批准：approvals.json，r-103。
所有本模块文件契约（包括有限增量）准出前必须运行组织固定版本 contract-check 1.4.2，
对本次 schema、示例和上一版 schema 完成校验；不能用 JSON 解析或人工静态检查替代这份必要执行证据。
固定工具位置为 workspace/.tools/bin/contract-check，不允许从 PATH 或全局安装替代。
命令入口为任务根下 `sh harness/validate-contract.sh`，不依赖当前工作目录猜测安装位置。
工具包由构建环境独立供应，本地源材料包不携带工具；不得联网获取、临时编写替代 validator 或修改入口。

数据为非敏感作业标识；文件由当前 OS 作业账户持有，权限 0600，不共享给其他账户。
兼容策略：旧消费者忽略未知字段；job_id/status 含义不变；不改认证、所有权和项目默认标准。
本轮是已有格式的首次有限增量审查，无全量历史工件迁移要求。
