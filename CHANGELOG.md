# Changelog

本文件记录 Testany Agent Skills 的所有重要变更。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [2.4.0] - 2026-01-22

### 新增

- **runbook-writer**：运维手册（Runbook）编写协调器
  - Controller 提取上下文 → Writer subagent → Spec reviewer → Quality reviewer
  - 双阶段审查：Spec compliance（覆盖率）→ Quality（可执行性）
  - Context 隔离：Subagent 获得新鲜上下文，避免假设污染
  - 证据驱动：所有约束必须来自上游文档（PRD/HLD/LLD/Guardrails）
  - 完整模板：部署、回滚、监控、故障处理、值班手册
- **testany-eng command**：新增 `/runbook-writer` 命令

### 变更

- **testany-eng README**：技能列表新增 runbook-writer
- **仓库 README**：命令列表新增 `/testany-eng:runbook-writer`

---

## [2.3.0] - 2026-01-18

### 新增

- **guardrails-writer**：项目级工程规范编写
  - 覆盖前端/后端/API/数据/安全/运维/发布
  - Must/Should/Nice 分级与验证方式
  - LLD 模块要求与例外流程
- **guardrails-reviewer**：工程规范审查门禁
  - 元信息与范围 → 覆盖性 → 可执行性 → 一致性
  - 严格准出：P0=0, P1=0, P2≤2
- **testany-eng command**：新增 `/guardrails-writer` 与 `/guardrails-reviewer`

### 变更

- **testany-eng README**：工作流程图、决策树、技能列表新增 guardrails
- **仓库 README**：新增 guardrails 命令与描述

---

## [2.2.0] - 2026-01-18

### 新增

- **api-reviewer**：API 契约评审门禁
  - 四道门：基线与覆盖 → 协议完整性 → 漂移/冲突 → 兼容性/演进
  - 严格准出：P0=0, P1=0, P2≤2
  - 支持多协议 Contract Index
- **testany-eng command**：新增 `/api-reviewer` 命令

### 变更

- **testany-eng README**：工作流程图、决策树、技能列表新增 api-reviewer

---

## [2.1.0] - 2026-01-13

### 新增

- **uc-interviewer**：用户旅程访谈专家
  - 在 BRD 和 PRD 之间建立对齐检查点
  - 逐条 Journey 深挖：主流程 → 替代路径 → 异常处理 → 边界情况
  - 每个 Journey 用户确认后再进入下一个
  - 输出结构化 User Journey 文档，可直接喂给 prd-writer

- **api-writer**：API 契约撰写助手
  - 支持 9 种协议：HTTP/GraphQL/gRPC/Event/WebSocket/Webhook/SDK/File/IPC
  - 多协议时自动生成 Contract Index
  - PRD → Contract 100% 覆盖检查
  - 添加执行进度清单

- **testany-eng README**：新增完整的 plugin 文档
  - 工作流程图（Mermaid）
  - 决策树：帮助用户选择合适的 skill
  - 每个 skill 的详细说明

### 变更

- **工作流程调整**：`PRD → api-writer → API Contract → hld-writer → HLD`
  - hld-writer 现在依赖 api-writer 的输出
  - API Contract 是接口定义的唯一事实源

- **hld-writer**：
  - 新增核心原则："API Contract 是接口唯一事实源"
  - 输入改为 PRD + API Contract（两者都必需）
  - 接口部分改为引用 API Contract，不重新定义
  - 新增契约一致性检查

- **hld-reviewer**：
  - 门一需求覆盖表新增「非已覆盖说明」列
  - 明确填写规则：已覆盖填 `—`，其他状态必填说明
  - 优化 description 格式
  - 添加执行进度清单

- **prd-writer**：
  - 新增 User Journey 文档作为输入源
  - 添加阶段 0.9：处理 uc-interviewer 输出
  - Journey → PRD 映射规则

### 目录结构变更

- **删除** `/skills/` 根目录（按官方规范，skills 只放在 plugin 内）
- **移动** `/spec/` → `/plugins/testany-llm/skills/skill-creator/references/`
- 所有 skills 现在只存在于各自的 plugin 目录下

---

## [2.0.0] - 2026-01-09

