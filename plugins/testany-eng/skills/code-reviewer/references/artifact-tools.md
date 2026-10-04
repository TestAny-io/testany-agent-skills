# 机器证据：落盘、校验、短输出

只在当前评审需要对应证据时使用下列工具；不是每轮必跑的新增门禁。所有命令从本 Skill 实际绝对目录解析。完整附件由工具读取/生成，模型读结果、必要差异和相关原始行为证据，不 `cat` 全量 manifest，不另写同功能的哈希/遍历/tar-mode 比较程序。

## 输出约定

- 下列证据校验工具默认 stdout ≤4096 bytes：状态、数量、附件路径/摘要、最多 20 个完整差异路径；`*_count` 是总数，`*_omitted` 表示还有多少。完整差异在附件中，摘要省略不代表没有其他差异。只读导航工具的独立约定见第 5 节。
- `--output` 指定新的附件文件；父目录应已存在，统一选择 Candidate 外的评审目录。工具拒绝覆盖；带 snapshot/repo 输入的模式还会拒绝 Candidate/Git 控制目录，manifest 模式拒绝其 evidence root 内的输出。不传则保存到临时目录并返回路径；需长期引用时明确指定持久评审目录。
- snapshot 的 `snapshot_sha256` 是 manifest 的语义摘要；`artifact_sha256`、`receipt_sha256`、manifest/archive 的 pin 是文件字节摘要，不混用。pin 应来自此前捕获或已核验引用，不能重新从当前待验文件取值自证。
- 退出码：0 为 CAPTURED/MATCH/SAME_CONTENT，1 为 DRIFT/MISMATCH/CONTENT_CHANGED，2 为 UNVERIFIED（输入、格式或执行问题）。错误不构成内容一致证明；只补必要缺口，不自动全审。
- 所有校验都不授予 source approval，不证明测试实际执行、oracle 正确或证据覆盖完整。仍按 evidence-reuse 核对相关行为、批准状态和依赖。

## 1. Snapshot 捕获与最终比较

```sh
python3 <skill-dir>/scripts/snapshot_worktree.py --repo <repo> --base <base> \
  --output <review-dir>/snapshot-before.json
# 最后验证结束、verdict 前；沿用首次相同 exclude/baseline/candidate-ignored 参数
python3 <skill-dir>/scripts/snapshot_worktree.py --repo <repo> --base <base> \
  --compare <review-dir>/snapshot-before.json --compare-sha256 <首次snapshot_sha256> \
  --output <review-dir>/snapshot-final.json
```

完整 argv 自动保存在附件 `capture.argv`。原 snapshot schema/digest 算法不变，已有 snapshot 可作为比较输入。比较整个 manifest（包括 raw permissions、index、基线与排除设置），不是只比 Git tree。`changed_fields` 指出元数据变化；即使 `changed_paths=[]`，DRIFT 也不能忽略。工具内部已经双捕获，不因输出截断/只读转发重新捕获。

已有脚本确需读取旧版全量 stdout 时，显式 `--full-json` 并重定向到文件/机器消费者；不要把它作为对话调用方式。Python `create_snapshot()` 接口保持不变。

## 2. 同内容 commit 绑定

使用 evidence-reuse 中的 `verify_candidate_binding.py`。它同样默认保存完整 receipt、只返回有上限的摘要。无需模型重建 raw bytes、mode 或 gitlink 清单。结果为 CONTENT_CHANGED 时，按附件中的相关差异补审。

## 3. 现有证据清单

显式选择已有格式；不先手写 adapter，也不猜测 JSON 是数组还是对象：

| `--format` | 读取字段与形状 | 验证内容 |
|---|---|---|
| `entries`（默认） | `{"entries":[{"path":"relative/file","bytes":123,"sha256":"..."}]}` | 已声明 size + SHA-256 |
| `evidence-map` | `{"evidence":{"relative/file":{"size":123,"sha256":"..."}}}` | 已声明 size + SHA-256 |
| `source-files` | `{"source_files":{"relative/file":"<SHA-256>"}}` | 已列文件 SHA-256 |

仅逐条验证所选字段，不递归打开文件里提到的其他引用；同一文档的 `external_evidence` 等未选字段不在结果范围内。相对路径以显式 `--root` 为准，不能越界或通过 symlink 逃逸。确实属于本次证据的绝对路径用精确文件白名单声明，不放行整个外部目录。

```sh
python3 <skill-dir>/scripts/verify_review_evidence.py manifest \
  --manifest <evidence-dir>/EVIDENCE-MANIFEST.json --manifest-sha256 <已固定文件SHA> \
  --root <evidence-dir> --allow-external-file <已绑定的外部证据文件> \
  --output <review-dir>/evidence-check.json
```

