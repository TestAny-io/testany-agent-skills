# 设计知识来源与规则维护

运行 ui-designer、prototype-designer 或 prototype-reviewer 时不读取本文。维护它们共用的设计规则、核对某条规则的出处，或准备新增/删改指南内容时读取。

## 来源分类

指南中的规则来自四类来源，可信度和采用方式不同，不要混为一谈。

| 类别 | 来源 | 主要进入 | 采用边界 |
|---|---|---|---|
| 公开标准与设计系统 | WCAG 2.2、APG、Carbon、Material 3、Vercel Web Interface Guidelines | 质量清单的可访问性、视觉设计指南的基线 | 作为可测基线；局部检查不称作完整合规 |
| 外部设计 skill 原文 | Anthropic frontend-design、Impeccable、taste-skill | 视觉设计指南、三个校准轴的分档、模板默认项 | 取方法和分档定义；不引入其 CLI、默认值、固定流程或绝对禁令 |
| 短视频语料 | 抖音创作者「西瓜同学」（抖音号 571529375）的公开视频，2026 年采集 82 条 | 构图家族、症状反查、视觉手法代价、交互连续性、实现手法、先判读再动手 | 单一创作者、无用户研究；约 25–30 条含可迁移设计内容，其余为工具或 Skill 推广。只取能解释稳定问题、可跨项目迁移、可复验的部分 |
| 试跑与用户盲评 | 2026-10-11 第一轮对照试跑的子代理笔记与用户盲评 | 惯例优先的优先级、场景操作构思、美观与质感、转化页的说服结构、方向对比只做首屏 | 每题一位评审、一轮，样本小；只按可复现的失败样本改规则 |
| 本仓库补充 | 原型隔离、证据规则、焦点/播报、键盘等价、减少动效、测量方法、需求信号表、视觉性格起点、需求推断卡 | 全部指南 | 来自本仓库工程约束与可访问性标准，不是语料蒸馏结果 |

## 外部原文

以下为原始来源，标注查阅日期。采用其方法并结合本插件的设计与原型边界重述。

