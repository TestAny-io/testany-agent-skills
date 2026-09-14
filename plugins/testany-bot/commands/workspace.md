---
description: Testany Workspace, 管理工作空间，成员权限，团队组织
argument-hint: <操作> <描述>，如：添加成员、查看权限、申请工作空间
---

# Testany 工作空间管理

管理 Testany 工作空间和团队成员。

## 使用方式

$ARGUMENTS

按 [交付验证](../skills/testany-guide/references/delivery-verification.md) 读回申请/成员/角色相关状态。申请受理不等于工作区已可用；未生效或部分失败如实报告，不重复申请或自动回滚。

## 支持的操作

- **查看工作空间**：列出我的工作空间和角色
- **成员管理**：添加/移除团队成员
- **权限配置**：设置成员角色（Owner/Admin/Member/Viewer）
- **申请访问**：申请加入工作空间

## 示例

```
/workspace 查看我的工作空间
/workspace 给 alice@example.com 添加 Y2K 的 Member 权限
/workspace 申请加入 ABC 工作空间
```
