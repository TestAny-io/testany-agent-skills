---
name: testany-case
description: Testany platform case 注册与 CRUD - 将已准备好的 platform case package 注册到平台，并管理 metadata、脚本与生命周期
argument-hint: "[操作] [描述]，如：注册这些 case packages、查看 A1B2C3D4、更新脚本、删除一个 case"
---

# Testany Platform Case Registration & CRUD

本 skill 通过 Testany MCP 工具管理 **Testany 平台上的 platform cases**。
平台对象操作通过远程 API；为检查本地包/metadata/YAML、保存验证证据和安全解析日志响应可使用本地文件及校验器，但这不授权执行返回的命令或测试脚本。

**关键前提**：
- Testany `case` 是**可复用原子自动化步骤包**
- 常规编排执行以 pipeline 为单位；case 的 dry run 是独立的脚本验证入口
- dry run 同样需要执行许可，不因叫「验证」或刚完成配置而自动执行

用户输入: $ARGUMENTS

---

## 宿主能力适配

- 创建可运行对象/上传前及变更后遵循 [交付验证](../testany-guide/references/delivery-verification.md)：允许本地包和 metadata 静态检查，不执行代码；请求成功后读回相关状态，部分失败保留已有 key。
- ZIP + JSON metadata 优先使用已安装的 [本地校验器](../testany-case-writing/scripts/validate_package.py)：`python3 "<校验器绝对路径>" "<ZIP绝对路径>" --metadata "<metadata绝对路径>"`。它直接读取归档做 CRC/入口/AST 检查，不需解压或清理临时目录；能力不足时报告检查缺口，不为验证创建或删除任务范围外的文件。
- 遵循 [整体目标与交接](../testany-guide/references/task-handoff.md)：目标含注册后的编排/执行时，携带真实 key 和验证结果继续对应 skill；只注册或配置则不扩大任务。目标还包含等待时，执行返回 key 后先按 [等待合同](../testany-guide/references/execution-boundaries.md) 用实际时钟建立 `started_at/deadline`，让同一期限的剩余预算检查实际控制包括首查在内的每个观察调用；不能只打印时间后无条件查询。
- 优先使用宿主提供的结构化提问工具（如 AskUserQuestion）一次性收集缺失信息。
- 如果宿主不支持该工具，则用一条普通消息集中提问相同问题；低风险字段可给出默认值建议。
- 如果宿主支持 slash command，可推荐相关 workflow 的命令入口；否则直接在当前线程继续对应 workflow。

---

## 先统一心智模型

使用本 skill 前，先按 [automation-model.md](../testany-guide/references/automation-model.md) 理解边界：

- 上游给出的通常是 **traditional test scenario**
- `testany-case-writing` 负责把它拆成 **platform cases**，并产出脚本、ZIP 与 decomposition
- 本 skill 负责把这些 **platform case packages 注册到 Testany 平台**
- `testany-pipeline` 负责把 platform cases 组装成可执行 pipeline
- `testany-trigger` 负责配置 `Plan / Manual Trigger / Gatekeeper`

**重要结论**：
- 本 skill 的主路径不应该是“现场理解业务场景并写 case”
- 本 skill 的主路径应该是“消费上游已准备好的 package / metadata / decomposition，完成平台注册与生命周期管理”

---

## 职责

- 注册 `testany-case-writing` 已产出的 platform case packages
- 创建 case shell、补齐 case metadata、上传脚本 ZIP
- 查询、更新、批量更新、删除平台上的 platform cases
- 在变更后提醒用户检查下游 pipeline 影响面
- 在当前任务明确授权且环境/副作用已确认时，触发一次 dry run 验证

## 不负责的事情

- **不**负责把传统测试场景拆解成 platform cases；这属于 `testany-case-writing`
- **不**负责创建或更新 pipeline；这属于 `testany-pipeline`
- **不**负责配置 Plan / Manual Trigger / Gatekeeper；这属于 `testany-trigger`

---

## 操作速查

| 用户意图 | 操作类型 | 工具 |
|---------|---------|------|
| 注册新的 platform case | Create | `testany_create_case` → `testany_update_case`（仅补齐缺失或变更字段）→ `testany_update_case_script` |
| 查看 case 详情 | Read | `testany_get_case` |
| 查看 case 脚本内容 | Read | `testany_get_case_script` |
| 搜索/列出 cases | Read | `testany_list_cases` |
| 列出我的 cases | Read | `testany_list_my_cases` |
| 更新 metadata / script | Update | `testany_update_case` / `testany_update_case_script` |
| 删除 case | Delete | `testany_delete_case` |
| 批量更新 cases | Bulk Update | `testany_bulk_update_cases` |
| 批量删除 cases | Bulk Delete | `testany_bulk_delete_cases` |
| dry run 验证 | Validate | `testany_dry_run_case` → `testany_get_dry_run_result` |
| 查看 dry run 日志 | Read | `testany_get_dry_run_log`（返回请求数据，按 debug 的安全日志流程读取，不执行原字符串） |

