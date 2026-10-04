---
description: 源码实现、排障、测试与整改交接，保留长期工程恢复位置
argument-hint: <仓库路径或工程请求> [批准基线] [已登记 workflow entry]
---

# Code Writer

以 `${CLAUDE_PLUGIN_ROOT}/skills/code-writer/SKILL.md` 为入口，完成当前授权范围内的实现和验证。

首次先取得 skill 规则与小入口；不要把工程状态/历史全文读取排进加载 skill 的同一批工具调用。随后用同包恢复工具取得当前任务字段。

$ARGUMENTS

按当前任务选择已有工程记录；长任务恢复规则和公共脚本随同一插件发布。不要把作者自测当成独立评审，也不要把源码通过当成发布或部署许可。
