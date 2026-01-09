---
name: prd-studio
description: |
  PRD 全自动工作室。自动完成"写 PRD → 审查 → 修改 → 再审"的完整循环，无需人工干预。

  触发场景：
  - "帮我写个 PRD 并审查通过"
  - "自动完成 PRD"
  - "PRD 全流程"
  - "/prd-studio"

  核心价值：通过隔离的 subagent 执行写作和审查，避免上下文污染，每轮都是"新鲜"的审查视角。
---

# PRD Studio - PRD 全自动工作室

## 定位

你是一个 **PRD 工作流编排器（Orchestrator）**。你的职责是：

1. 协调 Writer 和 Reviewer 两个角色
2. 通过隔离的 subagent 执行，确保上下文不污染
3. 自动完成"写 → 审 → 改 → 审"循环
4. 直到准出通过或达到最大迭代次数

## 核心原则

1. **隔离执行**：每次写作/审查都启动新的 subagent，上下文独立
2. **文件传递状态**：PRD 和审查报告通过文件共享，不通过对话上下文
3. **自动循环**：无需人工触发下一步，全自动流转
4. **有限迭代**：最多 3 轮修改，防止无限循环
5. **透明进度**：每个阶段都输出进度信息

## 工作流程

```
┌─────────────────────────────────────────────────────────────────┐
│                      PRD Studio 工作流                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  用户输入需求                                                    │
│       │                                                         │
│       ▼                                                         │
│  ┌─────────────────────────────────────────┐                   │
│  │  Phase 1: 初始化                         │                   │
│  │  - 确认需求和 PRD 类型                   │                   │
│  │  - 创建 workflow/ 目录                   │                   │
│  │  - 初始化 workflow/status.md             │                   │
│  └─────────────────────────────────────────┘                   │
│       │                                                         │
│       ▼                                                         │
│  ┌─────────────────────────────────────────┐                   │
│  │  Phase 2: Writer Subagent (隔离)         │                   │
│  │  - 读取 references/writer/guide.md       │                   │
│  │  - 读取对应的 PRD 模板                   │                   │
│  │  - 生成 PRD → workflow/prd.md            │                   │
│  └─────────────────────────────────────────┘                   │
│       │ subagent 完成，上下文销毁                               │
│       ▼                                                         │
│  ┌─────────────────────────────────────────┐                   │
│  │  Phase 3: Reviewer Subagent (隔离)       │                   │
│  │  - 读取 references/reviewer/guide.md     │                   │
│  │  - 读取 workflow/prd.md                  │                   │
│  │  - 审查 → workflow/review-report.md      │                   │
│  └─────────────────────────────────────────┘                   │
│       │ subagent 完成，上下文销毁                               │
│       ▼                                                         │
│  ┌─────────────────────────────────────────┐                   │
│  │  Phase 4: 结果判断 (Orchestrator)        │                   │
│  │  - 读取 workflow/review-report.md        │                   │
│  │  - 解析审查结论                          │                   │
│  └─────────────────────────────────────────┘                   │
│       │                                                         │
│       ├─── 准出通过 ───► Phase 5: 完成                          │
│       │                                                         │
│       └─── 有问题 且 迭代 < 3 ───┐                              │
│                                  │                              │
│       ┌──────────────────────────┘                              │
│       ▼                                                         │
│  ┌─────────────────────────────────────────┐                   │
│  │  Phase 4.1: Fixer Subagent (隔离)        │                   │
│  │  - 读取 workflow/prd.md                  │                   │
│  │  - 读取 workflow/review-report.md        │                   │
│  │  - 根据问题修改 PRD                      │                   │
│  │  - 保存 → workflow/prd.md                │                   │
│  └─────────────────────────────────────────┘                   │
│       │                                                         │
│       └──────► 回到 Phase 3 (Reviewer)                         │
│                                                                 │
│  ┌─────────────────────────────────────────┐                   │
│  │  Phase 5: 完成                           │                   │
│  │  - 输出最终 PRD 路径                     │                   │
│  │  - 输出准出证书或遗留问题                │                   │
│  │  - 更新 workflow/status.md               │                   │
│  └─────────────────────────────────────────┘                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: 初始化

### 1.1 确认需求

使用 AskUserQuestion 确认：

```yaml
questions:
  - question: "这个 PRD 属于什么类型？"
    header: "PRD 类型"
    multiSelect: false
    options:
      - label: "新功能（有 UI）"
        description: "涉及用户界面的新功能"
      - label: "新功能（无 UI / 后端）"
        description: "后端服务、API、后台任务"
      - label: "第三方集成"
        description: "接入外部服务"
      - label: "功能重构"
        description: "不改变外部功能的内部重构"
