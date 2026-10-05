# Writer / Reviewer 的持久入口

## 随包与随项目的边界

发布单位是完整 `testany-eng` 插件：两份 skill、`scripts/context_json.py`、`scripts/workflow_context.py`、`scripts/browser_context.js` 和本说明一起安装。不能只复制一个 SKILL.md 或某个旧缓存目录。Python 工具只依赖 Python 3.10+ 标准库；浏览器函数另见 [适配说明](browser-context.md)。

`<plugin-dir>` 永远从当前已发现的 skill 实际位置解析（skill 目录上两层），不写死 home、版本、机器或源仓库。首次/更新/依赖错误时运行：

```sh
python3 <plugin-dir>/scripts/workflow_context.py check
```

若本次已要执行 `resume`、`bind` 或 `locate`，其内置包检查同时满足首检，无需额外 `check`。优先用请求/宿主已给出的实际 skill 位置；已有路径时不先扫描 home 或多个旧缓存目录。

`PACKAGE_OK` 校验分发包内列出的资源摘要；不是来源签名、宿主激活、工程批准或长期行为保证。记录一次当前 plugin version/package SHA 即可；同一上下文未变时不逐轮重算。若出错，恢复已批准的完整包；无法恢复时报告具体能力缺口，继续不依赖它的工作，用窄范围的现有读取能力取得必要事实，不从旧缓存借模块或打印全历史救场。

## 一次接入；位置变化才更新

长任务沿用现有工程 Record/COORDINATION-STATE；无既有记录才创建一份最小工程工作记录。不要复制 Delivery Secretary 的目标台账。

工作位置放在原记录任意明确的 JSON Pointer 下，包含 `task_id`、`question`、`binding`、`completed`、`open`、`next_action`、`evidence`。前一项是任务标识；六项内容可以是短文本、列表或已有固定引用。恢复信息不是批准/测试依据。新增未闭合项先落事实，整理摘要不得删除反证、未做项或剩余承诺。

`task_id` 是当前工程工作的稳定定位值，可沿用已有秘书任务 ID；没有秘书或尚未映射时直接使用已有工程 ID，不等待秘书分配。秘书台账只引用该工程位置，不接管 Writer/Reviewer 的判断或恢复字段。

恢复位置可以支持对历史状态的有来源转述，不需要为每次进度答复重审原始附件。未重新验证的限制写在结果说明，不能凭此新增未闭合任务。原始证据用于新的实质判断；有反证/失效时才更改受影响完成状态，不把“本轮没有读过”当成证据失效。

每个协作工作流使用一个小入口文件，例如项目已有工程目录下的 `workflow-entry.json`。它仅存 role → task ID / state path / pointer，不存进度历史；Writer、Reviewer 只更新各自位置。无需按 turn 记录事件。不相关工作流使用各自入口，避免相互抢占。

在授权接入工作流时，把以下**短入口**写入该项目实际会加载的 AGENTS.md 或等效入口，使用项目自己的相对路径：

```markdown
对于本项目的源码实现/整改，使用已安装的 $code-writer；精确 Candidate
源码评审使用 $code-reviewer。工程恢复入口：docs/work/workflow-entry.json。
恢复/切换先匹配当前请求的 task ID；新任务先建立自己的工程工作位置。
按 skill 的 workflow_context 入口读取，禁止默用旧任务；状态摘要不代替证据。
首次先读 skill 与小入口；加载规则的同批调用不得全文输出工程状态/历史。
已知入口时直接用恢复工具读取当前字段，不先 cat 状态文件再决定读取范围。
```

这段只对对应工程工作适用，不能劫持文档评审或一般咨询。保留项目既有入口规范。配置只在用户授权的项目接入中写入；发布插件本身不会修改用户仓库。宿主不加载此入口时须明确缺少自动发现条件，不能宣称已经启用恢复。

接入验证要从新上下文开始，并检查项目入口实际进入了宿主上下文。只把文件留在磁盘、只发一条通知或只读过 skill，都不构成接入成功；首次读规则之前的大批量状态加载也计作入口失败。

绑定前，由对应角色将实际工作位置写入原记录。工具只检查它并写小入口，不写进度：

```sh
python3 <plugin-dir>/scripts/workflow_context.py bind \
  --entry <workflow-entry.json> --role writer --task <task-id> \
  --state <existing-state.json> --pointer /work_context/writer
```

