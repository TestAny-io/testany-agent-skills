# Guide Examples

本文件提供 `guide` 的高质量输入/输出样例，帮助导航器在真实项目场景下保持一致的判断口径。

使用原则：

- 优先模仿这些示例的**判断顺序**，不是照抄文案
- 先列证据，再给状态，再给推荐
- 推荐最多 3 条，第一条必须直击当前主阻塞点

## 示例 1：新项目，几乎没有文档

### 用户输入

> 这个项目现在应该从哪个 testany-eng skill 开始？

### 观察到的证据

- 仓库中没有 `BRD`、`PRD`、`HLD`、`Test Strategy` 等候选文档
- 没有 `TRACEABILITY-METADATA`
- 没有任何审查报告或准出证书

### 状态判断

| Artifact | 状态 | 证据 | 置信度 |
|----------|------|------|--------|
| BRD | missing | 未发现候选文档 | High |
| USER_JOURNEY | missing | 未发现候选文档 | High |
| PRD | missing | 未发现候选文档 | High |

### 推荐输出

```markdown
## 项目状态摘要

| Artifact | 当前状态 | 证据文件 | 置信度 |
|----------|----------|----------|--------|
| BRD | missing | 无 | High |
| User Journey | missing | 无 | High |
| PRD | missing | 无 | High |

## 推荐下一步

1. `/brd-interviewer`：当前主流程最早的缺口是 BRD。仓库中还没有任何需求基线，应该先把模糊想法收敛成可追溯的业务需求。
2. `/guide`：如果你后续补完 BRD 或其他文档，可以重新运行 Guide，让它继续判断下一步。
```

## 示例 2：已有 BRD，但还没有 User Journey

### 用户输入

> 我接手了一个项目，已经有 BRD，下一步该做什么？

### 观察到的证据

- 找到 `docs/brd-checkout.md`
- 标题含 `BRD`
- 文档顶部状态为 `已批准`
- 未发现 Journey 文档
- 未发现 PRD

### 状态判断

| Artifact | 状态 | 证据 | 置信度 |
|----------|------|------|--------|
| BRD | approved | 文档标题 + 状态行 | Medium |
| USER_JOURNEY | missing | 未发现候选文档 | High |
| PRD | missing | 未发现候选文档 | High |

### 推荐输出

```markdown
## 推荐下一步

1. `/uc-interviewer`：BRD 已具备，但主流程下一个关键基线是 User Journey。先把用户流程、异常路径和边界梳理清楚，再进入 PRD 更稳妥。
2. `/prd-writer`：这是再下一步，但不建议跳过 Journey 直接写 PRD，除非你明确确认用户流程已经足够清晰。

## 待确认项

- BRD 的“已批准”来自文档状态行，而非正式准出证书；如果有更正式的批准基线，请优先提供。
```

## 示例 3：PRD 已批准，前端仓库，应该优先 Prototype

### 用户输入

> 我有 PRD 和 Journey，这个是前端仓库。现在该先写 API Contract 还是先做原型？

### 观察到的证据

- `prd.md` 含 `TRACEABILITY-METADATA`，`artifact.type: PRD`，`status: approved`
- `journey.md` 存在
- 根目录有 `package.json`、`src/`、`components/`
- 未发现 `_prototype-manifest.md`
- 未发现 API Contract

### 状态判断

| Artifact | 状态 | 证据 | 置信度 |
|----------|------|------|--------|
| PRD | approved | Metadata | High |
| USER_JOURNEY | draft_or_exists | 文件存在 | Medium |
| PROTOTYPE | missing | 未发现 manifest | High |
| API_CONTRACT | missing | 未发现候选文档 | High |

### 推荐输出

```markdown
## 推荐下一步

1. `/prototype-designer`：这是前端仓库，且你明确在问交互验证路径。PRD 已批准、Journey 已存在，现在先做原型能更早暴露状态覆盖、导航断点和 API 数据需求问题。
2. `/api-writer`：如果你不需要先验证交互，也可以直接进入 API Contract；但对当前仓库类型来说，这通常是第二选择。

## 待确认项

- User Journey 存在，但没有看到统一批准证据；如果这是正式基线，建议后续补齐状态或审查记录。
```

## 示例 4：API Contract 已存在，但还没准出

### 用户输入

> 我已经有 PRD 和 API 契约了，接下来是不是该做 HLD？