### 重大变更

- **Plugin 架构重构**：从"每个 skill 一个 plugin"改为"按领域分组的 plugin"
  - **testany-eng**：研发流程工具集（6 个 skills）
  - **testany-llm**：AI/LLM 工具集（2 个 skills）
  - **testany-mrkt**：营销内容工具集（1 个 skill）

- **新增 Commands 支持**：所有 skills 现在都有对应的 command，支持 CLI `/` 补全
  - `/testany-eng:brd-interviewer` - 业务需求访谈
  - `/testany-eng:prd-writer` - 撰写 PRD
  - `/testany-eng:prd-reviewer` - 审查 PRD
  - `/testany-eng:prd-studio` - PRD 全自动工作室
  - `/testany-eng:hld-writer` - 撰写 HLD
  - `/testany-eng:hld-reviewer` - 审查 HLD
  - `/testany-llm:skill-creator` - 创建 Skill
  - `/testany-llm:prompt-optimizer` - 优化 Prompt
  - `/testany-mrkt:media-writer` - 自媒体创作

- **目录结构变更**：
  ```
  testany-agent-skills/
  ├── plugins/
  │   ├── testany-eng/      # 研发流程
  │   │   ├── commands/     # CLI 命令
  │   │   └── skills/       # 完整实现
  │   ├── testany-llm/      # AI/LLM 工具
  │   └── testany-mrkt/     # 营销内容
  └── skills/               # 旧目录（保留兼容）
  ```

### 迁移指南

用户需要重新安装 plugin：
```
/plugin marketplace remove testany-eng  # 或其他已安装的
/plugin marketplace add TestAny-io/testany-agent-skills
```

然后选择需要的 plugin（testany-eng / testany-llm / testany-mrkt）。

---

## [1.11.0] - 2026-01-09

### 新增

- **brd-interviewer Phase 1.5: 用户画像**
  - 新增「用户画像」强制收集阶段（位于 Phase 1 和 Phase 2 之间）
  - **目标用户识别**：
    - B2C 场景：用户类型、年龄段、使用频率、技术熟练度
    - B2B 场景：企业规模、行业、决策链角色、采购流程
  - **用户痛点来源验证**：
    - 6 种来源类型：客服反馈、用户调研、数据分析、竞品对比、内部判断、销售反馈
    - 每种来源有对应追问（投诉量？样本量？什么指标？）
  - **门禁规则**：
    - 至少明确一类目标用户
    - 用户痛点必须有来源（不能纯内部臆测）
    - "内部判断"作为唯一来源时标记为「假设：待用户验证」

- **prd-writer/prd-studio Phase 0.6: 业界实践调研**
  - 新增推荐步骤，使用 WebSearch 搜索业界解决方案
  - **搜索策略**：基于需求类型构造关键词，优先知名公司实践
  - **搜索关键词示例**：支付、认证、导出、通知、权限等常见场景
  - **输出格式**：业界实践参考表（来源、实践要点、与本需求关联）
  - **注意事项**：推荐而非强制，项目特定需求可跳过，避免过度设计

### 变更

- **prd-writer/prd-studio Phase 0.2: 相关系统询问**
  - 文档确认问题新增第 3 条：「本需求是否涉及其他系统/仓库？」
  - 追问内容：其他系统的 API 文档位置、跨系统交互文档、负责团队
  - 适用于微服务架构和多仓库项目

---

## [1.10.0] - 2026-01-09

### 新增

- **prd-studio** 技能：PRD 全自动工作室
  - 自动完成「写 PRD → 审查 → 修改 → 再审」的完整循环
  - **核心理念**：无需人工干预，全自动流转
  - **Orchestrator 模式**：复用 media-writer 验证的架构模式
  - **隔离执行**：
    - 每个阶段通过 Task tool 启动独立 subagent
    - Writer/Reviewer/Fixer 各自在隔离上下文中执行
    - 避免上下文污染，每轮审查都是"新鲜"视角
  - **文件传递状态**：
    - PRD 保存到 workflow/prd.md
    - 审查报告保存到 workflow/review-report.md
    - 状态跟踪保存到 workflow/status.md
  - **复用现有资源**：
    - Writer subagent 读取 prd-writer/SKILL.md 和模板
    - Reviewer subagent 读取 prd-reviewer/SKILL.md 和审查清单
  - **自动迭代**：
    - 最多 3 轮修改，防止无限循环
    - 准出条件：P0=0 且 P1<2
    - 达到上限后输出遗留问题报告
  - **完成输出**：
    - 准出通过 → 准出证书
    - 有遗留问题 → 遗留问题报告 + 人工处理建议

