# Changelog

本文件记录 Testany Agent Skills 的所有重要变更。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### 新增

- **B3 导出回归修正**：验证安装资源中的运行时 `manifest.json` 按原内容保留，同时继续阻止测试任务与评分 manifest 泄漏；补入此前未提交的独立用例。

- **B4 直接场景补测设施（未发布）**：增加真实 Git 初审与同一 Reviewer 整改复审、原始 PRD/HLD 批准冲突、必要本地工具实际缺失、media-writer 四轮检查点，以及离线等待边界样例。逐轮保留输入、源归档、实际公开调用与产物，历史失败不覆盖；设施测试与模型行为分开判定。用户排除 Claude 宿主验收与 SkillDock，本条不代表安装、发布或真实平台认证。

- **B4 测试可移植性（未发布）**：资格门禁单元测试改用明确标记的合成源骨架，生产固定摘要校验不变；三个 followup 历史集成项仅在本机归档缺失时显式跳过，非法输入不跳过。独立 PR 目录无归档回归412项通过、7项跳过，补齐原始冻结归档后419项全部通过；不改模型历史判定。

- **B4 隔离验收设施（未发布）**：新增冻结归档导出与公开证据采集工具；输入、评分和运行产物分离，原版/候选使用各自治理，支持显式归档且禁止隐式混用。采集按 LF 保留 Unicode、排除私有内容块并检查完成事件、身份、路径和不可覆盖边界；提供合成测试与缺少本机归档时的明确集成测试跳过。设施测试、模型样例和实际宿主安装分别取证，不互相替代，不代表已发布或真实平台认证。

- **B4 定向加固与宿主发现修复（未发布）**：case 入口直接指向无解压静态校验器并给出准确 CLI；pipeline/handoff 明确先解析真实创建响应再发起依赖 key 的调用。bot manifest 显式追加九个子技能，修复父级 SKILL.md 对子技能发现范围的影响，保留原资源路径。新增独立 C10G 离线兼容样例，同步工具 schema 与 Python trigger_command 校验而不执行命令；旧 adapter、输入、历史失败和早期 C10F 设施试跑记录不被替换。版本号未提升，真实宿主与平台运行不由静态声明替代。

- **testany-eng 源码实现评审门禁**：
  - 新增 `code-reviewer` skill 与 `/testany-eng:code-reviewer` command，覆盖首次完整 Code Review 和整改 delta 复审
  - 新增 Scope Lock、architecture budget、四态 verdict（`APPROVED / CHANGES_REQUIRED / SCOPE_DECISION_REQUIRED / EVIDENCE_BLOCKED`）
  - P0/P1 强制绑定 frozen invariant、精确证据、复现路径、影响与不超出已批准 architecture budget 的最小修复
  - P2 明确为非阻断；源码、exact-SHA CI 与环境/部署门禁分层输出
  - 新增中英文 Scope Lock、Review Report、Approval Certificate 模板，以及机器可读 review policy 和按触达面启用的 checklist
  - 新增 mutable worktree snapshot 工具与漂移重检规则；未提交实现可获得摘要绑定的评审结论，但 immutable certificate 仅用于 commit/tree
  - snapshot 同时绑定 Git patch、tracked 原始 bytes/mode、untracked/mutable baseline 及 canonical changed-path manifest，覆盖 clean filter、EOL、index flag、submodule 和并发漂移
  - 明确区分 Candidate 自行越界（标准 P1 scope violation，删除/回退）与真正需要 Owner 扩 scope 的决策，避免把开发加料转成产品扩张入口
  - 初次评审强制一次性完整覆盖；delta 复审需以上一轮完整覆盖为前提，多仓评审新增 shared Scope Lock coverage ledger 与 closed subagent result extension
  - Reviewer 漏审不能伪装成无限 delta：只允许一次独立异常完整复核，之后再次漏审则停止并交由用户裁决评审流程
  - Guide / workflow map 新增 Implementation Candidate → Code Review 路由，不把普通 HEAD 或 feature branch误判为待审 Candidate

- **testany-eng 流程导航能力**：
  - 新增 `guide` skill：扫描现有文档与准出状态，判断当前项目所处阶段并推荐下一步最合适的 `testany-eng` skill
  - 新增 `plugins/testany-eng/skills/guide/references/workflow-map.yaml`，统一主流程、Prototype 可选分支与 Guardrails 横切分支的导航规则
  - 新增 `plugins/testany-eng/skills/guide/references/artifact-detection.md`，细化 artifact 类型识别、状态归一化、审查证据与置信度规则
  - 新增 `plugins/testany-eng/skills/guide/references/guide-examples.md`，提供典型导航场景的输入/输出样例
  - 新增 `/testany-eng:guide` command 与 OpenAI agent interface

- **testany-eng 测试闭环能力**：
  - 新增 `test-strategy-writer`：基于 PRD/API/HLD 定义独立测试策略
  - 新增 `test-strategy-reviewer`：审查测试策略的风险覆盖、测试分层、环境与门禁
  - 新增 `test-spec-writer`：基于 Test Strategy + LLD 产出测试规格与 test case package
  - 新增 `test-reviewer`：作为测试门禁，审查追溯、覆盖、执行证据与残余风险

- **testany-eng traceability metadata v1**：
  - 新增 canonical schema 设计稿
  - 新增 `prd-profile-v1`、`test-strategy-profile-v1`、`test-spec-profile-v1` 示例
  - 新增 `trace-lint` 输入输出契约文档
  - 新增 `trace-build-rtm` 输入输出契约文档

- **testany-eng 脚本工具**：
  - 新增 `plugins/testany-eng/scripts/trace_lint.py`
  - 新增 `plugins/testany-eng/scripts/trace_build_rtm.py`
  - 新增对应 CLI 测试，覆盖 PRD / Test Strategy / Test Spec profile 校验与 RTM 聚合

### 变更

- **B4 有限行为纠偏（未发布）**：case 创建读回已含完整一致 metadata 时不再重复更新；执行转等待须实际初始化起止时间，以保留亚秒精度的同一预算覆盖查询和睡眠，禁止忙等并在已知终态停止冗余查询。原请求已授权的详情/排障不重复审批。HLD 遇互斥有效批准且无取代决定时保留待决边界，只澄清对应 Owner 决策，不按文档层级或单条批准自动选边；有限增量沿用既有追溯格式。API 兼容性评审实际核对已提供的直接消费者证据，必要工具缺失不取消独立读取、不扩大为全仓源码评审。

- **Frontmatter 校验根因修复（未发布）**：保留合法 Claude argument-hint/hooks，仓库校验区分 repository/portable profile，拒绝未知字段、重复 YAML 键与错误类型并明确报告扩展；覆盖此前漏检的 testany-import-git。同轮修复 prompt-optimizer Stop hook 缺少 once 导致可能延续到无关轮次的风险，保留重入/范围保护，纠正文档中的纯公共字段及宿主通用能力声明。不修改系统 quick validator、不将扩展移入无效 metadata，也不冒充原始严格检查全通过。

- **B3 用户交互与交付适配（未发布）**：
  - B3a：跨 Testany skill 保留整体目标、授权与真实状态，已授权链路实际接续；仅本地/配置/查询不扩大为执行，清除两处旧签名 curl 执行表述。
  - B3b/c：精简 BRD/UC 根文件，细节按需读取；访谈、材料整理、缺口补问分流，实测/估算/测量计划/离散验收分开，去除数字和假设数量的无差别门禁，双语模板不预填批准。
  - B3d：新增离线 ZIP/JSON metadata 校验器及正反例测试；区分生成、静态检查、远程受理、配置读回和执行终态，部分失败保留真实对象而不自动回滚。
  - B3e：prompt-optimizer 以任务及调用方契约优先，不按品牌强制格式，不索要完整内部思维链；主流程和可选 Stop hook 均有限收尾。
  - B3f：AGENTS/CLAUDE 保留全局不变量，发现/发布细节迁至按需文档，保留 strict、symlink、路径和单一版本 authority 语义；新增独立离线行为设施，原始/B1/B2测试基线保持不变。
  - 不修改平台 API、发现配置或发布版本；不代表已安装、发布或完成真实平台验证。

- **B2 工作流与执行模式适配（未发布）**：
  - B2a：先读取给定材料再询问真实缺口；工具名改为能力示例，脚本与参考资源从实际安装位置解析。
  - B2b：统一文档评审的 P2 非阻断、P0/P1 零遗留与必要证据门禁；区分缺陷、证据缺口、范围决策和建议，缺少上游时仍完成独立检查；稳定 ID 与完整首审约束 delta 复审。
  - B2c：API/PRD/HLD/LLD/测试/Runbook 区分正式设计与既有批准基线下的有限增量；不强制回补全部历史文档，不以行数或技术必要性代替权限/信任边界批准。
  - B2d：media-writer 增加端到端、指定检查点、单阶段模式；同步各阶段 prompt 和手册，按上下文识别许可，无独立 agent 时可顺序完成，不捏造作者事实或扩大到发布、付费生成与归档。
  - 新增独立离线行为样本导出与结构回归；原始基线样例不变。保留 B1、Code Reviewer 的专用冻结对象/证据协议与发布发现配置；本条不代表已安装或发布。

- **testany-bot B1 安全与结果真实性（未发布）**：
  - 日志请求改为严格解析的 HTTPS GET，移除远程 curl 字符串 eval；新增默认仅校验、签名脱敏、不跟随重定向的日志 helper 和离线测试。
  - 区分配置、执行与等待许可；补字段不自动 dry run，等待有截止时间，UI 回退和执行发起不冒充最终成功。
  - 统一 sync/switch/relation 的差异、授权、候选绑定与读回规则；保留平台参数/幂等约束，明确 managed confirm 的快照锁定限制。
  - 同步 command、关联参考和 plugin README；不改变发现配置或发布版本，不表示已安装生效。

- **评审分层与授权边界纠偏（testany-eng 2.3.0）**：
  - Guide/HLD/LLD/Code 共用 `review-boundaries.md`，按职责/信任/依赖边界、实现细节、契约和精确代码对象分流，不以跨仓数量或“技术方案”关键词选 HLD。
  - HLD/LLD 增加 `formal_design` / `bounded_change` 入口；保留正式完整覆盖，有限修复不强制全链文档、Manifest 或全量证书，整改只审原 ID/delta/直接影响。
  - 清除技术必要性标注、行业惯例与 Reviewer 旧 comment 循环自证授权的路径；区分技术结论、设计授权、执行许可，产品与工程决定分别交有权 Owner。
  - HLD/LLD 主说明、检查库、双语模板和 command 统一 P2 非阻断；清除一律重跑全门、模板自动全绿和以签章代替批准的表述。
  - Code Review 增补原始批准来源、零资源新增下的语义边界变化及真实管理入口/compiler 可表达性；既有 Scope Lock/snapshot/证据复用/有限漏审机械 policy 保持不变。
  - 新增独立 raw 场景与分离的 grader，验证路由、授权、范围保持和停止行为；结构回归与模型行为评估分别记录，不冒充产品部署证明。
  - 同步四个 command/agent metadata、README、marketplace 展示与单一 plugin 版本；未改其他 reviewer/writer 的准出规则。