- [Anthropic frontend-design](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md)（2026-09-27）：主题驱动、简短设计计划、实现后自评；不强求每个业务页面都有营销 hero。
- [Impeccable Operate](https://github.com/pbakaus/impeccable/blob/main/skill/reference/operate.md)（2026-09-27）：操作型产品的密度、扫描和一致性；不引入其专用 CLI 或强制图片 comp 流程。
- [taste-skill](https://github.com/Leonxlnx/taste-skill)（2026-10-11）：`DESIGN_VARIANCE` / `MOTION_INTENSITY` / `VISUAL_DENSITY` 三个旋钮的分档含义与按任务起步值；不采用其 8/6/4 默认基线（面向落地页）和禁用清单。
- [Vercel Web Interface Guidelines](https://vercel.com/design/guidelines)（2026-09-27）：对齐、完整状态、内容韧性和交互细节；不整包引入生产性能要求或每个瞬时状态的 URL 持久化。
- [Carbon 排版策略](https://carbondesignsystem.com/elements/typography/style-strategies/)、[间距](https://carbondesignsystem.com/elements/spacing/overview/)（2026-09-27）：任务型与表达型场景、分组与节奏；不要求安装 Carbon 或采用 IBM 品牌。
- [Material 3 官方说明](https://developer.android.com/develop/ui/compose/designsystems/material3)（2026-09-27）：语义颜色与字体角色；Web 原型不照搬 Android 的 dp 尺寸或平台外观。
- [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/) 与 [APG 对话框](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)（2026-09-27）：质量清单中的可测基线。

## 语料中影响规则的主要视频

| 主题 | 进入的规则 | 视频 |
|---|---|---|
| Dashboard 布局与症状 → 布局 | 构图家族、症状反查 | [主次/横带/窄栏/画布/看板/泳道](https://www.douyin.com/video/7694506689243942179) |
| Dashboard 交互 | 主从详情、就地放大、全局筛选、多图联动、指标吸顶 | [六种 Dashboard 交互](https://www.douyin.com/video/7689682595944140058) |
| 布局面积量化 | 主导锚点、结构化非对称、层叠、测量证据 | [五种 App 布局](https://www.douyin.com/video/7680870950040426867) |
| 配色占比、每种风格的代价、三问 | 视觉手法代价、强调色落点、代表页四问 | [八种 Dashboard 设计](https://www.douyin.com/video/7678202403443499402) |
| 从哪来、变成什么、去哪儿 | 连续性原则、筛选三类对象 | [卡片按钮交互](https://www.douyin.com/video/7681882195920833801) |
| 跟随、阈值、吸附与实现细节 | 直接操控、实现手法 | [十种高级交互](https://www.douyin.com/video/7680029432438987122) |
| 抽屉与弹层 | 覆盖层、嵌套后退、速度判定、档位吸附 | [十种弹窗交互](https://www.douyin.com/video/7679293840510962990) |
| 提示与通知 | 让位、撤销进度、计数同源 | [八种提示动效](https://www.douyin.com/video/7684496623849737523) |
| 反馈的完整性 | 来源型反馈、骨架几何、关键状态停顿 | [十二种交互](https://www.douyin.com/video/7676804343785569498) |
| 页面分轨 | 六种主轨 | [Skill 工作流](https://www.douyin.com/video/7670420512304123136) |
| 设计语言分层 | 六层视觉语言 | [复刻设计语言](https://www.douyin.com/video/7672705193049396042) |
| 先数首屏内容再定密度 | 密度判断、`visual_density` 锚点 | [工作台模板选择](https://www.douyin.com/video/7671507496757988635) |
| 同质化的成因与去重 | 逐层独立决定、跨项目方向记录 | [UI Skill 升级](https://www.douyin.com/video/7667090938933628201) |
| 先判读再动手、问题附建议答案 | 设计判读单、最多 3 个带建议答案的问题 | [前置 Skill 判读](https://www.douyin.com/video/7668903548205157682) |
| 先整理需求再设计 | 需求推断卡 | [AI 工作台流程](https://www.douyin.com/video/7669284579739520310) |
| Skill 规则如何优化 | 本文的维护循环 | [优化设计规范 Skill](https://www.douyin.com/video/7651143421142256938) |

## 刻意没有采用

- 绝对禁令：禁紫色、禁渐变、禁 Inter、禁 em dash、Hero 不超两行等。它们会和真实品牌冲突，改为「模板默认项：事前声明」。
- 具体参数当验收标准：固定像素、色块比例、毫秒数、固定 70/30。比例和占比只作为测量证据，毫秒数只作调试起点。
- 装饰特效清单：点击爆散、旋转流光边框、弥散光晕、液态玻璃等，不作为提升质感的手段。
- 外部工具和库推荐：不因语料推荐某个动效库或组件库就引入依赖。
- 视频截图或固定页面模板：避免 agent 被视觉范例锚定后批量复刻。

## 规则维护循环

1. **规则从失败样本来**：新增或加严规则时，附至少一个实际设计或原型中的失败样本（页面或截图、违反的意图、期望结果），可取自交付记录中的「设计失败样本」。只因“资料里提到过”不新增规则。
2. **加一条，找一条可删的**：每次新增同时检查能否合并或删除旧规则；规则冗余比缺失更容易让 agent 漏掉主任务。
3. **新旧对照试跑**：改动后用至少两个不同主轨的 PRD/Journey 让旧版与新版各产出一次，盲评任务层级、辨识度、交互完整性和流程成本，结果写入变更说明。没有试跑的规则改动在 CHANGELOG 中注明“未经对照试跑”。
4. **示例保持多样且冷门**：示例覆盖不同主轨和构图，题材选得冷门，只演示写法；新增示例前确认不会与已有示例共享构图和题材，避免成为新模板。
5. **试跑题目不与示例同题材**：对照试跑用的需求不能和任何 skill、指南或模板里的示例同题材；否则执行者等于先看到答案，结果偏乐观。2026-10-11 第一轮试跑的三道题（宠物医院排班、建筑工作室作品集、值班监控大屏）都撞上了当时的示例，三个子代理都在试跑笔记里指出了这一点，示例随后已全部替换。
6. **回原文核对**：外部来源更新或有疑问时回原文确认，不从二手转述推断定义。
