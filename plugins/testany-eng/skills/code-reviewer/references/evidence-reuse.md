# 证据复用与同内容绑定

目标是复用已经成立的判断，明确失效范围；不是把旧 PASS 或摘要当新证据。旧版 Review Record 仍可读，历史不迁移、不按旧 miss 次数重新升级。

## 1. 最小读取与复用判定

先读最近有效结论、当前绑定、未闭合项与此次变化。核验一次引用版本/摘要，按需要读对应原始代码、命令结果、独立 oracle；同一会话同一不可变版本不重复读回。完整 manifest/hash 附件由脚本处理，模型只接收差异、失败项和相关证据。若后来出现 blocker/撤回，先处理它，不能跳回旧 APPROVED。

| 情况 | 保留 | 必须重做 |
|------|------|----------|
| 修改单一路径 | 未受影响的 scope、覆盖、测试 | 原 blocker、delta、直接消费者及共享依赖受影响部分 |
| 首次/重复发现旧漏审 | 有理由继续可信的部分 | 错误 closure、同根因路径、受污染 oracle；记录 reviewer 责任和新的验证方法 |
| 新 CI/环境日志 | 无关源码判断 | 日志证明的具体源码问题或缺证；日志本身不触发全审 |
| 工作区在验证时漂移 | 能绑定到旧 bytes 且不受 delta 影响的结果 | 新 binding、漂移 delta、依赖被改变的检查 |
| 相同 raw 内容提交 | 有效 source approval 与等价 source/local 结果 | 确定性绑定校验；commit 为输入的检查及 exact-SHA CI 不能照搬 |
| 影响无法可靠界定/共同基线或关键 oracle 整体错误 | 能独立证明的部分 | 说明事实后扩大范围，必要时 full review |

测试复用需要 exact input、命令、配置/fixtures/toolchain、oracle 和结果可核验。源码/依赖/输入变化只使相关项失效；无法证明不受影响就补最小检查。不要为了取得新 Review ID、不同输出目录或更新报告时间重跑长链。Writer/CI 执行昂贵等价门禁一次；Reviewer 核结果与独立 oracle，并做必要独立反例。缺失证据不能靠再读一遍作者结论补齐。

## 2. 同内容提交：binding_only

前提全部满足：

1. 最近有效 source verdict 为 APPROVED，完整覆盖可信、原阻断项关闭、无 SD/EB；没有较新撤回/新 blocker。旧 mutable approval 本身仍只适用于 snapshot。
2. 仓库 identity、review root、Scope Lock 与批准来源不变。当前提交没有新的需求/语义上下文；外部配置、工具、fixture、oracle 等依赖未变。依赖 commit ID/parent/时间的验证要单独判断，不能因为 tree 一样就继承。
3. 被 reviewer 接受的 snapshot JSON 或 prior commit 已固定摘要。脚本证明**整个 Candidate** raw bytes、path set、Git mode、gitlink 一致，可变基线未变；不存在未绑定输入。多仓逐仓满足。

从本 Skill 的绝对目录运行（JSON/receipt 保存到 Candidate 外，避免输出污染 snapshot）：

```sh
python3 <skill-dir>/scripts/verify_candidate_binding.py --repo <repo> \
  --snapshot <reviewed-snapshot.json> --snapshot-sha256 <reviewed-snapshot-digest> \
  --commit <full-commit-sha> --output <outside-candidate>/binding.json
# 已批准 immutable commit 变为同 tree 的另一 commit：
python3 <skill-dir>/scripts/verify_candidate_binding.py --repo <repo> \
  --prior-commit <full-reviewed-sha> --commit <full-current-sha> \
  --output <outside-candidate>/binding.json
```

snapshot digest 是 JSON 内 `snapshot_sha256`，应来自原 review 的已固定引用，不能现场从待比较文件读出一个值后自证。脚本输出只证明 binding；reviewer 核对上述审批/依赖前提后写短 receipt：

`原 Review ID / prior APPROVED 引用 → 每仓 old binding → exact commit/tree → binding artifact digest → scope/依赖未变，source APPROVED 继续适用；CI=<该 SHA 状态>，environment=<独立状态>`

保留原 Review ID，增加 binding revision。不复制旧记录、不新增语义 review verdict/批准轮、不重新要求用户批准同一范围；全部 immutable 后 receipt 与原有效 APPROVED 共同构成当前 exact-commit source certificate。**receipt 不能关闭原 findings、恢复已撤回 approval 或产生部署许可。**

有排除 WIP 时，工具额外证明这些路径没有隐藏 base→旧 HEAD 的 Candidate 变化，并且新 commit 只保留其旧 HEAD 内容；提交了排除 WIP 会报差异。工具拒绝目录/特殊类型、缺失旧对象或无法验证的 snapshot；这些是 fast path 不成立，不等于全仓必须重审。内容差异输出 exact changed paths，转最小 delta；缺少证明只补相应 EB。未经证明不能宣布 SAME_CONTENT。不使用临时自写逐文件哈希程序替代该工具。

## 3. Review ID、捕获与终止

新实质整改/补审用新 Review ID，关联最近有效记录；同次评审内 snapshot 捕获重试、无内容变化绑定和报告整理用 binding revision。pre-verdict 重算可以兼作 post-validation 重算；其后有写入/新验证才需再次检查。稳定两次捕获由 snapshot 工具内部完成，不需要额外循环四次。

没有新的实质事实就不发新评审轮、不回 ACK 的 ACK。达到源码准出即停止；CI/live 分层，不能把未来环境任务倒灌为源码门禁。
