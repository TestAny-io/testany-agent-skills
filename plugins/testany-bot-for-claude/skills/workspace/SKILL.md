---
name: workspace
description: 管理 Testany 工作空间 - 成员管理、权限配置、团队组织
context: fork
agent: workspace-admin
disable-model-invocation: true
argument-hint: "[操作] [描述]，如：添加成员、查看权限、申请工作空间"
---

管理工作空间和团队成员。

用户输入: $ARGUMENTS

## 支持的操作

- **查看工作空间**：列出我的工作空间和角色
- **成员管理**：添加/移除团队成员
- **权限配置**：设置成员角色（Owner/Admin/Member/Viewer）
- **申请访问**：申请加入工作空间

## 工作流程

1. 确认操作目标（哪个工作空间、哪个成员）
2. 执行相应操作
3. 返回操作结果和当前状态