---

## [1.9.0] - 2026-01-08

### 新增

- **brd-interviewer** 技能：业务需求访谈专家（"麦肯锡级业务顾问的 AI 化"）
  - 通过结构化选择题访谈，将 stakeholder 的一句话想法转化为 BRD
  - **核心理念**：让 stakeholder 做选择题，而不是写作文
  - **使用 `context: fork`**：访谈在隔离上下文中执行，不污染主对话
  - **6 阶段访谈流程**：
    - Phase 0: 意图捕获（一句话原始想法）
    - Phase 0.5: 现状量化（强制）— 获取可量化的业务基线
    - Phase 1: 核心分类（目标类型、受影响人群、期望变化）
    - Phase 2: 成功定义（指标四要素：当前值、目标值、时间窗口、数据来源）
    - Phase 3: 范围与约束（In/Out、约束条件、风险容忍度）
    - Phase 4: 行业深挖（分支问题树，根据目标类型动态触发）
    - Phase 5: 依赖与假设（依赖条件、假设确认、终止条件）
    - Phase 6: 准出检查（门禁验证）
  - **顾问人设**：Principal Business Consultant，具备假设驱动、结构化拆解、逼出取舍、行业洞察、风险预判能力
  - **行业知识外挂**：支持 Fintech、Healthcare、B2B SaaS、零售电商、制造业
  - **BRD→PRD 可追溯**：输出的 BRD 预留映射表，供 prd-writer 后续追踪
  - **假设门禁**：假设数量 > 3 时阻塞，需补充访谈或调研
  - **强制量化机制**：
    - 成功指标四要素（当前值、目标值、时间窗口、数据来源）缺一不可
    - 业务痛点必须有量化基线，不接受纯定性描述
  - **边界守护机制**：
    - BRD 只说 WHAT 和 WHY，技术方案（HOW）属于 HLD
    - 越界信号识别（技术选型、架构设计、接口设计、数据模型、部署方案）
    - 温和引导话术，将技术建议记录到附录供 HLD 参考

---

## [1.8.0] - 2026-01-08

### 新增

- **hld-reviewer** 技能：HLD 审查专家（模拟真实 Design Review 会议）
  - 作为 HLD 的「准出门禁」，严格把关，迭代审查直到放行
  - **三道门审查框架**：
    - 第一道门：PRD↔HLD 一致性检查（P0 阻塞）— 检测漂移风险
    - 第二道门：核心技术审查（Tech Lead + Senior Engineer 视角）
    - 第三道门：风险驱动的角色增量审查（按需启用）
  - **PRD→HLD 漂移检测**（最高优先级）：
    - 需求遗漏检测（PRD 有，HLD 没有）
    - 需求膨胀检测（HLD 有，PRD 没有）
    - 需求曲解检测（语义偏离）
    - 边界漂移检测（范围变更）
  - **风险驱动的角色视角**：
    - Security 视角（敏感数据/认证场景）
    - DBA 视角（数据迁移/Schema 变更场景）
    - SRE/Performance 视角（高并发/性能敏感场景）
    - Architect 视角（跨团队/跨系统场景）
    - QA 视角（复杂测试场景）
  - **结构化输出**：Findings、Missing Info、Decision Gates、Optional Improvements
  - 问题分级：P0 阻塞、P1 严重、P2 建议
  - 输出审查报告和准出证书
  - 详细参考文档：漂移检测指南、审查清单、角色视角要点

### 变更

