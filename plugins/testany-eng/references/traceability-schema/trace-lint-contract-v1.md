# trace-lint v1 输入输出契约

命令中的 `TESTANY_ENG_ROOT` 须先按 [资源定位约定](../workflow-execution.md) 从实际加载位置确定，不是预置环境变量；工件路径则指向产品工作区。

## 1. 目标

`trace-lint` 是 `testany-eng` traceability metadata 的基础校验器。  
它的职责不是生成 RTM，也不是计算测试覆盖率；它只负责：

- 提取文档中的 traceability metadata block
- 校验结构、profile、引用和基础一致性
- 输出稳定、可脚本消费的 lint 结果

当前脚本已实现于：

```bash
python3 "$TESTANY_ENG_ROOT/scripts/trace_lint.py"
```

`prd-reviewer` 和后续 reviewer skill 应直接调用该脚本，而不是仅做人工等价检查。

## 2. 支持的输入

v1 支持两类输入：

### 2.1 Markdown Artifact

带有如下边界标记的 Markdown 文档：

````markdown
<!-- TRACEABILITY-METADATA:BEGIN -->
```yaml
...
```
<!-- TRACEABILITY-METADATA:END -->
````

### 2.2 Standalone YAML

单独保存的 YAML 文件，内容直接为 traceability metadata 对象。

## 3. 调用模型

推荐命令形态：

```bash
trace-lint <path...> [--format text|json] [--profile <profile>] [--strict]
```

仓库内当前脚本路径：

```bash
python3 "$TESTANY_ENG_ROOT/scripts/trace_lint.py" <path...>
```

### 3.1 Quick Start

校验一个 PRD Markdown 文档：

```bash
python3 "$TESTANY_ENG_ROOT/scripts/trace_lint.py" docs/PRD-checkout.md
```

输出机器可读 JSON：

```bash
python3 "$TESTANY_ENG_ROOT/scripts/trace_lint.py" --format json docs/PRD-checkout.md
```

在 reviewer / CI 中启用严格模式：

```bash
python3 "$TESTANY_ENG_ROOT/scripts/trace_lint.py" --strict docs/PRD-checkout.md
```

校验示例 profile：

```bash
python3 "$TESTANY_ENG_ROOT/scripts/trace_lint.py" \
  "$TESTANY_ENG_ROOT/references/traceability-schema/prd-profile-v1.example.yaml"
```

### 3.2 参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `<path...>` | 是 | 一个或多个 Markdown/YAML 文件路径 |
| `--format` | 否 | 输出格式，默认 `text` |
| `--profile` | 否 | 强制要求匹配的 profile；不传时使用文档内声明 |
| `--strict` | 否 | 将 warning 升级为 blocking failure 的严格模式 |

v1 不要求支持复杂目录扫描、远程 URL、自动修复。

### 3.3 退出码速查

| 退出码 | 含义 |
|--------|------|
| `0` | 无 blocking issue |
| `1` | 存在 blocking issue；或 strict 模式下存在 warning |
| `2` | 调用方式错误、输入文件不存在、系统异常 |

## 4. 提取规则

### 4.1 Markdown 提取

- 必须先定位 `TRACEABILITY-METADATA:BEGIN/END`
- 两个标记必须成对出现
- 标记之间必须只有一个 YAML fenced code block
- 只解析标记之间的 YAML，不解析正文自由文本

### 4.2 YAML 解析

- 必须能被标准 YAML 解析器成功解析
- 解析后顶层必须是 object/map
- 不允许顶层是数组或标量

## 5. 规范化后的内部输入模型

无论原始输入是 Markdown 还是 YAML，`trace-lint` 内部都应规范化成：

```yaml
input:
  path: /abs/path/to/file.md
  kind: markdown
  extracted: true
  metadata:
    schema: ...
    artifact: ...
    entities: ...
    relations: ...
    waivers: ...
```

## 6. 校验阶段

`trace-lint` v1 必须按以下顺序执行：

### 6.1 提取校验

- metadata block 是否存在
- 边界标记是否成对
- YAML fenced code block 是否存在且唯一
- YAML 是否可解析

### 6.2 Envelope 校验

- 是否存在顶层字段：
  - `schema`
  - `artifact`
  - `entities`
  - `relations`
  - `waivers`
