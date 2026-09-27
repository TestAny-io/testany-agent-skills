# 仓库探查报告模板

Phase 0.5 完成后，必须按此模板输出报告。

---

## 仓库探查报告

### 前端工作区门禁

| 信号 | 命中 | 证据 |
|------|------|------|
| UI 框架依赖 | ✅/❌ | [package.json 中的框架及版本] |
| 页面/路由目录 | ✅/❌ | [命中的路径] |
| 组件目录 | ✅/❌ | [命中的路径] |

**门禁结论**：[通过 / 用户确认后通过 / 未通过——已引导用户]

### 技术栈

| 项目 | 值 | 来源 |
|------|-----|------|
| 框架 | [框架 + 版本] | [package.json 路径] |
| 路由方案 | [文件路由 / 配置路由 / 约定] | [配置文件/目录路径] |
| 样式方案 | [Tailwind / CSS Modules / Styled Components / ...] | [配置文件路径] |
| 状态管理 | [Redux / Zustand / Pinia / Context / ...] | [来源路径] |
| TypeScript | [是/否 + strict 级别] | [tsconfig.json 路径] |
| 包管理器 | [npm / pnpm / yarn / bun] | [lock 文件路径] |

### 组件目录索引

| 组件名 | 类别 | 路径 |
|--------|------|------|
| Button | 基础 | src/components/ui/Button.tsx |
| Table | 数据展示 | src/components/Table/index.tsx |
| Form | 表单 | src/components/Form/Form.tsx |
| Empty | 状态 | src/components/Empty.tsx |
| Loading / Skeleton | 状态 | src/components/Loading.tsx |
| ... | ... | ... |

> 此阶段只列目录索引，不含 Props 详情。Props 在 Phase 1.4 按需读取。

### 设计规范与页面模式

- **设计依据**：[用户明确方向 / 品牌规范 / Storybook / token/主题路径；未知写明]
- **系统状态**：[成熟 / 不完整 / 无现成系统；采用继承/补齐/建立基线及原因]
- **参考页面**：[相关页面路径及可取得的截图；标注未运行的范围]

| 维度 | 现有约定/观察 | 来源路径或截图及视口 | 本轮处理 |
|---|---|---|---|
| 排版/颜色 | [字体角色、颜色 token] | [真实来源] | [继承/补齐等] |
| 布局/间距/密度 | [页面骨架、尺度、信息组织] | [真实来源] | [处理] |
| 组件/状态/动效 | [变体、反馈、焦点、图标等] | [真实来源] | [处理] |
| 适配 | [断点、目标设备、主题] | [真实来源] | [处理] |

- **已识别体验问题与允许范围内的改进**：[证据、影响及沙箱处理；无法修正的限制]
- **剩余方向缺口**：[需确认的实质性选择 / 无；样本不足不跳过后续视觉基线]

### 运行命令识别

| 项目 | 命令 | 来源 |
|------|------|------|
| 包管理器 | [pnpm / npm / yarn / bun] | [lock 文件] |
| 开发启动 | [pnpm dev / npm run dev / ...] | [package.json scripts] |
| Lint 检查 | [pnpm lint / npm run lint / ...] | [package.json scripts] |
| 类型检查 | [pnpm typecheck / pnpm exec tsc --noEmit / npx tsc --noEmit / 需确认] | [package.json scripts；或 tsconfig + 包管理器 exec（pnpm exec / yarn exec / bunx / npx）；或待 AskUserQuestion] |
| 工作区定位 | [monorepo 时: 包名或 --filter 参数] | [workspace 配置] |

### 验证能力

| 能力 | 实际可用方式 | 限制及影响 |
|---|---|---|
| 运行/浏览器操作 | [可用工具或命令；未执行不可写通过] | [限制/无] |
| 截图及查看 | [工具/截图读取方式] | [限制/无] |
| 对比度测量 | [工具或计算方法] | [限制/无] |

### 原型沙箱规划

- **沙箱路径**：[用户确认的路径，如 src/prototype/ 或 app/prototype/]
- **路由隔离方式**：[文件路由天然隔离 / 独立入口文件 / 用户协商方案]
- **路由前缀**：[/prototype/]