没有绝对引用时省略 `--allow-external-file`，多份时重复该参数。现有 `SOURCE-BINDING.json` 的 evidence map 加 `--format evidence-map`，已测源码 hash map 加 `--format source-files`，其 `--root` 分别指向证据目录和要核对的源码目录。未知形状先取字段名、类型和单个样例，再决定一次窄 adapter/工具支持，不要求迁移历史证据或重新跑测试。

摘要/receipt 标明 `manifest_field`、`verified_fields` 和 `verification_scope=listed_files_only`。Hash-only 清单可以证明已列文件的内容匹配，但没有声明的 size 不补造成历史证据；当前文件大小不能冒充测试时的元数据。三种 manifest 都不证明整个 Candidate 的 path set、mode/gitlink、执行时点或 oracle；需要完整源码绑定时用下一节的 snapshot/source 或同内容 binding 工具，并核对原测试执行引用。`MATCH` 不升级为整体 source approval。

## 4. 归档与已测源码

已提供 tar 且需要核对其与 reviewed snapshot 对应时：

```sh
python3 <skill-dir>/scripts/verify_review_evidence.py archive \
  --snapshot <reviewed.json> --snapshot-sha256 <已固定snapshot摘要> \
  --archive <source.tar> --archive-sha256 <已固定tar文件SHA> \
  --output <review-dir>/archive-check.json
```

只读归档，绝不解压。比对完整 path set、raw bytes、symlink target、Git file type/executable bit。tar 的 `0664/0775` 与 checkout 的 `0644/0755` 不因 group-write 位不同误报；**这不证明 checkout 的原始权限相同**。归档有根目录前缀时显式加 `--prefix <目录>`，不自动猜测。路径越界、重复项、hardlink/特殊类型、无法由 tar 证明的 gitlink 或排除 WIP，返回 UNVERIFIED，不默默跳过。

两份已存在且分别固定的 reviewed/tested snapshot 需要核对源码时：

```sh
python3 <skill-dir>/scripts/verify_review_evidence.py source \
  --snapshot <reviewed.json> --snapshot-sha256 <已固定reviewed摘要> \
  --tested-snapshot <tested.json> --tested-snapshot-sha256 <已固定tested摘要> \
  --output <review-dir>/tested-source-check.json
```

该模式比较整个候选文件集合、bytes、原始 permission bits 和 gitlink；允许 checkout 路径/index 不同。不支持排除 WIP。它不证明这份 tested snapshot 就是当时运行测试的输入，仍须核对执行绑定；不为获得这一附件要求复跑长测，也不把当前 checkout 冒充历史已测输入。

## 5. 按字段读取大型 JSON

恢复状态、找 manifest 字段或定位失败项时，用只读导航工具；不要求小文件也走此路径：

```sh
python3 <skill-dir>/scripts/read_machine_context.py <state.json> \
  --pointer /current/binding --pointer /current/open --pointer /current/next_action
```

字段用真实 JSON Pointer；数组索引如 `/failures/0`，键中的 `/`、`~` 分别写成 `~1`、`~0`。无 selector 时只返回根类型、数量和少量子路径。输出默认最多 6144 UTF-8 bytes，单值超过 1200 bytes 时给类型、数量和子路径，不切断原值。沿返回路径细读当前所需字段；确需完整较大字段时显式调整 `--value-bytes`/`--max-bytes`（总量上限 65536），避免重复打印同一大子树。

`SELECTED`/`complete=true` 只说明显式选择的值已完整显示；`PARTIAL`、`value_omitted`、`children_omitted` 均保留未读范围。缺字段返回码 1，文件/JSON/预算等问题返回码 2；0 也可能是有意省略的 `PARTIAL`。这些都不是评审或验证结论，不能用未显示的内容宣告 PASS。重复 JSON key、非有限数值不静默接受。

`observed_sha256` 仅标识本次实际读到的文件。只有显式传入此前固定的 `--sha256` 才核对该 pin；新算的摘要不证明历史版本、测试执行、源码绑定或批准。脚本不写状态、不追读引用；需要证据核验时继续用前述专用工具。

该兼容入口使用同一个 `testany-eng` 包中的 `scripts/context_json.py`，不查其他版本缓存或源码目录；必须安装完整插件。超长单字段可用 `--chunk-offset 0` 取得无损分段，按 `next_args` 继续（后续 offset 必须固定源 SHA）；`field_end` 不代表前文已读。长期工作位置及整包资源校验见 [持久入口](../../../references/workflow-runtime.md)。
