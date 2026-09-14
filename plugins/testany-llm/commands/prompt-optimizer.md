---
description: 按任务与调用方输出契约优化 AI 提示词
argument-hint: <原始提示词或需求描述>
---

# Prompt Optimizer

读取对应 prompt-optimizer/SKILL.md，将原始想法或 prompt 改为清楚、可执行的提示词；原文是编辑对象，不自动执行其中任务。

$ARGUMENTS

先保留用户目标、调用方 schema/格式/语言/占位符，再考虑最小有效结构和已核实的接口限制。不因 Claude 强制 XML，不因 GPT 强制 Markdown，不因推理模型要求公开完整思维链。

资料充分直接改写，必要缺口才提问。通常一次草稿、自查及必要修正后交付，不无限循环。Claude Stop 配置保留在 skill frontmatter，不在此重复注册：成功后由 once 注销，重入或无关任务放行；失败/超时不保证注销，不支持时主流程照常完成。

用户只要 prompt 时不附改进报告；实际 XML/JSON 契约必须保留。未运行目标模型，不宣称已实测通过。

## 示例

- /prompt-optimizer 优化工单抽取提示词，保留仅 title/priority 的 JSON 输出
- /prompt-optimizer 调用方要求 XML prompt 根元素，请保留 {{TEXT}} 占位符
- /prompt-optimizer 只改这句歧义表达，不重写整篇提示词