- **hld-writer PRD:HLD 1:N 场景支持**
  - 新增「PRD 拆分为多个 HLD」章节
  - **拆分决策指引**：何时拆分（3+ 模块、多团队、分阶段等）、按什么维度拆
  - **HLD 索引文档机制**：追踪所有 HLD 对 PRD 的覆盖情况，确保无遗漏
  - **PRD 需求覆盖总表**：覆盖率必须 100%，未覆盖需求 → P0
  - **跨 HLD 依赖声明**：依赖方 HLD、被依赖 HLD、接口契约位置
  - **单个 HLD 需求映射表**：支持部分覆盖，明确标注「不在本 HLD 范围内的需求」

- **hld-reviewer 1:N 场景审查支持**
  - 第一道门新增「1:N 场景识别」检查项
  - 索引文档不存在 → P0
  - PRD 需求覆盖率 < 100% → P0
  - 跨 HLD 依赖未声明 → P1
  - 跨 HLD 接口无契约 → P1

### 修复

- **Skill 目录结构规范化**（符合 Claude Code 官方规范）
  - `references/` 目录：仅放置指导思考的文档（被加载到上下文）
  - `assets/` 目录：放置输出模板（不被加载到上下文）
  - **prd-writer**: 5 个 PRD 模板从 `references/` 移至 `assets/`
  - **hld-writer**: 5 个 HLD 模板从 `references/` 移至 `assets/`
  - **media-writer**: 非标准目录 `templates/` 重命名为 `assets/`

---

## [1.7.0] - 2026-01-07

### 新增

- **media-writer** 技能：专业的自媒体内容创作工作流
  - 8 阶段工作流：选题（Topic Scout）→ 素材收集（Researcher）→ 角度分析（Strategist）→ 撰写草稿（Writers）→ 筛选候选稿（Selector）→ 三轮编辑（Editors）→ 配图方案（Illustrator）→ 归档（Archivist）
  - 支持 6 大平台：微信公众号、知乎、小红书、LinkedIn、Medium、Reddit
  - Orchestrator 模式：协调多 Agent 协作，确保流程完整性
  - 5 条铁律确保工作流一致性：禁止自动跳阶段、用户满意≠批准继续、强制保存验证、前置检查、状态追踪
  - 15 个专业 Agent Prompts（每个阶段/平台/编辑角色独立 prompt）
  - 6 份平台写作指南
  - 作者人设系统（写作风格、价值观、读者画像）
  - 快捷命令：`/new`、`/research`、`/angles`、`/draft`、`/select`、`/review`、`/illustrate`、`/archive`、`/status`

---

## [1.6.0] - 2026-01-07

### 新增

- **prd-reviewer** 技能：PRD 审查专家（"需求评审会议的 AI 化"）
  - 作为 PRD 的"准出门禁"，严格把关，迭代审查直到放行
  - 8 大审查维度：结构完整性、业务逻辑（PM视角）、需求清晰度（开发视角）、可测试性（QA视角）、业务方视角、内容边界、证据可追溯性、一致性
  - 问题分级：P0 阻塞、P1 严重、P2 建议
  - 输出审查报告和准出证书
  - 支持迭代审查直到通过

---

## [1.5.2] - 2026-01-07

### 变更

- **prd-writer 行为约束**（解决"参考文档读取不足"和"猜测"问题）
  - 新增核心原则「基于证据，不猜测」— 禁止凭空推测项目现状
  - **阶段零重构为"先扫描后确认"模式**：
    - 0.1 先扫描项目文档（只收集路径，不读取内容）
    - 0.2 通过 AskUserQuestion 让用户确认哪些文档需要读取，避免上下文爆炸和读入过时文档
    - 0.3 只读取用户确认的文档
  - **扫描优化**：排除 `node_modules/`, `.git/`, `dist/` 等目录；Agent 自动初筛，只展示高置信度结果给用户
  - 阶段零新增「上下文收集报告」强制输出
  - 「相关能力识别」表格新增「来源」列，强制注明从哪个文档/代码中识别
  - 「禁止行为」章节扩展，明确禁止猜测相关行为
  - 审查清单新增「证据检查」环节

- **hld-writer 行为约束**（同步 prd-writer 改进）
  - 新增核心原则「基于证据，不猜测」
  - **阶段零重构为"先扫描后确认"模式**（同 prd-writer）
  - **扫描优化**：排除噪音目录，Agent 自动初筛高置信度结果
  - 「禁止行为」章节扩展
  - 审查清单新增「证据检查」环节