- **code-reviewer 八项高优先级改进（testany-eng 2.2.0）**：
  1. 核验生产入口、输入 provider/parser、真实 helper、替身边界与独立 oracle，不把真实 PG/Kind 或测试数量等同生产语义证据。
  2. 对触达关键校验成对验证合法接受/非法拒绝，检查正常状态变化、错误分类与拒绝副作用。
  3. 按同一 invariant 的直接 callers、普通/续跑分支、批准 targets 和跨尝试恢复状态关闭整改，不只检查改动行。
  4. 同 ID 也区分 original_unfixed / introduced_by_fix / pre_existing_unreported_cause；保留漏审撤回、独立 full review 与有限恢复机制，禁止隐改验收条件。
  5. 新增隔离的 raw 行为样本、缺陷/修正版对照和 P2/范围/缺证控制；盲测不提供答案，分别检查漏报、误报、越界和收敛，不把结构断言当能力证明。
  6. P2 不捆绑当前整改或自动结转；除架构 surface 外，还核对新增手工步骤、门禁、配置与维护负担的必要性，优先缩小不实声明。
  7. 中英文模板与子任务共用一个可核验 Review Record；同范围下有条件复用内容/依赖不变的 source/local 证据，未知不复用，新 Candidate 仍需新 ID/绑定/verdict，不能继承 CI/live/旧批准。
  8. 独立复核先重建生产路径与假设再核作者结论；漏审后必须换能识别旧盲点的验证方法，不以 agent 名称/数量或 path coverage 代替行为证据。
  - Guide/command 仅同步 Review Record 与有条件 rebind 路由，Scope Lock/snapshot/envelope 原有字节绑定工具保持兼容；未新增发布流程或产品门禁。

- **Plugin 架构与仓库兼容基线收敛**：
  - `AGENTS.md` / `CLAUDE.md` 更新为当前按领域聚合 Plugin、目录自动发现 Skill/command 的真实架构
  - 架构说明与 validator 对齐上游规则：`plugin.json` 可选、默认 `skills/` 自动发现、manifest 自定义 `skills` 通常追加；只有 marketplace entry 自身在 marketplace-root source 下列出已存在的特定 skill 路径时才替换默认扫描
  - 清除 `runbook-writer/SKILL.md` 中已提交的冲突标记；把 output language 与 Guardrails trigger 语义合并到 canonical `subagents/*`，保留结构化结果契约并删除未引用的 `prompts/*` 第二 authority
  - `validate_codex_compat.py` 只扫描 marketplace 注册的 Plugin，落实 `strict:true` 合并、`strict:false` authority 冲突、marketplace-root replacement/fallback 与默认发现；显式 `null`、非法相对路径、dangling symlink、越界 target 和重复 version authority 均 fail closed，并排除未注册的 backup/WIP
  - `agents/openai.yaml` 保持可选；存在时按官方 generated baseline 校验必填/可选字段、类型、描述长度、`$skill-name` prompt 与图标路径；同 marketplace symlink 可复用，越界/dangling target fail closed
  - 删除仍残留在默认发现目录中的已废弃 `prd-studio` 源码，令实际安装面与既有删除记录一致
  - 修复 `guide` command frontmatter；`testany-eng` 升级到 `2.1.0`，每个已注册 Plugin 仅保留一个 version authority，避免已安装端静默复用旧 cache
  - 根目录 `/output/` 明确为本地生成交付物目录，不纳入版本控制；可复用资产应进入对应 Skill 的 `assets/`

- **uc-interviewer edge case 收敛**：
  - 新增 `plugins/testany-eng/skills/uc-interviewer/references/edge-case-framework.md`，统一 edge case 分类、必问触发器、defer 规则与步骤级矩阵输出契约
  - `uc-interviewer` 改为强制输出步骤级 `Edge Case Matrix`，记录 `Step ID / trigger / user-visible behavior / recovery`
  - `journey-output-template*.md` 同步升级为步骤级 edge case 模板
  - `prd-writer` / `prototype-designer` / `uc-interviewer` command / README 同步改为消费新的 edge case 结构

- **uc-interviewer checkpoint / traceability 收敛**：
  - `uc-interviewer` 改为 `开放发现 → 结构化确认` 的两段式访谈，证据不足时允许 free-text fallback
  - 新增 `plugins/testany-eng/references/traceability-schema/journey-profile-v1.example.yaml`，补齐 `USER_JOURNEY` 的机器可读契约示例
  - 新增 `plugins/testany-eng/skills/uc-interviewer/references/checkpoint-gates.md`，定义 `draft / in_review / approved` 与 blocking 条件
  - `journey-output-template*.md` 升级为带 `TRACEABILITY-METADATA`、`JOURNEY-* / FLOW-*`、checkpoint decision、review record 的正式基线模板
  - `trace_lint.py` 与测试新增 `journey-profile-v1` 校验；`trace-lint` 契约文档补充 `TRACE608`
  - `prd-writer`、guide artifact detection、agent prompt、README/command 同步改为识别最新 BRD baseline、Journey artifact status 与统一跳转模型

- **testany-eng 发现层更新**：
  - plugin README 的快速选择区新增 `/guide` 入口，便于存量项目和新用户先做流程定位
  - 仓库 README 新增 `/testany-eng:guide` 的命令入口、使用示例与 skill 描述
  - 根目录 `marketplace.json` 与 `plugins/testany-eng/.claude-plugin/plugin.json` 更新为“研发流程与导航工具集”描述，并纳入 `/testany-eng:guide`

- **testany-eng 国际化第一阶段**：
  - 新增 `plugins/testany-eng/references/language-policy.md`，统一输出语言、模板选择和 `TRACEABILITY-METADATA` 英文保留规则
  - active `testany-eng` skills 统一新增语言规则段，默认跟随用户输入语言输出
  - `prd-reviewer` / `hld-reviewer` 将内嵌审查报告与准出证书模板抽离到 `references/report-templates*.md`
  - BRD / Journey / PRD / HLD / LLD / Test Strategy / Test Spec / Runbook / Prototype 的直接输出模板新增英文对照文件 `*.en.md`
  - reviewer 审查报告与准出证书模板新增英文对照文件 `*.en.md`
  - `runbook-writer` 的 writer / reviewer prompts 显式传递 `output_language`

- **testany-eng `prd-studio` 废弃标记**：
  - `prd-studio` skill、command、README、marketplace 展示层统一标记为 deprecated
  - 默认推荐路径改为 `/testany-eng:prd-writer` + `/testany-eng:prd-reviewer`

- **testany-bot 自动化对象模型收敛**：
  - 新增 `automation-model.md`，统一 `traditional test scenario`、`platform case`、`pipeline`、`trigger` 四个对象的边界
  - `testany-guide` / `concepts` 同步补充 Manual Trigger 与 pipeline-only execution 模型

- **testany-bot skill 职责重构**：
  - `testany-case-writing` 改为先做场景拆解，再产出可注册的 platform case packages
  - `testany-case` 改为 platform case registration & CRUD，主路径优先消费上游 package / metadata / decomposition
  - `testany-pipeline` 改为优先消费上游 `automation design / decomposition`，保留从现有 cases 反推的 fallback 但降级为兜底
  - `testany-trigger` 改为同时负责 persistent trigger（`Plan / Manual Trigger / Gatekeeper`）和 ad-hoc run now
  - `testany-tests` 重命名为 `testany-execution`，聚焦 execution 观测、历史查询、刷新、取消与失败交接

- **PRD → Test Strategy → Test Spec 追溯闭环落地**：
  - `prd-writer` / `prd-reviewer` 继续使用 `prd-profile-v1`
  - `test-strategy-writer` / `test-strategy-reviewer` 接入 `test-strategy-profile-v1`
  - `test-spec-writer` / `test-reviewer` 接入 `test-spec-profile-v1`
  - reviewer 明确要求先执行 `trace-lint` / `trace-build-rtm`，不再只依赖人工等价检查

- **testany-bot 命名收敛**：
  - 测试触发 skill 统一命名为 `testany-trigger`
  - 命令入口统一为 `/testany-bot:trigger`
  - plugin README、根 README、marketplace 与跨 skill 引用同步更新

- **testany-eng 文档与命令入口更新**：
  - plugin README 补充测试阶段工作流、traceability 约定与脚本使用方式
  - 根 README 更新 `testany-eng` 的测试相关命令说明
  - 新增 4 个测试 skill 的 command 文档、review checklist、report template

- **testany-bot 文档入口更新**：
  - `commands`、plugin README、根 README、marketplace、`plugin.json` 同步更新为新的 automation model 和 skill 边界

### 移除

- **`testany-mrkt` 移除内部短视频脚本能力**：
  - 删除 `video-script-writer` skill 与 `/testany-mrkt:video-script-writer` 命令入口
  - `video-script-writer` 已迁移至私有仓 `testany-internal-agent-skills`
  - `plugins/testany-mrkt/.claude-plugin/plugin.json` 描述同步收敛为仅保留自媒体文章创作

- **删除已废弃的 `prd-studio`**：
  - `testany-eng` 的命令列表、流程图、决策树和 plugin 描述不再展示 `prd-studio`
  - `guide` 相关说明移除对 `prd-studio` 的特殊排除描述，流程事实源按当前仓库内容收口

- **删除 `skill-creator`**：
  - `testany-llm` 的命令列表和 plugin 描述改为仅保留 `prompt-optimizer`
  - 根 README、`AGENTS.md`、`CLAUDE.md` 不再引用已删除的 `skill-creator` 脚本与路径

## [skilldock 0.11.3] - 2026-10-13

补丁版本：处理 0.11.2 发布当天在一台真机上遇到的一次故障，以及真机确认中发现的问题。数据格式不变，不需要迁移。

### 修复

- **更新后 SkillDock 打不开**：Codex 自己装上新版本后，运行中的旧服务会自动换到新版本；旧服务可能关掉端口却不退出，此后每次打开都以“无法核实记录中的进程属于此 SkillDock 实例”失败，直到它不在了（那一次约 8 分钟）或有人手动结束它。按推断，留住它的是当时一次慢的清单读取的连接，页面的健康检查之后继续用这条连接；这个机制可以用替身进程复现，那一次是不是这样没有直接看到。现在服务退出有了期限；启动器对已经核实、通知过、端口上已经没有程序监听却还没退出的旧服务会强制结束，遇到“进程还在、端口没人监听”时，命令行与它当初启动的那一条逐字相同才认作自己的服务并结束它再继续，认不出时仍然拒绝，但提示里写明怎么处理。还在监听的服务不论答得多慢都不强制结束：它可能正在写。执行换版本的是新版本的启动器，所以从 0.11.2 换到 0.11.3 的那一次已经受这次修复保护。
- **新版本明明在运行，页面顶部却一直显示“新版未能启动”**：一次失败的重启记录在目标版本已经运行后不再当作失败显示。
- **更新后第一次打开要等约 30 秒**：等的是 Codex 的官方应用目录，服务每次重启后都要重读一次。现在服务把每次读到的结果存在本机的数据目录里，下次启动后先用它、同时在后面重读；存下的结果只在不满 7 天时这样用，更旧的仍等读取。只有这台机器上的第一次读取、以及隔了 7 天以上的那一次还要等。存下的只有 SkillDock 用到的字段（应用的名称、介绍、图标地址、安装入口、是否已连接），没有凭证，文件只对本用户可读。
- **只读开关**：不能由用户开关的条目，开着的保留颜色、滑块里有一个锁，关着的才是灰色；Claude 插件自带的技能（随所属插件启停）在开关旁标“随插件”。0.11.2 把它们一律显示为灰色，容易读成“没有启用”。