- `schema.name` 是否等于 `testany-traceability`
- `schema.version` 是否存在
- `schema.profile` 是否存在

### 6.3 Artifact 校验

- `artifact.id` 是否存在且符合 ID 规则
- `artifact.type` 是否存在且是合法枚举
- `artifact.title` 是否存在
- `artifact.status` 是否存在且是合法枚举
- `artifact.created_at` / `artifact.updated_at` 是否存在且为 `YYYY-MM-DD`
- `artifact.source_documents` 如存在，必须为字符串数组

### 6.4 Entities 校验

- `entities` 中已启用的桶必须存在
- 同一文档内实体 ID 不得重复
- 每个实体必须满足：
  - `id`
  - `title`
  - `statement`
  - `status`
  - `scope`
- `source_refs` 如存在，必须是对象数组

### 6.5 Relations 校验

- `relations` 必须是数组
- 同一文档内 `REL-*` 不得重复
- 每条 relation 必须包含：
  - `id`
  - `type`
  - `from`
  - `to`
- `from` 必须引用当前文档中已声明的本地实体 ID
- `to` 可以引用：
  - 当前 metadata 中已声明的本地实体 ID
  - `artifact.source_documents` 中声明的文档 ID
  - 合法的外部对象 ID（例如 `REQ-*`、`RISK-*`），其跨文档存在性由 `trace-build-rtm` 解析
- `verifies` 仅允许 `CASE-*` 作为 `from`

### 6.6 Waiver 校验

- `waivers` 必须是数组
- 生效 waiver 需要：
  - `status=approved`
  - `approved_by`
  - `approved_at`
- `target_ids` 必须引用已声明对象 ID

### 6.7 Profile 校验

如果文档声明 `prd-profile-v1`，必须额外检查：

- `artifact.type` 必须等于 `PRD`
- `entities.requirements` 必须存在且至少 1 条
- 以下桶必须存在，即使为空数组：
  - `requirements`
  - `risks`
  - `must_not_regress`
  - `external_behaviors`
  - `decisions`
  - `flows`
  - `test_cases`
- 每条 requirement 必须包含：
  - `id`
  - `class`
  - `title`
  - `statement`
  - `priority`
  - `status`
  - `scope`
  - `acceptance_criteria`
- `class` 只允许：
  - `functional`
  - `non_functional`
- `priority` 只允许：
  - `P0`
  - `P1`
  - `P2`
  - `P3`
- `acceptance_criteria` 必须是非空字符串数组

如果文档声明 `journey-profile-v1`，必须额外检查：

- `artifact.type` 必须等于 `USER_JOURNEY`
- `artifact.id` 必须使用 `JOURNEY-` 前缀
- `artifact.source_documents` 至少包含 1 个 `BRD-*` baseline ID
- 以下桶必须存在，即使为空数组：
  - `requirements`
  - `risks`
  - `must_not_regress`
  - `external_behaviors`
  - `decisions`
  - `flows`
  - `test_cases`
- `entities.flows` 必须存在且至少 1 条
- 每条 flow 必须包含：
  - `id`
  - `title`
  - `statement`
  - `status`
  - `scope`
  - `kind`
  - `priority`
- `kind` 只允许：
  - `user_journey`
- 每条 `FLOW-*` 至少应有 1 条 outgoing relation：
  - `derived_from`
  - `refines`
  - 或 `depends_on`

## 7. 问题分级

`trace-lint` v1 使用三档严重度：

| 严重度 | 含义 | 默认是否阻塞 |
|--------|------|--------------|
| `error` | 结构或语义错误 | 是 |
| `warning` | 不完整或高风险但可解析 | 否 |
| `info` | 补充提示 | 否 |

在 `--strict` 模式下，`warning` 也应导致非零退出。

## 8. 问题编码

建议使用稳定问题码，便于 reviewer 和未来 CI 规则引用：