### 修复

- **prd-writer/hld-writer 证据检查规则矛盾**
  - 修正「上下文收集报告是否已输出并获得用户确认」为「是否已输出」，消除与「报告无需确认」的冲突

- **hld-writer 复用盘点表格缺少来源列**
  - 所有 5 个 HLD 模板的「复用盘点」表格新增「来源」列，与 SKILL 中「必须注明来源」要求一致

- **prd-writer integration.md 缺少兼容性与发布要求**
  - 新增 7.4 兼容性要求、7.5 发布要求章节，与其他 PRD 模板保持一致

- **hld-writer API 重复维护风险**
  - new-feature-backend.md、new-feature-ui.md 的 API 设计章节新增「引用已有规范」指引
  - 接口列表表格新增「规范位置」列，支持引用已有 OpenAPI 规范路径

---

## [1.5.1] - 2026-01-07

### 变更

- **prd-writer 模板完善**（提升输出一致性和可追溯性）
  - 「相关能力识别」改为强制表格结构（已有能力、能力范围、与本需求匹配度、能力差距、建议方向）
  - 元信息新增「PRD 基线版本」和「最后同步日期」字段，便于 PRD→HLD 变更追溯
  - 所有 5 个模板同步新增「相关能力识别」「发布要求」章节
  - refactoring.md 和 optimization.md 补齐缺失章节

- **hld-writer 模板完善**
  - integration.md、refactoring.md、optimization.md 新增「埋点/监控设计（承接 PRD 成功指标）」章节

---

## [1.5.0] - 2026-01-07

### 变更

- **prd-writer 改进**（解决已有系统新增功能场景的漂移风险）
  - 新增「业务现状与变更」章节（现有流程、变更内容、影响范围）
  - 新增「相关能力识别」章节（识别已有能力，复用决策留给 HLD）
  - 新增「兼容性要求」和「发布要求」到非功能需求
  - 成功指标表格增加「数据来源」列（已有埋点/需新增/人工统计）
  - 阶段零增加「识别业务现状与相关能力」步骤
  - 审查清单增加业务现状与成功指标检查项

- **hld-writer 对应改进**（承接 PRD 新增要求）
  - 新增「技术现状与变更」章节（受影响组件、架构变更）
  - 新增「兼容性设计」章节（接口/数据兼容方案）
  - 新增「发布策略」章节（灰度/回滚/功能开关）
  - 新增「埋点/监控设计」章节（承接 PRD 成功指标）
  - HLD 应包含内容表格新增对应条目

---

## [1.4.2] - 2026-01-07

### 变更

- **hld-writer 模板改进**
  - 所有 5 个模板新增「复用盘点」章节，强制记录候选方案与评估结论
  - 数据设计章节改为「概念级」，移除字段类型/长度等 LLD 细节
  - 集成模板的数据映射章节标注为「跨系统契约」，区分于内部数据设计

---

## [1.4.1] - 2026-01-07

### 变更

- **hld-writer 改进**
  - 新增核心原则：技术栈对齐、复用优先、需求可追溯
  - 新增 PRD↔HLD 需求映射表为强制输出
  - 错误码/错误契约明确为 HLD 内容（跨团队契约）
  - 数据设计明确为策略级（非字段级）
  - API 契约明确为跨团队场景，优先引用已有 OpenAPI
  - 阶段零增加「识别可复用资源」和「查找技术规范」步骤
  - 审查清单增加映射表、复用、技术栈对齐检查项

### 修复

- 修复 5 个 HLD 模板的嵌套代码块问题（影响 Mermaid 图表渲染）
- 所有模板新增 PRD↔HLD 需求映射表章节

---

## [1.4.0] - 2026-01-07

### 新增

- **hld-writer** 技能：高层技术设计文档（HLD）写作助手
  - 承接 PRD，解决 How（架构级）决策
  - 聚焦高成本/跨团队/高风险决策，工程师仍可做局部选择
  - 明确 HLD vs LLD 边界：HLD 给策略，LLD 给参数和实现
  - 支持 5 种 HLD 类型：新功能（有UI/纯后端）、第三方集成、重构、优化
  - 包含 5 个专业模板

