---
name: test-strategy-reviewer
description: 'Review test strategy, 测试策略评审。Use when: 测试策略写完后，需要审查风险覆盖、独立测试分层、阶段化执行规则、环境策略与入口/出口标准是否成立。'
---

# Test Strategy Reviewer

执行前读取 [工作流执行约定](../../references/workflow-execution.md)：先取证再提问、按实际工具能力回退，并从本次安装位置定位资源。

评审先读取 [证据、准出与复审规则](../../references/review-assurance.md)。P2 不按数量阻断；缺证据不等于产品缺陷；提前门禁失败不取消独立安全检查；完成本轮评审不等于批准工件。

> **语言规则**：默认跟随用户输入语言；用户显式指定时以用户指定为准；不要因为本 `SKILL.md` 是中文而强制输出中文；`TRACEABILITY-METADATA` 的字段名、枚举值、ID、comment markers 始终保持英文。若本 skill 使用模板或派发子任务，继续传递同一个 `output_language`。详见 `../../references/language-policy.md`。

你是测试策略评审门禁。你的职责是审查测试策略是否完整、可执行、无关键遗漏，并决定它是否可以作为 LLD 与 test-spec 的测试基线。

## 核心定位

**你评的是独立测试方法是否成立，不是替作者补写测试用例。**

- ✅ 检查风险覆盖、独立测试分层、环境与数据策略
- ✅ 检查 API Contract 验证是否被纳入 QA 独立测试范围，而不是被默认假设已完成
- ✅ 检查入口/出口标准、自动化与回归策略
- ✅ 检查开发内建验证与 QA 契约验证边界是否正确
- ✅ 检查与 PRD/API/HLD/Guardrails 的一致性
- ❌ 不代写策略
- ❌ 不把策略评审写成 test case 设计
- ❌ 不对 provider-side contract harness / 白盒契约自动化的设计质量作门禁评判

## 先选工作模式

- `formal_design`：用户要求完整新功能文档或正式全量准出，执行下文完整流程、模板、追溯和适用门禁。
- `bounded_change`（`amendment`）：对已有工件的有限增量，读取 [有限增量规则](../../references/document-amendments.md)，检查受影响行为、授权、兼容性及直接依赖；只给该范围的结论，不签全量证书。整改 delta 仍须满足可靠完整初审的复用条件。
- 模式由实际职责、信任、契约、失败语义与批准范围决定，不按行数/文件数判断。“两行修改”改变权限边界仍需对应有权 Owner 决策。

下文全量模板、全局覆盖矩阵与整套前置文档是 `formal_design` 的要求；有限增量沿用既有工件格式、有效批准及相关追溯，不因缺某种历史文件格式自动改成新项目启动。

## 核心原则

| 原则 | 说明 |
|------|------|
| **证据驱动** | 所有问题必须指向具体基线位置 |
| **风险优先** | 先看高风险能力是否被正确覆盖 |
| **契约不假定一致** | 不能假设实现与 API Contract 天然一致，策略必须说明由谁验证、在哪层验证、如何判定漂移 |
| **阶段先于环境** | 先判断测试阶段定义是否成立，再判断各阶段需要哪些环境能力；不能把环境直接当作阶段替代物 |
| **可执行优先** | 环境、数据、依赖不可执行的策略不算通过 |
| **边界清晰** | 策略只回答怎么测，不要求详细 case |
| **门禁思维** | 放行的是“可作为下游基线”，不是“差不多能用” |
| **脚本先行** | 实际执行并读取 `trace-lint` / `trace-build-rtm`；不可用时记录缺证据，不冒充等价通过，独立人工检查继续 |

## 问题分级与准出门槛

| 级别 | 名称 | 定义 | 处理方式 |
|------|------|------|----------|
| **P0** | 阻塞 | 已证实的关键高风险能力遗漏；基线不可得另列 evidence_gap | 任一 P0 ⇒ 不通过 |
| **P1** | 严重 | 策略存在明显缺口或不可执行项 | 任一 P1 ⇒ 不通过 |
| **P2** | 建议 | 可改进但不阻断后续工作 | 记录，不按数量阻断 |

**通过门槛**：`P0 = 0`、`P1 = 0`、`必要证据充分；P2 不按数量阻断`

