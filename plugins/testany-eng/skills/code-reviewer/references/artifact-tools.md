# 机器证据：落盘、校验、短输出

只在当前评审需要对应证据时使用下列工具；不是每轮必跑的新增门禁。所有命令从本 Skill 实际绝对目录解析。完整附件由工具读取/生成，模型读结果、必要差异和相关原始行为证据，不 `cat` 全量 manifest，不另写同功能的哈希/遍历/tar-mode 比较程序。

## 输出约定

- 默认 stdout ≤4096 bytes：状态、数量、附件路径/摘要、最多 20 个完整差异路径；`*_count` 是总数，`*_omitted` 表示还有多少。完整差异在附件中，摘要省略不代表没有其他差异。
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

支持现有格式 `{"entries":[{"path":"relative/file","bytes":123,"sha256":"..."}]}`；逐条验证，不递归打开文件里提到的其他引用。相对路径以显式 `--root` 为准，不能越界或通过 symlink 逃逸。确实属于本次证据的绝对路径用精确文件白名单声明，不放行整个外部目录。

```sh
python3 <skill-dir>/scripts/verify_review_evidence.py manifest \
  --manifest <evidence-dir>/EVIDENCE-MANIFEST.json --manifest-sha256 <已固定文件SHA> \
  --root <evidence-dir> --allow-external-file <已绑定的外部证据文件> \
  --output <review-dir>/evidence-check.json
```

没有绝对引用时省略 `--allow-external-file`，多份时重复该参数。不支持的清单格式只在确实需要时添加一次窄 adapter/工具支持，不要求迁移历史证据或重新跑测试。

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
