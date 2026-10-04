# 浏览器有界读取适配

通用 Python 工具与浏览器无关。本适配只适用于当前宿主明确提供 `tab.playwright.domSnapshot(): Promise<string>` 的 JavaScript REPL（例如相应版本的 Codex `cua_repl`）。没有该 API 就使用宿主已提供的窄范围读取；不猜接口、不安装额外浏览器控制器，也不声称跨宿主都能用。

1. 严格遵守宿主首次调用/恢复文档。Codex 初始化要求单独的一次指定 API 调用，不能和下列函数定义、探测或 snapshot 混在首次调用中。压缩后的文档恢复也使用宿主要求的方式。
2. 宿主初始化完成后，检查 `typeof workflowObserve === "function" && workflowBrowserVersion === "1"`。缺失或版本变化才从**当前安装包**读取 `scripts/browser_context.js`，把定义原样放入 REPL 一次；不依赖文件系统 import/eval、旧版本路径或上轮口头“已加载”。重放定义会清除缓存，不重开浏览器。
3. 使用已按宿主规则取得的 tab，不为 helper 重新选择 browser、导航或打开重复 tab。已知单个控件可以直接用宿主支持的 locator 文本/状态读取。

```js
// 需要 DOM 范围时；完整 snapshot 只留在 REPL，输出有字节上限。
nodeRepl.write(JSON.stringify(await workflowObserve(tab, {find: "页面上已观察到的唯一标题", after: 16})));
// 同一页面、没有交互/刷新/异步状态变化时，可读刚才 snapshot 的另一段。
nodeRepl.write(JSON.stringify(workflowRead(tab, {from: 80, to: 110})));
// 未知范围：仅返回 landmarks/行位置，而不是 main 到页尾。
nodeRepl.write(JSON.stringify(await workflowObserve(tab)));
```

每次交互后按宿主要求取新状态，需要 DOM 时重新 `workflowObserve`。有页面/异步状态变化或 tab 切换就不可复用旧快照；可先 `workflowInvalidate()` 明确清除。相同 tab handle 的外部变化无法由 helper 自动发现，不以缓存代替必要新观察。`workflowRead` 在重置、读取失败或不同 tab 后返回 `STALE`。

默认紧凑 JSON 载荷最多 6144 UTF-8 bytes（不计宿主协议包装），可显式 `maxBytes` 调整到 1024..65536。`REGION/complete` 只涵盖返回的行。`notice_lines` 给 snapshot 内 alert/dialog/alertdialog 的位置（最多 16 个，其余计数保留），不代表已经阅读/处理；需按风险读取这些区域，不能因目标区域成功忽视外部错误。截图、原生/JavaScript 弹窗及视觉检查仍遵守宿主规则。

`NOT_FOUND`、`AMBIGUOUS`、`TOO_LARGE`、`UNSUPPORTED`、`UNAVAILABLE` 不回退成大页尾。根据已有定位、行号、受支持 locator 或必要截图扩大当前判断。单行过长时用语义范围读取并保留未读部分，不能把随意截断当成功。

这是调用适配，不是工具拦截器或宿主 hook。离线 VM 重置测试只验证函数的重装/失效和输出边界，不能证明宿主压缩后模型一定选择它；真实工程观察要另行核验实际调用及必要错误处理。
