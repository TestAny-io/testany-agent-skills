# 本机管理能力调查

调查时间：2026-09-14（Asia/Shanghai）。本文是该次本机只读观察，不是跨版本保证；实现仍需运行时探测。

## 执行边界

仅执行文件读取、`--help`、`--version`、`plugin marketplace list --json` 和 `plugin list --marketplace openai-bundled --json`。未修改用户配置、skills、插件安装状态或 marketplace，未执行安装、卸载、升级或联网刷新市场。本文写入仓库供工程设计引用。

## 运行时与 CLI

| 项目 | 验证结果 |
|---|---|
| Node | `~/.nvm/versions/node/v22.14.0/bin/node`，v22.14.0 |
| Python | `/Library/Frameworks/Python.framework/Versions/3.11/bin/python3`，3.11.3 |
| 可用 Codex | `~/.codex/plugins/.plugin-appserver/codex`，`codex-cli 0.154.0-alpha.6.2` |
| PATH 中的 Codex | npm wrapper 启动失败：缺 `vendor/aarch64-apple-darwin/codex/codex`，未修复 |
| CODEX_HOME | 本次进程未设置，实际默认根为 `~/.codex` |

通过各子命令 `--help` 核实的命令形状：

```text
codex plugin list --json
codex plugin list --available --json
codex plugin list --marketplace NAME --json
codex plugin add PLUGIN@MARKETPLACE --json
codex plugin remove PLUGIN@MARKETPLACE --json
codex plugin marketplace list --json
codex plugin marketplace add SOURCE [--ref REF] [--sparse PATH] --json
codex plugin marketplace upgrade [NAME] --json
codex plugin marketplace remove NAME --json
```

`SOURCE` 支持本地路径、`owner/repo[@ref]`、HTTPS Git URL、SSH Git URL。`upgrade` 仅刷新已配置 Git marketplace snapshot；省略名称表示全部 Git 市场。未发现独立 `plugin update`、`enable`、`disable` 子命令；未验证重复 `add` 的升级语义。

实现应允许指定二进制，验证候选的 `--version` 和所需子命令能力，以参数数组调用，不依赖 PATH 成功或私有路径永久存在。

## 扫描范围与归属

| 路径 | 观察 |
|---|---|
| `~/.codex/skills` | 33 个 `SKILL.md`，包含 `.system` 下 6 个；所见 skill 目录及入口是真实文件。`prd-reviewer.bak-20260309104817` 也是可发现的 skill |
| `~/.agents/skills` | 目录存在，当前为空 |
| 当前仓库及其父目录 | 除上述用户根，未发现其他 `.agents/skills` 或 `.codex/skills` |
| `~/.codex/plugins/cache` | `<market>/<plugin>/<version>`；含 `openai-bundled`、`openai-curated`、`openai-curated-remote`、`openai-primary-runtime` |
| `.../openai-bundled/chrome/latest` | symlink 指向同插件 `26.908.40834` 目录，不能计为第二份安装 |
| `<remote-market>/<plugin>/.codex-remote-plugin-install.json` | 根键仅观察到 `schema_version`、`remote_plugin_id`；不直接改写该托管标记 |

扫描应保留原路径、解析后路径和归属，去除同一实体的 symlink 重复；悬空或越过允许根的链接不能进入写操作。系统技能和托管缓存需要区别于用户独立安装目录。

## 状态事实与白名单结构

`~/.codex/config.toml` 中观察到以下相关形状；当前没有 `skills` 配置。其他配置不应发给 GUI。

```toml
[plugins."name@market"]
enabled = true

[marketplaces.market]
source_type = "local"
source = "/absolute/marketplace/path"
```

`plugin list --marketplace openai-bundled --json` 返回的管理字段示例：

```json
{
  "installed": [{
    "pluginId": "visualize@openai-bundled",
    "name": "visualize",
    "marketplaceName": "openai-bundled",
    "version": "1.0.37",
    "installed": true,
    "enabled": true,
    "source": {"source": "local", "path": "/absolute/plugin/source"},
    "marketplaceSource": {"sourceType": "local", "source": "/absolute/marketplace"},
    "installPolicy": "AVAILABLE",
    "authPolicy": "ON_INSTALL"
  }],
  "available": []
}
```

**缓存和配置不等于有效安装。** 本次配置含 `sites@openai-bundled.enabled=true`，cache 存在 `sites/0.1.66`，但上述 CLI `installed` 六项不包含它。远程插件存在安装标记，却未出现在 `[plugins]` 配置中。因此不能仅因 cache 存在就显示“已安装”，也不能仅因配置缺项就显示“已禁用”。优先记录 CLI 状态；文件补充项明确显示“缓存 / 状态待核实”，并附状态证据来源。

## Marketplace 实测结果

`plugin marketplace list --json` 返回：

| name | root | marketplaceSource |
|---|---|---|
| `openai-primary-runtime` | `~/.cache/codex-runtimes/codex-primary-runtime/plugins/openai-primary-runtime` | `sourceType: local`，source 为该绝对根 |
| `openai-bundled` | `~/.codex/.tmp/bundled-marketplaces/openai-bundled` | `sourceType: local`，source 为该绝对根 |
| `openai-curated` | `~/.codex/.tmp/plugins` | 未返回此字段 |

JSON 白名单为 `marketplaces[].name/root/marketplaceSource`，其中 `marketplaceSource` 可选，包含 `sourceType/source`。

这三处本机市场均存在 `.agents/plugins/marketplace.json`。观察到根键 `name/plugins` 和可选 `interface`；本地 entry 使用 `source: {"source":"local","path":"./plugins/name"}` 与 `policy`。样本插件 manifest 位于 `.codex-plugin/plugin.json`，技能路径示例为 `"skills":"./skills/"`。

这些是当前宿主样本；本仓库 `.claude-plugin` 的 strict、组件合并、路径、symlink 与版本 authority 规则仍遵循 [发现与发布维护](../../../../../docs/plugin-development.md)，不能用单一目录约定替代发现规范。

## 对工程设计的约束

- CLI 为插件/市场状态和生命周期首选 adapter；操作后读回。退出码成功不等于当前会话已加载新能力。
- 独立 skill 的启禁配置格式需要官方资料或隔离环境另行验证；本次用户配置未提供实际样本。
- 独立 skill 移除可先进入应用自己的 quarantine；恢复前检查目标冲突，移除 symlink 时不得操作其 target。
- 无来源历史的独立 skill 无法可靠检查更新。更新须有明确 source/ref、文件差异和本地修改检测。
- “刷新市场”与“更新已安装插件”分别呈现；本次没有为后者建立执行保证。
- 用户环境仅做只读验证；生命周期测试使用隔离 fixture / 临时 home / 假 CLI，不以用户实际安装状态做自动化试验。

发布整理：报告中的用户 home 前缀已替换为 `~`；环境版本与验证结果保留。