### 观察到的证据

- PRD metadata 显示 `status: approved`
- 找到 `openapi.yaml`
- 另有 `api-review-report.md`
- 未发现 API 准出证书
- 未发现 HLD

### 状态判断

| Artifact | 状态 | 证据 | 置信度 |
|----------|------|------|--------|
| PRD | approved | Metadata | High |
| API_CONTRACT | in_review | Contract 文件 + 审查报告，无准出证书 | High |
| HLD | missing | 未发现候选文档 | High |

### 推荐输出

```markdown
## 推荐下一步

1. `/api-reviewer`：虽然 API Contract 已存在，但当前只有审查报告，没有批准证据。主流程应先完成 API Contract 准出，再进入 HLD。
2. `/hld-writer`：这是 API Contract 准出后的下一步，目前不建议提前开始。
```

## 示例 5：HLD 已批准，Test Strategy 缺失，Guardrails 不应抢占主路径

### 用户输入

> 现在 HLD 评审已经过了，后面怎么走？

### 观察到的证据

- PRD approved
- API Contract approved
- HLD approved
- 未发现 Test Strategy
- 未发现 Guardrails
- 用户没有提到架构/平台/合规变更

### 状态判断

| Artifact | 状态 | 证据 | 置信度 |
|----------|------|------|--------|
| PRD | approved | Metadata / 准出证书 | High |
| API_CONTRACT | approved | 准出证书 | High |
| HLD | approved | 准出证书 | High |
| TEST_STRATEGY | missing | 未发现候选文档 | High |
| GUARDRAILS | missing | 未发现候选文档 | Medium |

### 推荐输出

```markdown
## 推荐下一步

1. `/test-strategy-writer`：主流程最早的缺口是 Test Strategy。PRD、API Contract、HLD 都已批准，现在应该先定义测试方法、风险分层和入口/出口标准。
2. `/guardrails-writer`：仓库里暂未发现 Guardrails，但当前没有看到强触发信号，所以它更适合作为治理补充建议，而不是主流程第一步。
```

## 示例 6：多个候选 PRD，必须降级为 low confidence

### 用户输入

> 帮我看下这个项目下一步该做什么。

### 观察到的证据

- 找到 `docs/prd-v1.md`，metadata `status: approved`
- 找到 `workflow/prd.md`，内容更新更晚，但无批准证据
- 找到 `api-contract.yaml`
- 未发现明确说明哪个 PRD 是当前正式基线

### 状态判断

| Artifact | 状态 | 证据 | 置信度 |
|----------|------|------|--------|
| PRD | ambiguous | 两个候选冲突 | Low |
| API_CONTRACT | draft_or_exists | 文档存在 | Medium |

### 推荐输出

```markdown
## 项目状态摘要

目前发现两份 PRD 候选：
- `docs/prd-v1.md`：有 approved 证据
- `workflow/prd.md`：更新更晚，但没有批准证据

由于这会直接影响后续推荐，当前 PRD 基线判断为 `low confidence`。

## 待确认项

1. 哪个文件才是当前正式使用的 PRD 基线？

## 暂定建议

如果 `docs/prd-v1.md` 仍是当前批准版，则下一步更接近 `/api-reviewer` 或 `/hld-writer`，取决于 API Contract 是否已准出。
如果 `workflow/prd.md` 才是当前实际基线，则应该先补 PRD 审查，再进入下游。
```

## 示例 7：已有 Prototype 沙箱，应推荐 Prototype Reviewer，而不是重做原型

### 用户输入

> 这个前端项目已经做了一版 prototype，下一步是什么？

### 观察到的证据

- 存在 `_prototype-manifest.md`
- 存在 prototype 交付摘要
- PRD approved
- Journey 存在
- 未发现 Prototype 准出证书
- 未发现 API Contract

### 推荐输出

```markdown
## 推荐下一步

1. `/prototype-reviewer`：Prototype 工件已经存在，但还没有准出证据。先做独立门禁，确认交互对齐、工程隔离和下游输入质量。
2. `/api-writer`：这是 Prototype 准出后的下一步，目前不建议跳过审查直接进入 API Contract。
```

## 示例 8：Guardrails 强触发，应进入推荐列表但不替代主流程事实判断

### 用户输入

> 我们这次从 VM 部署切到 Kubernetes，还加了新的审计要求。现在该怎么走？

### 观察到的证据