入口已存在时（包括 Reviewer 加入），须同时传 `--expected-entry-sha256 <最近读到的入口摘要>` 防止覆盖另一角色的更新。`locate --entry ...` 只读小入口，可找已登记角色/任务；不能按最新 mtime 猜工作流。工具锁冲突时等待当前写入结束再重试；异常遗留锁须确认没有写者后才能移除。

已知入口与当前任务不同时，直接用已有入口摘要和新记录位置 `bind`，不要故意先触发一次 `resume` 错误。新记录已含工作位置时，`bind` 自己检查其身份/字段，无需先读整条记录；不知道入口摘要才 `locate` 一次。两者均返回固定该入口修订的 `resume_args`；当前判断仍缺失时才用它恢复，不把绑定后再读变成门禁。`locate` 提供各角色参数，但角色/task 必须符合当前请求，不能据此替用户选任务。已知入口与任务就直接 `resume`，不先做目录发现；一次必要读回即可确认更新，不为记录同一事实另做多轮 hash/全文回读。

切到新阶段或支线时，先在其正确记录建立工作位置，再 `bind` 更新本角色入口。返回旧任务也显式绑定回去。既有暂停任务记录仍保留；入口不积累历史。旧 trial 字段无需全量迁移：只转接当前/暂停工作位置，原证据继续保留。

## 恢复时一条命令取得工作位置

```sh
python3 <plugin-dir>/scripts/workflow_context.py resume \
  --entry <workflow-entry.json> --role writer --task <当前请求对应的task-id>
# 精确读取多个字段；reviewer 也使用自己的 role 和 task。
python3 <plugin-dir>/scripts/workflow_context.py resume \
  --entry <workflow-entry.json> --role reviewer --task <task-id> \
  --field open --field next_action
```

`resume` 同时校验同包资源、入口任务和目标记录的 `task_id`，总输出最多 8192 UTF-8 bytes，包含包/来源/续读元数据。当前六项或显式字段按总预算完整返回，不再对每项设 1200-byte 门槛；额外字段只给名称，不读取整份工程历史。缺失项 exit 1；错任务、损坏/变化来源或资源错误 exit 2，不自动回到旧记录。换任务、更新包或出现新证据后重新理解相应内容；旧判断不能自动移植。

确实放不下的字段给类型、数量、子路径和 `next_args`。下一次 argv = 顶层 `continuation_prefix`（若有）+ 该字段的 `next_args`，交给 **同一个 workflow_context.py** 即可无损分段读取，无需手写 state path、pointer、offset 或预算。公共参数只返回一份，避免多个长字段的续读命令挤占内容预算；数组拼接不需要推导任何参数。这条路径继续核对 task，且同时 pin 入口和状态 SHA。按 argv 传递，或逐项正确 shell quoting，不能直接拼接 shell 文本。续读返回 `start/end/field_end/chunk_encoding/next_args`；下一段仍使用本次返回参数，不沿用前一输出的 prefix。来源变化先从当前任务重新 `resume`，不得拼接不同版本；缺失字段须查清实际缺口，不能用旧段或空值补齐。

已知其他 JSON 的结构时直接用 `context_json.py <file> --pointer /field`，多个字段重复 `--pointer`；它没有任务绑定，应只用于普通附件或明确局部读取。默认总输出 6144 bytes，选中值使用可用总预算；未指定 pointer 才只返回目录。超长字段同样使用本次 `continuation_prefix`（若有）+ 字段 `next_args`，交给 **context_json.py** 续读，后续 pin 源 SHA。根 pointer 是 `""`，`/` 表示空键；没有 `--depth` / `--max-depth` 参数。需要当前恢复状态时优先用上方 `resume`，不用多层 inventory 推测工程路径。

组合分段需核对连续范围。`field_end` 仅指到达字段末尾，`complete` 仅指本次选中内容，不证明全部证据读完、测试通过或批准存在。不能用 `cat` 整棵 JSON 再截断替代，也不能因摘要放不下而删除未做项或反证。

## 可验证的边界

工具能确定性检查资源、任务身份、字段遗漏和输出界限；不能强制模型每次调用，也不能拦截任意 shell/browser 工具。项目入口及 skill 提供恢复路径，不假定任何宿主支持自动 compaction/Stop hooks。不以新建重复协调线程补这个缺口。

发布验证分别检查：脱离源仓库的整包安装/移动/刷新、原入口继续读取、新阶段/返回任务、依赖缺失/内容变化、长字段完整续读、浏览器运行时重置。模型样例再检查新反证与新 Candidate，真实工程至少观察三次适用交接；不足如实保留待验证项。不得把单次加载成功或静态检查当成长期改善。
