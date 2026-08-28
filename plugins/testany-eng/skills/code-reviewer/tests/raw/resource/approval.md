# 本地资源校验变更

审批记录：DEC-R-17；需求负责人已批准本文件中的 Candidate 范围。

原入口只校验第一份 migration；本次增加第二份 migration，并支持 provider
返回带目录的逻辑路径。入口为 `python3 provider.py RESOURCE_ROOT`。

冻结的不变量：接受且只接受下列完整路径集合及对应 SHA-256；缺少、额外、移动、
重名目录中的资源或内容修改均须拒绝。校验通过输出 `{"accepted": true}` / exit 0，
拒绝输出 `{"accepted": false}` / exit 3。provider 扫描根目录下的 SQL 文件，逻辑路径
相对于该根目录，使用 `/`。空目录不能通过。

| 完整逻辑路径 | SHA-256 |
|---|---|
| db/migration/V001__setup.sql | a433734416fabe31de87fd5a2b631dedc1e7fca7730ee8f3bd89ccf77e29ee71 |
| db/migration/nested/V002__index.sql | 8aaf23a7289bc101327b0bd8df95d3ca431dc342f8250219b7545808d223ed6c |

批准预算：MODIFY 本地 helper 和相关测试；KEEP 文件系统 provider 及上述退出码。
API、数据库 schema、外部服务、后台任务、部署模型与新依赖均为 NONE。
必要源码证据为 helper、provider、调用入口与本地测试。必要本地门禁：
`python3 -m unittest discover -p 'test_*.py'`，及能够覆盖冻结不变量的定向检查。

这是缩小的源码评审案例，不包含 PostgreSQL、Flyway、真实业务或部署验收。
