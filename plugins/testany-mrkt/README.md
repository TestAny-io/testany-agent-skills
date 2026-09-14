# testany-mrkt

多平台内容创作 plugin，提供 `media-writer` 与 `/testany-mrkt:media-writer`。支持微信公众号、知乎、小红书、LinkedIn、Medium、Reddit。

## 执行方式

- `end_to_end`：要求写完文章时连续完成必要写作与编辑，不在每个内部阶段重复询问。
- `checkpointed`：仅在用户指定检查点停下；明确要求逐阶段确认时才逐阶段停。
- `single_stage`：只做 Brief、角度分析或某项审校，不自动扩展为完整文章流程。

已提供材料和选择直接复用；对具体提案的“可以”按上下文理解，不要求固定批准口令。没有独立 agent 时可顺序写作与自检，不声称独立评审。用户指定短稿字数优先于通用长文建议。

## 交付边界

写作默认交付本地稿件，不代表发布、发送、付费生成图片或归档移动的授权。配图与归档仅在请求包含时执行，仍须满足相应范围。无法支持的个人经历、业绩或数字不编造，标明待确认并完成独立部分。

详细规则见 [SKILL](skills/media-writer/SKILL.md)、[执行约定](skills/media-writer/references/execution-modes.md) 和 [执行手册](skills/media-writer/references/orchestrator-manual.md)。所有资源从实际安装位置定位；用户指定的产物路径优先于默认 `workflow/` 示例。

例：`/testany-mrkt:media-writer 用给定 Brief 连续写完微信和知乎两版短稿，不发布`；若只需检查点，明确“先做 Brief 给我确认”。

当前 B2 修改在源码工作区中，尚未发布或更新安装缓存。
