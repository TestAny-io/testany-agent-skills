---
name: testany-trigger
description: Testany 执行入口与单次触发 - 为 pipeline 配置 Plan、Manual Trigger、Gatekeeper，或立即执行一次
---

# Testany Trigger

管理 Testany 平台上的 **trigger**，并负责 **即时发起一次 pipeline execution**。

用户输入: $ARGUMENTS

---

## 先统一心智模型

遵循 [整体目标与交接](../testany-guide/references/task-handoff.md)。用户要求一次执行并等终态时，拿到 execution key 后继续 `testany-execution`，而非停在启动成功；只启动或配置则到该目标为止。

在开始之前，先按 [automation-model.md](../testany-guide/references/automation-model.md) 理解边界：

- `pipeline` 是执行与编排单元
- `trigger` 是执行入口
- `trigger` 决定“如何发起 execution”
- `execution` 发起之后的观测与管理属于 `testany-execution`

**重要结论**：
- 本 skill 既负责**持久化执行入口**，也负责**即时单次触发**
- 本 skill 不负责查看 execution 历史、轮询、取消或失败诊断
- 配置执行入口不自动授权 Run Now；发起成功不等于执行成功；UI 回退不等于已配置

---

## 职责范围

按 [交付验证](../testany-guide/references/delivery-verification.md) 读回本轮变更相关状态。请求受理、配置一致、执行已提交和执行成功分开；部分失败保留资源及真实 key，不自动删除回滚或重试。

- 创建/查询/更新/删除 Plan（定时计划）
- 创建/查询/更新/删除 Gatekeeper（Webhook 触发器）
- 覆盖 Manual Trigger 的平台概念、适用场景和当前支持路径
- 立即执行一次已有 pipeline（ad-hoc run now）
- 为已有 pipeline 提供合适的 trigger 方案建议
- 提供可复制的 Webhook / CI 集成示例

---

## Trigger 类型

### Persistent Trigger

长期存在、可重复复用的执行入口：
- `Plan`
- `Manual Trigger`
- `Gatekeeper`

### Ad-hoc Trigger

一次性即时触发：
- `testany_execute_pipeline`

它会直接返回 `execution_key`，后续观测与管理交给 `testany-execution`。

---

## MCP 支持现状

| 类型 | 平台能力 | 当前 MCP 支持 | 本 skill 的处理方式 |
|------|---------|--------------|--------------------|
| Plan | 完整 | 有 | 直接通过 MCP CRUD |
| Gatekeeper | 完整 | 有（含 pipeline 绑定与 webhook URL） | 直接通过 MCP 完成全流程 |
| Manual Trigger | 平台已支持 | 当前未看到对应 MCP tools | 明确纳入 trigger 体系；若当前宿主/MCP 无工具，则指导用户走 UI fallback |
| Run Now | 完整 | 有 (`testany_execute_pipeline`) | 直接执行一次并返回 `execution_key` |

---

## 操作速查

### Persistent Trigger

| 用户意图 | 操作类型 | MCP 工具 |
|---------|---------|---------|
| 列出 Gatekeepers | Read | `testany_list_gatekeepers` |
| 查看 Gatekeeper 详情 | Read | `testany_get_gatekeeper` |
| 创建 Gatekeeper | Create | `testany_create_gatekeeper`（可同时绑定 pipelines） |
| 查看 Gatekeeper 绑定的 Pipelines | Read | `testany_get_gatekeeper_pipelines` |
| 绑定/替换 Gatekeeper 的 Pipelines | Update | `testany_bind_gatekeeper_pipelines` |
| 更新 Gatekeeper 字段 | Update | `testany_update_gatekeeper` |
| 删除 Gatekeeper | Delete | `testany_delete_gatekeeper` |
| 列出 Plans | Read | `testany_list_plans` |
| 查看 Plan 详情 | Read | `testany_get_plan` |
| 创建 Plan | Create | `testany_create_plan` |
| 更新 Plan | Update | `testany_update_plan` |
| 删除 Plan | Delete | `testany_delete_plan` |
| 转移 Plan Owner | Update | `testany_assign_plan` |

常用辅助：
- `testany_get_my_workspaces`
- `testany_list_pipelines`

### Ad-hoc Run Now

| 用户意图 | MCP 工具 |
|---------|---------|
| 立即执行一次 pipeline | `testany_execute_pipeline` |

---

## Trigger 选择原则

| 方式 | 适用场景 |
|------|---------|
| Plan | 固定时间自动执行，如夜间回归、定时巡检 |
| Manual Trigger | 人工按需执行，如修复后复测、发布前验收 |
| Gatekeeper | 外部事件驱动执行，如 CI/CD、告警、Webhook |
| Run Now | 现在立刻执行一次，不沉淀长期 trigger 资源 |

---

## Run Now（立即执行一次）

### 适用场景

- “现在帮我跑一次这个 pipeline”
- “临时执行一次回归”
- “刚改完，立即验证”

### 流程

1. 如果用户没有明确 pipeline key：
   - `testany_get_my_workspaces`
   - `testany_list_pipelines`
   - 帮用户定位目标 pipeline
