# Code Review Record / Charter 模板

每个 attempt 只维护一份 Review Record：可完整内嵌，或以可读的 `path@version + sha256` 引用；接收方必须实际读取、校验文件摘要并重算 Scope Lock digest，不能只接受 ID/digest。Charter 在阅读实现细节前冻结，coverage/evidence 随评审补齐，terminal 绑定最终版本。子任务引用冻结的输入/assignment 版本；最终 Record 引用已校验输入与结果，主 Reviewer 核对固定绑定后合并增量，禁止覆盖已引用版本或要求子任务计算最终 Record 的自指 digest。

未知且影响结论的输入返回 `EVIDENCE_BLOCKED` 或 `SCOPE_DECISION_REQUIRED`。pre-charter 仅把确实未知的字段标为 `NOT_BOUND`，mode 用 `NOT_DETERMINED`、Scope Lock 用 `NOT_FROZEN`；保留其他已知精确字段。空集合保留 `[]`，不生成成片 `N/A` 或无适用事实的附录。

## 1. Identity 与 canonical Charter

| 字段 | 内容 |
|------|------|
| Review ID / main Reviewer | `CRV-<UUIDv4> / 稳定 identity/task`（本 attempt 唯一，不得重绑） |
| Mode / round | `initial_full_review / remediation_delta_review / exceptional_full_review_after_reviewer_miss`；Round N |
| Scope Lock ID / digest | `{稳定 ID / sha256}` |
| 用户目标 / 输出语言 | `{本轮明确要求 / zh-CN 或 en}` |
| Prior exception history | `[] / 单一可读且已校验的历史引用 + 本轮新增项` |
| Global / immediate-prior lock recovery count | `{展开 history 的总长度 / 按 missed lock 匹配 immediate-prior terminal 的长度，0 或 1}` |

Charter 保留以下完整 closed payload，不再另抄基线、scope、budget 和验证边界表。必须使用本 Skill 的 `scripts/scope_lock_digest.py <payload.json>` 生成 canonical payload/digest；v1 schema 不变：

```json
{
  "schema": "testany.code-reviewer.scope-lock.v1",
  "repositories": [{"repository_identity": "host/org/repo", "review_root_base": "0000000000000000000000000000000000000000"}],
  "approved_baselines": [{"baseline_type": "User decision", "exact_reference": "path@version", "approval_evidence": "decision-id", "governs": "Product scope"}],
  "in_scope": ["exact approved behavior"],
  "out_of_scope": ["deployment"],
  "must_not_change_or_regress": ["existing wire"],
  "architecture_budget": [{"surface": "endpoint", "allowed_action": "MODIFY", "approved_source": "decision-id", "exact_boundary": "internal endpoint only"}],
  "verification_boundary": [
    {"layer": "source", "required_in_code_review": true, "required_gates": ["unit"], "evidence_boundary": "local Candidate", "effect_on_code_verdict": "MAY_BLOCK_WHEN_TIED_TO_FROZEN_INVARIANT"},
    {"layer": "ci", "required_in_code_review": false, "required_gates": [], "evidence_boundary": "exact SHA after push", "effect_on_code_verdict": "REPORT_SEPARATELY;MAY_PROVE_SOURCE_FINDING"},
    {"layer": "environment", "required_in_code_review": false, "required_gates": [], "evidence_boundary": "live activation", "effect_on_code_verdict": "REPORT_SEPARATELY;MAY_PROVE_SOURCE_FINDING"}
  ]
}
```

脚本执行 NFC/首尾空白归一化、无序集合排序并拒绝重复、缺失/额外 key、语义冲突、非 full lowercase Git SHA、错误类型和未知枚举。每仓一个 root、三层各一行、每 budget surface boundary 一个事实；source 固定 required=true，CI/environment 固定 false 及上方 effect，attempt 文本不得覆盖。仓库 identity 使用批准 slug/UUID 或移除 userinfo/query/fragment 的 canonical remote host/path；无 remote 时需要用户批准稳定 ID。

作者 note、自测 PASS 和 Candidate 自述不是批准基线。budget 未授权的 surface 不得 ADD/MODIFY/DELETE，无字节或语义变化的保留不需额外授权。绝对 checkout path、Candidate/tree、mode、coverage、verdict、摘要自身与 excluded WIP 不进入 payload；普通整改或移动 checkout 不改变语义 Scope Lock。

