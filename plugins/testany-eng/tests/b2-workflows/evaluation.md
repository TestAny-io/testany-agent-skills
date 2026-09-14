# B2 离线行为回归

本目录覆盖读取/能力/路径、评审分级与复审、有限增量、写作模式。不是平台集成、模型排名或发布测试。

## 执行

从仓库根目录执行：

```bash
python3 -m unittest discover -s plugins/testany-eng/tests/b2-workflows -v
python3 plugins/testany-eng/tests/b2-workflows/prepare_run.py output/new-b2-run --batch all
python3 plugins/testany-eng/tests/b2-workflows/prepare_supplement.py output/new-b2-supplement
```

导出器拒绝覆盖非空目录，为输入保存 tar、逐文件 SHA-256 和预期；每个随机目录只包含当前任务、原始材料及插件资源，不含 grader/历史报告。`suite.json` 与原导出器在正式源修改前冻结；补充文件单独冻结，不覆盖原预期。`--variant original` 需要原执行记录中 Git ignored 的 `output/gpt6-b2-2026-09-14/start/tree.tar.gz`，不保证在新克隆中可用；candidate 导出不需要该归档。

每个任务使用全新、`fork_context: false` 的离线测试 agent，统一 reasoning，记录实际模型。不得将该测试方式当成用户已授权普通 skill 在任何宿主自由委派。测试 agent 仅访问自己的目录、不联网、不委派、不改插件，实际执行轨迹另行核对。该边界是同宿主的指令约束，不是 OS 沙箱或真实自动发现安装。

## 判定

必须核对实际工具行为、交付物、输入变更和最终声明，不能只看关键词或 agent 自评。`PASS / FAIL / PARTIAL / INVALID / NOT_RUN` 沿用原基线的含义。保留失败及修正前记录。

复用原样例时保留相关安全不变量；若新 case 在冻结前明确替换任务（例如 Runbook 材料改用于 HLD、单篇文章改成双平台短稿），交付路径与字数按新 request/expect 判定，不能同时要求旧任务的不同文件。

原 suite 有16个场景、20次运行，其中 P2 放行/P1 拒绝各重复3次；补充有2个场景。它们不覆盖全部33个 skill、全部协议、所有平台风格或全部 T01-T28。

新增的自查观察单独记录，不事后修改冻结预期。例：B04 原目标是缺上游仍检出生产入口越界；额外发现的摘要缺失机械 P1 应修正并复测，但与原 F07 样例分数分栏，不用重新解释原 grader 制造或消除失败。

## 已知限制

原导出器也复制了两个 Git ignored 的 `.DS_Store` 非指令文件。它们在输入摘要中可见，公开调用未见读取；不把它们纳入 Git 交付。为保持既有冻结设施，未在本轮隐改其复制规则；后续设施升级应显式过滤并生成新版本。

结构测试只能证明路径、包装及规则片段一致，不能代替模型行为。端到端模型样例也不能证明真实 API 兼容、独立发布审批或生产安全。发布前仍需安装 smoke、同配置旧新版对照与其他团队模型回归。
