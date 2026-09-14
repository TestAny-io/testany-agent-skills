---
name: brd-interviewer
description: 'BRD interview, 业务需求访谈。Use when: 需要将模糊的业务想法梳理成 BRD、"帮我梳理业务需求"、"老板说要做 XXX"、"这个需求不太清楚"、"写 BRD"。'
---

# BRD Interviewer - 业务需求梳理

执行前读取 [工作流执行约定](../../references/workflow-execution.md)：先读取用户材料，从本次安装位置定位资源，按真实工具能力工作。

## 触发范围

用于把业务想法梳理成 BRD、访谈业务需求或整理已有业务材料。仅修改已有文档片段时，只处理指定片段，不重启全套访谈。不用于替代 API/HLD/LLD 设计或业务批准。

## 必守约束

- 保留原始意图，BRD 聚焦 WHAT/WHY、目标用户、范围、成功定义、依赖与约束。
- 已知事实直接引用；不确定信息标记假设，不代替用户决定或批准。
- 访谈每轮最多 2-3 个关键问题；尊重用户指定的检查点。
- 先按 [访谈模式与事实标准](../../references/interview-modes.md) 选择 `interview` / `synthesis` / `gap_followup`。量化不是所有任务的硬门禁；实测、估算、测量计划、离散验收分别记录。
- 默认跟随用户语言，显式语言要求优先。字段名、枚举、ID 与 comment markers 保持英文，见 [语言规则](../../references/language-policy.md)。

## 最小工作流

1. 读取指定材料、原始目标和已有批准依据；不因文件名或标签认定批准。
2. 判断本次需要局部编辑、访谈或材料整理；不要向用户重复索取已有内容。
3. 资料充分就直接整理；仅有局部歧义就只问缺口。需要访谈时，按 [访谈问题库](references/interview-question-bank.md) 的相关阶段补全，不从头照读每个问题。
4. 生成文档时按用户语言读取 [中文模板](assets/brd-template.md) 或 [英文模板](assets/brd-template.en.md)。使用用户已指定的路径；没有路径时选工作区内合理默认并说明。
5. 检查范围、成功定义、依赖和假设。缺少历史数值仍可交付明确标注的草稿；不猜数字、不按假设数量阻塞。只要求草稿就保持草稿，正式批准必须有对应版本/范围的真实依据。
6. 返回实际文件、来源、未决项和交付状态，不主动进入实施或发布。

## 按需资源

| 情况 | 资源 |
|---|---|
| 需要具体问题、分支或当前准出清单 | [访谈问题库](references/interview-question-bank.md) |
| 需要问题组织方法 | [访谈框架](references/interview-framework.md) |
| 需要沟通技巧 | [顾问风格](references/consultant-persona.md) |
| 涉及行业特有需求 | [Fintech](references/industries/fintech.md)、[Healthcare](references/industries/healthcare.md)、[B2B SaaS](references/industries/b2b-saas.md)、[Retail](references/industries/retail-ecommerce.md)、[Manufacturing](references/industries/manufacturing.md)，只读相关分支 |

技术建议可保留到附录并注明待评估，不从技术名称推导用户未给的业务阈值。接口契约、架构及实现细节分别留给 API/HLD/LLD 职责。

## 使用示例

- “老板想做会员体系，但目标还不清楚”：先访谈关键业务缺口。
- “根据这份会议记录整理 BRD”：先读取记录，复用已知事实，不重新问全部问题。
- “只改 BRD 的产品名”：局部修改并检查差异，不加载行业问卷、不重开准出。