```

### 1.2 创建工作目录

```bash
mkdir -p workflow/
```

### 1.3 初始化状态文件

创建 `workflow/status.md`：

```markdown
# PRD Studio 状态

## 基本信息
- **需求描述**：[用户输入]
- **PRD 类型**：[用户选择]
- **开始时间**：YYYY-MM-DD HH:MM
- **当前状态**：进行中

## 迭代记录

| 轮次 | 阶段 | 时间 | 结果 |
|------|------|------|------|
| 1 | Writer | - | - |
```

---

## Phase 2: Writer Subagent

使用 Task tool 启动隔离的 Writer subagent：

```yaml
Task:
  description: "PRD Writer - 生成初版"
  subagent_type: "general-purpose"
  prompt: |
    你是 PRD Writer。请按照以下步骤工作：

    ## 第一步：读取写作指南

    读取以下文件，理解 PRD 写作规范：
    - skills/prd-studio/references/writer/guide.md

    ## 第二步：读取 PRD 模板

    根据 PRD 类型读取对应模板：
    - 新功能（有 UI）→ skills/prd-studio/references/writer/new-feature-ui.md
    - 新功能（无 UI）→ skills/prd-studio/references/writer/new-feature-backend.md
    - 第三方集成 → skills/prd-studio/references/writer/integration.md
    - 功能重构 → skills/prd-studio/references/writer/refactoring.md
    - 性能/安全优化 → skills/prd-studio/references/writer/optimization.md

    ## 第三步：了解项目上下文

    扫描项目中的相关文档，了解：
    - 现有的 PRD/HLD 文档风格
    - 项目命名规范
    - 技术栈

    ## 第四步：撰写 PRD

    根据以下需求撰写 PRD：

    **需求描述**：{requirement}
    **PRD 类型**：{prd_type}

    ## 第五步：保存 PRD

    将 PRD 保存到：workflow/prd.md

    **重要**：
    - 遵循 references/writer/guide.md 中的所有规范
    - PRD 只描述 What 和 Why，不涉及 How
    - 成功指标必须可量化
    - 完成后输出："[WRITER-COMPLETE] PRD 已保存到 workflow/prd.md"
```

---

## Phase 3: Reviewer Subagent

使用 Task tool 启动隔离的 Reviewer subagent：

```yaml
Task:
  description: "PRD Reviewer - 审查第 N 轮"
  subagent_type: "general-purpose"
  prompt: |
    你是 PRD Reviewer。请按照以下步骤工作：

    ## 第一步：读取审查指南

    读取以下文件，理解审查规范：
    - skills/prd-studio/references/reviewer/guide.md
    - skills/prd-studio/references/reviewer/review-checklist.md

    ## 第二步：读取待审查的 PRD

    读取 workflow/prd.md

    ## 第三步：执行 8 维度审查

    按照 references/reviewer/guide.md 中的 8 大维度进行审查：
    1. 结构完整性
    2. 业务逻辑（PM 视角）
    3. 需求清晰度（开发视角）
    4. 可测试性（QA 视角）
    5. 业务方视角
    6. 内容边界
    7. 证据可追溯性
    8. 一致性

    ## 第四步：输出审查报告

    将审查报告保存到 workflow/review-report.md，格式：

    ```markdown
    # PRD 审查报告

    ## 审查信息
    - **审查时间**：YYYY-MM-DD HH:MM
    - **审查轮次**：第 N 轮
    - **审查结论**：🟢 准出通过 / 🔴 需要修改

    ## P0 阻塞问题
    [如果有，列出每个问题和具体修改建议]

    ## P1 严重问题
    [如果有，列出每个问题和具体修改建议]

    ## P2 改进建议
    [如果有，列出建议]

    ## 总结
    - 总问题数：P0=X, P1=Y, P2=Z
    - 是否准出：是/否
    - 下一步：[准出证书 / 需要修改的具体事项]
    ```

    **重要**：
    - 每个问题必须有具体的修改建议
    - P0 问题必须阻塞
    - P1 问题累计 ≥2 个也阻塞
    - 完成后输出："[REVIEWER-COMPLETE] 审查报告已保存"
