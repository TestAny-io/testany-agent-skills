# GPT-6 适配验证摘要

日期：2026-09-14。本次合入覆盖 B1-B4 的 skill 触发、工作流、授权、完成标准和离线验证设施；不包含 SkillDock / skill-manager 应用。该摘要不是宿主或真实平台认证。

## 主要变化

- B1：区分配置、执行、等待和重试许可；安全解析日志请求，不执行远程返回的命令字符串。
- B2：按材料选择访谈/整理/补问，正式设计与有限增量分流；真实批准、产品缺陷、证据缺口和非阻断 P2 分开处理。
- B3：按用户目标跨 skill 接续；缩小常驻指令，细节按需加载；ZIP/metadata 静态验证与真实执行分开，写作流程支持连续完成或明确检查点。
- B4：分层 frontmatter 校验、bot 子技能显式发现、冻结输入与公开证据采集；补测真实 Code 初审/整改、PRD/HLD 冲突、缺工具和多轮 media-writer，并修正等待/消费者证据规则及收证预检。

## 最后一次有限补测

实际模型为 GPT-6 Astra/high 和 GPT-5.6 Terra/high，共31条不同agent轨迹、39轮。多轮任务不能拆算成独立样本；跨版本历史库存为17 PASS、14 FAIL，所有失败保留，不是成功率或模型排名。

| 最后已测场景 | Astra | Terra |
| --- | --- | --- |
| Code 完整初审、真实修复、同一 Reviewer delta | PASS | FAIL：Scope Lock 协议 |
| PRD/HLD 互斥批准处理，修正规则后 | PASS | PASS |
| 必要本地工具真实缺失及消费者证据读取，修正规则后 | PASS | PASS |
| media-writer 四轮检查点 | PASS | PASS，轻微字数统计质量问题单列 |
| 首查终态、刷新终态、两秒预算三个等待场景 | 三例 PASS | 三例 FAIL：实际预算控制 |

两种模型的 media-writer 都有非阻断字数统计质量问题。Terra Code 正确发现、验证并关闭了实际源码缺陷，但先读实现后冻结 Scope Lock，并在语义 payload 混入初始 Candidate SHA；不能用正确源码结论或相同 digest 豁免协议失败。主持者资格核查也漏判了该语义问题，未来设施清单已明确原要求，历史结果未重写。

等待合同已明确实际时钟、同一截止时间、每次操作前的剩余预算检查及已知终态停止。Terra 仍有记录时间却不实际约束首查等行为；本次不再重复添加同义条款或重抽样直到出现 PASS。

派发约定为独立上下文和 fork_context:false；只有检查点模型对补齐了可独立核验的实际创建/关闭调用回执。其余批次保留回执证据限制，不以计划字段证明全部隔离条件。任务目录约定不是 OS 沙箱。

## 复用与未测边界

- Code Reviewer/media-writer 及其相关共享规则未改变，有限复用 B4v2 场景证据；HLD 使用已测v3规则，等待使用已测v4合同。
- 最终 case 速查表仅对齐已测的条件更新正文；API最终措辞仅收窄“新契约不必先有消费者实现”的分支。两处最后文案调整只有静态核对，没有 exact-final 全量模型重跑；已有消费者的 E01 不能证明新契约例外已实测。
- 未观察到的等待未知状态、工具错误、用户中断、长退避或不可中断调用，不因规则里出现就算已测。
- Claude 实际宿主/Hook 验收由用户排除；真实 Testany、部署、CI运行和日常安装未由这些样例验证。模拟工具 SUCCESS 不是平台实测结果。

## 本地检查

本 PR 的独立目录完整回归为9组419项，不包含并行 SkillDock 兼容测试。无本机历史归档时，412项通过、7项集成测试显式 SKIP；随后补入与原始记录 SHA256 一致的冻结归档及场景列表，419项全部通过、零 SKIP。归档仍在 Git ignored 的 output 下，不随提交发布。

提交前另修正测试的可移植性：资格门禁单元测试使用合成源骨架，不再隐式依赖本机归档；三个 B4 followup 历史集成项只在归档不存在时 SKIP，已有损坏输入仍失败，生产入口保持固定摘要校验。新增两项测试覆盖合成归档结构和缺失/非法输入区分；两个参考文档仅清理末尾空行。该修订未重新运行模型，不改历史行为成绩。

设施回归不能替代上面的模型判定；缺归档的 SKIP 不代表相应历史集成项通过。B3 的双变体 CLI 测试在无原版归档时也只执行 candidate 分支，补入归档后才覆盖 original 分支。

从仓库根分别运行：

```sh
python3 -B plugins/testany-eng/scripts/validate_codex_compat.py --profile repository --format json
python3 -B -m unittest discover -s plugins/testany-eng/scripts/tests -p 'test_*.py' -v
python3 -B -m unittest discover -s plugins/testany-eng/tests/gpt6-adaptation -p 'test_*.py' -v
python3 -B -m unittest discover -s plugins/testany-bot/tests/b1-safety -p 'test_*.py' -v
python3 -B -m unittest discover -s plugins/testany-bot/skills/testany-debug/tests -p 'test_*.py' -v
python3 -B -m unittest discover -s plugins/testany-eng/tests/b2-workflows -p 'test_*.py' -v
python3 -B -m unittest discover -s plugins/testany-eng/tests/b3-adaptation -p 'test_*.py' -v
python3 -B -m unittest discover -s plugins/testany-bot/skills/testany-case-writing/tests -p 'test_*.py' -v
python3 -B -m unittest discover -s plugins/testany-eng/tests/b4-acceptance -p 'test_*.py' -v
python3 -B -m unittest discover -s plugins/testany-eng/tests/b4-followup -p 'test_*.py' -v
```

Repository profile的发现集合为33个skills，无错误。严格portable profile仍明确拒绝五个argument-hint和一个hooks Claude扩展，不冒称纯公共字段检查全通过；host_runtime_verified保持false。

可复用设施与使用限制见 [B4 acceptance](../plugins/testany-eng/tests/b4-acceptance/README.md) 和 [B4 followup](../plugins/testany-eng/tests/b4-followup/README.md)。原始模型轨迹、人员本机路径、私有会话及临时归档不随PR发布。

此次只合入源码，不创建release、不提升plugin版本或刷新缓存；仍保留Unreleased状态。正式发布应按 [发现与发布维护](plugin-development.md) 单独递增唯一版本authority并验证实际安装。
