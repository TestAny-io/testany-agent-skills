# SkillDock 产品需求 · v0.2

状态：第三轮 UAT 要求移除产品 Sandbox，默认直接管理本机清单。最新变更和验收见 [第三轮整改记录](14-uat-round3-delivery.md)。输入：`BRIEF-SKILLDOCK-001`，见 [交付计划](00-delivery-plan.md)。

## 背景与目标

当前对话中的 Plugin Management 截图只返回询问，用户缺少可浏览的清单和直接操作入口。SkillDock 面向管理本人 Codex 环境的开发者，在一个 GUI 内理解技能来源、所属插件和生效状态，完成可验证的安装、更新、启禁与移除。

初版为本地单用户工具，主要使用场景是 Codex 聊天旁的右侧面板；普通桌面浏览器也能使用。界面默认中文与浅色，支持英文、日文及深色；详见 [第一轮 UAT 变更基线](07-uat-round1-changes.md)。应用不以公开上架、团队多用户权限或原生左侧 sidebar 扩展为本轮交付前提。

## 现有能力识别

| 已有能力 | 范围 | 匹配与缺口 | 建议方向 | 来源 |
|---|---|---|---|---|
| Codex skill discovery/config | 独立 skill 清单及按路径开关 | 需要聚合来源、识别同名与重复路径 | 优先复用配置语义 | 官方 Build skills |
| Plugin browser 与 CLI | 已安装插件、安装/移除、marketplaces | 版本支持有差异；并非独立 skill 更新器 | 能力检测后复用 | 官方 Plugins/Package your plugin |
| skill-installer | 从 GitHub 安装独立技能 | 已存在目录会终止，不追踪全生命周期 | 补充明确来源和更新预览 | 本机 skill-installer/SKILL.md |
| 本仓库领域 plugins | testany-eng 等聚合技能及入口 | 无现有 GUI app | 同领域新增 skill 携带应用 | 根 README、AGENTS、plugin manifest |

## 用户旅程

| Journey | 主流程 | 异常与恢复 |
|---|---|---|
| J1 查看与整理 | 打开管理台 → 自动加载 → 搜索/筛选 → 查看详情/技能正文 → 切换启用状态 | 不可读目录单独标识；缓存内 skill 展示所属插件；刷新重试 |
| J2 安装 | 选择本地路径或 Git 来源 → 预览待安装对象和目标 → 确认安装 → 新对象出现在清单 | 同名冲突不覆盖；格式错误说明原因；取消不安装 |
| J3 更新 | 查看已追踪来源 → 检查更新 → 查看变化 → 更新 → 状态与记录刷新 | 本地内容修改阻止覆盖；来源离线不显示成功；保留恢复入口 |
| J4 移除与恢复 | 选择对象 → 看到受影响内容 → 移至可恢复区 → 从记录恢复 | 目标已重新占用则拒绝恢复；系统和托管对象按所属管理器处理 |
| J5 管理市场 | 列出来源 → 添加本地/Git 市场 → 刷新 → 查看可安装插件 → 安装或移除来源 | 无效 manifest、断链、越界路径显示原因，不隐式复制任意目录 |
| J6（已撤销） | 第三轮 UAT 移除产品演练入口；首次打开直接加载本机清单 | 开发自动化继续使用隔离夹具，不作为产品旅程 |

## 需求与验收

