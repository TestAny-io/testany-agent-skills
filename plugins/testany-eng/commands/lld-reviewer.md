---
description: LLD review, 正式详细设计或批准边界内有限工程修复评审
argument-hint: <LLD 或修复说明> [已有批准基线/ADR] [原 finding ID]
---

# LLD Reviewer

执行前读取 [工作流执行约定](../references/workflow-execution.md)：先取证再提问、按实际工具能力回退，并从本次安装位置定位资源。

读取并遵循 `../skills/lld-reviewer/SKILL.md` 及其按模式要求的参考资料。以该 skill 为唯一规则源，不在命令层复制准出阈值。

## 使用方式

评审输入：

$ARGUMENTS

先识别 `formal_design` 或 `bounded_change`。已批准职责内的 SQL/事务/重试等修复默认 LLD；真实职责、信任或常态依赖变化只分流该增量，不因跨仓重启全量 HLD。分别报告技术结论与范围授权，P2 不阻断；设计评审不授予外部执行许可。
