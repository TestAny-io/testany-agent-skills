---
name: testany-sync-case-env-from-source
description: 从 OpenAPI 生成的 Testany case 源代码中自动识别入参和出参，并同步到 case 的环境变量列表中。适用于源代码存储在需要认证的 Git 仓库（如 Bitbucket）的场景。
---

# Testany Case 环境变量同步 Skill

本 Skill 用于从 OpenAPI definition 生成的 Testany case 源代码中自动提取入参和出参，并将它们同步更新到 Testany case 的 `environment_variables` 配置中。

## 适用场景

当 Testany case 的源代码满足以下条件时使用本 Skill：
- 源代码由 OpenAPI definition 自动生成
- 源代码包含 `BASE_STRUCTURES_INFO` 和 `relay_request_fields` 等特征结构
- 源代码存储在需要认证的 Git 仓库（如私有 Bitbucket 仓库）
- 需要将代码中的 ENV[...] 变量和出参字段同步到 case 配置

## 用户交互流程

### 步骤 1：选择操作模式

先从当前请求提取已有 case keys、搜索条件和操作模式；已明确时直接复用，不重复询问。配置更新的预览与确认门禁保持不变：

| 模式 | 说明 |
|------|------|
| **单 Case 操作** | 直接输入一个 case key |
| **批量 Keys 操作** | 输入多个 case key（逗号分隔） |
| **搜索批量操作** | 通过条件搜索 case，对结果进行批量操作 |

仅当模式或目标仍不明确时提问；使用当前可用的提问工具，无工具时使用普通文本。

---

### 步骤 2：获取 Case 列表

根据用户选择的模式，获取待处理的 case 列表：

#### 模式 A：单 Case 操作
```python
case_keys = [user_input_case_key]
```

#### 模式 B：批量 Keys 操作
```python
# 解析逗号分隔的 keys
case_keys = user_input_keys.split(',')
case_keys = [key.strip() for key in case_keys if key.strip()]
```

#### 模式 C：搜索批量操作
```python
# 使用 AskUserQuestion 询问搜索条件
# 可选搜索条件：
# - key_or_name: case key 或名称关键词
# - workspaces: 工作空间列表
# - case_labels: 标签列表
# - runtime_uuid: 运行时 UUID

# 调用 testany_list_cases 获取匹配的 case 列表
cases = testany_list_cases(
    key_or_name=search_keyword,
    workspaces=selected_workspaces,
    case_labels=selected_labels,
    page_size=100  # 限制单页结果数量
)

case_keys = [case['key'] for case in cases]
```

**搜索参数说明：**
- `key_or_name`: 模糊匹配 case key 或名称
- `workspaces`: 筛选指定工作空间的 case（需要先调用 `testany_get_my_workspaces` 获取可用工作空间列表）
- `case_labels`: 筛选包含指定标签的 case（需要先调用 `testany_list_labels` 获取可用标签列表）
- `page_size`: 单页返回数量，默认 20，批量操作建议设为 100

---

### 步骤 3：对每个 Case 执行同步流程

遍历 `case_keys`，对每个 case 执行以下子流程：

#### 子流程 3.1：验证 Case 存在 + 保护已有 secrets

```python
case = testany_get_case(key=case_key)
if case is None or case.get('error'):
    记录错误：Case 不存在
    跳过此 case
    continue

# 读取并隔离已有的 type=secrets 行
# 这类行是用户在 case 上直接维护的凭证绑定，不从源代码派生；
# sync 流程重建 environment_variables 时必须原样保留它们，避免静默丢失绑定。
existing_env_vars = (case.get('case_meta') or {}).get('environment_variables') or []
preserved_secrets = [row for row in existing_env_vars if row.get('type') == 'secrets']
preserved_secret_names = {row['name'] for row in preserved_secrets}
```

#### 子流程 3.2：解析源代码 URL

从 `case['script_url']` 中提取：
- 仓库名称（如：testany-io/integration-test）
- 分支名称（如：demo1、from-swagger-backend-all）
- 文件路径（如：testany-scripts/xxx/yyy/xxx.py）

URL 格式：
```
https://bitbucket.org/{owner}/{repo}/src/{branch}/{file_path}
```

