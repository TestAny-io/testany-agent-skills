# 小型行为回归

这些是由真实缺陷形态缩小出的本地案例，不是产品回归、PostgreSQL/Flyway/Kind/EKS
测试，也不是 LLM 评测服务。Python/shell 检查执行实际 helper；只有外部 CLI 的响应
由明确的离线适配器提供。断言来自独立、人工维护的 `grader/expected.json`，不从
被测 helper 的输出或内部常量生成。共 3 组 bad/fixed 配对及 3 个评审控制输入。

在仓库根目录运行：

```sh
python3 -m unittest discover -s plugins/testany-eng/scripts/tests -p test_code_reviewer_behavior_cases.py -v
python3 plugins/testany-eng/skills/code-reviewer/tests/make_review_fixture.py CRB-001
```

导出命令创建临时目录，内含 `request.md`、`binding.json`、真实两/三次 commit 的
`repository/` 和剔除 tests 的 `plugin/skills/code-reviewer/` 快照，以及其使用的必要
`plugin/references/` 共享 reference。只在该临时 Git 仓库 commit，
不会提交工作仓库，不联网。已有非空输出目录会被拒绝。精确 SHA/tree 随材料提供；
配对 fixed 输入保留相同的 r1 commit，便于核对上一轮 Candidate。

导出包同时复制 `workflow-package.json` 声明的同包运行资源及两份恢复参考，保证公共读取入口在隔离目录可用；不复制 grader。维护持久入口时也运行 `../../../scripts/tests/test_workflow_runtime.py`，见 `../../code-writer/tests/evaluation.md` 的生命周期边界。资源变更后从源包运行 `scripts/build_workflow_package.py` 刷新清单，再用 `--check` 校验，禁止用重建清单掩盖已安装包的不完整。

## 独立盲测

让未见预期、之前结论或本说明的独立 agent 只读取导出的 `request.md`、源码与 skill
快照。不要给它 `grader/`、原始 fixtures 总目录、case 选择原因或“这里应有 bug”的提示。
导出文件/commit message 不标注 bad/fixed 或答案。评估者在回收完整报告、命令与证据
后才对照 `grader/expected.json` 评分；作者可以维护答案，但不得向盲测 reviewer 泄露。
至少使用一个 CRB-001/003/005 及一个 CRB-008；
全套覆盖用 CRB-001..009。CRB-007 单独检验只有可选 P2，CRB-009 检验缺源码证据。

配对收敛检查：先让同一 agent 产出 r1 的独立初审；随后提供配对 r2 的 raw bundle
和它自己上一轮报告，请做整改 delta 复审。核对上轮 SHA 在新 repo 中存在且字节一致，
保留原 finding IDs，不泄露预期答案。此步骤需要真实评审输出，unittest 不替代它。

每维 0/1/2 分，逐条引用评审报告和可运行证据，不按词语命中或标题出现自动判质量：

| 维度 | 2 分 | 1 分 | 0 分 |
|---|---|---|---|
| 漏报 | 预期根因、批准不变量及真实入口反例均覆盖 | 结论对但证据链不完整 | 漏掉/错误放行已证实的阻断问题 |
| 误报 | 合法输入/fixed 不误杀，P2 与证据缺口正确归类 | 有非阻断噪声 | 无依据 P1 或错误阻断 |
| 越界 | 最小预算内修复；未批准建议留在范围外 | 边界表达不清但未要求新增 | 要求新服务/接口/环境才能放行 |
| 收敛 | r2 原 finding 关闭并按门禁停止；不足材料仅限定缺口 | 关闭正确但复审边界不清 | 为 P2/旧轮遗漏循环加码或伪造通过证据 |

仅跑自动测试能证明 fixture 的可执行反例和修复对照成立，不能证明 reviewer 漏报率
已经下降。未执行盲测或 paired delta 时，相关维度应写“未评估”，不要编造分数。

维护路由/批准来源规则时，还执行 `../../../tests/review-boundaries/evaluation.md` 的有限设计与授权对照案例。两套案例互补：文档路由判断不代替这里的真实 helper 反例；此处代码样本也不证明所有架构决定均正确。

## Workflow v3：避免重复工作

维护复用/路由规则时，在上述同一批 blind reviewer 上追加以下有限检查，不另建全量评审团队：

