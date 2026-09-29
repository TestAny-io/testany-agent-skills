# Prototype Manifest

## 基本信息

| 项目 | 内容 |
|---|---|
| PRD 来源 | ../../../references/01-product-requirements.md；21、22、24、27、28 号增量文档及本轮用户 GUI 重设计要求 |
| User Journey 来源 | 01-product-requirements.md 内 J1–J5 用户旅程；上述增量文档中的交互与 UAT 步骤 |
| 前端仓库 | testany-agent-skills/plugins/skilldock/skills/skill-manager/assets/app |
| 沙箱目录 | assets/app/prototype |
| 路由前缀 | /prototype/ |
| 创建时间 | 2026-09-28 |

旧 PRD 的插件技能开关语义以 28-plugin-skill-selection.md 为准；Sandbox 已撤销；不新增创建项目。下表步骤与边界编号是对既有文字旅程的本轮编号，非冒充上游已有独立 Journey Graph。

## 原型预算

| 项目 | 数量 |
|---|---|
| P0 Journey | 4：J1 查看整理、J2 安装、J4 移除恢复、J5 管理市场 |
| P1 Journey | 1：J3 更新，本轮“整个 GUI”明确包含，做完整界面交互，不做占位 |
| 页面总数 | 5 + 共享浮层；无新增业务页面 |
| 原型预算触发 | 未触发 |

## Visual Brief（视觉设计说明）

- **任务与受众**：Codex 用户低频整理技能库、安装插件、查看更新；桌面为主，中英日混合技能名；中文为本轮走查主语言。
- **保真度与方向**：高保真、原生 Mac 工具感。柔和中性背景、清晰文字、细边界、克制阴影、蓝色主要操作；不做营销大标题、不加入无关插画。
- **依据与范围**：用户本轮明确偏好优先；保留品牌图形/名称。沿用已验证交互组件，重新组织页面层级、密度与配色。独立 mock 原型，不替换当前完整应用。
- **密度与层级**：名称与用途优先，次要路径在详情；筛选计数融入分段标签；技能/插件共用搜索→筛选→详情→操作路径。只有安装、更新作为主要操作。
- **代表页**：技能库 /prototype/?page=skills；涵盖导航、统一清单、筛选、标签、重复、副本、详情与开关。
- **验证范围**：1440×1000 桌面、1024×800、720×900 面板、390×844 窄屏；浅深色与系统偏好；正常/加载/空/错误/边界。正式 API、安全、安装磁盘副作用、原生启动生命周期与完整三语言翻译不在本原型的验证范围，原生产实现仍保留。

| 设计维度 | 使用的 token/值与角色 | 来源/本轮决定及理由 |
|---|---|---|
| 颜色 | --canvas #f8f8fa；--surface #fff；--ink #24252b；--muted #686a74；--accent #2563d5；--line #e6e7eb；深色对应中性石墨 | 沙箱新值；信息密度高时降低大色块干扰，蓝仅用于操作/选中 |
| 字体 | 系统 -apple-system / BlinkMacSystemFont / PingFang SC / sans-serif；标题26/650、对象14/600、正文13、辅助10–12；代码SFMono | 继承本机字体/图标能力，不下载字体；名字优先于统计 |
| 布局/间距/密度 | 侧栏208；桌面内边距36；内容区最大1512；4/8/12/16/24/32间距；按钮32–36高、列表约80高 | 新组合；720以下导航折叠顶部，390单列；清单与详情分工 |
| 细节/动效 | 6–12px角色圆角；1px细边界；仅浮层阴影；lucide 16–20；120–160ms，尊重reduced-motion | 使用现有依赖，不制造仿系统窗口控制或假原生权限弹窗 |

**页面例外与未决项**：无风格未决。代码差异保留等宽字体/增删语义色；帮助与来源保持可展开。

UAT 主题修订：原型独立 HTML 入口带 `skilldock-prototype-document` 类，仅对此类同步文档 `color-scheme`，让原生下拉菜单遵循选定主题。控件及 option/optgroup 仍受 `.sd-prototype` 限定；正式应用入口和主题文件不受影响。

## 页面 ↔ Journey ↔ PRD 追溯表

| # | 页面 | 路由 | Journey | Journey 步骤 | PRD 需求 | 状态覆盖 |
|---|---|---|---|---|---|---|
| 1 | 技能库/详情/同名管理 | ?page=skills | J1/J2/J4 | J1.S1加载→S2筛选→S3详情→S4开关；J4.S1选择→S2预览→S3移除 | REQ-SD-001–005、008、009；21、22增量 | 五态 |
| 2 | 插件/安装 | ?page=plugins | J1/J2/J5 | J2.S1选来源→S2预览→S3选择启用→S4安装；J1.S4单项独立 | REQ-SD-002、003、006；27、28增量 | 五态 |
| 3 | 市场来源/插件目录 | ?page=markets | J5 | J5.S1列表→S2添加/刷新→S3插件→J2 | REQ-SD-006、008 | 五态 |
| 4 | 更新/差异/计划 | ?page=updates | J3 | J3.S1检查→S2差异→S3更新→S4记录；J3.S5设置计划 | REQ-SD-007、014；20、22、24增量 | 五态 |
| 5 | 操作记录/恢复 | ?page=activity | J4 | J4.S4记录→S5确认→S6恢复 | REQ-SD-005、008 | 五态 |
| 共用 | 项目/外观/语言 | 以上页面浮层 | J1 | J1.S0选择扫描项目；查看设置 | REQ-SD-011、012、013；27增量 | 偏好/取消/校验 |

## 页面状态与交互矩阵