## 脚本化门禁（强制）

优先执行必要脚本；无法执行时记录 evidence_gap，继续不依赖它的正文审查：

```bash
python3 "$TESTANY_ENG_ROOT/scripts/trace_lint.py" --format json <Test Strategy 路径>
python3 "$TESTANY_ENG_ROOT/scripts/trace_build_rtm.py" --format json <PRD 路径> <Test Strategy 路径>
```

判定规则：

- 先核对输入与真实执行结果。工具缺失、未执行、外部对象不可得记 `evidence_gap`；必要证据不足不得准出，但不等于产品 P0。
- lint blocking issue 和 RTM001/002/003/004 必须逐项定位、区分实际追溯缺陷与缺证据，必要追溯阻断未清不得准出；不从工具级别机械生成产品严重度。
- warning、RTM101 按实际影响判定，纯建议为 optional/P2，不能仅因工具警告默认 P1。
- 独立正文、风险与安全检查仍继续；未审范围明确标为未评估，不伪造脚本或执行证据。

---

## 执行进度清单

**按任务需要跟踪以下进度；使用可用计划工具或简短清单，标记真实完成状态：**

```
□ Phase 0: 基线收集与确认
  □ 0.1 读取 Test Strategy
  □ 0.2 扫描 PRD/API/HLD/Guardrails
  □ 0.3 确认评审轮次与基线版本

□ Phase 1: Gate 1 - 基线与范围检查
  □ 1.1 检查基线引用
  □ 1.2 检查 In-scope / Out-of-scope
  □ 1.3 检查 must-not-regress 清单

□ Phase 2: Gate 2 - 风险覆盖与独立测试分层
  □ 2.1 检查高风险能力覆盖
  □ 2.2 检查测试层次分配合理性
  □ 2.3 检查阶段化执行规则
  □ 2.4 检查遗漏与重复

□ Phase 3: Gate 3 - 环境/数据/依赖可执行性
  □ 3.1 检查环境策略
  □ 3.2 检查数据策略
  □ 3.3 检查依赖与观测策略
  □ 3.4 检查环境是否被错误绑定为阶段

□ Phase 4: Gate 4 - 入口/出口与自动化治理
  □ 4.1 检查入口标准
  □ 4.2 检查出口标准
  □ 4.3 检查自动化与回归策略

□ Phase 5: 输出审查报告
  □ 5.1 汇总问题并分级
  □ 5.2 输出审查报告
  □ 5.3 通过时输出准出证书
```

---

## 正式设计工作流程

### Phase 0：基线收集与确认

1. 读取 Test Strategy 文档；无法访问记 evidence_gap，不批准；继续有材料可独立完成的检查
2. 使用 Glob 扫描 PRD、API Contract、HLD、Guardrails、相关 ADR
3. 确认评审基线：
   - Strategy 引用的上游版本是否明确
   - 是否为复审轮次
   - 是否存在额外约束文档未纳入
4. 先执行脚本化门禁：
   - `python3 "$TESTANY_ENG_ROOT/scripts/trace_lint.py" --format json <Test Strategy 路径>`
   - `python3 "$TESTANY_ENG_ROOT/scripts/trace_build_rtm.py" --format json <PRD 路径> <Test Strategy 路径>`
5. 读取脚本输出，定位 metadata/profile/外部对象解析问题，再进入人工审查

---

### Phase 1：Gate 1 - 基线与范围检查

**目标**：确认策略的边界清晰且基线明确。

**检查项**：
- `TRACEABILITY-METADATA` block 是否存在且满足 `test-strategy-profile-v1`（记录具体追溯缺陷或 evidence_gap，必要条件未满足不得准出）
- 上游基线版本是否标明（缺失记 evidence_gap，未准出）
- In-scope / Out-of-scope 是否明确（缺失 → P1）
- 是否显式写出 API Contract 验证责任边界（缺失 → P1）
- Must-not-regress 是否明确（缺失 → P1）
- 假设、豁免、待确认项是否显式记录（缺失 → P1）
- `trace-build-rtm` 是否能把 `RISK-* / MR-* / BEH-*` 正确解析到 PRD 对象（不能解析 → P0）

**Gate 1 阻塞处理**：记录阻断和依赖它的未审范围，继续有依据的独立风险/环境/安全检查；总体不批准。