### 变更

- **依赖**：升级三个有安全提醒的依赖到修复版本——`@modelcontextprotocol/sdk` 1.31.0、`smol-toml` 1.9.0、`source-map-js` 1.2.2（开发依赖）。

### 文档、分发与验证

- SkillDock 从 0.11.2 升至 0.11.3：Codex manifest、应用版本与 lockfile、marketplace 条目、中英文 README、应用 README 与 Codex 原生构建产物。
- 设计：HLD v1.41；API 契约（0.38，36c 0.37）与 PRD 没有改。Owner 2026-10-13 确认两项决定（HLD 第 10 节）：启动器在两种情形下强制结束进程（DG-0113-1），官方应用目录上一次的结果存到本机（DG-0113-2）。0.11.2 的真机确认结果见 HLD 9.3 V27（桌面应用的 **Update** 第二次可用；“Codex 自己更新后计划沿用”在真实 Codex 上通过；分段计时量到一次，慢在官方应用目录，那一次 30.0 秒），这次故障的经过与根因见 V28，实施进展见 [37](plugins/skilldock/skills/skill-manager/references/37-cross-agent-implementation-plan.md)“0.11.3 进展”。
- 单元测试 661 项、浏览器端到端测试 89 项在隔离沙箱中全部通过（本机 Chrome，临时配置）。沙箱不是 CI 等价环境。新规则由作者做了 35 项变异检查（启动器、重启状态与关闭 18 项，存在本机的目录结果 17 项），每一项都有用例失败；评审另做的变异里有几项没有用例看住，记在实施计划“留给以后的”。
- 独立评审：第一轮代码 [81](plugins/skilldock/skills/skill-manager/references/81-0113-code-review.md)（CHANGES_REQUESTED，P2 1、P3 5）与文档 [82](plugins/skilldock/skills/skill-manager/references/82-0113-hld-delta-review.md)（需小改后复核，P2 1、P3 6）指出同一个问题：启动器把“答得慢”当成“端口已关”，会在写的中途结束服务。已改为只认“连接被拒绝”，其余意见一并处理。第二轮代码 [83](plugins/skilldock/skills/skill-manager/references/83-0113-code-review-r2.md)（APPROVED，P3 1）与文档 [84](plugins/skilldock/skills/skill-manager/references/84-0113-hld-delta-review-r2.md)（APPROVED 附条件，P3 3；证书绑定 HLD v1.40）通过。此后加入的“目录结果存在本机”与 HLD v1.41：第三轮复核待补。
- 没有验证的：“目录结果存在本机”只有用例（替身命令行），没有在真实的 Codex 上试过；故障的修复只有用例与评审的探针（用替身进程模拟“关了端口却不退出”“还在监听只是答得慢”的旧服务），真实的换版本要等 0.11.3 发布后的下一次才看得到；读进程表只在一台 macOS 上看过，自动化用例跑在读不到进程表的沙箱里；0.11.3 没有装进真实的 Claude 或 Codex 试过。
- 没有做的：官方应用目录在后面重读结束之后，界面不会自己更新，要到下一次读取才看到新结果。

## [skilldock 0.11.2] - 2026-10-13

补丁版本：处理 0.11.1 发布后在一台真机上确认时发现的问题，以及发布前最后两份复核留给下一版的意见。数据格式不变，不需要迁移。

### 修复

- **Codex 自己更新插件之后，定时计划不再停下**：Codex 把插件的每个版本装进各自的目录，此前计划把换了目录的插件当成新对象，每轮以“来源、所有者、安装目录或内容已变化”跳过并要求重新选择——Codex 抢在计划之前更新一次，这个插件的自动更新就停了。现在版本更高、来源没有变、装入的版本和内容与本机 marketplace 副本逐文件一致时，原计划继续生效并记一条操作记录；手动检查同样会恢复。同一版本的目录被替换、来源换了、版本更低或比不出先后、装入内容与来源不一致（包括本机 marketplace 副本又往前走了一版）时，仍然要求重新选择。
- **访达的 `.DS_Store` 不再算技能的内容**：对两侧的独立技能与 Claude 的技能目录插件，检查更新（本地修改与差异）、恢复一次更新、定时计划的绑定、关联来源的预览都不看它，不论它随来源装入还是之后才出现，来源文件夹里的也一样。0.11.1 只放宽了“安装之后才出现的那一份”：随来源装入的被访达改写后仍算本地修改，更新之后才出现的会挡住恢复，来源文件夹被访达打开过会带来一次只含它的更新，计划会跳过并要求重新选择——这四种都不再发生；0.11.2 之前保存的计划照常沿用。检查（或关联来源的预览）之后、应用之前才出现或被改写的那一份仍会让应用停下并提示重新检查；Codex 插件不在这次放宽之内。
- **Claude 插件自带技能多列**：来源为 marketplace 根目录、根目录自己的 manifest 又声明了技能路径的插件，条目列的是 `./`、`./skills` 或其他存在的目录时，不再把 manifest 声明的路径下的技能也列出来（Claude 不加载它们）；默认目录里的某个技能同时被条目单独列出时，名称与 Claude 一致。
- **Claude 报告的加载问题有了说明**：Claude 的插件清单对加载有问题的插件给出的原因，现在显示在该插件的提示里（技能目录插件同样），它的技能条目的说明与诊断也写明，有英文、日文译文。技能仍然列出：同一个报告既用于整个插件没有加载的情形，也用于某个声明路径失败而其余照常加载的情形，SkillDock 不去猜是哪一种。
- **只读开关显示为灰色**：不能由用户开关的条目（例如 Claude 插件自带的技能），开关不再是半透明的蓝色。
- **隔一阵再打开，多数时候不再等半分钟**：读取清单时要向 Codex 读一次官方应用目录，在一台真机上它要 25～30 秒（从日志的计时推断），结果只保留 10 分钟，过期后的每一次读取都要等它。现在读过一次之后，过期时先用上一次的结果、在后面重读，只有服务进程启动后的第一次读取要等；读取失败时照旧提示。先用的那份结果可能是很久以前的（官方目录插件的名称、图标、是否已连接等），后面那次读取结束之后再读即更正；“核对连接状态”总是等一次新的读取，安装官方目录插件之后的结果在目录过期时也等。服务刚启动后的第一次打开仍然慢；日志里也有几次慢在 Codex 的清单命令本身，这一版没有处理。

### 变更

- **慢读取的日志多三项计时**：一次清单读取达到 5 秒时写进 `server.log` 的那一行，末尾另列 Codex 目录读取的三段（插件清单、marketplace 清单、官方应用目录）各用了多久。

### 文档、分发与验证

- SkillDock 从 0.11.1 升至 0.11.2：Codex manifest、应用版本与 lockfile、marketplace 条目、中英文 README、应用 README 与 Codex 原生构建产物。
- README：0.11.0 到 0.11.1 这一次更新，Claude 桌面应用在刷新 marketplace 之后 **Update** 可用（一台机器实测），取代“尚未确认”的说法；应用 README 写明计划沿用与 `.DS_Store` 的规则。
- 设计与契约：HLD v1.38、API 契约 0.38（36c 0.37，只增供显示的内容）；PRD 没有改。真机确认的结果见 HLD 9.3 V25，实施进展见 [37](plugins/skilldock/skills/skill-manager/references/37-cross-agent-implementation-plan.md)“0.11.2 进展”。其中两项做法（计划沿用、`.DS_Store` 的范围）改动了早先定下的规则，Owner 2026-10-13 已同意（HLD 第 10 节 DG-0112-1、2）；`.DS_Store` 一项，Owner 同意的是检查更新、恢复与定时计划，关联来源的预览是之后按评审意见补的，Owner 随后也已同意；这条放宽与“不覆盖本地修改”的关系不在 PRD 另行登记（Owner 的决定）。
- 单元测试 649 项、浏览器端到端测试 89 项在隔离沙箱中全部通过（本机 Chrome，临时配置）。沙箱不是 CI 等价环境。新增的规则逐条做了变异检查（改错即有用例失败）。
- 真实 Claude 命令行 2.1.295，临时配置目录、禁网：插件技能冒烟（`tests/claude-plugin-skills-smoke.mjs`）扩到三个 marketplace 的 23 个插件与一个技能目录插件——前两个 marketplace 的 22 个，SkillDock 列出的技能与 `claude plugin details` 相同；另外核对了 Claude 的清单对四个插件的加载报告（其中一个 Claude 没有加载）与 SkillDock 的转述。分发冒烟与升级冒烟（从 0.11.0 更新到 0.11.2）通过。
- 独立评审：第一批改动的代码见 [75](plugins/skilldock/skills/skill-manager/references/75-0112-code-review.md)（APPROVED，P3 6），设计文档见 [76](plugins/skilldock/skills/skill-manager/references/76-0112-hld-contract-delta-review.md)（带条件 APPROVED，P3 7）；处理之后的复核见 [77](plugins/skilldock/skills/skill-manager/references/77-0112-code-review-r2.md)（APPROVED，P3 3）与 [78](plugins/skilldock/skills/skill-manager/references/78-0112-hld-contract-delta-review-r2.md)（带条件 APPROVED，P3 6；条件是合并前告知 Owner 两点）。最后一轮见 [79](plugins/skilldock/skills/skill-manager/references/79-0112-code-review-r3.md)（APPROVED，没有新发现）与 [80](plugins/skilldock/skills/skill-manager/references/80-0112-hld-contract-delta-review-r3.md)（带条件 APPROVED，P3 3，证书绑定到 HLD v1.38）。六份报告都没有 P2 及以上的意见；意见除登记为留给以后的几条外都已处理。
- 没有验证的：计划沿用的规则只有隔离用例（用替身模拟 Codex 换版本目录），没有在真实 Codex 上跑过；“慢的是官方应用目录”是从日志的计时行与代码推断的，没有直接量过，改动的效果也没有在真机上看过；0.11.2 没有装进真实的 Claude 或 Codex 试过。
- 没有做的：直接声明的技能说明头不规范时名称与 Claude 不同（已知差异）；服务启动后第一次打开的等待（要界面配合的“先显示、后刷新”）；界面清单 [41](plugins/skilldock/skills/skill-manager/references/41-ui-redesign-backlog.md) 的 UI-01、UI-08、UI-09。

## [skilldock 0.11.1] - 2026-10-13

补丁版本：SkillDock 在 Claude 一侧也声明版本号，Agent 标识换成官方标志，并处理最终 UAT 与界面清单（[41](plugins/skilldock/skills/skill-manager/references/41-ui-redesign-backlog.md)）里记录的具体问题。数据格式不变，不需要迁移。

### 变更