显示解析结果供用户确认：
- 分支名称
- 文件路径

#### 子流程 3.3：拉取源代码到本地

**使用 Git Worktree（默认方案）：**

```bash
# 统一工作树目录
WORKTREE_BASE="/tmp/testany-worktrees"

# 首次访问某个分支时，创建工作树（如果不存在）
BRANCH_WORKTREE="${WORKTREE_BASE}/{branch_name}"
if [ ! -d "${BRANCH_WORKTREE}" ]; then
    git fetch origin {branch_name}
    git worktree add "${BRANCH_WORKTREE}" origin/{branch_name}
fi

# 从工作树中读取文件
FILE_PATH="${BRANCH_WORKTREE}/{file_path}"
```

**优势：**
- 并行访问多个分支：每个分支有独立工作树
- 缓存复用：同一分支的多个 case 只需创建一次
- 无副作用：不影响主工作区的 Git 配置

#### 子流程 3.4：解析入参（Input Parameters）

从源代码的 `BASE_STRUCTURES_INFO["structure"]` 部分查找所有 `ENV[变量名]` 格式的占位符：

```python
import re

env_pattern = r'ENV\[([^\]]+)\]'
input_params = set()

for section in ['path', 'query', 'header', 'body']:
    if section in structure:
        text = json.dumps(structure[section])
        matches = re.findall(env_pattern, text)
        input_params.update(matches)

# 跳过与已有 secret 绑定同名的变量：
# 这些名字已经由用户配置的 secret 提供，代码中直接读同名环境变量即可，
# sync 不应该再派生一条 type=env 把它覆盖掉。
input_collisions = input_params & preserved_secret_names
if input_collisions:
    记录警告：f"以下变量与已有 secret 绑定同名，保留 secret，跳过 source 派生：{sorted(input_collisions)}"
    input_params -= input_collisions
```

**入参规范：**
- 变量名保持 ENV[...] 中的原始名称（全大写）
- 类型：`env`（表示输入参数）
- value：使用占位符值 "PLACEHOLDER"
- description：根据参数位置和用途自动生成

#### 子流程 3.5：解析出参（Output Parameters）

从源代码的 `relay_request_fields` 数组中提取所有字段：

```python
relay_request_fields = [
    "NAME",
    "DESCRIPTION",
    "RUNTIME_UUID",
    # ...
]
```

**出参规范：**
- 字段名保持数组中的原始名称（全大写）
- 类型：`output`（表示 relay 输出参数）
- value：使用占位符值 "PLACEHOLDER"
- description：根据字段名称自动生成

**与已有 secrets 的冲突处理**：
如果 `relay_request_fields` 中某个字段与已有 secret 绑定同名，保留 secret 绑定，跳过该字段的 output 生成，并记录警告：`output 字段 {NAME} 与已有 secret 绑定同名，跳过 output 派生`。
（同一 case 内 environment_variables 的 `name` 必须唯一，不能既是 secrets 又是 output。）

#### 子流程 3.6：读取环境变量文件并替换 PLACEHOLDER

从同一分支的 env 目录中读取环境变量配置文件，并将匹配的入参 `value` 从 `"PLACEHOLDER"` 替换为实际值。

**环境变量文件路径规则：**

| 元素 | 示例 |
|------|------|
| Python 文件路径 | `testany-scripts/get_case_importHistory_id_payload/positive/test_get_case_importHistory_id_payload_positive.py` |
| 提取的目录名 | `get_case_importHistory_id_payload`（`testany-scripts/` 后的第一个目录） |
| 环境变量文件路径 | `integration-test/testany-scripts/env/{目录名}_environment.txt` |
| 完整路径 | `integration-test/testany-scripts/env/get_case_importHistory_id_payload_environment.txt` |

**实现逻辑：**

