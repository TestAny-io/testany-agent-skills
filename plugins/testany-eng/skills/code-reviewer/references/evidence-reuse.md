# 有条件的证据复用与 Candidate 重绑

仅在拟复用已验证的 source/local evidence、snapshot 漂移或 mutable→immutable 时读取。目的不是自动批准新 Candidate，而是避免内容和依赖未变时反复做同一工作。**旧 verdict 失效与旧实验结果是否仍有价值，是两个不同问题。**

## 1. 先确认旧证据实际证明了什么

读取并校验旧 Review Record / terminal artifact，确认 Scope Lock、完整覆盖、原阻断项、命令结果和证据来源。不可只读作者总结、测试数量或一个摘要。旧记录用原格式也可读取；不要为套新模板重写历史事实。

- 旧独立完整 coverage 必须可信且两类 gap 为空，才能以它支持 delta-only review。存在缺口时继续完整评审；已可靠检查的局部事实可供参考，但不等于完整 coverage。
- 被正式 reviewer miss 否证的 coverage、错误 oracle、替身掩盖的路径不能复用来宣称 closure。独立 full review 仍需重新建立行为判断。
- CI 结果只属于其 exact SHA，不能改标签贴到新 commit。live Secret/Kubernetes/DB 状态不能因源码未变就当成当前事实。

## 2. 能否重建前后内容

| 输入 | 可接受的比较依据 | 不够的依据 |
|------|------------------|------------|
| immutable→immutable | replacement-disabled exact Git trees、完整 diff、可读取依赖与基线 | commit message、文件名相同、作者说只改文档 |
| snapshot→snapshot/immutable | 与旧 snapshot 原始 bytes/mode/路径集合一致的保留副本，或可完全重建并核验的 Git blobs/patches 和 untracked/ignored 原件；与当前实际内容比较 | `WORKTREE@digest` 本身、已继续修改的同一个目录、仅 Git clean-filter 后的 diff |
| 多仓 | 每仓前后精确绑定和直接跨仓依赖比较 | 只检查改动仓，忽略同一门禁加载的其他仓/fixture |

snapshot 工具的 `--base` 始终是 immutable Git SHA。可重建 snapshot 作为逻辑 previous 输入，不表示它能被当成 Git revision。保留原始 snapshot 和比较证据；不能比较两个包含不同 HEAD/index 元数据的总摘要就断定源文件不同，也不能忽略原始 bytes/mode 差异只看 Git tree。

当前 immutable Candidate 的完整 tree 必须与声称已审内容对应，包括新增/删除、symlink target、执行位与 submodule SHA。若需依赖过滤/EOL 归一化，证明实际编译/执行输入一致；否则按变化处理。排除的他人 WIP 不能在 commit 后混进 Candidate。

无可重建旧内容，或不能界定影响范围：不用旧覆盖作 delta base，从 immutable `review_root_base` 做 initial full review。若当前内容本身也不可绑定，返回 `EVIDENCE_BLOCKED`。

## 3. 按证据项核对依赖，不按整仓一刀切

在现有 Review Record 加一行即可，无需新增平台/通用 manifest 服务：

| Evidence ID / 原始结果引用 | 前后 Candidate | 实际输入及直接/传递依赖 | 比较证据 | 决定 / 需补的最小检查 |
|---------------------------|---------------|--------------------------|----------|---------------------|
| `{gate + command + result digest}` | `{old → new exact bindings}` | `{source/helper/parser/test/fixture/oracle/build/config/tool inputs}` | `{实际 bytes/hash/版本与依赖关系核验}` | `REUSE / RERUN / BLOCKED` |

只有全部成立才能 `REUSE`：

1. 同一已核验 Scope Lock/批准 invariant，旧结果确实属于声称的输入。
2. 前后内容可读取/重建；完整 delta 已分类，并追踪到该实验实际加载的直接/传递依赖。不能仅因被测文件没变就复用。
3. 被测源码、生产 helper/provider/parser、测试、fixture、独立 expected source、build/lockfile、命令参数、配置、实际工具版本/必要运行镜像均未改变；不存在会影响该结果的未绑定环境输入。
4. 外部依赖若参与旧实验，能证明它是同一可重现隔离 fixture 及相同协议/版本/配置。仅版本号相同、主机相同或“之前绿过”不证明状态相同。
5. 旧测试确实走真实待审逻辑，oracle 未被本次输出生成，测试语义没有被新事实否证。内容相等不能拯救原本错误的测试方法。

源码检查的复用同样要证明其输入与 invariant 未变；需重审 delta 及受影响分支。工具版本/命令只是最低核对，不要求为了复用收集所有无关系统信息。不能可靠界定依赖就不复用该项，直接跑现有相关门禁通常更简单。

`RERUN`：任一相关输入变化或不确定，重跑该项及直接影响的必要回归。`BLOCKED`：必要证据无法安全取得，用最小 EB 标明缺什么；不升级成源码 P1。与某项证据无关的文档变更不自动抹掉其他已验证结果。

## 4. 新绑定与结论

- snapshot drift：使旧 Review ID/attempt 失效，记录 old/new snapshot、原命令与 drift 原因；创建新 ID。尚未有 terminal 的失效 attempt 记 `invalidated_attempt_lineage`，不要伪造 prior terminal。
- mutable→immutable：逐仓核验新 commit/tree，并记录 `MUTABLE_TO_IMMUTABLE_REBIND`。只有在无更高优先级的 miss/reset/new-scope cause、旧完整 coverage 可用、前后比较可靠时才可 delta/rebind review；否则 full review。
- 正常整改：确认所有原 blocking IDs、delta、行为链回归已闭合。受影响证据重跑，明确列出哪些是复用，不把旧结果写作“本轮已执行”。
- 再次检查 mutable snapshot 稳定。新的 source verdict 基于**旧可信覆盖 + 已审 delta/等价证明 + 必要新验证**共同给出，旧批准不自动继承，CI/环境授权不变。

## 5. 最小例子

- 已审 worktree 提交后，raw 文件/依赖完全一致，HEAD 变化但命令不读取 Git revision：新 ID、核验新 commit/tree、引用已验证本地测试可行；若构建把 Git SHA 嵌入 artifact，相关构建/绑定测试必须重跑。
- helper 文件未改，但调用方改为另一个 resource loader，或测试只 mock 掉 helper：原 PASS 不能证明新生产路径，重跑最小真实路径检查。
- 只改 review note，build/test 不读取它：可复用受验证的本地结果，不能声称新 SHA 已通过旧 CI。
- 只有旧 snapshot 摘要、原 untracked 文件已丢失：无法证明等价，不能直接升为 immutable approval。