- **Claude 一侧声明版本**：仓库的 Claude marketplace 中，`skilldock` 条目声明版本号，与 Codex 一侧相同。Claude 中显示的版本从提交摘要变为 `0.11.1`，两侧显示同一版本，更新预览能给出目标版本；Claude 命令行按这个版本识别新版本，也只在它变化时更新。从 0.11.0 升级的方法不变：在 SkillDock 的“更新”页检查并确认，或刷新 marketplace 后运行 `claude plugin update skilldock@testany-agent-skills`。
- **Agent 标识换成官方标志**：Codex 用 OpenAI Blossom，Claude 用 Claude Spark，取自 OpenAI 与 Anthropic 的官方品牌资源，仍只显示图标（名称在悬停提示与读屏中）。来源与用法见 [THIRD_PARTY_NOTICES](plugins/skilldock/skills/skill-manager/THIRD_PARTY_NOTICES.md)。
- **删除 `commands/skill-manager.md`**：它与技能同名，Codex 不引用它。删除后 Claude 会话中仍有且只有一个 `skilldock:skill-manager` 入口（隔离实验，Claude 命令行 2.1.295），它来自技能本身；Codex manifest 不引用这个文件，原生入口与 `$skill-manager` 预计不受影响。
- **Claude 插件自带的技能进入技能库**：已安装的 Claude 插件带的技能以只读条目列出，归在所属插件名下，启用状态跟随插件；不能单独开关、移除或更新（Claude 只能整个启停插件），可以查看内容、跳到所属插件、从“管理更新”定位到插件的更新项。0.11.0 只在插件上显示技能数。列出的是 Claude 自己列为这个插件技能的那些（会话提供给模型的是其中带说明的）：默认的 `skills/`，加上插件清单或 marketplace 条目另行声明的路径；一个仓库拆成几个插件、各自声明带哪几个技能时，每个插件只列它声明的。条目的名称按 Claude 的叫法：技能目录之下的取所在的目录名，声明的路径本身就是一个技能时取说明头里的名称。插件的技能数改为列出的技能数，不再把 `commands/` 里的旧式命令文件算进去。
- **市场来源**：Git marketplace 固定在某个分支、标签或提交时，卡片上写明。

### 修复

- **计数与空状态**：技能页的分类计数、市场来源与操作记录的数量、各页的空状态都按顶部的 Agent 筛选计算；标题旁的数字移出页面标题，并说明数的是什么（例如“已安装的插件”）。
- **按所选 Agent 给说明与默认值**：“未安装”的说明按列表中实际出现的 Agent 给出；顶部选了 Claude 时，“安装技能”“添加来源”等对话框默认选 Claude。
- **插件**：不能安装的插件，属于它自己的原因直接显示在卡片上（整侧只读时，同一句说明只在列表上方出现一次）；从 Claude marketplace 安装的预览显示插件带有哪一侧的专用 manifest（条目指向 marketplace 副本内的目录时）。
- **会影响另一侧的改动**：更新页的检查结果与批量移除的预览直接列出说明，不必等到确认框；计划中待确认的技能写明所在的另一侧插件，开启自动应用的计划在设置里标出待确认的目标。
- **加载**：第一次读取清单较慢时，4 秒后说明正在读取。
- **启动器**：准备依赖前说明安装依赖需要联网，依赖安装失败时写明这一步需要联网、离线时请联网后重试；“请求目录包含符号链接”与“使用界面保存的项目”两条提示只在与最终扫描的目录相符时输出。
- **访达的 `.DS_Store` 不再挡住技能更新**：两侧的独立技能与 Claude 的技能目录插件检查更新时，安装之后才出现的 `.DS_Store` 不算本地修改，也不进差异；随来源装入的那份照常比较。Codex 插件与后台计划的绑定没有变：访达写入之后计划会跳过该目标并提示重新选择。
- **marketplace 兼容性检查**：只带 Codex manifest 的插件在条目中重复同一版本，不再提示“两处版本声明”。

### 文档、分发与验证

- SkillDock 从 0.11.0 升至 0.11.1：Codex manifest、应用版本与 lockfile、marketplace 条目、中英文 README、应用 README 与 Codex 原生构建产物；新增一条把这几处绑在一起的版本一致性用例。
- 需求、设计与契约：PRD 0.13（默认管理状态只在第一次发现环境时确定；登记一条已知残留；Agent 字段只显示标识）、HLD v1.35、API 契约 0.36（36c 0.35），写入条目声明版本、删除命令文件、他人写入安装目录的文件的比较规则、Claude 插件自带技能的条目等；0.11.0 发布后的收尾记录见 [65](plugins/skilldock/skills/skill-manager/references/65-post-release-wrapup.md)，实施进展见 [37](plugins/skilldock/skills/skill-manager/references/37-cross-agent-implementation-plan.md) 的“0.11.1 进展”。
- 单元测试 631 项、浏览器端到端测试 89 项在隔离沙箱中全部通过（本机 Chrome，临时配置）。沙箱不是 CI 等价环境。
- 真实 Claude 命令行 2.1.295，临时配置目录、禁网：分发冒烟装入版本为 `0.11.1`、1 个技能、0 个 MCP 服务；升级冒烟（`tests/claude-upgrade-smoke.mjs`）从 0.11.0（`838b6191431a`）更新到 `0.11.1`，同一版本只改内容时不更新，条目版本升高后更新；会话启动事件中 0.11.0 与 0.11.1 都只有一个 `skilldock:skill-manager` 入口（HLD 9.3 V21）；插件技能冒烟（`tests/claude-plugin-skills-smoke.mjs`）装上 11 种写法的插件，SkillDock 为每个插件列出的技能与 `claude plugin details` 列出的相同（不含命令文件），会话提供给模型的每一项都在其中（HLD 9.3 V23）。
- 独立评审：版本声明、校验规则、删除命令文件、官方标志与收尾记录见 [66](plugins/skilldock/skills/skill-manager/references/66-0111-packaging-review.md)；界面与启动器批次见 [67](plugins/skilldock/skills/skill-manager/references/67-0111-interface-review.md)（APPROVED，P2 2、P3 8，已处理）及其复核 [69](plugins/skilldock/skills/skill-manager/references/69-0111-interface-review-r2.md)、[71](plugins/skilldock/skills/skill-manager/references/71-0111-interface-review-r3.md)、[73](plugins/skilldock/skills/skill-manager/references/73-0111-interface-review-r4.md)（都是 APPROVED；69、71 的意见已处理，73 的 4 项 P3 留到下一版）；HLD、契约、PRD 与同批文档的增量复核见 [68](plugins/skilldock/skills/skill-manager/references/68-0111-hld-contract-delta-review.md)、[70](plugins/skilldock/skills/skill-manager/references/70-0111-hld-contract-delta-review-r2.md)、[72](plugins/skilldock/skills/skill-manager/references/72-0111-hld-contract-delta-review-r3.md)、[74](plugins/skilldock/skills/skill-manager/references/74-0111-hld-contract-delta-review-r4.md)（74：APPROVED，证书绑定到 HLD v1.35、契约 0.36（36c 0.35）、PRD 0.13；它的 3 项 P3 中属于本条目的文字已改，其余留到下一版）。
- 没有验证的（按 Owner 2026-10-13 的安排，真机确认放在发布之后，发现的问题进下一版）：Claude 桌面应用插件页的 **Update** 在声明版本后是否可用；0.11.1 装入真实的 Claude 桌面应用后，`/skilldock:skill-manager` 与“打开 SkillDock”是否照常可用（只在隔离的命令行会话中看过入口还在）；0.11.1 装入真实的 Codex 后原生入口与 `$skill-manager` 的表现。已知限制：Codex 插件的基线与后台计划的绑定仍把访达的 `.DS_Store` 计入，恢复一次技能更新时的核对也是（更新之后才出现的 `.DS_Store` 会挡住恢复，删掉它即可）；桌面应用为没有 Claude manifest 的插件自动生成的清单文件被手工改动时识别不出（PRD Q14）。

## [testany-eng 2.8.1] - 2026-10-13

### 变更

- 仓库校验脚本 `validate_codex_compat.py`：只带 Codex manifest 的插件可以在 marketplace 条目中重复同一版本（Claude 不读 Codex manifest，这是给它的镜像），两处必须是相同的非空字符串；其余插件仍只允许一处声明版本。`CLAUDE.md`、`AGENTS.md`、`docs/plugin-development.md` 的版本规则同步。

### 文档、分发与验证

- `testany-eng` 从 2.8.0 升至 2.8.1（只有校验脚本与其测试变化）；同步插件 README。版本仍仅由插件 `plugin.json` 声明。
- 校验脚本的单元测试与仓库校验（`--profile repository`）通过。

## [skilldock 0.11.0] - 2026-10-12

跨 Agent 版本：一个本地实例同时管理 Codex 与 Claude（Claude Code 与 Claude 桌面应用）的技能、插件和 marketplace。在 Codex 或 Claude 中都能安装和打开 SkillDock，两边打开的是同一个实例、同一份数据。需求、设计与接口契约随本版发布：PRD-SKILLDOCK-002、HLD-SDX-001、API-SDX-001（`plugins/skilldock/skills/skill-manager/references/34`～`37`）。

### 新增

- **Agent 环境页**：列出本机的 Codex 与 Claude，显示配置目录、命令行、技能与插件数量、各自装的 SkillDock 版本，以及 SkillDock 对它的管理状态（已启用、只读、无法确认）。首次出现时，装有 SkillDock 的一侧默认启用管理，另一侧只读；启用前列出可能写入的位置；停用 Claude 管理时可一并清理 SkillDock 生成的本地 marketplace。
- **Claude 技能**：从本地目录或 Git 安装到个人技能目录或当前项目的 `.claude/skills`；启停与可见性写入 Claude 设置；移除后可从操作记录恢复。两侧共用的技能修改前提示“两侧看到的内容都会改变”，两侧关联了不同来源时拒绝更新并说明冲突。
- **Claude 插件与 marketplace**：从 marketplace 安装（用户、项目、本地三种范围）、启停、卸载（可保留插件数据）；从本地目录或 Git 安装：带 Claude manifest 的放入技能目录，否则由 SkillDock 生成一个本地 marketplace。添加、刷新、移除 marketplace。所有改动经 Claude 自己的命令行执行，并读回核对。
- **Claude 对象的更新**：Claude 技能、技能目录插件和从 marketplace 安装的插件进入更新页。检查时按插件来源（本地目录、Git、npm、压缩包）暂存 Claude 将装入的内容，可看逐文件差异；应用前再核对一次，应用后读回。插件内容变了而版本号没变时提示维护者递增版本；没有版本号的插件更新前先复制一份。由 claude.ai 同步或组织托管的对象，以及来源为命令、需要凭证命令或项目目录已不存在的插件，不代为更新，并说明原因。
- **后台计划**可以加入 Claude 目标。Claude 管理停用或 Claude 命令行不可用时，这些目标暂停而不算失败；一侧的技能内容在另一侧插件目录中时，加入自动应用前先确认。
- **SkillDock 自身的更新**：某一侧的 SkillDock 比另一侧旧时，Agent 环境页可一键经该侧命令行更新并读回；更新后正在运行的实例自动切换到最高版本。迁移门槛处（另一侧还装着低于 0.10.3 的 SkillDock）也可经确认一键更新。
- **运行环境**：启动器按固定顺序查找并保存本机可用的 Node.js 22.12+（Codex 工作区、Homebrew、nvm 等），失效时重新查找，找不到时弹出安装引导；不再自动下载 Node。启动输出同时打印所选的 Codex 与 Claude 命令行（本机有 Claude 配置目录时）。

### 变更