```python
# 步骤 1：从 Python 文件路径中提取目录名
import re
from pathlib import Path

python_path = "testany-scripts/get_case_importHistory_id_payload/positive/xxx.py"

# 提取 testany-scripts/ 后的第一个目录名
match = re.match(r'testany-scripts/([^/]+)/', python_path)
if match:
    directory_name = match.group(1)  # get_case_importHistory_id_payload
else:
    directory_name = None

# 步骤 2：构建环境变量文件路径
if directory_name:
    env_file_path = f"integration-test/testany-scripts/env/{directory_name}_environment.txt"
    # 在 worktree 中的完整路径
    full_env_path = f"{BRANCH_WORKTREE}/{env_file_path}"
else:
    full_env_path = None

# 步骤 3：读取并解析环境变量文件
env_values = {}
if full_env_path and Path(full_env_path).exists():
    with open(full_env_path, 'r') as f:
        for line in f:
            line = line.strip()
            if line and '=' in line and not line.startswith('#'):
                key, value = line.split('=', 1)
                env_values[key.strip()] = value.strip()

# 步骤 4：替换匹配的入参的 value
for param in input_params:
    if param in env_values:
        # 将 PLACEHOLDER 替换为实际值
        param_value = env_values[param]
        environment_variables.append({
            "type": "env",
            "name": param,
            "value": param_value,
            "description": f"Input parameter: {param}"
        })
    else:
        # 文件中未找到该参数，保留 PLACEHOLDER
        environment_variables.append({
            "type": "env",
            "name": param,
            "value": "PLACEHOLDER",
            "description": f"Input parameter: {param}"
        })
```

**环境变量文件格式：**

```
# 示例：get_case_importHistory_id_payload_environment.txt
ENV_QUERY_KEY_1_00=IXX
ENV_PATH_ID_1_00=12345
ENV_HEADER_AUTH_TOKEN=abc123def456
```

**注意：**
- 文件格式为 `KEY=VALUE`，每行一个变量
- 支持 `#` 开头的注释行（忽略）
- 如果文件不存在，所有入参的 `value` 保留 `"PLACEHOLDER"`
- 如果某个参数在文件中未找到，该参数的 `value` 保留 `"PLACEHOLDER"`

#### 子流程 3.7：预览更新

显示将要更新的 `environment_variables` 数组：

```
入参（type=env）：
- ENV_PATH_ID_1_00: Path parameter for import history id

出参（type=output）：
- NAME: Output field from response: NAME
- DESCRIPTION: Output field from response: DESCRIPTION
...
```

如果 `preserved_secrets` 非空，额外展示保护提示（在入参/出参列表之前）：

```
⚠️ 检测到 N 个 type=secrets 行，将原样保留（本次 sync 不会修改）：
- DB_PASSWORD
- API_TOKEN
...
```

如果 `input_collisions` 或 output 冲突非空，同样展示跳过提示：

```
⚠️ 以下 source 变量与已有 secret 绑定同名，已跳过派生：
- DB_PASSWORD (source 中作为 ENV[...] 出现，保留 secret 绑定)
```

使用 `AskUserQuestion` 确认是否执行更新：
- 选项 1：确认更新
- 选项 2：跳过此 case
- 选项 3：跳过剩余所有 case

#### 子流程 3.8：执行更新

```python
# 注意：environment_variables 已经在子流程 3.6 中填充了入参
# 这里只需要添加出参（出参不替换 PLACEHOLDER）

# 添加出参
for field in relay_request_fields:
    environment_variables.append({
        "type": "output",
        "name": field,
        "value": "PLACEHOLDER",
        "description": f"Output field from response: {field}"
    })

# 合并：从 source 派生的 env/output 行 + 子流程 3.1 中保留的 type=secrets 行
# 必须带上 preserved_secrets，否则整集合替换语义会把已有 secret 绑定删除
final_env_vars = environment_variables + preserved_secrets

# 更新 case
result = testany_update_case(
    key=case_key,
    case_meta={
        "environment_variables": final_env_vars
    }
)
```

记录更新结果（成功/失败/错误信息）。

---

### 步骤 4：显示汇总报告

所有 case 处理完成后，显示汇总报告：

```
同步完成汇总：
----------------
总处理数：10
成功：8
失败：2

失败的 Case：
- ABC12345: Case 不存在
- DEF67890: 源代码拉取失败（分支不存在）

是否清理 worktree 缓存？（缓存可复用，建议保留）
```

