---
description: Testany V2 Git 导入 — OAuth 连接、仓库浏览、创建/同步 import history、switch/relation、webhook 管理
argument-hint: <操作> <描述>，如：连接 GitHub、创建 managed 导入、同步一下、切 commit、开 webhook
---

# Testany V2 Git Import

驱动 Testany `/api/v2/case/importHistory` 全生命周期。不处理 v1 导入（v1 依赖界面交互，不在本 command 范围）。

## 使用方式

$ARGUMENTS

## 核心动作

- **连接 Git 平台**：GitHub / GitLab 的 OAuth 连接管理（initiate 返回 `authorize_url`，由用户浏览器完成）
- **浏览仓库**：列仓库 / 分支 / commit、浏览目录、预览文件
- **创建导入**：managed（后端镜像） / sync_link（用户显式选文件）两种模式
- **同步 / 切换**：sync/switch 先 preview，relation 先取得候选 snapshot；按真实差异及授权决定是否提交
- **同步记录**：列表与 per-file 详情
- **Webhook**：启用 / 关闭 / 轮换 secret / 查看平台侧配置步骤

## 示例

```
/import-git 帮我连一下 GitHub
/import-git 在 owner/repo 上建一个 managed 导入，跟 main 分支
/import-git 这个导入现在有啥要 sync 的？
/import-git 切到 commit abc123 并确认
/import-git 查最近一次 sync 出啥错了
/import-git 把 A1B2-... 这个导入的 webhook 开起来
/import-git 轮换一下 webhook secret
```

## 重要边界

- **OAuth 必须浏览器完成**：agent 只能给出 `authorize_url`，完成授权需用户在浏览器操作（`frontend_return_uri` 必填）
- **webhook_secret 只显示一次**：首次启用 / regenerate 后必须立刻保存并在 Git 平台同步更新
- **current-phase 约束**：`confirm_git_sync` 仅 managed_import 可用；sync_link 的 binding 演化统一走 **addFiles** / **sourceDeleted** 关系流（managed_import 也支持这两条路径）
- **switchMode 只动 sync_mode**：把 `pinned_commit → latest`；**不是** managed_import ↔ sync_link 的切换
- **idempotency_key 自动生成**：不要手动传 UUID，除非跨多次调用显式去重
- **confirm 不等于人类批准**：按 [同步授权决策表](../skills/testany-import-git/references/sync-authorization.md) 处理；授权内差异不重复问，意外删除/扩大集合/版本漂移须停对应动作
- **不能假锁定快照**：managed confirm 不支持用 file_selections 筛选或自造 snapshot 参数；提交后核对实际 commit 和逐项结果，部分失败不得说全部完成

## MCP Schema 资源

读 `testany://schema/import-git` 了解全量类型、枚举、典型流程和工具归类。

## 与其它 command 的关系

- 导入产生的仍是 platform cases；若要真正执行还需 `/pipeline` 组装 + `/trigger` 配执行入口
- 如需手工构建脚本包（而非从 Git 导入），用 `/case-writing` + `/case`