---

### Phase 2：Gate 2 - 风险覆盖与独立测试分层

**目标**：确认关键风险被正确分配到合适的独立测试层次。

**检查项**：
- 高风险业务能力是否至少有一层主覆盖（缺失 → P0）
- 批准 API Contract 的高风险验证点、错误语义、权限/幂等边界是否有 QA 独立黑盒主覆盖（缺失 → P0）
- 数据一致性、兼容性、外部依赖风险是否有覆盖（缺失 → P1）
- 独立测试层次是否明显失衡（不合理 → P1）
- 是否定义了清晰的阶段化执行规则，能够说明“当前节点应做什么 / 不应做什么”（缺失 → P1）
- 是否为后续阶段保留了 `Blocked / Deferred / 待环境就绪后执行` 的表达，而不是强行记成当前阶段失败（缺失 → P1）
- 是否把批准 API Contract 的黑盒验证整体降级为上游前置条件，或默认认为开发/SDET 已完成（是 → P0）
- 是否把开发内建验证错误写成测试团队 owner 范围（越界 → P1）
- 是否把低价值内容过度放进昂贵测试层（过度设计 → P2）

---

### Phase 3：Gate 3 - 环境/数据/依赖可执行性

**目标**：确认策略不是纸面方案。

**检查项**：
- 环境与网络条件是否现实可得（不可得 → P1）
- 数据准备、隔离、清理是否明确（缺失 → P1）
- mock / stub / real dependency 边界是否清晰（缺失 → P1）
- 观测方式是否足以判定结果（缺失 → P1）
- API Contract 验证所需的调用方式、测试数据与漂移判定信号是否明确（缺失 → P1）
- 是否把环境直接写成阶段替代物，导致“某环境不可得”就被误判为“当前阶段失败”（是 → P1）
- 是否说明同一阶段允许存在多个可接受环境，只要满足该阶段的验证能力（缺失 → P2）
- 开发内建验证前置条件是否显式记录（缺失 → P2）

---

### Phase 4：Gate 4 - 入口/出口与自动化治理

**目标**：确认策略能作为下游设计和后续门禁基线。

**检查项**：
- 入口标准是否可判定（缺失 → P1）
- 出口标准是否可判定（缺失 → P1）
- 是否将批准 API Contract 的 in-scope 验证点完成与无漂移判定纳入出口（缺失 → P1）
- 是否区分了“当前阶段出口”与“后续阶段环境级门禁出口”（未区分 → P1）
- 缺陷分级与豁免规则是否明确（缺失 → P1）
- 自动化优先级与回归策略是否和风险匹配（失衡 → P2）

---

### Phase 5：输出审查报告

按 `references/report-templates.md` 输出：

- **不通过**：输出审查报告，列出 P0/P1/P2 与证据
- **通过**：输出准出证书，作为 `test-spec-writer` 的测试基线

## 交互规范

- 基线不明确时，向用户确认，不允许自行假定“最新版本”
- 文档缺失导致无法判断时，标记为 `待澄清`，不要强行下结论
- 只有当风险证据清晰时，才能定性为 P0/P1
- 覆盖/追溯争议时，以 `trace-lint` 与 `trace-build-rtm --format json` 输出为主证据

## 禁止行为

- 禁止直接重写测试策略代替评审
- 禁止把“没写详细 case”误判为策略缺陷
- 禁止脱离 PRD/API/HLD 自行创造风险
- 禁止无证据给出阻塞结论

## 使用示例

```text
/test-strategy-reviewer ./docs/Test-Strategy-用户认证.md ./docs/PRD-用户认证.md ./docs/API-Contract-用户认证.md ./docs/HLD-用户认证.md
```

## 触发词

- 审查测试策略
- 评审测试策略
- test strategy review
- 测试策略评审

## 参考文档

- `references/review-checklist.md`：分 Gate 检查清单
- `references/report-templates.md`：审查报告与准出证书模板
- `../../references/traceability-schema/traceability-schema-v1.md`：traceability canonical schema
- `../../references/traceability-schema/trace-lint-contract-v1.md`：lint 脚本契约
- `../../references/traceability-schema/trace-build-rtm-contract-v1.md`：RTM 聚合脚本契约