| ID | 优先级 | 需求 | 验收标准 |
|---|---|---|---|
| REQ-SD-001 | P0 | 统一清单 | 展示用户、当前项目、系统和已安装插件技能；显示来源、路径、所属插件、启用状态；相同文件别名与同名不同文件可辨识；仅已知根和用户选定来源纳入扫描，不声称扫描任意磁盘位置 |
| REQ-SD-002 | P0 | 实用的 GUI | 提供 Skills、Plugins、Marketplaces、更新、记录；搜索与来源筛选、详情、可操作开关；显示加载/空/错误状态；在 720px 面板及 1440px 桌面可用，键盘能操作主要控件 |
| REQ-SD-003 | P0 | 启用和禁用 | 独立 skill 按路径启禁，插件按所属包启禁；界面回读结果并区分持久配置与当前会话是否需重新加载；不可操作项明确原因 |
| REQ-SD-004 | P0 | 安装独立 skill | 从本地 skill 目录或 Git 来源选择子目录安装；先显示元数据和目标；已存在目标拒绝覆盖；成功后清单有来源记录 |
| REQ-SD-005 | P0 | 可恢复的移除 | 用户独立技能移至备份区且可恢复；symlink 只移除链接；插件通过支持的包级入口卸载；不将删除缓存伪装成正式卸载 |
| REQ-SD-006 | P0 | 管理 marketplace 与插件 | 查看现有市场、添加/移除来源、刷新 Git 市场；查看市场插件并安装；保留已有市场元数据；版本不支持时可见原因和下一步 |
| REQ-SD-007 | P1 | 更新管理 | 展示全部已有安装的来源、安装路径与所属更新渠道；识别可证明的既有来源，无记录时允许关联；按技能或所属插件检查、更新和恢复，宿主能力限制给出具体下一步 |
| REQ-SD-008 | P0 | 结果与恢复 | 所有写操作记录对象、时间、执行结果；失败不显示完成；配置/文件外部变化不被静默覆盖；恢复目标冲突可见 |
| REQ-SD-009 | P0 | 本地数据边界 | 页面不暴露凭证或无关配置；任意外部页面不能发起有效写操作；不执行导入技能里的脚本；系统内置及不支持的托管资源受保护 |
| REQ-SD-010 | P0 | 可交付验证 | 提供单命令启动、依赖说明、真实清单只读核验、隔离自动化测试与 UAT 清单；阶段文档完整，UAT 保留用户填写 |
| REQ-SD-011 | P1 | 外观主题 | 保留浅色，增加深色和跟随系统，持久化偏好，覆盖全部页面及弹窗 |
| REQ-SD-012 | P1 | 界面语言 | 支持中文、英文、日文切换，持久化偏好，本地化界面与日期，来源内容保留原文 |
| REQ-SD-013 | P1 | 开源许可 | SkillDock自有软件使用AGPL-3.0-only，保留第三方声明，提供完整许可证与对应运行版本源码 |
| REQ-SD-014 | P1 | 定时自动更新 | 用户选择明确更新目标与循环间隔，后台检查并按设置自动更新，持久化运行结果，冲突跳过且不覆盖本地修改 |

## 业务规则与数据概念

- Skill 是具有 SKILL.md 的工作流；名称不是唯一身份，同名技能不得合并后误操作。
- Plugin 是包含 skills 的安装单元；Marketplace 是分发来源，移除来源不等于已安装包全部卸载。
- 系统预置和平台托管内容展示原管理范围，不冒充可任意删改。真实不可用状态允许展示，但核心独立技能生命周期必须可在受支持本机位置执行。
- 自动更新默认关闭，用户明确选定安装对象才加入；来源/所有权/安装身份变化后重新选择。界面周期按小时显示，预设不重复显示数值框，自定义输入带小时单位；既有分钟持久记录保持原周期，服务恢复只补一轮。
- “已更新配置”“已安装到磁盘”“当前 Codex 会话已加载”是不同状态；仅验证到前两者时明确提示新会话/重载。
- 导入内容视为数据，详情仅呈现正文，不执行其中指令或 HTML。
- 产品不提供 Sandbox。测试通过程序参数使用隔离夹具；正式服务不创建或运行演练数据，也不得把旧演练请求转换为本机操作。

## 成功指标

在记录硬件/fixture 规模的验证中：100 个技能初次清单可用时间目标 <3 秒；本地搜索反馈目标 <100ms；写操作中显示忙碌状态；720/1440px 无阻断性横向溢出。以上为目标，实测写入验证报告。每个 P0 需求至少一条测试或明确人工核验结果；UAT 通过率由用户填写，不预填。

