---
name: testany-router
description: Testany 平台操作路由 - 识别用户意图，分发到专业 Subagent，或直接回答简单问题
user-invocable: false
---

# Testany 操作路由

## 意图识别 → Subagent 分发

当用户请求涉及 Testany 平台操作时，根据以下规则分发：

| 意图关键词（中文/英文） | 派发 Subagent | 典型场景 |
|------------------------|---------------|----------|
| 创建/写/新建/create/new + 测试/用例/case/test | `case-author` | "帮我创建一个 API 测试"、"create a new test case" |
| 编辑/修改/更新/edit/update/modify + 用例/脚本/case/script | `case-author` | "更新这个用例的脚本"、"update the script" |
| 创建/组装/配置/create/build/compose + 流水线/pipeline | `pipeline-builder` | "把这些用例组成 pipeline"、"create a pipeline" |
| relay/变量传递/依赖/variable/dependency | `pipeline-builder` | "配置用例之间的变量传递"、"setup relay" |
| 执行/跑/运行/触发/run/execute/trigger + 测试/pipeline | `test-runner` | "跑一下回归测试"、"run the pipeline" |
| 查看/检查/status/result + 结果/状态 | `test-runner` | "看看测试跑完了没"、"check execution status" |
| 失败/报错/为什么/排查/fail/error/why/debug/troubleshoot | `debug-analyzer` | "这个测试为什么失败了"、"why did it fail" |
| 日志/错误信息/log/error message | `debug-analyzer` | "帮我看看日志"、"show me the logs" |
| Jenkins/GitHub Actions/GitLab/CI/CD/门禁/gatekeeper/quality gate | `cicd-integrator` | "接入我们的 CI"、"setup quality gate" |
| 定时/计划/cron/schedule/plan | `cicd-integrator` | "每天凌晨 2 点执行"、"schedule daily run" |
| 权限/成员/工作空间/团队/permission/member/workspace/team | `workspace-admin` | "给新同事开权限"、"add team member" |

## 冲突意图处理

当用户意图可能匹配多个 Subagent 时：

| 冲突场景 | 处理策略 |
|---------|---------|
| "创建 pipeline 并执行" | 先派发 `pipeline-builder`，完成后建议用户使用 `/tests` 执行 |
| "查看失败原因和日志" | 派发 `debug-analyzer`（同属 debug 职责） |
| "更新 case 的 relay 配置" | 派发 `case-author`（relay 在 case 层面是环境变量配置） |
| "配置 pipeline 的 relay" | 派发 `pipeline-builder`（relay 在 pipeline 层面是编排配置） |
| 意图不明确 | 询问用户具体想做什么，再决定派发 |

## 简单问答（无需派发 Agent）

以下问题直接回答，无需启动 Subagent：

### 标识符格式
| 类型 | 格式 | 示例 |
|------|------|------|
| Case Key | 8 位大写十六进制 | `A1B2C3D4` |
| Pipeline Key | `{WS_KEY}-{4或5位数字}` | `Y2K-0601` |
| Workspace Key | 3 位大写字母数字 | `Y2K` |
| Execution ID | `{WS_KEY}-{4或5位数字}-{序号}` | `Y2K-0601-00001` |

### Executor 类型速查
| 脚本类型 | Executor | 触发配置 |
|---------|----------|----------|
| Postman Collection | `postman` | `trigger_path` |
| Python 脚本 | `pyres` (推荐) | `trigger_command` |
| Playwright 测试 | `playwright` | `trigger_path` |
| Maven 项目 | `maven` | `trigger_path` |
| Gradle 项目 | `gradle` | `trigger_path` |

### 执行状态码
| 状态 | 值 | 含义 |
|------|---|------|
| PENDING | 0 | 排队中 |
| RUNNING | 1 | 执行中 |
| SUCCESS | 2 | 成功 |
| FAILED | 3 | 失败 |
| CANCELLED | 4 | 已取消 |
| TIMEOUT | 5 | 超时 |

## 分发原则

1. **复杂任务**（涉及多个 MCP 调用）→ 派发 Subagent
2. **简单查询**（格式/概念/状态码）→ 直接回答
3. **冲突意图** → 按冲突处理表或询问用户
4. **不确定时** → 询问用户意图后再决定
5. **混合语言** → 同时匹配中英文关键词
