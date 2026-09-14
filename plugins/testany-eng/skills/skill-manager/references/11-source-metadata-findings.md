# 现有技能来源元数据调查

日期：2026-09-14。范围：第二轮 UAT「关联更新来源为空」。本轮仅只读调查，未修改后端、用户配置或安装内容，未执行安装、更新、联网下载或自动计划。

## 本机可验证事实

- `~/.codex/skills` 下有 27 个直接包含 `SKILL.md` 的独立技能目录；均为普通目录，没有 `.git`。其相关父目录也没有 `.git`。
- `~/.agents/skills` 存在且为空。
- 这些技能及根目录中没有发现明确的安装来源记录；文件名含 source、origin、install、lock、metadata、manifest 的候选检查结果是技能自身的参考文档或脚本，不是安装元数据。
- `~/.codex`、`~/.agents` 下已检查的 `skills-lock.json`、`skill-lock.json`、`.skill-lock.json`、`.skills-lock.json` 均不存在。没有据此推断其他安装器必然采用某种固定格式。
- 技能目录及其 `SKILL.md` 没有 `com.apple.metadata:kMDItemWhereFroms` 下载来源扩展属性。
- `.system/.codex-system-skills.marker` 是宿主系统技能标记，不能当作某个独立技能的 GitHub 来源或历史安装 commit。

未检查聊天记录、shell 历史、凭证文件或与技能来源无关的数据。没有按名称、相似内容或当前仓库内容推断安装历史。

## 官方安装脚本为什么不能补回这些字段

本机官方脚本：`~/.codex/skills/.system/skill-installer/scripts/install-skill-from-github.py`。

调查时 SHA-256：`38f311b75664bb063808f982c600271ebc4b560830f491705190f88a94e3e781`。

- `_copy_skill`（第 219–223 行）只调用 `shutil.copytree(src, dest_dir)`，复制选中的技能子目录。
- `main`（第 326–345 行）把仓库下载或 checkout 到临时目录，复制技能后删除整个临时目录。
- 第 346–347 行只向终端打印技能名称和目标目录。
- 脚本没有写入来源仓库、源子目录、ref 或 resolved commit 的持久记录。下载方式与 Git 回退方式最终都使用上述复制流程。
- `list-skills.py` 的已安装判断只枚举目标目录名称，也不能证明某个同名目录来自所列远程仓库。

因此，即使安装时知道 GitHub URL 和子目录，普通安装副本也可能不再保留这些信息。仅凭现存文件不能可靠恢复原始安装 ref 或 commit。

## 字段能力与当前实现

| 现有证据 | 可显示的信息 | 不能据此声称的信息 |
| --- | --- | --- |
| SkillDock 已记录的安装或用户确认关联 | 来源、子目录、ref；Git 安装记录存在时可显示 resolved commit | 用户确认的来源不自动等于最初安装来源 |
| 技能仍在真实 Git 工作区中 | origin、仓库相对子目录、当前分支、当前 HEAD | 当前 HEAD 不等于历史安装 commit；存在工作区修改时也不代表所有文件与 HEAD 相同 |
| 官方已安装插件记录及可验证 marketplace | 所属插件、市场、包版本、已知本地来源或远程管理 owner | 不存在的 GitHub 仓库地址和独立技能安装 commit |
| 系统技能目录及宿主标记 | Codex 所有者、宿主版本与系统目录身份 | 单个技能的独立更新来源 |
| 无元数据的普通副本 | 安装路径、技能声明、当前内容 | 原始 GitHub 仓库、源子目录、ref、历史安装 commit |

`assets/app/server/sources.mjs` 已读取真实 Git 工作区的 origin、HEAD 和相对子目录，并为已有 SkillDock 来源记录填充 `sourceInfo`。本机 27 个普通副本的空字段没有发现可直接补读的安装元数据，当前后端没有遗漏一份已存在且可可靠解析的来源登记表。

本轮处理方向：界面明确区分「已读取」与「未记录」，已有来源自动预填；未记录的副本由用户提供来源，经过预览确认后建立可持续更新的记录。当前范围不新增内容匹配候选仓库，也不把候选来源写成历史安装事实。
