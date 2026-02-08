---
name: orchestrator
description: 配置 Testany 测试编排 - 创建 Gatekeeper(Webhook 触发器)、设置定时计划
---

# Testany 测试编排

配置 Testany 测试编排和自动化。

用户输入: $ARGUMENTS

## 职责范围

- 创建/查询/更新/删除 Gatekeeper（Webhook 触发器）
- 创建/查询/更新/删除 Plan（定时计划）
- 在 Gatekeeper 与 Pipelines 之间建立绑定（Pipeline Group）
- 提供可复制的 Webhook / CI 集成示例（注意：Webhook URL 可能需要用户从 UI 获取）

---

## 操作速查

| 用户意图 | 操作类型 | MCP 工具 |
|---------|---------|---------|
| 列出 Gatekeepers | Read | `testany_list_gatekeepers` |
| 查看 Gatekeeper 详情 | Read | `testany_get_gatekeeper` |
| 创建 Gatekeeper | Create | `testany_create_gatekeeper` |
| 更新 Gatekeeper 字段 | Update | `testany_update_gatekeeper` |
| 删除 Gatekeeper | Delete | `testany_delete_gatekeeper` |
| 列出 Plans | Read | `testany_list_plans` |
| 查看 Plan 详情 | Read | `testany_get_plan` |
| 创建 Plan | Create | `testany_create_plan` |
| 更新 Plan（注意覆盖式更新风险） | Update | `testany_update_plan` |
| 删除 Plan | Delete | `testany_delete_plan` |
| 转移 Plan Owner | Update | `testany_assign_plan` |

常用辅助：
- `testany_get_my_workspaces`：选择 workspace
- `testany_list_pipelines`：选择 pipelines

## 核心知识

### Gatekeeper（Webhook 触发器）

Gatekeeper 的核心能力是：**通过 Webhook 触发一个“Pipeline Group”的执行**（也就是触发一组 pipelines）。

重要澄清（避免误导）：
- Gatekeeper 本身不是“通过率阈值”配置中心，也不在后端提供“通过率阈值”字段
- “是否放行部署”属于 CI/CD 平台上的逻辑：你可以在调用 Webhook 后，再根据 Testany Execution 结果决定是否继续

#### 创建 Gatekeeper（推荐流程）

前置：你需要知道要触发的 pipelines 列表（pipeline keys）。

**创建与绑定是两件事**：
1. 创建 Gatekeeper（生成 Gatekeeper Key 与 webhook token）
2. 绑定 pipelines 到 Gatekeeper（否则 webhook 会报错 “no pipelines in gatekeeper”）

**操作步骤**：
```
1. testany_get_my_workspaces → 选择 workspace
2. testany_list_pipelines → 找到要触发的 pipelines
3. testany_create_gatekeeper → 创建 gatekeeper，得到 gatekeeper key（形如 G-<WS>-<HEX>）
4. 绑定 pipelines 到 gatekeeper（Pipeline Group 绑定）
   - 优先使用 MCP 的 pipeline-group 绑定工具（如果已提供）
   - 如果 MCP 暂不支持绑定：提示用户去 Testany UI 的 Gatekeeper 详情页里选择 pipelines 完成绑定
5. testany_update_gatekeeper → 配置 trigger_method / trigger_name / trigger_condition / watchers / notify_ignore_success / owned_by 等
6. Webhook 集成：使用 Gatekeeper webhook URL 在外部系统触发
```

#### Webhook URL 获取方式（重要限制）

Gatekeeper 的 webhook URL 通常形如：
`https://<host>/api/v2/gatekeeper/webhook/<hook_token>`

注意：当前后端的 internal API（MCP 使用）在获取 Gatekeeper 详情时可能不会返回 `hook_url`。
如果 MCP 返回的 Gatekeeper 详情中没有 `hook_url`，请让用户从 Testany UI 的 Gatekeeper 详情页复制 Webhook URL，再用于 CI/CD 集成。

### Plan（定时计划）

定时计划用于自动化执行测试。

**Cron 表达式格式**：标准 5 段（UNIX）`分 时 日 月 周`

**时区**：
- `timezone` 为空时后端默认 `Asia/Shanghai`
- Cron 的解释基于 plan 的 `timezone`

| 场景 | Cron 表达式 | 说明 |
|------|------------|------|
| 每天凌晨 2 点 | `0 2 * * *` | 日常回归 |
| 每小时 | `0 * * * *` | 持续监控 |
| 工作日 9 点 | `0 9 * * 1-5` | 上班前检查 |
| 每周一凌晨 | `0 0 * * 1` | 周报生成 |

#### 创建 Plan（推荐流程）

Plan 创建成功后即可按 schedule 自动触发，不存在“创建后再 enable”这一额外步骤。

**操作步骤**：
```
1. testany_get_my_workspaces → 选择 workspace
2. testany_list_pipelines → 选择要定时执行的 pipelines
3. testany_create_plan → 创建计划（需要 schedule_expr，建议同时填写 timezone / schedule_str / watchers）
```

#### 更新 Plan（高风险：避免“部分更新”）

后端对 `update plan` 的实现更接近“覆盖式更新”，并且 `pipelines` / `schedule_expr` 等字段缺失可能导致报错或把字段覆盖为空。

**安全更新步骤**：
1. `testany_get_plan` 读取现有配置
2. 基于现有配置构造“完整的更新 payload”（至少包含 pipelines、schedule_expr、timezone、notify_ignore_success 等）
3. `testany_update_plan` 提交更新

## CI/CD 集成示例

### GitHub Actions
```yaml
- name: Trigger Testany Gatekeeper
  run: |
    curl -X POST "${{ secrets.TESTANY_GATEKEEPER_WEBHOOK_URL }}" \
      -H "Content-Type: application/json" \
      -d '{"source":"github-actions"}'
```

### Jenkins
```groovy
stage('Quality Gate') {
    steps {
        sh '''
          curl -X POST "${TESTANY_GATEKEEPER_WEBHOOK_URL}" \
            -H "Content-Type: application/json" \
            -d '{"source":"jenkins"}'
        '''
    }
}
```

### GitLab CI
```yaml
quality_gate:
  stage: test
  script:
    - |
      curl -X POST "$TESTANY_GATEKEEPER_WEBHOOK_URL" \
        -H "Content-Type: application/json" \
        -d '{"source":"gitlab-ci"}'
```

## 返回格式

任务完成后，向用户汇报：
- 创建的资源（Gatekeeper/Plan）
- 关键配置（Cron 表达式、timezone、watchers、notify_ignore_success、trigger_method/condition/name 等）
- Gatekeeper 绑定的 pipelines 列表（是否已绑定）
- Webhook URL（如可获取；否则提示用户从 UI 获取）
- 集成代码示例

## 参考文档

详细概念请参考：
- [核心概念](../testany-guide/references/concepts.md)