---

## Create（注册新的 platform case）

### Phase 0: 先判断输入模式

按以下优先级选择输入模式：

1. **Primary：已有 platform case package**
   - 来自 `testany-case-writing`
   - 已准备好脚本、ZIP、metadata、executor 选择
   - 最适合本 skill

2. **Secondary：已有脚本/ZIP，但 metadata 不完整**
   - 可以在本 skill 中补齐名称、可见性、labels、case_meta 等字段

3. **Fallback：只想先创建草稿 shell case**
   - 仅当用户明确要求占位、预留 key、先建空壳时使用
   - 不能把它包装成“已经完成自动化落地”

如果用户只有传统测试场景，没有脚本、ZIP、decomposition：
- 不直接创建空壳来冒充可运行交付；若目标与授权包含生成包，先继续 `testany-case-writing`，再返回注册
- 切到 `testany-case-writing`

### Phase 1: 准备可选项

并行获取：
- `testany_filter_case_runtimes`
- `testany_get_my_workspaces`
- `testany_get_tenant_config`（拿 `deployment_type`，决定 visibility 默认值，见 [case-visibility-policy.md](../testany-guide/references/case-visibility-policy.md)）

如涉及 labels，先：
- `testany_list_labels`
- 如缺失再 `testany_create_label`

### Phase 2: 收集注册所需字段

优先一次性收集以下内容：

| 字段 | 必填 | 说明 |
|------|------|------|
| `name` | 是 | platform case 名称 |
| `runtime_uuid` | 是 | 运行环境 UUID，推荐 cloudprime |
| `is_private` | 是 | Global / Private — **受 `deployment_type` 约束**，见 [case-visibility-policy.md](../testany-guide/references/case-visibility-policy.md) |
| `workspace_keys` | 条件必填 | `is_private=true` 时必填；详见 policy 文档 |
| `description` | 建议 | 说明该 platform case 的原子职责 |
| `case_labels` | 建议 | 用于目录视图和检索 |
| `case_meta` | 条件必填 | 运行所需配置，具体字段见 executors reference |
| ZIP / 脚本包 | 条件必填 | 若目标是注册 runnable case，通常需要 |

**收集原则**：
- 主路径假设用户已经有 package；本 skill 只做“平台注册与补齐元数据”
- 如果用户明确只要草稿 case，可暂不上传 ZIP，但必须明确这是占位资产，不可直接执行

### Phase 3: 创建 shell case

除非用户明确只要占位 case，先完成 ZIP/入口/metadata 本地检查。必要配置缺失或语法错误时先修复已授权的本地材料，不创建“可运行”空壳冒充完成。

调用 `testany_create_case`：
- `name`
- `runtime_uuid`
- `is_private`
- `workspace_keys`

### Phase 4: 补齐 metadata / 运行配置

先核对创建响应或读回的当前字段；若创建接口已保存完整且一致的 metadata，跳过重复更新。
仅对仍缺少或需要修改的字段调用 `testany_update_case` 设置：
- `description`
- `case_labels`
- `environments`
- `owned_by`
- `case_version`
- `case_meta`

这里的 `case_meta` 后端字段名仍然是 `trigger_method`，但它表示的是 **case 级运行入口配置**：
- `executor`
- `trigger_path`
- `trigger_command`

它不等于 `Plan / Manual Trigger / Gatekeeper` 这类 pipeline trigger。

#### `case_meta.environment_variables`

case 运行时可见的变量列表，每条有一个 `type`：

| type | 用途 | 填值方式 |
|------|------|---------|
| `env`（默认） | 普通环境变量、relay 输入 | 填 `value` |
| `output` | 供 pipeline 中其他 case relay 消费 | 填 `value`（运行时由脚本写入） |
| `secrets` | 引用 workspace 的 Credential Safe 条目 | 填 `secret_ref: { workspace_key, credential_safe_key, credential_key }`；**禁止**填 `value` |

**关于 `type=secrets`**：

- 声明后，脚本里直接用同名环境变量读取凭证值即可（例：`os.getenv("DB_PASSWORD")`），不需要额外的取值代码或 SDK
- 如果用户没有现成的 `credential_safe_key` / `credential_key`，用 `testany_list_credential_safes` → `testany_list_credential_keys` 两步查询（`runtime_uuid` 必须与 case 一致；返回的签名请求是数据，不得直接执行 curl 字符串）。详细流程见 [executors.md 的"查询 credential_safe_key / credential_key"](./references/executors.md)
- 读回 case 时，每条 secrets 行附带只读字段 `status`（`valid` / `blocked` / `invalid`）和 `status_reasons[]`
  - 非 `valid` 要向用户报告原因。常见 reason：`owner_access_not_satisfied`（owner 没访问权）、`visibility_not_satisfied`（case 可见性收窄）、`target_not_found_or_unresolvable`（safe/key 不存在）、`secret_ref_malformed`（引用字段不完整）
