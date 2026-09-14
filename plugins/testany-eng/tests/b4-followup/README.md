# B4 有限行为补测设施

这些样例补充直接场景覆盖，不重写历史 B4 成绩，不测试 SkillDock / skill-manager，
不运行 Claude 宿主认证或 hook，不调用真实 Testany、网络、凭据或发布操作。

## 场景与独立证据

| 模块 | 真实任务 | 不能替代的证据 |
|------|----------|----------------|
| `code_review_case.py` | 本地 Git Candidate 首次完整源码评审，真实修复后同一 agent delta 复审 | 给定旧报告、单次 verdict 探针、真实 CI/部署 |
| `design_environment_cases.py` | 原始批准材料中的 PRD/HLD 冲突；必要本地工具实际缺失 | 两份 BRD 冲突、给定 not-run 记录、组织审批外部认证 |
| `checkpoint_case.py` | media-writer 同一 agent 四轮检查点推进 | 单 Stage 1、BRD/Journey 变体、真实发布 |
| `wait_cases.py` | 注册到终态全链、refresh 终态、两秒预算 | 真实平台执行、未知状态/错误/中断全部路径 |

`fixture_support.py` 复用 B4 的安全归档读取、安装树、输入 inventory 和公开会话收集器。
`prepare` 只生成输入，不派发模型。默认源为本机 B4 v2 冻结归档；可传明确 `archive`，
不回退到 live 工作区，不将并行应用改动混入候选。缺归档时报错，不能伪称运行成功。
正式复现需先提供包含四个领域插件及治理文件的明确源归档；`code_review_case.py`
的历史重放另校验本次固定 v2 摘要，不能拿新版本冒充原样例。

## 最小使用

从仓库根运行本地设施测试，不调用模型或平台：

```sh
python3 -B -m unittest discover -s plugins/testany-eng/tests/b4-followup -p 'test_*.py' -v
```

新 checkout 不需要私人归档即可运行单元测试。三个历史导出集成项仅在本机 v2
归档不存在时显式 SKIP；损坏文件、目录或符号链接不能冒充缺输入。资格门禁的
单元测试使用明确标记的合成源骨架与真实本地 Git/collector，仅在测试内替换
固定摘要，不改变生产入口的归档校验，也不产生模型验收证据。

单个等待样例导出到新目录（需要本机 v2 归档）：

```sh
python3 -B -c 'import sys; from pathlib import Path; sys.path.insert(0,"plugins/testany-eng/tests/b4-followup"); import wait_cases; wait_cases.prepare(Path("output/wait-new-run"), "W02")'
```

其他模块的 CLI 以 `python3 -B <module.py> --help` 为准。生成与收集分离：主持者预审
并冻结请求、判据和后续轮次，获得实际 agent ID 后保存派发收据，再采集已完成的公开证据。
用户已授权补测时，主持者设施审查不是再次要求用户审批。

## 隔离、判定与停止

- 原始业务材料、当轮请求和安装技能进入任务根；expected、修复 recipe、未来轮次、评分和旧对话不进入任务根。
- task root 和证据目录分离，路径含空格；这只是任务资源约定，不是操作系统沙箱。
- 每条多轮 trajectory 保持同一 agent；转入下一轮前保存公开轨迹与真实 workspace 快照。累计会话不能冒充单轮证据。
- `capture_phase` 与现有 collector 只导出公开文本和工具，不导出私有推理。保留真实模型、effort、输入/源归档/设施摘要和身份。
- 本地设施测试不替代模型验收，路径白名单不证明内容正确。语义评分需检查公开动作及产物；失败后的自纠不抹去失败。
- 缺工具判据检查真实入口的失败，不往生产 validator 塞模拟异常。等待工具只模拟状态，绝不执行提供的测试脚本。
- 新细则单独评分，不追溯修改 B4 核心成绩。单个样例通过不是稳定性、全技能、全宿主或真实平台认证。
- source 修正只处理已证明的问题；输入、判据或设施错误须明确版本化，不能挑选成功样本覆盖历史失败。

本机报告和运行证据位于 Git ignored `output/`；本目录只保留可复用设施、原始场景材料和本地测试。
