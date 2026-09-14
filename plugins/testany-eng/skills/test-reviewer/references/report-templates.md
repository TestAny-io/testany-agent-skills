# Test Reviewer 模板

每份报告和准出证书必须绑定对象/版本、范围、标准、模式（initial/delta/closeout）、已审/未审覆盖及真实证据。沿用稳定问题 ID，分列 kind（defect/evidence_gap/scope_decision/optional）、严重级别和准出影响。通过须无未关闭 P0/P1 且必要证据充分，P2 不按数量阻断。详见 [评审规则](../../../references/review-assurance.md)。

## 审查报告模板

```markdown
# 测试审查报告

- 评审绑定：[对象/版本/可得摘要；范围；标准/版本；initial/delta/closeout]
- 覆盖状态：[已审；未审；复用证据及有效性]
- 准出影响：[defect / evidence_gap / scope_decision / optional；稳定 ID 与关闭证据]

## 基本信息

| 项目 | 内容 |
|------|------|
| **Test Package** | {路径} |
| **Review Mode** | 设计准备评审 / 发布前测试门禁 |
| **PRD 基线** | {路径} v{版本} |
| **API Contract 基线** | {路径} v{版本} |
| **HLD 基线** | {路径} v{版本} |
| **LLD 基线** | {路径} v{版本} |
| **Test Strategy** | {路径} v{版本} |
| **审查结论** | 🟢 通过 / 🔴 不通过 |

## 脚本校验摘要

| 检查 | 命令 | 结果 | 备注 |
|------|------|------|------|
| Lint | `python3 "$TESTANY_ENG_ROOT/scripts/trace_lint.py" --format json {test_spec_path}` | PASS / FAIL / NOT RUN / BLOCKED | {关键 issue / 无} |
| RTM 聚合 | `python3 "$TESTANY_ENG_ROOT/scripts/trace_build_rtm.py" --format json {prd_path} {test_strategy_path} {test_spec_path}` | PASS / FAIL / NOT RUN / BLOCKED | {关键 issue / 无} |

## 问题统计

| 级别 | 数量 | 门槛 | 状态 |
|------|------|------|------|
| P0 | {n} | = 0 | ✅/❌ |
| P1 | {n} | = 0 | ✅/❌ |
| P2 | {n} | 不按数量阻断 | 记录 |

## 覆盖率摘要

| 指标 | 结果 | 门槛 | 状态 | 未覆盖项 |
|------|------|------|------|----------|
| 需求覆盖率 | {x/y = z%} | = 100% | ✅/❌ | {列表 / 无} |
| API Contract 覆盖率 | {x/y = z%} | = 100% | ✅/❌ | {列表 / 无} |
| 风险覆盖率 | {x/y = z%} | 明确展示 | ✅/❌ | {列表 / 无} |
| 高风险覆盖率 | {x/y = z%} | = 100% | ✅/❌ | {列表 / 无} |
| Must-not-regress 覆盖率 | {x/y = z%} | = 100% | ✅/❌ | {列表 / 无} |
| 外部行为覆盖率 | {x/y = z%} | 明确展示 | ✅/❌ | {列表 / 无} |
| 场景覆盖率 | {x/y = z%} | 明确展示 | ✅/❌ | {列表 / 无} |
| 必测 NFR 覆盖率 | {x/y = z%} | = 100% | ✅/❌ | {列表 / 无} |

### RTM 聚合摘要

| 指标 | 结果 |
|------|------|
| Requirement Covered / Total | {x / y} |
| Risk Covered / Total | {x / y} |
| Must-not-regress Covered / Total | {x / y} |
| External Behavior Covered / Total | {x / y} |
| Test Cases | {n} |
| Unresolved Relation Targets | {n} |
| Orphan Entities | {n} |

## Gate 1：基线与追溯
- {结论与证据}

## Gate 2：覆盖与漂移
- {结论与证据}

## Gate 3：可执行性与证据设计
- {结论与证据}

## Gate 4：执行证据与残余风险
- {结论与证据}

## Downstream Handoff

- **文档下游**：{`/runbook-writer` / 无}
- **自动化下游**：{`/case-writing` / 无}
- **说明**：{例如：当 `Testany Automation Handoff.status = ready` 时进入 `/case-writing`}

## 问题清单

### P0
- {问题}（证据：{位置}）

### P1
- {问题}（证据：{位置}）

### P2
- {问题}（证据：{位置}）

## 结论

- **通过**：{测试设计准出 / 测试门禁通过}
或
- **不通过**：修复问题后复审
```

## 准出证书模板

```markdown
# ✅ 测试准出证书

- 评审绑定：[对象/版本/可得摘要；范围；标准/版本；initial/delta/closeout]
- 覆盖状态：[已审；未审；复用证据及有效性]
- 准出影响：[defect / evidence_gap / scope_decision / optional；稳定 ID 与关闭证据]

- **Test Package**：{路径}
- **Review Mode**：设计准备评审 / 发布前测试门禁
- **结论**：通过
- **脚本校验**：`trace-lint` 通过，`trace-build-rtm` 无 build error
- **说明**：{可进入测试执行阶段 / 可进入发布准备阶段}
- **文档下游**：{`/runbook-writer` / 无}
- **自动化下游**：{`/case-writing` / 无}
```