| Code | 严重度 | 含义 |
|------|--------|------|
| `TRACE001` | error | metadata block 缺失 |
| `TRACE002` | error | metadata block 边界标记不合法 |
| `TRACE003` | error | YAML 解析失败 |
| `TRACE101` | error | 顶层 envelope 缺字段 |
| `TRACE102` | error | `schema.name` 非法 |
| `TRACE103` | error | `schema.profile` 缺失 |
| `TRACE201` | error | `artifact` 必填字段缺失 |
| `TRACE202` | error | `artifact.type` 非法 |
| `TRACE203` | error | 日期格式非法 |
| `TRACE301` | error | 实体 ID 重复 |
| `TRACE302` | error | 实体缺必填字段 |
| `TRACE303` | warning | 实体缺 `source_refs` |
| `TRACE401` | error | relation 缺字段 |
| `TRACE402` | error | relation 引用不存在 |
| `TRACE403` | error | relation 类型/方向非法 |
| `TRACE404` | info | relation.to 为外部对象引用，等待 trace-build-rtm 解析 |
| `TRACE405` | warning | relation.status 非标准 |
| `TRACE501` | error | waiver 引用不存在 |
| `TRACE502` | warning | waiver 未批准或已过期 |
| `TRACE601` | error | profile 不匹配 |
| `TRACE602` | error | `prd-profile-v1` requirement 缺字段 |
| `TRACE608` | error | `journey-profile-v1` 缺字段、缺 baseline、缺 flow relation 或 flow 结构非法 |

## 9. 输出格式

### 9.1 Text 输出

默认输出面向终端和 reviewer：

```text
TRACE-LINT RESULT: FAIL
Artifact: PRD-CHECKOUT-001 (PRD)
Profile: prd-profile-v1
Path: /abs/path/to/PRD-checkout.md

Errors: 2
Warnings: 1
Infos: 0

[ERROR] TRACE302 entities.requirements[1].acceptance_criteria
Requirement REQ-CHECKOUT-002 缺少 acceptance_criteria。
Suggestion: 补齐至少 1 条可测试的 acceptance criteria。

[WARNING] TRACE303 entities.requirements[0].source_refs
Requirement REQ-CHECKOUT-001 未声明 source_refs。
Suggestion: 标注来源文档和章节。
```

### 9.2 JSON 输出

`--format json` 时输出稳定 JSON 对象：

```json
{
  "tool": "trace-lint",
  "version": "1.0.0",
  "status": "fail",
  "strict": false,
  "artifacts": [
    {
      "path": "/abs/path/to/PRD-checkout.md",
      "artifact_id": "PRD-CHECKOUT-001",
      "artifact_type": "PRD",
      "profile": "prd-profile-v1",
      "result": "fail",
      "summary": {
        "errors": 2,
        "warnings": 1,
        "infos": 0
      },
      "issues": [
        {
          "severity": "error",
          "code": "TRACE302",
          "path": "entities.requirements[1].acceptance_criteria",
          "message": "Requirement REQ-CHECKOUT-002 缺少 acceptance_criteria。",
          "suggestion": "补齐至少 1 条可测试的 acceptance criteria。"
        }
      ]
    }
  ],
  "summary": {
    "artifacts": 1,
    "passed": 0,
    "failed": 1,
    "warnings": 1,
    "errors": 2
  }
}
```

## 10. 与 PRD writer/reviewer 的对接要求

### 11.1 `prd-writer`

- 新写或重写的 PRD 必须产出符合 `prd-profile-v1` 的 metadata block
- writer 生成的 requirement 必须同步生成稳定 `REQ-*`
- requirement 对上游 BRD / Journey 的来源必须尽量使用 `derived_from` 标注

### 11.2 `prd-reviewer`

- reviewer 必须把 `trace-lint` 视为 PRD 准出前的强制门禁
- 脚本已实现，应实际执行；工具/依赖不可用时记录 `evidence_gap`，不得以人工检查冒充脚本通过。
- metadata block 缺失、损坏、profile 不匹配、`REQ-*` 结构非法须定位并记录；必要追溯条件未满足不得准出。区分实际工件缺陷和证据不可得，按影响分级，不将工具级别机械映射为产品 `P0`。独立正文检查仍可继续。

## 11. v1 边界

`trace-lint` v1 只做：

- 单文档 metadata 提取
- 单文档结构校验
- 单文档内引用校验

它不做：

- RTM 汇总构建
- 跨文件深度追溯图分析
- 覆盖率计算
- 自动修复
- 需求文本和正文段落的语义一致性推理
