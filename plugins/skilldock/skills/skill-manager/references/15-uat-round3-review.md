# 第三轮 UAT 有界独立复核

结论：**本轮明确范围通过，开放 P0/P1：0。** 日期：2026-09-14。依据 `14-uat-round3-delivery.md` 与用户移除产品 Sandbox 的要求，复核生产环境、旧状态隔离、会话初始化及界面入口。此结论不代替用户再次 UAT。

## 范围与独立性

`product_review` 只读审查 service 的环境构建和动作门禁、scheduler 的环境遍历、HTTP session/defaultMode、scanner 状态文案，以及 App/UpdatesWorkspace 的启动、动作、显示和三语变更。读取相应测试与双服务 E2E harness，没有修改实现或测试。

全部执行使用临时 home/project/state；没有操作真实配置、安装内容或启用真实计划。root 的全量回归、本机只读 smoke、正式实例和源码下载读回由 root 的交付记录负责，不冒称为本审查者执行。

## 核对结果

| 边界 | 结果 |
|---|---|
| 生产启动 | 普通入口 `createApp()` 仅构建 local，既不初始化 Sandbox，也不将旧 Sandbox 加入调度。仅代码层显式 `enableTestSandbox === true` 可启用内部测试夹具，环境变量、URL、请求体和本地存储均无产品启用入口 |
| 非法模式 | 生产 Sandbox 清单、正文、安装/启禁/删除/批量更新/计划请求由统一门禁拒绝，合法请求返回 403 MODE_DISABLED；不重写成 local。缺少或非法动作参数仍按既有校验拒绝 |
| 既有状态 | 旧 Sandbox 目录与计划保留但不运行；损坏的退休状态不妨碍生产启动。本机原计划保持，隔离 fixture 中已保存的 local 计划仍按期更新其原目标 |
| 首次会话 | 先取得并验证 token/defaultMode，再请求指定环境清单。延迟 session 时无提前清单请求；503、缺 mode、非法 mode、缺 token 均显示错误且不读取清单、不发 POST；重试后只读 local |
| 动作时环境 | 每次动作重新核对 session/defaultMode。独立反例在清单加载后将 session 默认环境改成另一环境，点击启禁仍为 0 个 POST，配置 sentinel 未变 |
| 产品界面 | 三语五页及安装窗口无模式切换、演练说明或示例填入按钮；旧 `?mode=sandbox` 与 localStorage 偏好无效，生产只显示本机 fixture 清单。390px 无横向溢出；目录来源和原有业务能力保留 |

内部测试仍可让同一前端连接显式夹具服务，mode 只由已验证会话取得，不提供用户切换控件。这是自动化测试机制，不是生产 Sandbox 的重新入口。

## 独立执行证据

- `node --test tests/backend-production.test.mjs`：**4/4 通过，0.470 秒**，覆盖生产无 Sandbox、API 拒绝、显式测试参数、旧计划忽略、本机计划保留、损坏旧状态忽略。
- `uat-round3.spec.ts`：**7/7 通过，6.4 秒**，覆盖三语生产界面及四类 bootstrap 失败/重试。
- `app.spec.ts --grep 'inventory waits for the server session'`：**1/1 通过，1.8 秒**，延迟会话期间没有清单请求，释放后仅使用服务选定的内部测试环境。
- 额外临时浏览器反例：`{"case":"defaultMode changes before action","posts":0,"configUnchanged":true}`。

浏览器使用独立 4831/4832 端口、line reporter，结果位于 `/tmp/skilldock-r3-independent-e2e`、`/tmp/skilldock-r3-independent-gate`，未覆盖 root 的结果。另查看中文生产窄屏截图，模式控件和演练提示已移除。

## 候选摘要

浏览器验证前后以下 16 个对象的 SHA-256 不变：server 的 `service.mjs`、`scheduler.mjs`、`index.mjs`、`scanner.mjs`；src 的 `App.tsx`、`UpdatesWorkspace.tsx`、`styles.css`、i18n 的 `messages.json`、`keys.json`、`errors.json`、`server-messages.json`；`shared/contracts.ts`；tests 的 `backend-production.test.mjs`、`e2e-server.mjs`、`app.spec.ts`、`uat-round3.spec.ts`。

集合 SHA-256：`1e0b7142b282bc8530444f6fed48c7e23226e77d402076c1f30bc4d564e34438`。相对路径以 `skill-manager` 为根并带 `assets/app/`，排序后依次输入路径、NUL、原始文件字节、NUL。

这是上述有限 delta 的审核，不沿用为后续源码、真实写操作或用户 UAT 的自动批准。没有删除旧演练数据，也没有迁移或重设本机计划。用户再次验收仍按 14 文档待填写。
