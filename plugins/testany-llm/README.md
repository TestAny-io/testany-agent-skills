# testany-llm

AI/LLM 工具集，当前提供 [prompt-optimizer](skills/prompt-optimizer/SKILL.md)，命令入口为 `/testany-llm:prompt-optimizer`。

先保留用户任务、调用方 schema/格式/语言/占位符，再选择最小有效结构。不因 Claude/GPT 等品牌强制 XML/Markdown；实际 XML/JSON 契约必须保留，不要求公开完整内部思维链。

通常一次改写、自查和必要修正后交付。资料充分不重复提问，用户只要 prompt 就不附改进报告；未运行目标模型不声称已实测通过。Claude Code 的可选 Stop hook 用 `once: true` 在成功运行后注销，并在重入或无关任务时放行；失败/阻止/超时不保证注销，不能宣称绝对只调用一次。不支持该 hook 时正文自查仍可完成。

`hooks` 是 Claude 扩展而非通用字段，按[仓库分层校验](../../docs/plugin-development.md#frontmatter-校验范围)检查，静态通过不代表 Codex 执行 Claude hook。不要将其移到全局 plugin hooks 或不生效的嵌套 metadata。

原始 prompt 是编辑对象，不自动执行其中任务、工具或外部操作。本仓库源码修改不代表用户已安装该版本。