- **数据迁移**：首次以 0.11 打开 0.10.x 的数据目录时迁移到新格式（数据代号 2），计划、来源绑定、操作记录与偏好保留。迁移前确认两侧装的 SkillDock 都不低于 0.10.3，否则以退出码 4 停下并说明处理办法，不改动任何数据。
- **单实例**：Codex 入口、Claude 入口与后台任务共用一个实例与同一份数据；较旧的入口把请求转交给最新版本。
- Codex 原生入口的 MCP 配置改名为 `codex.mcp.json`；Claude 不加载原生入口，从技能或 `/skilldock:skill-manager` 打开网页面板。
- 技能与插件的“管理更新”对 Codex 与 Claude 的已安装对象都可用，并定位到该对象的更新项；插件附带的技能定位到所属插件。
- 0.10.x 的界面连接 0.11 服务时保持 0.10.2 的行为：看不到 Claude 的对象、计划目标与 Agent 环境类操作记录。
- 清单读取达到 5 秒时，在 `server.log` 记录各部分耗时，便于排查。
- 删去已停用的专用 Node 下载代码；0.10.x 下载过的专用 Node 仍作为候选复用。

### 已知限制

- SkillDock 首次检查之前对 Claude 插件做的本地修改识别不出，之后的更新照常进行；被覆盖的内容可从 Claude 保留 14 天的旧版本目录或更新前的副本找回。
- 只读的一侧也提供 SkillDock 自身的一键更新（只改 SkillDock 本身，每次需确认）。
- 0.10.2 及更早版本遇到 0.11 的数据时拒绝启动或启动失败，没有“请更新”的提示，但不改动计划、绑定、历史与偏好。
- 技能库中 Claude 一侧只列个人与项目技能；Claude 插件自带的技能不能单独开关，只计入所属插件的技能数（插件页显示数量）。
- 在 Codex 中直接更新或重装某个插件后，自动更新计划不再接管它（0.10.x 起的规则：安装目录变化即视为新对象），需要在更新页重新选择。
- Claude 桌面应用插件页的 Update 不识别 SkillDock 的新版本（SkillDock 在 Claude 一侧以提交摘要作版本）；请在 SkillDock 的“更新”页检查并应用，0.11.1 将在 marketplace 条目中声明版本号。

### 文档与分发

- SkillDock 从 0.10.3 升至 0.11.0；同步插件 manifest、应用版本与 lockfile、中英文 README、应用 README，以及 Codex 原生构建产物。
- 仓库的 Claude marketplace（`.claude-plugin/marketplace.json`）收录 SkillDock，并给 TeamDesk 条目注明“仅支持 Codex”。

### 验证

- 单元测试 614 项在隔离沙箱中全部通过，其中兼容矩阵 103 项对手写样本与真实 0.11.0 各跑一遍（含 V18 门槛的环境组合与 0.10.2/0.10.3 共存用例，[55](plugins/skilldock/skills/skill-manager/references/55-compat-matrix-coverage.md)）；浏览器端到端测试 86 项通过（本机 Chrome，临时配置）。沙箱不是 CI 等价环境。
- V17：在另一台电脑的真实 Codex 中从 0.10.3 更新到 0.11.0，安装后约 70 秒由 0.10.3 自更新协调器转交给 0.11.0 并完成迁移，计划、绑定、历史、项目与后台任务保留（计划中 SkillDock 自身一项需重新选择），开着的原生页面自动重连；“重启 Codex 后”与“`$skill-manager` 为同一实例”两项以间接证据为准（[64](plugins/skilldock/skills/skill-manager/references/64-v17-results.md)）。
- 最终 UAT：在 Claude 桌面应用中添加本仓库 marketplace、从插件浏览器安装、与 Codex 共用同一实例、在 SkillDock 更新页不用终端更新（含桌面应用刷新 marketplace 之后），以及从本地目录把插件装到 Claude（[61](plugins/skilldock/skills/skill-manager/references/61-final-uat-claude-desktop.md)）。UAT 带出的问题已修复：Codex 原生入口每次显示“已跳过无效的项目目录”、沿用实例时 stderr 的扫描目录不准、桌面应用写入的合成清单与访达的 `.DS_Store` 被判为本地修改。
- P0 验收逐条核对（[56](plugins/skilldock/skills/skill-manager/references/56-p0-acceptance-check.md)）：全部满足，或为 Owner 认可的例外与随版发布的界面残余（记入 [41](plugins/skilldock/skills/skill-manager/references/41-ui-redesign-backlog.md)）。
- 独立评审：HLD v1.31、API 契约 0.32（36c 0.31）、PRD 0.11 的证书绑定见 [59](plugins/skilldock/skills/skill-manager/references/59-cross-agent-6d-rereview-r2.md)；阶段 6 与最终 UAT 修复的代码评审见 57～59、62、63 系列报告。

## [testany-eng 2.8.0] - 2026-10-11

### 新增

- **新增 ui-designer**：新增 `ui-designer` skill 与 `/testany-eng:ui-designer` command，负责决定产品界面长什么样、用起来是什么感觉。输入可以是口述需求、PRD/Journey、截图或品牌材料；自行判读视觉性格、构图、组件和交互；方向开放时把两个方向做成同一个代表页供用户选择；产出设计包（设计说明、设计语言、token、组件规格、交互编排、高保真页面与证据）。有前端仓库时写进与 prototype-designer 共用的隔离沙箱，可直接交接；没有仓库时输出独立设计包。第一版不设独立 reviewer，使用共享质量清单自检。guide 新增对应导航与设计包识别。第一轮用子代理冷启动做了三道题的对照试跑，并按失败样本修正了示例、方向拍板、临时 token、单页产品、系统事件、观看距离字号、信息单元计数、取证环境等规则；该轮试题与当时的示例重合，示例随后全部换成冷门题材。用户盲评中基线以 2:1 胜出（排班、作品集输，值班大屏胜），随后确立“任务效率与领域惯例 > 业务目标 > 普通用户眼中的美观 > 辨识度”的优先级，新增场景操作构思、美观与质感要求和转化页的说服结构，方向对比改为只做代表页首屏，页面范围改为覆盖完整旅程。第二轮换新题试跑后盲评为 ui-designer 1 胜 2 平；据此补充流程类内容的分步引导规则，并澄清文档时间点、单页产品范围、混合方案处理、示例制度标注和测量取证口径。

### 变更

- **prototype-designer 设计与交互升级及拆分**：
  - 与新增的 ui-designer 拆分职责：设计指南与质量清单移到插件共享目录 `references/design/`，仓库探查、沙箱隔离与运行检查抽成共享的 `references/frontend-sandbox.md`；prototype-designer 收窄为在沙箱中验证流程、状态和数据需求，视觉依据优先级为用户指令、设计包、仓库设计系统、最小基线；prototype-reviewer 在有设计包时检查符合度，并认可设计包中已记录的 `[DESIGN]` 组件。
  - 新增视觉方向与构图、组件选择与组合、交互编排与动效三份指南：六种页面主轨、十种构图家族、六层视觉语言、设计签名，以及按输入方式设计的 P0 交互编排；reviewer 门二同步检查。
  - 先定每页构图再匹配组件；主轨、构图和三个校准轴改为逐页记录，三轴按 taste-skill 原文分档并用可观察依据锚定。
  - 生成默认样式改为事前声明：没有品牌或设计系统要求时默认不用，确需使用须在 Brief 写明任务依据；新增各轨默认骨架、反馈症状反查表和视觉手法代价表。
  - 代表页门槛加入测量证据（区块面积占比、强调色落点、首屏信息单元数、样式种类），只用于核对 Brief，不设阈值；交付摘要与评审报告新增对应记录。
  - 交互编排分完整和一行两档；焦点只在编排中记录，组件适用状态并入组件清单；补充 FLIP、共享滚动进度、两层弧线、速度判定等不新增依赖的实现手法；示例改为多主轨。
  - 新增设计判读：从使用频率、设备、任务、数据形态、行业语境等需求信号推出视觉性格、构图、组件和交互，写出带依据和置信度的判读单后直接动手，不等用户指定风格。
  - 支持独立使用：输入可以是 PRD/Journey，也可以是口述需求、截图或零散材料；缺少正式文档时整理成需求推断卡作为追溯基线，不再要求先走 uc-interviewer。prototype-reviewer 以推断卡为基线评审并核查其忠实度，不进入下游时门四记不适用。
  - 新增设计知识来源与规则维护说明，区分标准、外部 skill 原文、短视频语料和本仓库补充；规则改动须附失败样本。未经新旧对照试跑，不代表生成效果已被验证。

### 文档、分发与验证

- `testany-eng` 从 2.7.1 升至 2.8.0，共 24 个研发与协作 skills；同步中英文 README、插件 README、marketplace 描述与命令清单、guide 导航和完整包资源清单（`workflow-package.json`）。版本仍仅由插件 `plugin.json` 声明，其他插件不升版。
- 四个相关 skill 的 frontmatter 校验、仓库发现校验（38 个 active skills）、插件单元测试（242 项通过、1 项跳过）、b2/b3/b4/gpt6 测试套件、Markdown 链接与锚点、差异检查和包资源哈希检查均通过。
- 用子代理冷启动做了两轮、每轮三题的对照试跑，并由用户盲评：第一轮（题目与当时示例重合）基线 2 : 1 胜出，修改规则后第二轮 ui-designer 1 胜 2 平；ui-designer 比基线多花约 45% 的 token。样本小，只说明方向，不代表效果已被充分验证；本轮发布不修改用户安装缓存。

## [skilldock 0.10.3] - 2026-10-08

跨 Agent 版本（0.11.0）之前的过渡版。它让 0.10.x 用户在另一侧或本侧升级到 0.11 之后，旧入口不接管、不改写新数据，并尽量直接转到新版本。行为按 API 契约 API-SDX-001 冻结；契约、PRD 与 HLD 随 0.11.0 一起发布。

### 新增

- 遇到 0.11 及以上版本写下的数据（数据代号 ≥ 2，或新格式的启动记录）时，启动器在选择工具链、下载 Node 或构建之前判定并转交：先转交本安装的较新缓存；否则把已在运行并核实过的新实例交还给调用方；否则调用记录中的首选启动目标或本机最高的同源安装；都不可行时以退出码 3 提示更新本侧 SkillDock。只执行同名、同源、未带废弃标记的 0.11 及以上安装中的启动脚本；判定过程不联网、不写文件，从不自己接管。
- 已在运行的新实例与请求的项目不同时，改由新版启动器切换项目；新版启动失败时回落为沿用原实例，并说明项目未切换。
- 自更新失败后逐次延长等待（1 分钟起加倍，最长 30 分钟），出现新的待更新版本或安装变化时重来，避免另一侧仍有旧版时每秒重试。
- 后台定时任务遇到较新数据时本次直接结束，不读写计划、不停用、不注销后台任务。

### 修复

- 启动失败时 Codex 原生界面只显示 “redact is not a function”，现在显示“SkillDock 后台启动未完成。”与具体原因（包括需要更新本侧的提示）。

### 文档与分发

- SkillDock 从 0.10.2 升至 0.10.3；同步插件 manifest、应用版本与 lockfile、中英文 README、应用 README，以及 Codex 原生构建产物。技能说明补充退出码 3 的含义。其他插件不受本轮影响。
- 新增兼容测试矩阵：用 Git 历史中的 0.10.2 真实代码、本版代码与手写的 0.11 状态样本，在临时目录中覆盖原生入口、技能入口、后台、自更新与回退共 37 条用例；另增转交链单元测试 9 项、自更新退避测试 3 项。

### 验证

- TypeScript 检查与 Codex 原生构建通过；单元测试 286 项中 285 项通过，兼容矩阵 37 项全部通过。唯一失败的工具链用例在未改动的 0.10.2 代码上同样失败：本机 Node 来自 nvm，自带 npm 先于应用包内 npm 被选中，与本次改动无关。仓库发现校验通过。