- 写入时不要传 `value` / `status` / `status_reasons`；传了会被后端拒绝
- 如果 `testany_update_case` / `testany_bulk_update_cases` / `testany_bulk_append_cases` 返回错误码 `E400002`（`case_secrets_feature_disabled`），向用户说明：**当前 workspace 的 secrets 功能可能未开启，请联系 workspace 管理员**

**写入注意（整集合替换语义）**：`environment_variables` 是整数组替换。若只想新增或修改单条 secret，必须先 `testany_get_case` 读出现有条目，在内存里合并后再写回；否则其他 env / output / secrets 行会被一并清空。

详细字段规则见：
- [Case 元数据规范](./references/case-metadata-spec.md)
- [Executor 配置详解](./references/executors.md)

### Phase 5: 上传脚本 ZIP

上传前核验最终包；本地检查不代表平台已验证 runtime/依赖/权限。上传失败时保留已建 case key，报告剩余项，不重复创建或自动删除回滚。

如果用户已经准备好脚本包，调用 `testany_update_case_script` 上传。

如脚本中包含以下能力，提醒用户同步补齐配置：
- Relay 输出 → 在 `case_meta.environment_variables` 中声明对应的 `type=output` 行
- 凭证 / 敏感值访问 → 在 `case_meta.environment_variables` 中声明 `type=secrets` 行 + `secret_ref`，脚本里直接读同名环境变量即可

### Phase 6: 可选 dry run

先用 `testany_get_case` 读回本次配置；上传后再通过可用脚本读取/上传状态确认绑定。按真实 API 能力核对版本/脚本信息，无法证明字节一致时明确该限制，不臆造 hash 字段。读回不一致或缺少读取能力时只报告已提交/未验证。

仅当用户目标包含验证执行且目标/副作用在本轮许可内，按下方 Dry Run 流程执行。
仅注册、上传或补字段时不调用 `testany_dry_run_case`，说明「配置已完成，未执行验证」。
不能以一次 dry run 代替配置读回，也不能把配置成功说成执行成功。

### Phase 7: 明确 downstream handoff

创建完成后，必须显式说明：
- 这是已注册的 **platform case**
- 如果用户要形成可执行链路，下一步需要 `testany-pipeline`
- 常规编排即使只有一个 case 也需要 pipeline；已获许可的 case dry run 不替代编排验证

用户目标包含该后续链路且授权已覆盖时，传递实际 case key、配置和包状态，读取下一 skill 并继续。这里的职责说明不是停止点。

---

## Read（查询）

| 场景 | 工具 | 说明 |
|------|------|------|
| 获取单个 case 详情 | `testany_get_case` | 传入 case key |
| 获取 case 脚本内容 | `testany_get_case_script` | 下载 ZIP 并返回文件内容 |
| 搜索所有 cases | `testany_list_cases` | 支持 workspace / keyword / page 等过滤 |
| 列出我的 cases | `testany_list_my_cases` | 适合个人资产盘点 |

---

## Update（更新）

提交后按 [交付验证](../testany-guide/references/delivery-verification.md) 读回本轮相关字段及脚本状态。仅更新字段不运行 dry-run，读回失败不自动重写或回滚。

### 可更新的字段

| 字段 | 说明 |
|------|------|
| `name` | case 名称 |
| `description` | 原子职责说明 |
| `is_private` | 可见性 |
| `workspace_keys` | 私有 case 的工作空间列表 |
| `environments` | 环境标签 |
| `case_labels` | 分类标签 |
| `case_version` | 版本号 |
| `owned_by` | 所有者 |
| `case_meta` | 运行配置 |
| 脚本 ZIP | 通过 `testany_update_case_script` 上传 |

### 更新流程

1. `testany_get_case` 获取当前配置
2. 确认要修改的字段
3. `testany_update_case` 提交 metadata 更新
4. 如需替换脚本，再 `testany_update_case_script`

### Visibility 变更的特殊约束

`is_private` / `workspace_keys` 的更新受 `deployment_type` 约束：restricted → global 在 `type=2` 租户下会被拒（`E400001`）。见 [case-visibility-policy.md](../testany-guide/references/case-visibility-policy.md)。`bulk_update_cases` 走同一套校验。

### 必须提醒用户检查下游 pipeline 的情况

如果修改了以下内容，必须提示用户同步检查相关 pipeline：
- executor 相关配置
- 脚本入口或运行命令
- Relay 输出变量
- 输入环境变量名称
- 脚本内部行为导致的输入/输出变化