## 2. Exact repository binding

每仓一行；`review_root_base` 直接引用 Charter 对应 repository 行，不另造第二份 authority。

| Repository / root reference | Absolute checkout | Reviewed from | Candidate | Tree / snapshot | Exact reviewed range / ownership |
|-----------------------------|-------------------|---------------|-----------|-----------------|----------------------------------|
| `{Charter repository 行}` | `{绝对路径}` | `{精确 base / previous Candidate}` | `{full SHA / WORKTREE}` | `{full tree SHA / WORKTREE@sha256}` | `{精确两端 / clean 或已分类 staged、unstaged、untracked、ignored}` |

- initial：批准 base → Candidate；exceptional：逐仓 `review_root_base` → Candidate，manifest/range 必须同起点。
- remediation：previous Candidate → current Candidate；previous 可以是 immutable commit/tree，或依据 [evidence-reuse.md](evidence-reuse.md) 已验证可重建的 snapshot，必须绑定重建和比较证据。不能把 snapshot digest 当 Git SHA；snapshot 工具的 `--base` 始终是 immutable SHA。
- mode、transition 和 full-review 触发遵循 [review-policy.yaml](review-policy.yaml)。snapshot 改变或 mutable→immutable 都是新 Review ID、新 binding、新 verdict；旧 approval 不自动转换。

### Mutable Binding Appendix（仅实际 mutable 仓库）

| Repository reference | Immutable base / HEAD | Snapshot schema | Resolved snapshot script + file sha256 | Exact argv | Post-validation / pre-verdict recheck |
|----------------------|-----------------------|-----------------|----------------------------------------|------------|---------------------------------------|
| `{第 2 节行}` | `{full SHA / full SHA}` | `testany.code-reviewer.worktree-snapshot.v1` | `{本 Skill scripts/snapshot_worktree.py 的解析后绝对路径 / sha256}` | `{含 --repo、--base 及每个 --exclude、--candidate-ignored、--mutable-baseline}` | `MATCH / MATCH` |

- `candidate_untracked: []`；实际项列精确 path 与 Candidate 归属证据。
- `candidate_ignored: []`；实际项列精确 path、归属证据及 `--candidate-ignored`。
- `excluded_wip: []`；实际项列 path、owner、证据支持的原因及 `--exclude`。
- `mutable_baselines: []`；实际项列绝对 path、sha256 及 `--mutable-baseline`。

这些集合由 snapshot 绑定，不得假定全部 dirty 文件属于 Candidate。excluded WIP 必须从 manifest 消失，不能排除 immutable diff、`base..HEAD` 已提交 Candidate path 及其 ancestor/descendant；仍在 manifest 的 path 不能标为 WIP。所有 Candidate-owned ignored 必须用 `--candidate-ignored` 捕获，`--mutable-baseline` 不能替代；归属不明不得静默忽略。recheck 为 `DRIFT` 时本 attempt 失效，不能对旧 snapshot 出 verdict；未运行或无法稳定绑定时记录 EB。

### Invalidated attempt lineage（仅存在 pre-terminal drift 时）

| Invalidated Review ID | Old / new snapshot | Snapshot script digest / exact argv | Drift evidence | Specific evidence reuse decision |
|-----------------------|--------------------|------------------------------------|----------------|----------------------------------|
| `{旧 CRV ID；无 terminal}` | `{两端摘要}` | `{可读证据引用}` | `{精确 mismatch}` | `{第 4 节复用记录 / []}` |

reason 固定 `MUTABLE_SNAPSHOT_DRIFT_REBIND`。失效 attempt 不是 terminal，也不能被隐藏为真正首次 attempt；即使后来提交为 immutable，仍保留 lineage。复用的是逐条验证过的证据，不是失效 verdict。

## 3. Manifest 与 coverage

| Repository reference | Manifest source / exact range | Raw manifest SHA-256 |
|----------------------|-------------------------------|----------------------|
| `{第 2 节行}` | `{精确命令 / snapshot 字段；需重建时另引用比较证据}` | `{sha256}` |