提供清理选项：
- 选项 1：清理所有 worktree 缓存
- 选项 2：保留缓存（下次运行更快）

---

## 关键代码模式识别

### 入参模式

| 代码特征 | 含义 |
|---------|------|
| `BASE_STRUCTURES_INFO` | 请求结构模板 |
| `structure.path` | 路径参数 |
| `structure.query` | 查询参数 |
| `structure.header` | 请求头参数 |
| `structure.body` | 请求体参数 |
| `ENV[变量名]` | 需要解析的环境变量（入参） |

### 出参模式

| 代码特征 | 含义 |
|---------|------|
| `relay_request_fields` | 出参字段列表（全大写） |
| `response_fields` | 响应字段定义（用于 process_response_data） |
| `share_test_data(processed_data)` | 调用 relay 服务传递出参 |

---

## 错误处理

### 1. Case 不存在
- 检查 `testany_get_case` 的返回值
- 如果 404 错误，记录并跳过

### 2. 源代码 URL 解析失败
- 验证 script_url 格式是否符合预期
- 如果格式不匹配，记录错误并跳过

### 3. 分支不存在
- 执行 `git fetch` 时检查返回值
- 如果分支不存在，记录错误并跳过

### 4. 文件拉取失败
- 检查文件路径是否正确
- 如果拉取失败，记录错误并跳过

### 5. 代码模式不匹配
- 检查 `BASE_STRUCTURES_INFO` 和 `relay_request_fields` 是否存在
- 如果不存在，提示该 case 可能不是 OpenAPI 生成，记录并跳过

### 6. 环境变量更新失败
- 检查 `testany_update_case` 的错误信息
- 如果错误码为 `E400002`（`case_secrets_feature_disabled`），提示用户：该 workspace 的 secrets 功能可能未开启，请联系管理员确认
- 记录错误详情，继续处理下一个 case

### 7. 名称冲突（source 变量与已有 secret 绑定同名）
- 保留 secret 绑定，跳过 source 派生的同名 env/output
- 在预览中展示跳过列表（子流程 3.7）
- 不算错误，不中断流程；仅在汇总报告里计入警告

---

## 使用示例与字段约定

单 case、批量及环境文件示例见 [使用参考](references/env-sync-usage.md)；处理环境变量前读取其中的密钥、PLACEHOLDER 和字段约定。

## 成功标准

- 成功拉取源代码到本地
- 正确识别所有 ENV[...] 入参
- 正确识别所有 relay_request_fields 出参
- **从 env 目录成功读取环境变量文件并替换入参的 PLACEHOLDER**
- 成功更新 case 的 environment_variables
- 提供清晰的进度反馈和结果报告
- 支持 3 种操作模式（单 case、批量 keys、搜索批量）
- 提供汇总报告和清理选项

---

参考代码结构也见 [使用参考](references/env-sync-usage.md)。

## 实现检查清单

- [ ] 实现操作模式选择（单 case / 批量 keys / 搜索批量）
- [ ] 验证 case 存在
- [ ] 解析 script_url 获取仓库、分支、文件路径
- [ ] 检查并创建 Git Worktree（如不存在）
- [ ] 从 worktree 读取源代码文件
- [ ] 解析入参（ENV[...] 模式）
- [ ] 解析出参（relay_request_fields）
- [ ] **从 Python 文件路径提取目录名并构建环境变量文件路径**
- [ ] **从 worktree 读取环境变量文件（KEY=VALUE 格式）**
- [ ] **将匹配的入参 value 从 PLACEHOLDER 替换为实际值**
- [ ] 构建环境变量数组
- [ ] 预览更新结果（用户确认）
- [ ] 调用 testany_update_case
- [ ] 支持批量处理和多分支
- [ ] 生成汇总报告
- [ ] 提供清理 worktree 缓存选项

---

## Git Worktree 清理命令

手动清理所有 worktree 缓存：

```bash
# 列出所有 worktree
git worktree list

# 删除特定 worktree
git worktree remove /tmp/testany-worktrees/{branch_name}

# 删除所有 worktree（谨慎使用）
for worktree in /tmp/testany-worktrees/*/; do
    git worktree remove "$worktree"
done
```