<!-- TRACEABILITY-METADATA:BEGIN -->
```yaml
schema:
  name: testany-traceability
  version: 1.0.0
  profile: prd-profile-v1
artifact:
  id: PRD-SKILLDOCK-001
  type: PRD
  title: SkillDock 本地技能管理台
  status: draft
  owners:
  - product.user
  - engineering.codex
  created_at: '2026-09-14'
  updated_at: '2026-09-14'
  source_documents:
  - BRIEF-SKILLDOCK-001
  - UAT-SD-R1-001
  - UAT-SD-R2-001
entities:
  requirements:
  - id: REQ-SD-001
    class: functional
    title: 统一清单
    statement: 展示用户、当前项目、系统和已安装插件技能；显示来源、路径、所属插件、启用状态；相同文件别名与同名不同文件可辨识；仅已知根和用户选定来源纳入扫描，不声称扫描任意磁盘位置
    priority: P0
    status: proposed
    scope: in
    acceptance_criteria:
    - 展示用户、当前项目、系统和已安装插件技能；显示来源、路径、所属插件、启用状态；相同文件别名与同名不同文件可辨识；仅已知根和用户选定来源纳入扫描，不声称扫描任意磁盘位置
    source_refs:
    - artifact_id: BRIEF-SKILLDOCK-001
    - artifact_id: UAT-SD-R1-001
  - id: REQ-SD-002
    class: functional
    title: 实用的 GUI
    statement: 提供 Skills、Plugins、Marketplaces、更新、记录；搜索与来源筛选、详情、可操作开关；显示加载/空/错误状态；在
      720px 面板及 1440px 桌面可用，键盘能操作主要控件
    priority: P0
    status: proposed
    scope: in
    acceptance_criteria:
    - 提供 Skills、Plugins、Marketplaces、更新、记录；搜索与来源筛选、详情、可操作开关；显示加载/空/错误状态；在 720px 面板及
      1440px 桌面可用，键盘能操作主要控件
    source_refs:
    - artifact_id: BRIEF-SKILLDOCK-001
    - artifact_id: UAT-SD-R1-001
    - artifact_id: UAT-SD-R2-001
  - id: REQ-SD-003
    class: functional
    title: 启用和禁用
    statement: 独立 skill 按路径启禁，插件按所属包启禁；界面回读结果并区分持久配置与当前会话是否需重新加载；不可操作项明确原因
    priority: P0
    status: proposed
    scope: in
    acceptance_criteria:
    - 独立 skill 按路径启禁，插件按所属包启禁；界面回读结果并区分持久配置与当前会话是否需重新加载；不可操作项明确原因
    source_refs:
    - artifact_id: BRIEF-SKILLDOCK-001
  - id: REQ-SD-004
    class: functional
    title: 安装独立 skill
    statement: 从本地 skill 目录或 Git 来源选择子目录安装；先显示元数据和目标；已存在目标拒绝覆盖；成功后清单有来源记录
    priority: P0
    status: proposed
    scope: in
    acceptance_criteria:
    - 从本地 skill 目录或 Git 来源选择子目录安装；先显示元数据和目标；已存在目标拒绝覆盖；成功后清单有来源记录
    source_refs:
    - artifact_id: BRIEF-SKILLDOCK-001
  - id: REQ-SD-005
    class: functional
    title: 可恢复的移除
    statement: 用户独立技能移至备份区且可恢复；symlink 只移除链接；插件通过支持的包级入口卸载；不将删除缓存伪装成正式卸载
    priority: P0
    status: proposed
    scope: in
    acceptance_criteria:
    - 用户独立技能移至备份区且可恢复；symlink 只移除链接；插件通过支持的包级入口卸载；不将删除缓存伪装成正式卸载
    source_refs:
    - artifact_id: BRIEF-SKILLDOCK-001
  - id: REQ-SD-006
    class: functional
    title: 管理 marketplace 与插件
    statement: 查看现有市场、添加/移除来源、刷新 Git 市场；查看市场插件并安装；保留已有市场元数据；版本不支持时可见原因和下一步
    priority: P0
    status: proposed
    scope: in
    acceptance_criteria:
    - 查看现有市场、添加/移除来源、刷新 Git 市场；查看市场插件并安装；保留已有市场元数据；版本不支持时可见原因和下一步
    source_refs:
    - artifact_id: BRIEF-SKILLDOCK-001
    - artifact_id: UAT-SD-R1-001
  - id: REQ-SD-007
    class: functional
    title: 更新管理
    statement: 展示全部已有安装的来源、安装路径与所属更新渠道；识别可证明的既有来源，无记录时允许关联；按技能或所属插件检查、更新和恢复，宿主能力限制给出具体下一步
    priority: P1
    status: proposed
    scope: in
    acceptance_criteria:
    - 展示全部已有安装的来源、安装路径与所属更新渠道；识别可证明的既有来源，无记录时允许关联；按技能或所属插件检查、更新和恢复，宿主能力限制给出具体下一步
    source_refs:
    - artifact_id: BRIEF-SKILLDOCK-001
    - artifact_id: UAT-SD-R1-001
    - artifact_id: UAT-SD-R2-001
  - id: REQ-SD-008
    class: functional
    title: 结果与恢复
    statement: 所有写操作记录对象、时间、执行结果；失败不显示完成；配置/文件外部变化不被静默覆盖；恢复目标冲突可见
    priority: P0
    status: proposed
    scope: in
    acceptance_criteria:
    - 所有写操作记录对象、时间、执行结果；失败不显示完成；配置/文件外部变化不被静默覆盖；恢复目标冲突可见
    source_refs:
    - artifact_id: BRIEF-SKILLDOCK-001
    - artifact_id: UAT-SD-R1-001
  - id: REQ-SD-009
    class: functional
    title: 本地数据边界
    statement: 页面不暴露凭证或无关配置；任意外部页面不能发起有效写操作；不执行导入技能里的脚本；系统内置及不支持的托管资源受保护
    priority: P0
    status: proposed
    scope: in
    acceptance_criteria:
    - 页面不暴露凭证或无关配置；任意外部页面不能发起有效写操作；不执行导入技能里的脚本；系统内置及不支持的托管资源受保护
    source_refs:
    - artifact_id: BRIEF-SKILLDOCK-001
    - artifact_id: UAT-SD-R1-001
  - id: REQ-SD-010
    class: functional
    title: 可交付验证
    statement: 提供单命令启动、依赖说明、真实清单只读核验、隔离自动化测试与 UAT 清单；阶段文档完整，UAT 保留用户填写
    priority: P0
    status: proposed
    scope: in
    acceptance_criteria:
    - 提供单命令启动、依赖说明、真实清单只读核验、隔离自动化测试与 UAT 清单；阶段文档完整，UAT 保留用户填写
    source_refs:
    - artifact_id: BRIEF-SKILLDOCK-001
    - artifact_id: UAT-SD-R1-001
  - id: REQ-SD-011
    class: functional
    title: 外观主题
    statement: 保留浅色，增加深色和跟随系统，持久化偏好，覆盖全部页面及弹窗
    priority: P1
    status: proposed
    scope: in
    acceptance_criteria:
    - 保留浅色，增加深色和跟随系统，持久化偏好，覆盖全部页面及弹窗
    source_refs:
    - artifact_id: UAT-SD-R1-001
  - id: REQ-SD-012
    class: functional
    title: 界面语言
    statement: 支持中文、英文、日文切换，持久化偏好，本地化界面与日期，来源内容保留原文
    priority: P1
    status: proposed
    scope: in
    acceptance_criteria:
    - 支持中文、英文、日文切换，持久化偏好，本地化界面与日期，来源内容保留原文
    source_refs:
    - artifact_id: UAT-SD-R1-001
    - artifact_id: UAT-SD-R2-001
  - id: REQ-SD-013
    class: functional
    title: 开源许可
    statement: SkillDock自有软件使用AGPL-3.0-only，保留第三方声明，提供完整许可证与对应运行版本源码
    priority: P1
    status: proposed
    scope: in
    acceptance_criteria:
    - SkillDock自有软件使用AGPL-3.0-only，保留第三方声明，提供完整许可证与对应运行版本源码
    source_refs:
    - artifact_id: UAT-SD-R1-001
  - id: REQ-SD-014
    class: functional
    title: 定时自动更新
    statement: 用户选择明确更新目标与循环间隔，后台检查并按设置自动更新，持久化运行结果，冲突跳过且不覆盖本地修改
    priority: P1
    status: proposed
    scope: in
    acceptance_criteria:
    - 用户选择明确更新目标与循环间隔，后台检查并按设置自动更新，持久化运行结果，冲突跳过且不覆盖本地修改
    source_refs:
    - artifact_id: UAT-SD-R1-001
    - artifact_id: UAT-SD-R2-001
  risks: []
  must_not_regress: []
  external_behaviors: []
  decisions: []
  flows: []
  test_cases: []
relations: []
waivers: []
```
<!-- TRACEABILITY-METADATA:END -->