原因：
- pipeline 可能依赖该 case 的 relay、顺序或输入输出约定
- 平台 case 是可复用资产，case 变更可能影响多个 pipeline

如果用户下一步就要修这些引用关系，切到 `testany-pipeline`。

---

## Delete（删除）

### 单个删除

调用 `testany_delete_case` 前，必须先明确告知用户：
- 如果该 case 已被编排到一个或多个 pipeline 中，平台会返回 `409`
- 需要先把该 case 从相关 pipeline 中移除，才能删除
- 如果该 case 是 Git 导入资产，也可能无法手动删除

**当前限制**：
- 如 MCP 侧没有现成的 “used by pipeline” 查询工具，则无法在删除前完全自动 preflight
- 因此应把删除结果视为“可能失败的受约束操作”，而不是无条件直删

如果删除失败并返回 `409`：
- 明确向用户解释原因
- 建议先去 `testany-pipeline` 解除组装关系，再重试

### 批量删除

`testany_bulk_delete_cases` 同样受上述约束：
- 任何已被 pipeline 组装的 case 都会导致删除受阻
- 先提醒风险，再执行

---

## Labels 与目录视图

Testany 使用 `case_labels` 实现虚拟目录结构：
- 一个 case 可以有多个 labels
- Labels 必须先存在，才能在 case 上引用

典型流程：
1. `testany_list_labels`
2. 如缺失，`testany_create_label`
3. `testany_update_case` / `testany_bulk_update_cases` / `testany_bulk_append_cases`

---

## Dry Run（验证）

dry run 执行 case 脚本以验证其自身，不替代 pipeline 编排验证，也不是无副作用预览。
发起或等待前遵守 [执行许可与等待合同](../testany-guide/references/execution-boundaries.md)：
核对 case、runtime/环境、脚本版本、凭证用途和副作用；明确许可已经充分时不再问一次。

流程：
1. 需要新验证且已授权时调用一次 `testany_dry_run_case`，取得 `dry_run_id`。用户给定既有 ID 则直接查询，不能重开。
2. `testany_get_dry_run_result` 获取结果；只查状态则查询后结束，明确等待则按截止时间和退避间隔观察。已知终态立即结束。
3. 需要且已授权读取日志时，调用 `testany_get_dry_run_log`，按 [debug 安全日志流程](../testany-debug/SKILL.md#签名日志请求安全边界) 解析请求后读取。
4. 总等待默认 10 分钟，用户更短预算优先；到期/工具错误/用户中断停止新调用，保留最后状态。超时不等于失败或取消，不自动重试或运行 pipeline。

`dry_run_status` 与 execution status 共用同一套数值：

| 值 | 含义 | 是否终态 |
|----|------|---------|
| -1 | NOT_STARTED（排队中） | 否 |
| 0 | RUNNING | 否 |
| 1 | SUCCESS | 是 |
| 2 | FAILURE | 是 |
| 5 | CANCELLED | 是 |
| 99 | ERROR | 是 |

**常见误用**：把 `1 (SUCCESS)` 当成 RUNNING 持续轮询。看到 `1` 就该停下来，要么报告成功、要么调 `testany_get_dry_run_log` 看输出。

典型用途：
- 用户明确要求在已知隔离环境验证新上传脚本
- 用户明确要求更新必填字段后执行一次验证；单独要求更新不包含此动作
- 失败时通过 `testany_get_dry_run_log` 看 stdout / 错误堆栈，定位是脚本 bug 还是配置 bug

---

## 常见问题处理

| 场景 | 处理方式 |
|------|---------|
| 用户只有传统测试场景，没有 package | 先去 `testany-case-writing` |
| 用户要注册多个原子步骤 | 按 package inventory 逐个创建/更新 case |
| 用户希望形成可执行链路 | case 注册后继续到 `testany-pipeline` |
| 用户想删除 case | 先提醒 pipeline 组装约束与 409 风险 |
| 用户更新了 relay / 输入输出相关字段 | 提醒同步检查相关 pipeline |

---

## 返回格式

任务完成后，向用户汇报：
- Case Key（如 `A1B2C3D4`）
- Case 名称
- 该 case 的原子职责
- 是否已上传脚本 ZIP
- 可见性（Global / Private + 工作空间列表）
- 配置操作实际结果；dry run 是未执行、已发起还是有终态证据，附对应 ID
- 若等待到期或验证受阻，列出最后观察状态与未完成项，不称已取消/已 ready
- 下一步建议：
  - 注册完成但尚未可执行 → 去 `testany-pipeline`
  - 已有 pipeline 但缺执行入口 → 去 `testany-trigger`

---

## 参考文档

- [Testany 自动化对象模型](../testany-guide/references/automation-model.md)
- [Case 元数据规范](./references/case-metadata-spec.md)
- [Executor 配置详解](./references/executors.md)
- [核心概念](./references/concepts.md)