## [skilldock 0.10.2] - 2026-10-06

### 修复

- 修复英文与日文插件安装、卸载、启用和禁用提示被宽泛标签模板抢先匹配，导致中外文混杂的问题。整句翻译按固定文本的具体程度优先匹配，保留插件名称和外部参数原文；新增服务消息与重载提示组合的单元回归，以及真实安装流程的完整 toast 断言。
- 补齐插件详情安装路径、Git 更新说明、暂停计划、后台连接和清单诊断的英日译文；更新失败与新写入的操作记录传递错误码以显示对应译文，原始诊断可展开查看。嵌套诊断仅翻译应用消息，插件名称、路径和外部内容仍保留原文。

### 文档与分发

- SkillDock 从 0.10.1 升至 0.10.2；同步插件 manifest、应用版本与 lockfile、中英文 README，以及 Web / Codex 原生构建产物。其他插件不受本轮影响。
- 增加中英日服务消息与完整安装提示回归，覆盖插件详情、嵌套诊断、更新失败和操作记录的英日显示；原始名称、描述与诊断保留。

### 验证

- TypeScript、Web / Codex 原生构建通过；237 项单元测试、86 项浏览器回归通过。仓库发现校验（37 个技能）、版本 authority 与递增检查、100 个本地文档链接及差异检查通过。

## [testany-eng 2.7.1] - 2026-10-05

### 修复

- 恢复工具按整次 8192-byte 预算完整容纳核心字段，普通 JSON 显式选择使用 6144-byte 总预算，不再默认以 1200-byte 单值门槛制造补读；修正整段能放下却因续读元数据被多拆一页的情况。
- 超长值返回精确、固定来源的续读参数，公共参数共享，避免挤占正文。`resume` 续读同时核对入口、任务和状态版本；`bind` / `locate` 返回可直接使用的恢复参数。
- `code-writer` / `code-reviewer` 将日常恢复直接指向入口命令，接入与切换说明按需读取，减少目录探索和参数重试；保留新 Candidate、反证、独立核验及既有评审门禁。

### 文档、分发与验证

- `testany-eng` 从 2.7.0 升至 2.7.1；同步中英文 README、工具说明、行为验证要求和完整包资源清单。版本仍仅由插件 `plugin.json` 声明，其他插件不升版。
- 125 项相关自动测试通过；仓库发现、两份修改 skill 的 frontmatter、资源清单与差异检查通过。同一冻结摘要离线取全六字段从两次读取降为一次；独立恢复演练一次 `resume` 取全并保留未做项和新反证。
- 上述验证不等于真实工程 Token 节省或在线角色已采用；本轮发布不修改用户安装缓存及在线线程状态。

## [testany-eng 2.7.0] - 2026-10-04

### 新增与修复

- 新增 `code-writer` 及 command、导航和发现说明，覆盖已授权实现、排障、必要测试、精确 Candidate 交接与工程续接。
- Writer / Reviewer 共用随完整插件发布的资源校验、任务绑定和有界读取工具，按实际安装位置解析依赖。小入口只定位原工程记录；任务切换明确核对身份，长 JSON 字段支持固定来源的无损续读，浏览器适配支持重装与缓存失效检测。
- Reviewer 兼容既有 entries 与显式 evidence/source map，保留 pin、路径和内容核验；hash-only 结果明确只验证列出的文件，不补造历史 size 或批准。状态查询复用已有结论，新 Candidate、反证和独立核验仍按原要求处理。
- 配套更新 `delivery-secretary`，继续担任 Delivery Manager，维护目标、承诺、依赖和进度；工程判断由 Writer / Reviewer 各自维护，不新增同职责 skill、审批门禁或 ACK 往返。

### 文档、分发与验证

- `testany-eng` 从 2.6.0 升至 2.7.0，共 23 个研发与协作 skills；同步中英文 README、marketplace 和完整包资源清单，版本仍仅由插件 `plugin.json` 声明。
- 生命周期 / 任务切换 / 依赖失败 / JSON 与浏览器读取、Reviewer 回归和路由检查共 125 项自动测试通过；仓库发现校验与三份核心 skill 的 frontmatter 校验通过。隔离独立样例覆盖 Writer 修复、状态恢复与切换、Reviewer 初审 / 整改复审 / 控制输入。
- 工具测试和隔离样例不代表真实宿主压缩、在线线程采用或长期 Token / 时间节省已经验证；浏览器适配仅适用于文档列出的宿主能力。本轮发布未更新用户安装缓存或在线角色状态。

## [skilldock 0.10.1] - 2026-10-02

### 修复

- 修复第三方 marketplace 因重复声明版本而无法添加、预览或更新的问题：以 `plugin.json.version` 为准，保留原文件并展示非阻断提示。
- 修正 `strict:false` 判定：manifest 存在且条目自身声明六类组件字段时才冲突；仅 manifest 声明组件合法。组件发现与预览遵循相同规则，保留来源身份、路径边界、悬空链接与非法版本保护。
- 在市场卡片、插件详情、安装预览和更新检查中展示中、英、日兼容性提示，提示不进入会阻断操作的错误诊断。

### 文档与分发

- SkillDock manifest、应用 package 与 lockfile 同步到 0.10.1，重新构建网页和 Codex 原生 UI；同步中英文 README、第三方测试样本许可与[兼容性说明](plugins/skilldock/skills/skill-manager/references/marketplace-compatibility.md)。
- 根级 AGENTS / CLAUDE 与发现维护文档区分本仓库单一版本的编写政策和第三方安装兼容规则；其他插件内容与版本不在本轮发布范围内。

### 验证

- 后端回归 219/219、浏览器回归 84/84 通过；包括中英日、浅深色的完整提示与安装流程。TypeScript、Web / 原生构建、候选树发现校验、107 个文档本地链接和 47 个原生输入 / 4 个产物摘要核验通过。
- Codex CLI 0.159.2 在隔离目录完成原始 metadata 加合成技能的安装、版本优先级更新和启用选择读回；真实 `ui-ux-pro-max-skill` 仓库只读核验 7 个技能、682 个文件，未在用户环境安装该插件。

## [skilldock 0.10.0] - 2026-10-01

### 新增与修复

- 官方应用目录接入：按 Codex 返回的应用身份补齐 Miro 等插件的显示名称、介绍和 Logo，插件页与安装窗口支持真实名称及别名搜索，不再只显示内部编号。筛选隐藏结果时可保留关键词查看全部匹配。
- 官方应用插件经预览、Codex CLI 安装与清单读回，分别显示安装和账号连接状态，并保留官方授权入口。安装结果不明时不误报成功、不自动重试，可先核对状态再决定下一步。
- 图标按可见条目加载，限制来源、大小和并发并复用缓存；目录不可用不阻断本地技能管理。安装前再次核实策略、版本与应用身份；未可靠关联身份的插件保持原有限制。
- 远程完整组件清单与逐项技能选择仍以宿主应用接口能力为限；不将应用介绍冒充完整技能清单。

### 文档与资源

- 同步中英文产品与仓库说明，补充[官方应用目录接入与验证边界](plugins/skilldock/skills/skill-manager/references/official-app-directory.md)。
- SkillDock manifest、应用 package 与 lockfile 同步到 0.10.0，重新生成 Web 与 Codex 原生产物；其他插件不受本次发布影响。

### 验证

- 0.10.0 后端回归 212/212、浏览器回归 78/78 通过；TypeScript、Web / 原生构建、仓库发现校验及文档本地链接检查通过。核对 46 个原生构建输入和 4 个产物摘要；Vite 保留既有大 chunk 提示。
- 在真实 Codex 目录中只读核对 Miro 的显示名称、介绍、Logo 与安装预览；安装、授权分离及失败读回使用隔离测试。未实际安装 Miro，也未替用户授权账号。

## [skilldock 0.9.1] - 2026-09-29

### 修复

- **SkillDock 目录兼容性**：统一自定义 CODEX_HOME、已登记 marketplace 与迁移后的 skills / 插件缓存根路径；补齐外部技能链接和外置项目的仓库范围发现。链接移除保留真实目标，详情显示入口与实际路径；迁移缓存的插件更新、自更新和原生恢复使用一致身份。保留运行期目录替换保护，并支持经校验的跨磁盘技能移动与恢复。实现与隔离验证见 [目录兼容性记录](plugins/skilldock/skills/skill-manager/references/33-directory-compatibility.md)。

### 文档与资源

- **SkillDock 产品 README**：重写中英文产品入口，使用蓝色三层 Logo 与 Ubuntu 字标、深浅色新版界面实拍图，以及插件技能选择和更新 diff 展示；突出安装、侧栏入口、后台更新、反馈与 Testany 相关插件，并同步安装、管理和自定义目录的支持范围。
- 归档此前的独立界面原型及设计、自检记录；明确它使用示例数据、不接入正式业务，生产入口与源码构建范围不变。
- SkillDock 插件 manifest、应用 package 与 lockfile 同步到 0.9.1；更新根目录与应用说明，重新生成 Codex 原生 UI / MCP 产物。

### 验证

- 0.9.1 后端回归 202/202、浏览器回归 72/72 通过；正式与原型 TypeScript 检查、Web / 原生构建、原型独立构建及仓库发现校验通过。Vite 保留既有大 chunk 提示，不影响构建成功。
- 在隔离 HOME/CODEX_HOME 中使用真实 Codex CLI 安装 0.9.1，验证 MCP 发现、按需冷启动、标签写入读回、后台重启与过期会话拒绝、MCP 重连；测试结束清理隔离环境，未修改用户日常安装。
- 核对原生构建的 45 个输入和 4 个产物摘要；中英文产品 README 的深浅色、移动端与链接检查通过。跨磁盘分支采用 EXDEV 注入，不代表实体外置磁盘断连或断电验收。

## [skilldock 0.9.0] - 2026-09-29

### 提供者图标与品牌更新

- 技能与插件的列表、详情及安装预览优先使用包内声明的原始图标；技能未提供时继承所属插件，缺失或无法显示时保留默认图标。支持插件深色 logo，保持原图颜色与比例。
- 图像按包内边界读取、去重并限制大小，浏览器与原生应用共用同一实现。普通 Marketplace 保留来源类型图标；远程未安装插件的在线图标元数据补齐暂未纳入。
- 采用已确认的蓝色三层 Logo，上两层倾斜 −8°，透明节点与连线呼应 Testany；字标采用 Ubuntu Medium 转曲图形，无需用户安装字体。
- 应用导航、网页标签和 Codex 原生入口共用图标源，补齐插件自身的浅色与深色图标声明；修复原生构建 SVG data URL 中引号导致品牌图形变成色块的问题。

### 版本与说明

- 独立 `skilldock` 从 0.8.0 升至 0.9.0，manifest 为唯一插件版本 authority，应用与锁文件同步；其他插件版本不变。
- 同步中英文 README、第三方许可、图标生成脚本与原生分发资源。升级后刷新网页；Codex 已缓存的入口图标需重新加载插件或重启宿主。
- 历史设计原型与本机截图保留在本地，不纳入本次分发。

## [skilldock 0.8.0] - 2026-09-29

### 原生主页面与桌面界面

