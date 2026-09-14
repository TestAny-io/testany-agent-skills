# AskUserQuestion 模板

以下模板仅用于读取相关材料后仍存在的真实缺口。已明确的基线、模式、格式或范围直接复用；问题须引用具体冲突，不要求先确认后读取。工具名称为示例，无对应工具可用普通文本。

本文档定义 prototype-reviewer 审查过程中需要向用户确认的问题模板。

---

## 审查输入确认

**触发时机**：阶段零 - 用户未在启动命令中提供完整路径时

```yaml
question: "请提供原型审查所需的文档路径"
header: "审查输入"
multiSelect: false
options:
  - label: "提供所有路径"
    description: "沙箱目录、PRD、User Journey、交付摘要的路径"
  - label: "从 Manifest 中读取"
    description: "已有 _prototype-manifest.md，从中提取 PRD 和 Journey 路径"
  - label: "部分文档缺失"
    description: "说明缺失项（上游对齐无法准出，但工程隔离继续）"
```

**处理路径**：
| 情况 | 严重度 | 处理 |
|------|--------|------|
| 所有路径可访问 | — | 继续审查 |
| 从 Manifest 读取成功 | — | 继续审查 |
| PRD 或 Journey 缺失 | evidence_gap | 上游对齐待补，工程隔离继续 |
| 交付摘要未提供 | evidence_gap | 仅限制依赖它的结论；专项检查不强制补做 Gate 4，不自动生成 P1 |

---

## 沙箱外变更归属确认

**触发时机**：阶段三 Gate 3.2 - 检测到沙箱外变更文件且不在交付摘要受控例外中

```yaml
question: "检测到以下沙箱外文件变更，请确认与本次 prototype 的关系"
header: "变更归属"
multiSelect: false
options:
  - label: "早于 prototype 的无关改动"
    description: "该文件变更与本次原型无关，排除"
  - label: "本次 prototype 产生的改动（未经批准）"
    description: "该变更不应存在（将判定为 P0 越界）"
  - label: "本次 prototype 产生的改动（Phase 2.1 已批准但未记录到交付摘要）"
    description: "属于受控例外，但交付摘要中遗漏了记录（将进入例外确认流程）"
  - label: "无法判断"
    description: "建议提供 prototype 起始 commit 或先 stash 无关改动后重审"
```

> **动态生成**：每个沙箱外变更文件单独生成一组选项。文件数量多时，可按目录分组、分批确认。

**处理路径**：
| 用户选择 | 处理 |
|---------|------|
| 早于 prototype 的无关改动 | 排除，不计入隔离问题 |
| 本次 prototype 产生（未经批准） | **P0**（未授权越界） |
| 本次 prototype 产生（已批准但未记录） | 进入「未记录的受控例外确认」流程 |
| 无法判断 | 记录为「待澄清」，建议提供 `--baseline <commit>` 后重审 |

---

## 未记录的受控例外确认

**触发时机**：阶段三 Gate 3.2 - 用户确认沙箱外变更是本次 prototype 产生的，声称在 Phase 2.1 已批准但交付摘要中未记录

```yaml
question: "请确认该变更是否满足受控例外条件"
header: "例外验证"
multiSelect: false
options:
  - label: "满足：仅新增一行 prototype-only 路由入口，未修改已有路由"
    description: "将执行 git diff 验证三条件；通过 → P1（记录缺失），不通过 → P0"
  - label: "不满足上述条件"
    description: "该变更超出受控例外范围（将判定为 P0）"
  - label: "需要查看具体 diff"
    description: "展示该文件的 git diff 后再判断"
```

**验证流程**：
1. 用户选择"满足"后，Reviewer 执行 `git diff <文件路径>` 验证三条件：
   - (1) 仅新增一行
   - (2) 新增内容为 prototype-only 路由入口
   - (3) 未修改已有路由
2. 三条件全部满足 → **P1**（受控例外合法，但交付摘要记录缺失）
3. 任一条件不满足 → **P0**（变更超出受控例外范围）

---

## 隔离例外二次确认

**触发时机**：阶段三 Gate 3.3 - 交付摘要中记录了受控例外，但 Reviewer 验证三条件时证据不充分

```yaml
question: "交付摘要记录了以下受控例外，但验证时证据不充分，请确认"
header: "例外确认"
multiSelect: false
options:
  - label: "确认为受控例外"
    description: "该变更在 Phase 2.1 中已批准，仅新增 prototype-only 路由入口"
  - label: "非受控例外"
    description: "该变更不应存在（将判定为 P0）"
  - label: "需要查看具体 diff"
    description: "展示该文件的 git diff 后再判断"
```