| 页面/路由 | 状态 | Journey Step / Edge Case ID | 触发方式 | 用户可见结果/主要操作 | 恢复/焦点去向 | 响应式变化 |
|---|---|---|---|---|---|---|
| 全部五页 | 正常 | 对应S1 | 无state或state=normal | 真实关系的mock数据；可操作清单 | 详情关闭返回触发按钮 | 桌面列/窄屏重排 |
| 全部五页 | 加载 | 通用补充 | state=loading；另检查全部有实时进度 | 页面骨架，保留导航与明确读取状态 | 演示“完成加载”回正常；自然检查自动结束 | 同一骨架宽度 |
| 全部五页 | 空 | 通用补充 | state=empty；搜索无结果独立状态 | 技能/插件安装、市场添加、更新全部最新、记录暂无 | 对应CTA或清除筛选 | 内容居中但不大hero |
| 全部五页 | 错误 | J1.S1/EC-01目录读取；J5.S2/EC-05私仓授权；J3.S1/EC-06离线；J4.S4/EC-07记录读取 | state=error | 原因和重试；不把失败展示成空库 | 重试回正常，当前页保持 | 长原因换行 |
| 技能 | 边界 | J1.S2/EC-02同名多路径、长名；J4.S1/EC-03受保护副本 | state=boundary；同名筛选/管理同名 | 长名称、路径可访问；仅选中允许副本移除 | 两步确认；取消保留全部；记录恢复 | 详情滚动，底部操作固定 |
| 插件 | 边界 | J2.S2/EC-04无权限、已安装、零技能 | state=boundary；安装来源/预览 | 禁用原因；组件独立；已安装不重复安装 | 保留输入/换来源/取消 | 弹窗固定操作区 |
| 市场 | 边界 | J5.S2/EC-05私仓无授权 | state=boundary | 指出具体私仓来源失败，其余目录保留 | 检查连接，mock恢复 | URL折行 |
| 更新 | 边界 | J3.S3/EC-08本地改动、未知来源 | state=boundary | 冲突阻止覆盖；解释原因和关联来源 | 查看来源/重查；计划只包含可追踪目标 | diff局部横向滚动 |
| 记录 | 边界 | J4.S5/EC-09恢复目标已存在 | state=boundary；恢复 | 明确不能覆盖已存在路径 | 保留原记录，关闭或重新检查 | 长路径折行 |

状态通过 query 切换；独立“设计预览”工具浮层可选页面状态、主题、重置mock，与业务导航分开。所有弹窗复用 Modal 焦点循环/Escape/焦点恢复。

## 导航关系表

| 来源页面 | 目标页面 | 触发条件 | Journey 跳转 |
|---|---|---|---|
| 五页 | 其他主页面 | 侧栏/窄屏导航 | J1/J3/J4/J5；history返回保留筛选 |
| 技能详情 | 插件详情 | 查看所属插件 | J1.S3→J5.S3 |
| 技能/插件 | 安装浮层→当前清单 | 安装按钮→预览→确认 | J2.S1–S4 |
| 市场详情 | 插件安装预览 | 选择市场内插件 | J5.S3→J2.S2 |
| 技能/插件详情 | 更新 | 检查更新 | J1.S3→J3.S1 |
| 技能/插件/更新 | 记录 | 移除/更新后的查看记录 | J4.S3/J3.S3→J4.S4 |
| 记录 | 恢复确认→记录/技能 | 恢复选定记录 | J4.S4–S6 |

## 组件使用清单

| 组件 | 来源 | 使用页面 |
|---|---|---|
| Modal | 仓库已有 | 全部浮层，保留焦点能力 |
| LibraryButton、LibraryFilters、ViewSwitch、CollectionFooter | 仓库已有 | 统一库页与操作；将统计按钮通过沙箱CSS组合为紧凑分类栏 |
| InstallDialog（含InstallSteps、GitSourceFields、GitAccessHelp、ResolvedGitSource、PluginSkillPicker） | 仓库已有，以mock ActionHandler注入 | 技能/插件安装 |
| TagsDialog、TagFilter、TagStrip | 仓库已有 | 技能/插件 |
| DuplicateSkillsDialog | 仓库已有 | 同名管理 |
| ProjectPicker、ProjectDialog | 仓库已有 | 全局项目上下文 |
| DiffBrowser | 仓库已有，以mock差异结果注入 | 更新详情 |
| [PROTOTYPE] Shell / Library / DetailPanel | 沙箱新增；生产页面内部未导出，且本轮重做页面组合 | 五页 |
| [PROTOTYPE] ItemIcon / Switch / PageState | 沙箱新增；同类生产函数仅App内部可见 | 清单/状态 |
| [PROTOTYPE] ScheduleDialog / MarketDialog / PreferencesPanel | 沙箱新增页面组合，复用Modal/Button，内存状态 | 更新/市场/外观 |

## Mock 数据清单

| 数据文件 | 对应 PRD 实体 | 使用页面 | 包含状态 | PRD 未定义的字段 |
|---|---|---|---|---|
| mock/data.ts | Skill、Plugin、Marketplace、Activity、Snapshot、PluginInstallPreview、FileDiff | 五页和复用组件 | 正常、空、同名多路径、长名称、权限失败、受保护副本、来源未关联、本地改动 | 图标映射由名称在视觉层选择，无新增业务字段 |
| mock/data.ts 内项目/预览/差异夹具 | ProjectCatalog、InstallPreview、FileDiff | 项目/安装/diff | 现有项目、不可用项目、技能选择、增删行 | 无 |

所有安装、标签、更新、删除、计划与恢复仅更新原型内存；刷新重置业务数据。偏好使用该独立 origin 的浏览器存储；无后端请求、无磁盘/系统计划写入。