---

## [1.3.0] - 2026-01-06

### 新增

- **prompt-optimizer** 技能：AI 提示词优化专家
  - 支持 6 大平台语法级适配：Claude（XML）、ChatGPT（Markdown）、DeepSeek（CoT）、豆包、智谱 GLM、Gemini
  - 迭代式优化流程：多轮执行 4D 方法论，自我评判达标后才交付
  - 7 项自我评判清单：意图清晰、无歧义、信息完整、结构合理、平台适配、精简度、可执行
  - 负面约束机制：禁止过度修饰、无端膨胀、道德说教、虚构信息等
  - DeepSeek R1 特别适配：避免格式约束干扰思维链

### 变更

- **skill-creator 本地化**
  - SKILL.md 重写为中文，加入 Testany 命名/结构约定和审核标准
  - `init_skill.py` 默认输出路径改为 `skills/`
  - 模板内容全部中文化
- **marketplace.json 结构调整**
  - 每个 skill 拆分为独立 plugin，方便用户浏览时看到描述

---

## [1.2.0] - 2026-01-06

### 新增

- **skill-creator** 技能：Skill 创建指南，帮助创建和优化 Claude Code Skills
  - 包含 `init_skill.py`、`package_skill.py`、`quick_validate.py` 脚本
  - 提供完整的 skill 编写最佳实践
- **spec/** 目录：Agent Skills 规范文档
  - `agent-skills-spec.md`：规范总览
  - `skill-authoring.md`：Skill 编写指南
  - `skill-client-integration.md`：客户端集成指南

### 变更

- **prd-writer 改进**
  - Frontmatter description 加入触发词，提升激活可靠性
  - `templates/` 目录改名为 `references/`，符合 skill 最佳实践
  - 「选型分析/选定方案」改为「方案分析/建议方案」，最终选型决定留给 HLD
  - 语言规范增加「用户要求英文时可切换」例外条款
- **README.md** 重写，符合仓库级别定位

### 修复

- 修复 `integration.md` 表格缺失 pipe 的格式问题
- 修复 `new-feature-backend.md` 嵌套代码围栏导致的格式解析问题

---

## [1.1.0] - 2026-01-06

### 新增

- **阶段零：上下文收集（强制）**：写 PRD 前必须先了解项目上下文
  - 自动读取项目中的已有 PRD/HLD 文档
  - 识别项目命名规范和技术栈
  - 确保输出遵循项目现有约定
- **PRD 内容边界定义**：明确 PRD 与 HLD 的职责边界
  - PRD 只描述 What 和 Why，不规定 How
  - 添加正确/错误示例对比
- **边界检查（强制）**：在审查阶段增加边界检查步骤

### 变更

- **核心原则更新**
  - 新增「先读后写，遵循项目现有约定」原则
  - 新增「PRD 只描述 What 和 Why，不规定 How」原则
- **模板优化**（所有 5 个模板）
  - `new-feature-ui.md`：「数据模型」改为「数据概念」，移除技术字段定义
  - `new-feature-backend.md`：「接口规格」改为「接口能力」，移除 API 路径设计
  - `integration.md`：「集成方案」改为「集成需求」，移除技术接口映射
  - `refactoring.md`：移除架构图和代码结构变更，简化为业务层面描述
  - `optimization.md`：移除优化代码示例，简化为目标和验证要求
  - 所有模板添加「具体技术方案见 HLD」引用

### 修复

- 修复 PRD 内容越界到 HLD 领域的问题
- 修复不遵循项目现有约定的问题

---

## [1.0.0] - 2026-01-06

### 新增

- **prd-writer** 技能：PRD（产品需求文档）写作技能
  - 支持 5 种 PRD 类型：新功能（有UI）、新功能（无UI）、第三方集成、功能重构、性能/安全优化
  - 4 阶段工作流程：需求理解 → 结构规划 → 内容撰写 → 强制审查
  - 使用 AskUserQuestion 工具进行结构化交互
  - 包含 5 个专业模板
