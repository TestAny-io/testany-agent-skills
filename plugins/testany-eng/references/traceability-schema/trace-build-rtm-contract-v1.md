# trace-build-rtm v1 输入输出契约

命令中的 `TESTANY_ENG_ROOT` 须先按 [资源定位约定](../workflow-execution.md) 从实际加载位置确定，不是预置环境变量；工件路径则指向产品工作区。

## 1. 目标

`trace-build-rtm` 用于把多个 traceability metadata 文档聚合成一份全局 RTM。

它负责：

- 先调用 `trace-lint` 校验所有输入
- 聚合多个 artifact 的实体和关系
- 解析跨文档对象引用
- 输出 Requirements / Risks / Must-not-regress / External Behaviors / Test Cases 的矩阵
- 报告 unresolved external target、duplicate ID、orphan entity

它不负责：

- 自动修复 metadata
- 替代测试门禁判断
- 计算代码覆盖率

## 2. 脚本位置

```bash
python3 "$TESTANY_ENG_ROOT/scripts/trace_build_rtm.py"
```

## 3. 调用模型

推荐命令形态：

```bash
trace-build-rtm <path...> [--format markdown|json] [--strict]
```

### 3.1 Quick Start

聚合一组 PRD / Test Strategy / Test Spec 文档：

```bash
python3 "$TESTANY_ENG_ROOT/scripts/trace_build_rtm.py" \
  docs/PRD-checkout.md \
  docs/Test-Strategy-checkout.md \
  docs/Test-Spec-checkout.md
```

输出机器可读 JSON：

```bash
python3 "$TESTANY_ENG_ROOT/scripts/trace_build_rtm.py" \
  --format json \
  docs/PRD-checkout.md \
  docs/Test-Strategy-checkout.md \
  docs/Test-Spec-checkout.md
```

在 CI / reviewer 场景中启用严格模式：

```bash
python3 "$TESTANY_ENG_ROOT/scripts/trace_build_rtm.py" \
  --strict \
  --format json \
  docs/PRD-checkout.md \
  docs/Test-Strategy-checkout.md \
  docs/Test-Spec-checkout.md
```

### 3.2 参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `<path...>` | 是 | 一个或多个 Markdown/YAML 文件路径 |
| `--format` | 否 | 输出格式，默认 `markdown` |
| `--strict` | 否 | 将输入文档中的 `trace-lint warning` 也视为 blocking failure |

### 3.3 退出码速查

| 退出码 | 含义 |
|--------|------|
| `0` | lint 通过，且 RTM 聚合阶段无 build error |
| `1` | lint 失败，或 RTM 聚合阶段发现 build error |
| `2` | 调用方式错误、输入文件不存在、系统异常 |

## 4. 构建阶段

### 4.1 Lint Gate

所有输入必须先通过 `trace-lint`：

- 非 strict 模式下：
  - `error` 阻塞
  - `warning` 允许继续
  - `info` 允许继续
- strict 模式下：
  - `warning` 也阻塞

### 4.2 聚合模型

输入通过 lint 后，`trace-build-rtm` 聚合：

- `artifacts`
- `entities`
- `relations`
- `waivers`

并构建：

- 全局实体索引
- 全局关系索引
- incoming / outgoing relation map
- active waiver map

## 5. 外部对象解析规则

`trace-lint` 允许 `relation.to` 指向合法的外部对象 ID，例如：

- `REQ-*`
- `RISK-*`
- `MR-*`
- `BEH-*`

`trace-build-rtm` 在聚合阶段负责解析这些外部对象引用：

- 如果能在输入集合中找到对应对象：视为解析成功
- 如果找不到：记为 `unresolved_relation_targets`，并导致 build fail

文档 ID（如 `BRD-*`、`PRD-*`、`TSTRAT-*`）不是 build error，即使它们未加载进本次聚合输入。

## 6. Build Issue 分类

建议使用以下稳定问题码：

| Code | 严重度 | 含义 |
|------|--------|------|
| `RTM001` | error | artifact ID 重复 |
| `RTM002` | error | entity ID 重复 |
| `RTM003` | error | unresolved external entity target |
| `RTM004` | error | relation.from 在全局聚合后仍无法解析 |
| `RTM101` | warning | orphan entity |

## 7. 输出内容

### 7.1 Markdown 输出

默认输出：

- 概览 summary
- 输入 artifact 清单
- Requirements Matrix
- Risks Matrix
- Must-not-regress Matrix
- External Behaviors Matrix
- Test Cases Matrix
- Uncovered lists
- Build Issues
- Lint Notes

### 7.2 JSON 输出

`--format json` 时输出稳定 JSON：

```json
{
  "tool": "trace-build-rtm",
  "version": "1.0.0",
  "status": "pass",
  "strict": false,
  "lint": {
    "status": "pass",
    "reports": [],
    "summary": {}
  },
  "build": {
    "issues": [],
    "artifacts": [],
    "entities": {},
    "relations": [],
    "waivers": [],
    "matrices": {
      "requirements": [],
      "risks": [],
      "must_not_regress": [],
      "external_behaviors": [],
      "test_cases": []
    },
    "test_case_links": [],
    "unresolved_relation_targets": [],
    "orphan_entities": [],
    "summary": {}
  }
}
```

## 8. Coverage 语义

`trace-build-rtm` 会输出覆盖状态，但它本身不是 release gate。

v1 中：

- Requirement:
  - `covered` = 有 `CASE -> REQ` verifies，或有 active waiver
  - `uncovered` = 没有 verifies 且没有 waiver
- Risk:
  - `covered` = 有 `verifies` 或 `mitigates`，或有 active waiver
- Must-not-regress / External Behavior:
  - `covered` = 有 `verifies`，或有 active waiver

注意：

- `uncovered` 会进入 summary 和 missing list
- 但 `uncovered` 本身不是 build error
- 是否阻塞准出，由 reviewer / gate 决定

## 9. 与 reviewer / 后续工具的配合

- `prd-reviewer` 仍只负责单文档 PRD 审查，直接调用 `trace-lint`
- `test-reviewer` 后续可直接消费 `trace-build-rtm --format json` 的输出
- `trace-check-coverage` 如后续实现，可复用 `trace-build-rtm` 的聚合结果