- 将完整管理界面接入 MCP Apps，支持 More 入口和用户固定；沿用原有浏览器入口。
- 按需启动并复用受管后台，断线后自动恢复，实例变化后重新读取清单；写请求不自动重放。
- 使用可移植的插件根相对启动路径、自包含界面和 MCP bundle；补充隔离安装与协议、生命周期验证。
- 识别新版桌面应用的 codex-cli/bin/codex；启动锁可回收已退出进程留下的记录，旧 MCP 会话在自更新后沿用新版安装。
- 原生入口与固定持久化已在桌面宿主 26.924.22138 实测；其他宿主版本保留浏览器入口。隔离安装、实际 MCP 协议和浏览器回归覆盖完整产品，不将这些检查等同于所有宿主的 UAT。
- 修复原生宿主深色样式覆盖应用浅色配色：主题变量、控件色彩与 diff 样式统一绑定 SkillDock 自身容器，补充宿主与应用主题不同的验证场景。
- 正式产品五个页面采用紧凑桌面布局：玻璃侧边栏与工具栏、语义化浅深配色、统一列表与筛选、宽窗口详情侧栏和窄窗口详情面板。
- 增加可见的更多操作及右键菜单、列表键盘导航、应用内搜索快捷键，并保存页面、筛选、视图、详情与滚动位置；弹窗隔离背景并在关闭后恢复焦点。
- 支持减少透明度、系统减少动态效果和提高对比度偏好，校正原生下拉控件及中等宽度窗口导航；原生入口与浏览器共享同一产品界面。

### 版本与说明

- 独立 `skilldock` 从远程 main 的 0.7.0 升至 0.8.0；manifest 为唯一版本 authority，应用与锁文件同步。
- 同步根目录及插件的中英文安装说明、应用开发说明、第三方许可和原生分发资源；历史原型不纳入分发。

## [skilldock 0.7.0] - 2026-09-28

### 新增

- Skills 页搜索栏新增“仅显示重复”，集中列出存在同名副本的技能，支持叠加关键词、来源、状态和标签筛选，并保留卡片/列表切换及按路径管理同名技能的入口。
- 重复判定使用完整扫描结果，不受当前筛选影响；清除筛选同时关闭开关，同名副本处理到只剩一份后自动退出重复列表。
- 同步中英日文提示、空结果说明、深浅色及窄屏布局。

### 版本与验证

- 按新增兼容能力从 `0.6.0` 升 minor 至 `0.7.0`；同步插件清单、应用与锁文件、根及插件 README，Marketplace 保持单一版本 authority。
- 构建与 17 项相关浏览器回归通过；隔离环境实测组合筛选、清除条件、键盘操作、三种语言与移除副本后的自动刷新。未操作真实技能库，不将浏览器验证表述为宿主安装验证。
- 发布构建及同名技能管理/对应源码包 20 项回归通过；仓库发现静态校验通过（36 项技能），插件与应用版本一致，Marketplace 不重复声明版本。

## [testany-eng 2.6.0] - 2026-09-28

### 新增

- `delivery-secretary` 交付秘书：持续维护目标拆解、共享依赖、原始承诺与进度；保留拆解后的原始计数和上层恢复路径，在既有授权内主动澄清状态，不替代工程判断或扩大范围。
- 提供可选 JSON 台账模板、只读结构检查与统计工具，检查组合图环、完成矛盾和消息依据，支持原始测试集合、短明细与分页。
- 新增 command、agent metadata、Guide 可选路由及可复现的离线行为样例；同步插件发现描述和中英文 README。不默认创建线程、安装或配置后台监控。

### 变更

- `code-reviewer` 增加可选秘书协作接口：沿用既有授权、精确 binding 与 Review Record，同步实质状态变化并回答定向询问；纯状态查询不启动新评审，新 Candidate 或反证仍按影响范围核验。
- 秘书收件、任务 ID 与台账更新不成为源码准出条件；保留原评审模式、P2 非阻断和源码/CI/环境分层，不为进度统计重跑工程验证。
- 按新增兼容能力将 `testany-eng` 从 `2.5.1` 升至 `2.6.0`；版本仅由插件 `plugin.json` 声明，Marketplace 不重复声明。

### 验证

- 秘书统计工具 17 项、Code Reviewer 91 项、兼容性校验器 39 项及评审边界/路由 6 项回归通过；独立演练覆盖秘书两轮恢复、Reviewer 状态查询与配对整改复审、无秘书场景。
- 验证范围为本地静态检查、脚本回归和离线行为样例；未将其表述为真实跨线程发送、后台唤醒、宿主安装或长期 Token/耗时收益已验证。

## [testany-eng 2.5.1] - 2026-09-28

### 修复

- 减少 `code-reviewer` 反复读取大清单和临时编写证据校验代码的开销：完整 snapshot/receipt 保存为不可覆盖的附件，默认 stdout 不超过 4096 bytes，并报告差异总数和省略数量。
- 复用内置 snapshot 比较及 manifest/archive/source 校验；固定输入摘要，核对原始字节与适用的权限语义，避免将 tar group-write 差异误报为 Git executable bit 变化。
- 保持原 snapshot schema、digest 算法和 Python `create_snapshot()` 接口；默认 CLI stdout 改为摘要，依赖旧版全量 snapshot stdout 的机器消费者需显式加 `--full-json` 并重定向。
- 同步按需工具指南、证据复用规则、中英文 Scope Lock 与 README；工具不替代语义评审、证据覆盖或执行绑定，不新增每轮门禁或复跑测试要求。
- 按本次补丁发布范围将 `testany-eng` 从 `2.5.0` 升至 `2.5.1`；版本仅由插件 `plugin.json` 声明，Marketplace 不重复声明。

## [仓库发布规则] - 2026-09-27

### 变更

- 明确本仓库任何内容合并到远程 `main` 即为发布，合并授权包含该次发布的必要准备；不再将“源码合并”和“以后发布”拆开。
- 合并前对照最新 main 递增受影响插件版本，同步发布记录并验证；插件内文档和资源不豁免。根级规则与文档按实际影响记录，不给未受影响插件空升版本。
- AGENTS、CLAUDE、README 和维护手册同步合并前检查及合并后远程读回要求；保留 TeamDesk 的专用版本增量规则。

## [testany-eng 2.5.0] - 2026-09-27

### 变更

- `prototype-designer` 默认追求高保真与视觉精美，新增任务驱动的 Visual Brief、设计 token、代表页打磨及浏览器观察—修正—复验；线框稿遵循用户保真度。
- 新增视觉设计指南，覆盖排版、配色、布局/密度、组件、内容、多状态、动效与适配；继承成熟系统、补齐缺口，新项目不跳过视觉基线。
- `prototype-reviewer` 门二同步检查视觉品质、真实交互与当前实现的证据；严重缺陷、证据缺口和审美建议分开判定，P2 不按数量阻断，专项检查不扩大范围。
- 同步中英文 Manifest、交付/评审模板、探查指南、command、界面说明和 README；保留沙箱隔离、组件复用、Mock 与 Journey 追溯。
- 本次新增视觉设计与体验验收能力，按 SemVer 升 minor：`2.4.1` → `2.5.0`。版本仅由插件 `plugin.json` 声明，Marketplace 不重复声明；安装端需更新插件后使用新版。

## [skilldock 0.6.0] - 2026-09-25

### Added
- Marketplace、本地目录和 Git 来源在安装确认前统一列出技能名称、用途和路径，支持搜索、全选、全不选及逐项勾选；插件仍整包安装，未勾选技能保持禁用，其他组件不受影响。
- 保存逐技能选择，手动及定时更新映射到新版本缓存路径，新增技能默认禁用；外部同步后在下一次检查恢复绑定。

### Fixed
- 修复禁用一个插件内技能会关闭整个插件的问题。Skills 页仅切换目标技能，Plugins 页总开关仍控制整个包。
- 按 SKILL.md 真实路径配置和去重，防止符号链接别名导致未选技能仍被 Codex 加载。
- 长技能列表滚动显示并固定确认按钮；中、英、日和浅深色同步。

### Upgrade notes
- 旧版误关整个插件的用户，升级后先在 Plugins 页重新启用插件，再在 Skills 页禁用目标技能；不自动更改已有总开关。配置在新的 Codex 会话或重载后生效。
- 此轮包含新增兼容功能，按 SemVer 升 minor 至 0.6.0；同步应用、锁文件、插件清单及安装说明，Marketplace 不重复声明版本。

### Validation scope
- 后端、浏览器、构建和仓库发现检查，以及隔离配置下的真实 Codex 安装、单技能开关及更新验证，见[本轮实现记录](plugins/skilldock/skills/skill-manager/references/28-plugin-skill-selection.md)。
- 当前本机 Codex 缓存会省略包内目录链接；这类包仍保留完整内容核验失败，不声称更新成功。普通目录插件的安装及更新通过；未修改种子用户环境。

## [skilldock 0.5.0] - 2026-09-24

### Added
- 插件可从本地目录、Git 仓库或 GitHub 目录链接直接安装；确认前预览实际插件与组件，自动登记单插件来源，保留原来源信息并支持后续手动及定时更新。
- 项目下拉选择汇总 Codex 已保存项目、最近目录与当前目录；按真实路径去重，缺失目录禁用。macOS 支持选择已有文件夹，其他平台保留手动路径输入。

### Changed
- Skills / Plugins 统一统计筛选、搜索、标签、卡片/列表、详情、分页和“来源 → 预览确认”安装流程；保留 Marketplace 安装入口，添加来源后回到安装窗口。
- 中、英、日和浅深色同步，修复长项目路径在窄窗口中的布局溢出。新建项目及创建 Codex 侧栏项目按用户决定暂缓。
- 本轮为新增兼容功能，按 SemVer 从 0.4.2 升至 0.5.0；同步应用、锁文件、插件清单和安装说明。

### Validation scope
- 构建、后端与浏览器回归通过；真实 Codex CLI 使用独立配置验证单插件安装、内容核实、包更新及 Marketplace 安装。详细执行证据见 [本轮实现记录](plugins/skilldock/skills/skill-manager/references/27-library-install-and-projects.md)。
- 系统文件夹对话框的真实桌面体验待 UAT；未修改本机现有插件安装或种子用户环境。

## [teamdesk 0.3.0] - 2026-09-24

### Fixed
- 启动器主程序、Codex 启动组件和图标渲染器均明确以 macOS 13.0 为编译目标，不再继承本机编译环境的隐式最低版本。
- 原子替换图标前及完整安装核验时，同时检查 Info.plist、两个 Mach-O 程序的真实最低系统版本/平台/架构与签名；不一致时停止并报告失败，安装结果保留核验信息。
- 添加高版本编译环境、主程序/辅助程序不一致、架构/平台错误及真实编译回归。种子用户 macOS 27.0 上生成的两个程序要求 28.0，导致 Finder 拒绝打开；本地修复阶段 0.2.1，合并 main 按约定升为 0.3.0。目标机器仍需重装后启动复测。

## [teamdesk 0.2.0] - 2026-09-24

### Fixed
- 修复公开下载安装入口在 macOS 临时目录/符号链接路径下静默退出：Node 模块真实路径与命令行路径先规范化再判断是否直接执行。
- 图标构建与一键启动入口采用相同路径判断，shell 安装入口解析物理目录；保留原有原生安装、逐文件核验和失败恢复语义。
- 新增链接路径进程回归，并在真实 macOS 临时路径中跑通安装及图标签名；更新种子测试文档。此次再次合并 main，按约定 minor +1。

## [teamdesk 0.1.0] - 2026-09-24