2. 按 [执行许可与等待合同](../testany-guide/references/execution-boundaries.md) 核对本轮执行许可、pipeline、环境/参数及副作用；明确的信息不重复问，然后调用一次 `testany_execute_pipeline`
3. 返回 `execution_key`
4. 明确告诉用户：
   - 仅在工具确认已受理并返回 key 时说执行已经发起；没有终态证据不能说测试成功
   - 接下来如需看进度、查历史、取消、看结果，切到 `testany-execution`

### 输入补充

如有需要，可同时传：
- `environment`
- `parameters`

但不要把这些一次性参数误写成长期 trigger 配置。

---

## Plan（定时计划）

### 定义

Plan 用于按固定 schedule 自动触发一个或多个 pipeline。

### 创建流程

1. `testany_get_my_workspaces` → 选择 workspace
2. `testany_list_pipelines` → 选择要定时执行的 pipelines
3. `testany_create_plan` → 创建计划
4. `testany_get_plan` 核对目标、schedule 和配置；受理但读回失败时说明已创建而未核验，不重复创建

建议同时填写：
- `schedule_expr`
- `timezone`
- `schedule_str`
- `watchers`

### 更新注意事项

Plan 更新应视为高风险“覆盖式更新”：
1. `testany_get_plan` 先读取现有配置
2. 基于现有配置构造完整 payload
3. 再调用 `testany_update_plan`
4. 读回核对本次字段；不一致或权限不足报告验证受阻，不自动执行计划来「验证配置」

---

## Manual Trigger（按需执行模板）

### 定义

Manual Trigger 用于按需执行一个或多个 pipeline，不依赖定时调度，也不依赖外部 webhook。

### 典型场景

- 热修复上线前快速回归
- 环境恢复后立即复测关键链路
- 人工发起标准化多 pipeline 验收

### 当前处理方式

如果当前 MCP/宿主没有 Manual Trigger 工具：
1. 帮用户确定 workspace 和 pipelines
2. 给出建议的名称、描述和 pipeline 列表
3. 提示用户到 Testany UI 创建 Manual Trigger
4. 明确「尚未配置，待用户操作」；不声称 MCP 已完成，不替换成 Plan/Gatekeeper/Run Now，也不擅自操作 UI

若当前宿主实际具备对应工具，则按其真实 schema 配置并读回，不凭本表推断工具永远缺失。

---

## Gatekeeper（Webhook / 事件驱动）

### 定义

Gatekeeper 通过 Webhook 触发一个 pipeline group 的执行。

### 重要澄清

- Gatekeeper 不是 pipeline 编排工具
- Gatekeeper 不是 execution 观测工具
- “是否放行部署”属于外部 CI/CD 逻辑，应在调用 Gatekeeper 之后依据 execution 结果自行决定

### 创建流程

**方式一：创建时直接绑定（推荐）**
1. `testany_get_my_workspaces` → 选择 workspace
2. `testany_list_pipelines` → 选择要触发的 pipelines
3. `testany_create_gatekeeper(workspace, name, pipelines=[...])` → 创建并绑定
4. `testany_get_gatekeeper` → 获取 `hook_url`
5. `testany_update_gatekeeper` → 配置 trigger_method / trigger_name / trigger_condition / watchers / owned_by
   - 仅设置本轮要求的字段，不为凑流程覆盖默认值；没有额外字段目标时不调用 update
6. 用 `testany_get_gatekeeper` / `testany_get_gatekeeper_pipelines` 核对本次配置与绑定；读回失败只说明已创建/已提交而核验受阻

**方式二：先创建，再绑定**
1. `testany_create_gatekeeper` → 创建 Gatekeeper
2. `testany_bind_gatekeeper_pipelines` → 绑定 pipelines
3. `testany_get_gatekeeper_pipelines` → 确认绑定结果

### Webhook URL 获取

通过 `testany_get_gatekeeper` 获取详情即可拿到 `hook_url`。如果用户无编辑权限，`hook_url` 会是 null。

---

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

---

## 返回格式

按实际操作与证据汇报，不使用统一「MCP 直连完成」模板：
- Trigger 类型：`Plan / Manual Trigger / Gatekeeper / Run Now`
- 目标 pipelines 列表
- 实际结果：已配置且核验 / 已提交但核验受阻 / 已发起执行 / 尚待用户操作 / 操作失败
- 支持该结果的对象 key、工具回包或读回；列出部分完成与未完成项，不因某一步成功隐藏后续失败
- 关键配置（schedule_expr、timezone、watchers、trigger_name 等）；平台原枚举不改名
- 如是 Run Now：
  - 返回 `execution_key`
  - 单凭 key 只声称已发起；用户已要求等终态则继续 `testany-execution`，仅启动请求不擅自等待，任何等待都不授权取消或重试
- 如是 Gatekeeper：
  - 返回 Webhook URL（通过 testany_get_gatekeeper 获取；无权限时为 null）

配置读回不能证明测试通过；回包不确定时先查状态，不自动重试创建或删除对象「回滚」。

---

## 参考文档

- [Testany 自动化对象模型](../testany-guide/references/automation-model.md)
- [核心概念](../testany-guide/references/concepts.md)