immutable Git 两端先确认 `refs/replace` 与 legacy `info/grafts` 均不存在；commit/tree 解析和 diff 使用 `GIT_NO_REPLACE_OBJECTS=1`。对 `git diff --name-status --no-renames -z --no-ext-diff --no-textconv --ignore-submodules=none <reviewed-from> <candidate> --` 的 raw stdout 直接做 SHA-256。WORKTREE 使用 `manifest.candidate_changed_paths` 与 `manifest.candidate_changed_paths_sha256`；重建 snapshot 的 delta 比较另留精确证据，不能伪装成 Git SHA 范围。

| Repo-qualified manifest path / layers / status | Classification | Scope/budget reference / evidence | Assignment |
|-----------------------------------------------|----------------|-----------------------------------|------------|
| `{逐 path，含所有 manifest layers}` | `in_scope / scope_violation / verified_filtered_baseline` | `{精确行；filtered 时为 filter/EOL + prior-raw 双证据}` | `{main / 子任务 ID}` |

immutable path 只能是前两类。`verified_filtered_baseline` 仅用于 WORKTREE 中唯一变化为 `raw_worktree_vs_index/RAW`、且已证明既有 filter/EOL 表示及 prior raw bytes 的 path。`worktree_mode_vs_index`、`submodule_head_vs_index` 也必须分类，但不能使用 filtered；excluded WIP 不是分类值。

| Assignment / exact repository range | Paths / components / risk domains | Reviewer | Complete | Typed gaps |
|------------------------------------|----------------------------------|----------|----------|------------|
| `{唯一 assignment ID / 第 2 节范围引用}` | `{完整 diff 分配}` | `{identity/task}` | `YES / NO` | `[] / SD 或 EB 绑定的精确范围` |

- `initial_full_coverage_complete: YES / NO`；source：`{本轮或已校验 prior coverage}`。
- `coverage_reconciled: YES / NO`（全部仓库、manifest、assignment 和共享 Scope Lock）。
- `unclassified: []`；`scope_decision_blocked_ranges: []`；`evidence_or_assignment_gaps: []`。

每个 scope-blocked range 与 closed SD proposal 的 contaminated range 一一对应；每个缺证/未分配 range 绑定 EB。前者触发 `SCOPE_DECISION_REQUIRED`，后者触发 `EVIDENCE_BLOCKED`；两者并存时 EB 优先但不丢 SD。APPROVED 或后续 delta 复用都要求完整 coverage、对账通过、unclassified 与两类 gap 为空。

## 4. 行为证据与验证结果

先独立画出生产路径和假设，再核对作者 PASS。只为本次触达的关键面建立下表，不要求每文件全矩阵；明确实际生产入口与真实 helper、被 stub/mock/替换的部分及未覆盖边界，不能把测试自身的预期当独立 oracle。

| Frozen invariant | Production entry / parser | Actual helper + substitutions | Independent oracle / source | Legal / illegal / failure outcome | Direct callers / branches / targets / retry sequence；未覆盖边界 |
|------------------|---------------------------|-------------------------------|-----------------------------|-----------------------------------|----------------------------------------------------------------|
| `{批准基线行}` | `{path:symbol 与入口参数}` | `{真实调用与替换边界}` | `{独立批准语义/参考源}` | `{适用输入、预期与实测证据}` | `{已检查传播路径与明确缺口}` |

状态/resourceVersion、历史终态 Pod、exit code 等仅在触达且批准语义适用时检查，不从示例派生新 scope。

| Layer | Exact evidence / command / result | Status |
|-------|-----------------------------------|--------|
| Source/local | `{Charter required_gates、实际环境/输入、结果与行为表关联}` | `COMPLETE / INCOMPLETE` |
| Exact-SHA CI | `{逐仓 SHA 与结果；mutable 为 NOT_APPLICABLE_UNTIL_COMMIT}` | `{SUCCESS / FAILED / NOT_RUN}` |
| Environment/deployment | `{live 来源、时间和 readiness gap；不继承旧 live 状态}` | `{实测状态 / NOT_RUN}` |

`evidence_reuse: []`；如复用，逐条记录 prior evidence 引用、prior/current bytes、影响范围、依赖/命令/工具/配置/基线一致或已审 delta 的证明、保留/补跑决定。仅同 scope、旧完整 coverage 且两类 gap 空、prior bytes 可重建时才评估复用；missing/unknown 的证据不用，补最小检查，无法可靠划界则 full review。CI 仍只证明原 exact SHA，live 不继承，被 reviewer miss 否证的方法/证据不可复用。细则见 [evidence-reuse.md](evidence-reuse.md)。