### Added
- 首次发布完整 TeamDesk MVP：32 位在职员工、部门与共享资料、原生任务绑定、FIFO/steer、网状交接、问题/审批归属、负责人报告、人类验收与共享 hook 记账。
- 就地 AI 撰写部门职责、工作说明、任务目标与完成标准；按需读取本地参考资料，并由人类采用后保存。
- 连接阶段与恢复、完整投递回执、SQLite 事务化 metadata 历史及部门/员工协作拓扑与回放。
- 一次安装入口 `install-teamdesk.sh`：检查依赖、通过原生 CLI 安装插件、创建并验证 macOS 启动图标；GitHub main 与本地 clone 均可安装。失败可重跑，来源冲突/禁用/降级明确处理；图标保存本机运行时选择。
- macOS 图标启动/复用本地工作台与共享 Codex Desktop，并在 Safari 打开；已有普通模式 Codex 提示正常退出，不强制中断任务。

### Validation scope
- 既有本地迭代 0.0.1–0.0.13 的验证历史保留在插件文档，本轮安装开发阶段为 0.0.14，首次 main 发布按约定升为 0.1.0。
- 第二台 Mac、Intel / 较早 macOS 及完整冷启动仍需种子验证；实验接口兼容性不等于所有新版 Codex 均已实测。

## [skilldock 0.4.2] - 2026-09-23

### Fixed
- 插件被外部同步后，若安装版本及完整内容与已核实来源一致，检查会恢复过期基线，不再持续误报 `LOCAL_CHANGES`；恢复不覆盖安装文件。
- 定时计划可在来源、插件和安装目录身份保持一致时核实内容同步并恢复绑定；手动检查、后台检查及检查过程中发生的同版本同步均可恢复，历史记录与计划设置保留。
- 恢复前后复核来源、目录和内容，真实本地修改、身份替换与检查期间的变化仍会被拦截；恢复事件提供中文、英文、日文提示。

## [skilldock 0.4.1] - 2026-09-23

### Fixed
- 后台唤起未执行更新时，不再把历史批次的错误显示为当前执行失败；自动兼容 0.4.0 已保存的误报状态。
- 后台任务状态与更新对象的检查结果分别展示；真实运行环境错误保留发生时间和重试信息。
- 更新结果记录保存对象、比较时的已安装/来源版本与发生时间；中文、英文、日文同步，旧记录缺失的版本明确显示为未记录。

## [skilldock 0.4.0] - 2026-09-23

### Added
- macOS 用户级独立后台更新：系统按需启动、执行后退出，网页服务与 Codex 可关闭，登录/唤醒后补做过期计划。
- 更新页新增真实后台状态、最近唤起、成功时间与失败信息；三语言同步。
- 持久化失败退避、跨进程互斥、执行中停用、异常退出恢复；现有已启用计划迁移。
- 稳定启动入口与自身更新运行目录切换，不依赖旧版本插件缓存；停用和已确认卸载清理系统任务。

### Changed
- 网页服务不再运行自动更新计时器；手动检查使用同一更新执行逻辑。
- 停止网页服务不再停止定时更新；关闭自动更新须在更新页停用计划。

## [skilldock 0.3.0] - 2026-09-15

### 导航与私有来源访问

- 移除侧栏当前页面的红点和窄屏装饰，使用选中背景并保留读屏页面状态。
- Git 下载复用本机 HTTPS credential helper、SSH 设置及企业 CA；安装、关联和更新使用相同凭据，文件检出保留 hooks/filter 限制。
- 增加中英日私仓认证说明，以及认证不足、仓库不可见、SSH 主机未验证的具体提示；验证凭据失效后的定时任务失败和恢复。

### 更新进度与本机标签

- 检查全部显示真实逐项进度、当前对象、耗时和成功/跳过/失败结果，轻量进度读取不重复扫描或等待 CLI。
- 插件卡片增加更新入口，明确按整个插件及其附带技能更新。
- 技能和插件支持本机标签的新增、修改、移除及多选筛选，跨重启和正常版本更新保留，重名副本分别管理。

## [skilldock 0.2.0 / testany-eng 2.4.1] - 2026-09-15

- SkillDock 移至独立 skilldock 插件，新安装只含一个应用 skill；testany-eng 移除应用入口，保留 21 个研发 skills。
- 增加旧包到独立插件的显式数据接续，保留原计划与历史，不自动卸载整套研发工具。
- CLI 按版本与插件能力验证 PATH、桌面应用和 Codex 管理的候选，打印最终绝对路径；安装说明加入损坏 wrapper 回退。
- 增加 --project、请求/最终目录说明、GUI 项目切换与保存；中断调用后提示核实后台服务状态。
- Git 来源支持直接粘贴 GitHub tree 目录链接，自动解析真实分支、标签和子目录；保留显式 ref 覆盖与高级子目录选项。
- 技能/插件更新及关联来源预览新增默认折叠的逐行 diff，显示行号和增删内容，对二进制、大文件及过期预览明确反馈。
- 删除侧栏底部宣传文案，产品署名改为 A Testany Product。
- 同名技能新增按安装路径单选/多选移除，默认全部保留；确认页明确移除和保留清单，每份独立记录与恢复，组成员或内容变化拒绝旧预览。

## [testany-eng 2.4.0 / SkillDock 0.1.0] - 2026-09-14

- 新增 `skill-manager` 与本地 SkillDock GUI，管理 Codex 技能、插件、市场来源、安装更新、启禁和可恢复移除。
- 支持浅色、深色、系统外观及中英日界面；显示已有安装的来源证据，支持关联更新来源、小时周期与所选对象的后台自动更新。
- 支持 SkillDock 自身更新后的自动重启与界面重连，跨版本保留计划及历史；构建失败保留旧服务，启动失败尝试恢复旧运行目录。
- macOS 启动入口自动复用 Codex 的 Node.js/npm，并在缺失时准备经过固定摘要校验的专用运行时；首次启动及自动重启无需用户预装全局 Node。
- 三轮 UAT 整改已完成；产品移除 Sandbox，打开即本机清单，隔离夹具仅供自动化测试。本机文件与计划保留。
- SkillDock 子树采用 AGPL-3.0-only，提供完整许可证、第三方声明和对应运行版本源码；其他 skills 沿用 MIT。
- 先通过现有 Git marketplace 分发，新增 Codex 安装与更新指引；不代表进入 OpenAI 官方目录。

## [2.6.1] - 2026-02-01

### 移除

- **testany-bot-for-claude 紧急下线**：
  - 因存在严重问题，暂时从 marketplace 移除
  - 从 git 仓库中排除（用户 clone 后不会包含）
  - 本地文件保留，待问题修复后重新上线
  - 用户请使用通用版 `testany-bot`

---

## [2.6.0] - 2026-01-31

### 新增

- **testany-bot/testany-bot-for-claude `case-writing` Skill**：
  - 新增 `case-writing` Skill，用于交互式编写测试脚本
  - **在主进程运行**：可使用 `AskUserQuestion` 与用户多轮交互，理解需求
  - **4 阶段工作流程**：需求收集 → 生成测试用例文档 → 生成测试脚本 → 交付
  - **5 种 Executor 模板**：
    - PyRes (Python)：pytest 框架，推荐用于 API 测试
    - Postman：Collection v2.1 格式，适合简单 API 验证
    - Playwright：TypeScript E2E 测试
    - Maven：JUnit 5 + JDK 11
    - Gradle：JUnit 5 构建配置
  - **完整代码示例**：每种 Executor 包含环境变量使用、Relay 输出、凭证获取（TSS）代码
  - **Executor 选择决策树**：帮助根据用户需求自动选择合适的测试框架
  - **新增 `/case-writing` 命令**

### 变更

- **testany-bot-for-claude `case-author` 重命名为 `case-manager`**：
  - 职责聚焦：仅负责 MCP 操作（创建、配置、上传），不负责脚本编写
  - 禁用 Write/Edit 权限（脚本编写移至 `case-writing` Skill）
  - 当用户需要编写脚本时，提示使用 `/case-writing` 命令

- **架构优化：Skill vs Subagent 职责分离**：
  - **Subagent**（如 `case-manager`）：自主执行 MCP 操作，无需用户交互
  - **Skill**（如 `case-writing`）：在主进程运行，支持多轮用户交互
  - 命名规范：Subagent 用名词（case-manager），Skill 用动名词（case-writing）

- **testany-router 路由规则更新**：
  - 新增 `case-writing` vs `case-manager` 意图区分
  - "写测试"、"生成脚本" → `case-writing` Skill
  - "创建 case"、"上传脚本" → `case-manager` Subagent

---

## [2.5.0] - 2026-01-30

### 新增

- **testany-bot**：Testany 测试平台智能助手（通用版）v2.0.0
  - 跨平台兼容：VS Code Copilot、GitHub Copilot 等 AI 平台
  - 自包含 Skills 架构：每个技能内嵌完整知识，无需外部依赖
  - 6 个核心技能：case、pipeline、tests、debug、trigger、workspace
  - 遵循 [Agent Skills 公共规范](https://agentskills.io)，仅使用 `name` 和 `description` 字段
  - 完整 README 文档（含 Mermaid 架构图）

- **testany-bot-for-claude**：Testany 测试平台智能助手（Claude Code 专用版）v2.0.0
  - **Subagent + Router 架构**：
    - `testany-router`：意图识别 + 快速问答，支持中英文混合表达
    - 6 个专业 Subagent：case-author、pipeline-builder、test-runner、debug-analyzer、test-orchestrator、workspace-admin
  - **Context 隔离**：每个 Subagent 在独立 Context 工作，不污染主对话
  - **工具权限控制**：通过 `disallowedTools` 限制 Subagent 可用工具
  - **冲突意图处理**：Router 支持复合意图识别和分步处理策略
  - 使用 Claude Code 专用字段：`context: fork`、`agent:`、`disable-model-invocation:`
  - 完整 README 文档（含 Mermaid 架构图）

### 变更

- **testany-bot/testany-bot-for-claude 命名优化**：
  - `cicd` skill 重命名为 `orchestrator`（更准确描述门禁+定时计划功能）
  - `cicd-integrator` agent 重命名为 `test-orchestrator`
  - 与 `test-runner`（执行测试）形成清晰区分：`test-orchestrator`（编排测试何时/何条件执行）

- **testany-bot/testany-bot-for-claude 安全增强**：
  - `debug` 技能新增 curlCommand 安全验证：
    - 域名验证：仅允许 `*.testany.io`、`*.testany.com.cn`
    - 协议验证：仅允许 HTTPS
    - 参数验证：禁止危险参数（`-o`、`|`、`;`、`$(`）

- **testany-bot/testany-bot-for-claude 执行约束**：
  - `tests` 技能明确：Testany 只支持执行 Pipeline，不支持直接执行单个 Case

- **marketplace.json**：新增 testany-bot、testany-bot-for-claude 注册

- **仓库 README**：
  - Plugin 列表新增 testany-bot、testany-bot-for-claude
  - 目录结构新增 testany-bot、testany-bot-for-claude
  - Skills 列表新增 12 个命令说明

---

## [2.4.1] - 2026-01-27

### 变更

- **media-writer**：强化 Researcher 硬数据门槛与结构化输出
- **media-writer**：知乎 Writer 增加篇幅/深度分级与证据密度要求
- **知乎写作指南**：补充档位规则、证据密度与硬数据标准

---

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