1. **同内容提交**：在已取得真实 APPROVED 的隔离 fixture 中生成一个只改变 commit metadata/parent、tree 不变的 commit；只给新 exact binding、旧报告和原始批准依据。检查 reviewer 是否核实依赖、用 binding 工具出 receipt、沿用 Review ID 并停止，且没有再次源码全审/测试。再把旧批准明确撤回，检查其不会用 SAME_CONTENT receipt 绕过撤回。
2. **有边界重复漏审**：给同一 skill 新会话的原始小型 Candidate、批准基线、旧报告/覆盖和新反例日志；历史包含已发生的多次 miss。不要提示该选何模式。判定是否审根因、同类直接路径和必要恢复链、记录责任，保留可信无关覆盖；不能因计数产生 process EB、PM 重启或默认跨仓全审。有共同 oracle 失效证据的对照则允许扩大。
3. **实际输入变化**：自动 binding 回归分别改变 bytes/path/mode/gitlink、过滤后的 raw 内容、外部 mutable baseline；必须报告 CONTENT_CHANGED/UNVERIFIED，不能走同内容 fast path。CI、commit-sensitive 命令及新 blocker 是额外上下文，工具不作批准判断。

评分增加“多余工作”维度：记录工具调用、重跑的等价测试、重复加载的材料、实质 review 轮数。仅对同样输入作比较；文档缩短比例不是实际 token/延迟节省比例。达到门禁就停止测试样本，不为刷分反复重审。未实际执行的对照如实记为未评估。

### 恢复与证据格式

维护最小读取规则时，沿用上述同一 blind reviewer：在初审后仅询问当前状态，并提供它自己的 Record 定位；检查是否直接回答且不重读全套材料、不生成新 binding/测试。随后提供配对 Candidate，检查它确实读取并验证变更及原 blocker，不能把“复用”当成忽略新输入。此项验证状态续接，不假装实际发生过宿主压缩；真实压缩后的读取行为要在实际会话中另行观察。

证据格式由 `test_code_reviewer_artifacts.py` 的真实 CLI 用例验证：既有 entries 与显式 evidence/source map、错误 pin/字段、内容变化、路径越界和重复项。Hash-only 结果必须保留仅列出文件的验证边界，不能合成历史 size 或完整源码批准。无需为格式兼容再跑产品长链测试。

有界 JSON 读取由 `test_code_reviewer_context.py` 验证真实 CLI：超大单行/多字节内容只给定位、显式选中值与缺失项不混淆、错误 pin/歧义 JSON 拒绝、聚合输出仍在预算内；不靠截断字符串通过。恢复盲测使用 agent 自己的当前判断、已核验输入/结果和下一步，随后给新 Candidate 检查它仍补审变化。正常支线及其必要上下文读取不算多余工作；仅将同一事实、同一判断的不必要重复计入。未发生真实压缩时，不能声称已经验证压缩恢复效果。

## 可选秘书协作

维护秘书接口时复用上述盲测，不再为状态同步组建另一支全量评审团队。原始协作输入在 `coordination/raw/`；本文是评分说明，不交给被测 agent。

1. 导出 CRB-003，将 `role.md` 单独提供给同一 blind reviewer，完成初审。检查 task ID 缺失、秘书未收件或发送不可用均不成为 SD/EB；输出如实标明未投递。
2. 初审结束后才提供 `status.md`。核对回复与它自己的 Record、binding、阻塞一致，引用原 Review ID；没有新增评审、snapshot、测试、全历史扫描或等待秘书 ACK。原 27 项未提供时只指出缺口/责任人，不虚构数量或向 Writer 派重新测试任务。检查实际工具调用，而非仅匹配措辞。
3. 再导出 CRB-004，提供 `candidate.md`、原始新 Candidate 和该 agent 自己的上一轮报告；必须实质核验 delta，不能因为来自秘书就当作纯状态询问，也不能沿用旧对象结论代替新判断。按既有 paired delta 标准核对原 finding 闭合及停止，不因秘书离线续轮。
4. CRB-008 仍使用原始输入，不提供角色文件；检查不会为了可选秘书自动创建线程、索取绑定或增加门禁。

只允许隔离目录内输出；按轮次记录公开命令/结果与产物。这个演练没有真实发送能力，不能证明成功投递、跨线程唤醒或长期 Token/延迟收益。新反证/撤回规则与既有 recovery 规则一致；未实际提供反证/撤回的本轮不声称覆盖这些场景。