## 5. Items、prior terminal 与统一 closure

`findings: []`；`scope_proposals: []`；`evidence_blockers: []`；`environment_only_notes: []`。条目只存一份完整正文或可读已校验引用；字段及 conditional provenance 见 [report-templates.md](report-templates.md)。报告与子任务引用同一 registry，不抄完整历史。

`prior_terminal_chain: []`（真正没有 prior terminal 时）。存在时只绑定一个 canonical terminal artifact：`{path@version + sha256 / 已验证并解码读取的 EMBEDDED_TERMINAL_ENVELOPE}`；从该引用读取 prior Review ID、Candidate、mode/main Reviewer、Scope Lock，不重复抄写。

| Transition cause | Exact authority / trigger / restoration evidence | First-available source or time |
|------------------|--------------------------------------------------|--------------------------------|
| `{review-policy.yaml 的 closed cause}` | `{每 cause 独立证据}` | `{精确来源/时间}` |

causes 去重且兼容约束累加；`SAME / NEW` 及 mode 按 policy 推导。无 scope-changing cause 为 SAME（ID/digest 均相等）；恰好一个批准的 scope-changing cause 才可 NEW（ID/digest 均不同），不能借 rebind/new scope 清除历史。

`blocking_items: []`；存在 prior 时，每个原 P0/P1、SD、EB 必须在同一表保留原 ID，P2 不进入 mandatory closure。

| Original item ID / type | Prior invariant / repo / range / status reference | Causal classification / old-new code / first visibility | Closure evidence / authority / regression | Current status / next disposition |
|-------------------------|--------------------------------------------------|-------------------------------------------------------|-------------------------------------------|-----------------------------------|
| `{CR-P0/P1 / SD / EB}` | `{prior terminal 精确行引用}` | `{代码原因适用时填写；其他为 []}` | `{最小修复或恢复/Owner 决定；相关回归}` | `OPEN / CLOSED；所需下一步` |

代码原因使用 `original_unfixed / introduced_by_fix / pre_existing_unreported_cause`，并绑定旧/新代码、首次可见性、prior acceptance/status 与 Reviewer 责任。对未关闭同 issue 补原因不自动触发正式 miss；已漏报 blocking item 或无依据的原 closure 按 reviewer-miss 处理，同 ID 不能免除责任，也不能静默改变原 acceptance。所有 prior blocking items CLOSED 才可批准；最小修复还须评估操作/门禁复杂度，不只计算新增表或服务。

### Reviewer-miss Appendix（仅实际发生时）

| Missed item / type | Prior-Candidate discoverability | Missed lock / prior terminal reference | Independent main / different evidence method |
|--------------------|--------------------------------|----------------------------------------|----------------------------------------------|
| `{CR/SD ID + P0/P1/scope_proposal}` | `{旧 path:symbol + failure path；含无依据 closure 时的证据}` | `{已校验 chain/history 行}` | `{当前 main identity；独立路径/假设与不同验证方法}` |

首次 miss：同 missed lock recovery count=0，独立 main 不同于前任，从逐仓 review root 做一次 exceptional full（ordinal=1）；不能只换 ID、换子任务或重跑作者 PASS。当前 recovery 仅存非自引用 `exceptional_review`；下一 attempt 在 terminal digest 已知后向可读 history 追加 missed/recovery 两套 Scope Lock、prior/independent Reviewer 与 artifact 的绑定。

同 missed lock 再次 miss：建立 `EB-*/review_process_integrity`，绑定 prior exception artifact、第二个 item/type/旧 Candidate 证据及全部 implicated Reviewer；coverage incomplete，`EVIDENCE_BLOCKED`。只有用户明确授权不在 implicated 集合内的新 independent main 从 review root 做新的 initial full 才可恢复；Candidate 修改/测试/普通补证不能关闭，也不允许 delta。其他 lock 的历史不触发本锁 quota，NEW/rebind 不清零旧 quota。

## 6. Charter decision

- Charter complete / candidate binding stable / full coverage plan complete：`YES / NO`。
- 未解决 baseline conflict / 未批准 proposal：`[] / 精确 item 引用`。
- Review may proceed：`YES / EVIDENCE_BLOCKED / SCOPE_DECISION_REQUIRED`。
- 独立可审范围继续：`YES / NO + 精确理由`（局部 proposal/gap 默认不阻止其余范围）。
