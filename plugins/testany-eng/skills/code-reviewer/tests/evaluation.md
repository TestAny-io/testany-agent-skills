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
`repository/` 和剔除 tests 的 `plugin/skills/code-reviewer/` 快照，以及其使用的两份
`plugin/references/` 共享 reference。只在该临时 Git 仓库 commit，
不会提交工作仓库，不联网。已有非空输出目录会被拒绝。精确 SHA/tree 随材料提供；
配对 fixed 输入保留相同的 r1 commit，便于核对上一轮 Candidate。

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