- 用户明确提到部署模式变化
- 用户明确提到合规/审计要求变化
- 仓库已有 HLD / LLD / Runbook
- 已有 `guardrails.md`，但内容未覆盖部署和审计

### 推荐输出

```markdown
## 推荐下一步

1. `/guardrails-writer`：你这次命中了 Guardrails 的强触发条件，应该先更新项目级部署/审计规则，明确哪些下游文档需要重审。
2. `/guardrails-reviewer`：规则更新后应做准出，形成新的治理基线。
3. 之后再回到受影响的主流程节点，例如 `/runbook-writer` 或对应 reviewer。
```

## 示例 9：Test Spec 已准出，且已具备 Testany Automation Handoff

### 用户输入

> Test Spec 已经 approved 了，我下一步想把它落成 Testany 自动化脚本，应该用哪个命令？

### 观察到的证据

- `test-spec.md` metadata 显示 `artifact.type: TEST_SPEC`，`status: approved`
- 同一文档中存在 `## Testany Automation Handoff`
- handoff YAML 中 `status: ready`
- `recommended_entrypoint: /case-writing`
- `scenario_groups` 已包含 `source_case_ids`、`recommended_executor`、`platform_case_strategy`

### 推荐输出

```markdown
## 推荐下一步

1. `/case-writing`：你当前目标是进入 Testany 自动化落地，而且 approved Test Spec 已经包含 `Testany Automation Handoff.status = ready`。这是最直接、最小返工的下一步。
2. `/runbook-writer`：如果你同时也要补运维/发布准备资产，这仍然是并行合理路径；但它不替代自动化落地。

## 待确认项

- 暂未发现阻塞 `/case-writing` 的 handoff 缺口；如果后续要进入平台注册和编排，则再继续 `/case` → `/pipeline`。
```

## 示例 10：用户直接问阶段名，不要脑补命令别名

### 用户输入

> User Journey 的 skill 叫什么名字？

### 正确判断

- 用户问的是阶段 / artifact 对应的 canonical command
- 应回查 `workflow-map.yaml` 或 `artifact_routes`
- `USER_JOURNEY` 的创建命令是 `/uc-interviewer`
- 不能因为 “User Journey” 更像自然语言，就改写成 `/user-journey`

### 推荐输出

```markdown
User Journey 对应的 `testany-eng` skill 是 `/uc-interviewer`。

它负责在 BRD 和 PRD 之间梳理、确认用户旅程与 use case；如果你已经有 BRD，下一步通常就是它。
```

## 示例 11：Implementation Candidate 已冻结，应推荐 Code Reviewer

### 用户输入

> 开发已经完成本地实现，给了 base、Candidate 和 review request。下一步做什么？

### 观察到的证据

- review request 明确列出 repository path、base SHA、Candidate SHA 和 tree
- Candidate 工作树 clean
- LLD 已批准
- 没有 exact Candidate 的 Code Review certificate
- CI 尚未运行

### 状态判断

| Artifact | 状态 | 证据 | 置信度 |
|----------|------|------|--------|
| LLD | approved | 准出证书 | High |
| IMPLEMENTATION_CANDIDATE | in_review | exact SHA + review request | High |

### 推荐输出

```markdown
## 推荐下一步

1. `/code-reviewer`：exact Implementation Candidate 已存在，但没有源码准出证据。先冻结 Scope Lock 并做 Lead Dev Code Review。
2. 测试规格与 Runbook 可以按项目计划并行推进；它们不是本次源码评审的前置条件。

## 边界说明

- CI 尚未运行不等于源码缺陷；Code Review 通过后仍需 exact-SHA CI。
- Code Review approval 不授予 merge 或 deployment 权限。
```

## 示例 12：只有 feature branch，不能臆测 Candidate

### 用户输入

> 仓库里有个 feature 分支，下一步是不是 code review？

### 观察到的证据

- feature branch 存在
- 没有 base/Candidate 绑定、review request 或 worktree 归属说明

### 推荐输出

```markdown
当前只能确认 feature branch 存在，不能确认哪个 commit/worktree 是待审 Candidate，因此 `IMPLEMENTATION_CANDIDATE` 状态为 `unknown`。

请先提供 base 与 Candidate SHA，或明确要求评审当前 worktree并说明未提交文件归属。形成精确边界后，再运行 `/code-reviewer`。
```
