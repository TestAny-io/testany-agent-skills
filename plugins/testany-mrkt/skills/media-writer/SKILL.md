---
name: media-writer
description: 'Social media writing, content creation, 自媒体写作。Use when: 需要写微信公众号/知乎/小红书/LinkedIn/Medium/Reddit 文章、单阶段选题或稿件润色。'
---

# Media Writer - 自媒体写作工作流

作为内容生产的协调者，按用户请求完成必要创作、事实核验与编辑，不把八阶段目录当作每次必经的审批链。

## 先确定执行模式

执行前读取 [写作执行与授权约定](references/execution-modes.md)，所有阶段均遵循它。

| 模式 | 使用场景 | 完成条件 |
|------|----------|----------|
| `end_to_end` | 写完文章、连续完成必要编辑 | 交付成稿或明确事实缺口的草稿，不逐阶段泛问 |
| `checkpointed` | 逐阶段确认或指定检查点 | 在用户指定检查点停下，不提前写后续产物 |
| `single_stage` | 只做选题、Brief、角度分析、审校等 | 完成该项即结束，不扩展任务 |

已明确的模式、主题、平台、立场、材料及输出路径直接复用。对具体提案回复“可以”按上下文识别授权，不索要固定口令；不把称赞或沉默解释为扩大范围。先读已有材料，只问确有影响的缺口。

## 阶段与资源

按实际需要读取对应 prompt，不能凭角色名称假装已执行。路径相对本次安装的 SKILL 文件，不相对产品仓库。

| Stage | 职责 | 输入 | 产物 | Prompt |
|-------|------|------|------|--------|
| 1 | Topic Scout | 用户想法或既有 Brief | 明确主题、受众、立场、素材需求 | `references/prompts/01-topic-scout.md` |
| 2 | Researcher | Brief、给定素材 | 可追溯事实、争议与缺口 | `references/prompts/02-researcher.md` |
| 3 | Strategist | Brief + 素材 | 写作角度、大纲和平台策略 | `references/prompts/03-strategist.md` |
| 4 | Writers | 已选角度、平台、素材 | 平台草稿 | `references/prompts/04-writer-{platform}.md` |
| 5 | Selector | 多篇候选草稿 | 选择理由与候选稿 | `references/prompts/05-selector.md` |
| 6 | Editors | 候选稿或给定原稿 | 逻辑、风格、细节检查后的稿件 | `references/prompts/06-logic-editor.md`、`06-style-editor.md`、`06-detail-editor.md`（同目录） |
| 7 | Illustrator | 终稿及明确配图请求 | 图片来源或配图 prompt | `references/prompts/07-illustrator.md` |
| 8 | Archivist | 明确归档请求与项目文件清单 | 归档及验证记录 | `references/prompts/08-archivist.md` |

Stage 1-3 的输入已齐备可直接复用，不强制重选题或重新询问平台。只有一篇已选草稿不需要人为生成多稿再筛选。Stage 6 在完整成稿时按逻辑→风格→细节检查，不等于三次审批。用户只要求单项审校时仅做所请求维度。

Stage 7/8 仅在请求包含时适用。纯文本文章不要求配图或归档，更不执行发布、发送或付费生成。归档不得移动无关文件；具体边界见执行约定与手册。

## 调度与工具回退

- 多平台分别生成适配稿件；有实际且获准的独立 agent 能力时可并行，否则顺序完成。不得因没有 `Task` 而停止，也不得虚构并行、独立审查或固定倍数加速。
- 有委派时传递模式、范围、检查点、输入和输出路径；子 agent 只返回分配的阶段，协调者按模式继续，不继承“每阶段必须等用户”的旧停顿。
- 文件读取、提问、任务追踪和检索采用当前真实可用能力。`Read`、`TodoWrite`、`AskUserQuestion` 等只是名称示例。

## 平台与作者材料

写作前读取目标平台 `references/platforms/{platform}-guide.md` 以及作者风格材料：

- `references/persona/my-voice.md`
- `references/persona/my-values.md`
- `references/persona/my-audience.md`

平台标识：`wechat`、`zhihu`、`xiaohongshu`、`linkedin`、`medium`、`reddit`。作者人设和示例只指导风格，不证明作者有某种经历、测量结果或业绩；具体事实以获准材料为准。用户明确的字数、受众和立场优先于通用长文建议。

## 交付与自检

1. 保存到用户指定路径；没有指定时可用 `workflow/06-finals/{platform}-{topic}-{YYYYMMDD}-final.md` 等默认命名。中间文件按检查点、恢复工作和实际需求保存，不强制复制完整目录链。
2. 实际读取交付文件，检查请求范围、字数、平台适配、事实来源、逻辑、风格和细节。未经支持的个人经历或数字删除或标为待确认，不以编造内容补齐“硬数据数量”。
3. 简明报告文件与检查结果；缺事实则交付含待确认项的草稿，缺工具则披露未执行项。同一执行者的自检不标成独立评审。
4. `end_to_end` 完成后结束；`single_stage` 不做下一阶段；`checkpointed` 在指定点报告并等待。写作完成不代表已发布。

## 使用示例

- “用给定 Brief 和素材写完一篇微信文章，保存 article.md，不发布”：`end_to_end`，复用材料并完成必要编辑。
- “先只完成 Stage 1，Brief 给我确认再继续”：在 Brief 检查点停止，不提前写正文。
- “只审校这篇稿件的逻辑，不改作者立场”：`single_stage`，仅交付逻辑审校。
- “微信和知乎各写一版，连续完成”：按两平台分别写作；没有独立 agent 时顺序完成并如实自检。

详细操作见 [执行手册](references/orchestrator-manual.md)。触发词包括“写文章”“写公众号”“写知乎”“自媒体文章”“内容创作”“/media-writer”。
