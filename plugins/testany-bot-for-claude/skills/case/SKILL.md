---
name: case
description: 管理 Testany 测试用例 - 创建、配置、更新、上传脚本（编写脚本请用 /case-writing）
context: fork
agent: case-manager
disable-model-invocation: true
argument-hint: "[操作] [描述]，如：创建 case、上传脚本、配置环境变量"
---

根据用户需求管理测试用例。

用户输入: $ARGUMENTS

## 支持的操作

- **创建用例**：创建新的测试用例，选择 executor，配置触发方式
- **更新配置**：修改用例的 executor、环境变量、可见性等
- **上传脚本**：上传或更新测试脚本 ZIP 包
- **查看用例**：获取用例详情和配置

## 工作流程

1. 理解用户的测试需求
2. 获取 runtime（推荐 cloudprime）
3. 根据操作类型执行相应步骤
4. 返回操作结果和下一步建议