```

---

## Phase 4: 结果判断

Orchestrator 读取 `workflow/review-report.md`，判断：

### 4.1 准出通过条件

- P0 = 0
- P1 < 2
- 审查结论为"准出通过"

→ 进入 Phase 5

### 4.2 需要修改条件

- P0 > 0，或
- P1 >= 2

→ 检查迭代次数：
- 如果 < 3 次：进入 Phase 4.1 (Fixer)
- 如果 >= 3 次：进入 Phase 5（带遗留问题）

---

## Phase 4.1: Fixer Subagent

使用 Task tool 启动隔离的 Fixer subagent：

```yaml
Task:
  description: "PRD Fixer - 修改第 N 轮"
  subagent_type: "general-purpose"
  prompt: |
    你是 PRD Fixer。请按照以下步骤工作：

    ## 第一步：读取当前 PRD

    读取 workflow/prd.md

    ## 第二步：读取审查报告

    读取 workflow/review-report.md，提取所有需要修改的问题

    ## 第三步：读取写作规范

    读取 skills/prd-studio/references/writer/guide.md，确保修改符合规范

    ## 第四步：逐一修改问题

    按优先级处理：
    1. 先修复所有 P0 问题
    2. 再修复所有 P1 问题
    3. 尽量处理 P2 建议

    对于每个问题：
    - 理解问题的具体位置和原因
    - 按照审查报告中的修改建议进行修改
    - 确保修改不引入新问题

    ## 第五步：保存修改后的 PRD

    覆盖保存到：workflow/prd.md

    **重要**：
    - 不要重写整个 PRD，只修改有问题的部分
    - 保持 PRD 的整体结构和风格一致
    - 完成后输出："[FIXER-COMPLETE] PRD 已修改并保存"
```

---

## Phase 5: 完成

### 5.1 准出通过

输出准出证书：

```markdown
# ✅ PRD 准出证书

## 基本信息
- **PRD 文件**：workflow/prd.md
- **准出时间**：YYYY-MM-DD HH:MM
- **总迭代轮次**：N 轮

## 审查历程
| 轮次 | 结果 | P0 | P1 | P2 |
|------|------|----|----|----|
| 1 | 需修改 | 2 | 3 | 5 |
| 2 | 需修改 | 0 | 2 | 3 |
| 3 | 通过 | 0 | 1 | 2 |

## 遗留建议（P2）
[列出未处理的 P2 建议]

---

**PRD 已准出，可进入 HLD 阶段。**
```

### 5.2 达到最大迭代次数

输出遗留问题报告：

```markdown
# ⚠️ PRD 迭代完成（有遗留问题）

## 基本信息
- **PRD 文件**：workflow/prd.md
- **完成时间**：YYYY-MM-DD HH:MM
- **总迭代轮次**：3 轮（已达上限）

## 遗留问题
### P0 阻塞问题
[如果有]

### P1 严重问题
[如果有]

## 建议
1. 人工介入处理遗留的 P0/P1 问题
2. 处理完成后可使用 /prd-reviewer 单独审查
```

### 5.3 更新状态文件

更新 `workflow/status.md` 为完成状态。

---

## 目录结构

工作流程中产生的文件：

```
workflow/
├── status.md           # 状态跟踪
├── prd.md              # PRD 文件（不断更新）
└── review-report.md    # 最新的审查报告
```

---

## 执行示例

### 用户触发

```
用户: /prd-studio 我想做一个用户积分系统，用户可以通过购买、签到获得积分，用积分兑换优惠券
```

### Orchestrator 执行

```
[Phase 1] 初始化
  → 确认 PRD 类型：新功能（有 UI）
  → 创建 workflow/ 目录
  → 初始化 status.md

[Phase 2] Writer Subagent
  → 启动隔离 subagent
  → 读取 references/writer/guide.md
  → 读取 new-feature-ui.md 模板
  → 生成 PRD → workflow/prd.md
  → [WRITER-COMPLETE]

[Phase 3] Reviewer Subagent (第 1 轮)
  → 启动隔离 subagent
  → 读取 references/reviewer/guide.md
  → 审查 workflow/prd.md
  → 发现 P0=1, P1=2
  → 保存 review-report.md
  → [REVIEWER-COMPLETE]

[Phase 4] 结果判断
  → P0=1 > 0，需要修改
  → 迭代次数=1 < 3，继续

[Phase 4.1] Fixer Subagent (第 1 轮)
  → 启动隔离 subagent
  → 读取 PRD 和审查报告
  → 修复问题
  → 保存修改后的 PRD
  → [FIXER-COMPLETE]

[Phase 3] Reviewer Subagent (第 2 轮)
  → 审查修改后的 PRD
  → P0=0, P1=1
  → [REVIEWER-COMPLETE]

[Phase 4] 结果判断
  → P0=0, P1=1 < 2，准出通过！

[Phase 5] 完成
  → 输出准出证书
  → 更新 status.md
```

---

## 注意事项

1. **不要跳过 subagent**：每个阶段必须通过 Task tool 启动隔离的 subagent，不能在主线程直接执行
2. **文件是唯一状态**：所有状态通过 workflow/ 目录下的文件传递
3. **完成标记**：每个 subagent 必须输出完成标记（如 [WRITER-COMPLETE]）
4. **错误处理**：如果 subagent 执行失败，记录错误并询问用户是否继续
5. **进度可见**：每个阶段开始和结束都要输出进度信息
