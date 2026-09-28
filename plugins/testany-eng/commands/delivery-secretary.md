---
description: Delivery secretary，交付秘书。持续维护目标、依赖、原始承诺和进度，主动向已授权角色核实状态
argument-hint: "[项目或台账路径] [目标/进度问题] [可选：角色绑定与协调授权]"
---

# Delivery Secretary

读取 `${CLAUDE_PLUGIN_ROOT}/skills/delivery-secretary/SKILL.md` 并按其条件读取台账与协作参考；以 skill 为唯一行为规则源，不在 command 中复制另一套状态机。参数作为项目、既有台账、用户问题及角色授权上下文传入：

$ARGUMENTS

只进行本次授权的记录维护与协调，不替代工程判断或新增交付门禁。角色身份、发送权限、工具可用性及后续自动唤醒必须按实际情况核实。
