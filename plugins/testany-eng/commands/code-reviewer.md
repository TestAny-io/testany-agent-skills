---
description: Code review, 源码实现评审。基于冻结范围和精确 Candidate 做 Lead Dev Code Review
argument-hint: <仓库路径> [base SHA] [Candidate SHA 或 WORKTREE] [批准基线路径] [exact prior terminal artifact]
---

# Code Reviewer

以 `${CLAUDE_PLUGIN_ROOT}/skills/code-reviewer/SKILL.md` 及其直接引用的
`review-policy.yaml`、Scope Lock、checklist、report templates 和 subagent
result extension 为唯一规则源执行 Code Review；不要在 command 层复制、删减或
改写另一套评审状态机。把以下参数作为仓库、base/Candidate、批准基线与 prior
terminal inputs 传入：

$ARGUMENTS

本命令只做源码实现评审，不替代 API/HLD/LLD/Test/Runbook Review，也不授予
push、merge、CI 触发或部署权限。
