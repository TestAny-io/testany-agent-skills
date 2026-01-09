# Orchestrator 规则

## 核心规则

### 1. 隔离执行规则

**每个阶段必须通过 Task tool 启动独立的 subagent**

```
正确：
Task → Writer subagent (隔离上下文)
Task → Reviewer subagent (隔离上下文)

错误：
直接在主线程执行写作/审查逻辑
```

**原因**：
- 避免上下文污染
- 每轮审查都是"新鲜"视角
- 防止 Writer 和 Reviewer 逻辑互相干扰

### 2. 状态传递规则

**所有状态必须通过文件传递，不能依赖对话上下文**

| 状态 | 文件 |
|------|------|
| PRD 内容 | workflow/prd.md |
| 审查结果 | workflow/review-report.md |
| 流程状态 | workflow/status.md |

**原因**：
- Subagent 之间无法共享上下文
- 文件是持久化的，可追溯
- 即使中断也能恢复

### 3. 迭代控制规则

**最多 3 轮迭代**

```
轮次 1: Write → Review → (有问题) → Fix
轮次 2: Review → (有问题) → Fix
轮次 3: Review → (有问题) → 停止，输出遗留问题
```

**原因**：
- 防止无限循环
- 3 轮通常足够解决大部分问题
- 超过 3 轮说明需求本身可能有问题，需人工介入

### 4. 准出判定规则

| 条件 | 结果 |
|------|------|
| P0 = 0 且 P1 < 2 | 准出通过 |
| P0 > 0 | 阻塞，需修改 |
| P1 >= 2 | 阻塞，需修改 |
| 迭代 >= 3 且仍有问题 | 停止，输出遗留问题 |

### 5. 错误处理规则

**Subagent 执行失败时**：

1. 记录错误信息到 workflow/status.md
2. 输出错误信息给用户
3. 询问是否重试或终止

**常见错误**：
- 文件读取失败 → 检查路径
- Subagent 超时 → 重试一次
- 输出格式错误 → 解析 subagent 输出，提取关键信息

---

## Subagent Prompt 模板

### Writer Subagent

```
你是 PRD Writer。

## 输入
- 需求描述：{requirement}
- PRD 类型：{prd_type}

## 任务
1. 读取 skills/prd-writer/SKILL.md 学习写作规范
2. 读取对应的 PRD 模板
3. 根据需求撰写 PRD
4. 保存到 workflow/prd.md

## 输出
完成后输出：[WRITER-COMPLETE] PRD 已保存
```

### Reviewer Subagent

```
你是 PRD Reviewer。

## 输入
- PRD 文件：workflow/prd.md
- 审查轮次：第 {round} 轮

## 任务
1. 读取 skills/prd-reviewer/SKILL.md 学习审查规范
2. 读取 workflow/prd.md
3. 按 8 维度审查
4. 保存审查报告到 workflow/review-report.md

## 输出
完成后输出：[REVIEWER-COMPLETE] 审查报告已保存
```

### Fixer Subagent

```
你是 PRD Fixer。

## 输入
- PRD 文件：workflow/prd.md
- 审查报告：workflow/review-report.md
- 修改轮次：第 {round} 轮

## 任务
1. 读取 PRD 和审查报告
2. 理解每个问题的具体位置和修改建议
3. 逐一修改问题
4. 保存修改后的 PRD 到 workflow/prd.md

## 输出
完成后输出：[FIXER-COMPLETE] PRD 已修改
```

---

## 进度输出格式

每个阶段开始和结束时输出：

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[PRD Studio] Phase 2: Writer Subagent
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

正在启动 Writer subagent...
- 需求：用户积分系统
- 类型：新功能（有 UI）

[等待 subagent 完成...]

✓ Writer 完成
  - PRD 已保存：workflow/prd.md
  - 进入下一阶段：Reviewer

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## 完成输出格式

### 准出通过

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ PRD Studio 完成 - 准出通过
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PRD 文件：workflow/prd.md
迭代轮次：2 轮
最终评审：P0=0, P1=1, P2=3

PRD 已准出，可进入 HLD 阶段。
建议使用 /hld-writer 继续。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 有遗留问题

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ PRD Studio 完成 - 有遗留问题
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PRD 文件：workflow/prd.md
迭代轮次：3 轮（已达上限）
最终评审：P0=1, P1=2, P2=3

遗留问题：
- [P0] 成功指标缺少数据来源
- [P1] 验收标准不够具体
- [P1] 边界情况未覆盖

建议人工处理后使用 /prd-reviewer 单独审查。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```
