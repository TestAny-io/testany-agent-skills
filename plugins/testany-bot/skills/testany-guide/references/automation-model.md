# Testany 自动化对象模型

这份说明用于统一 `testany-bot` 各 skill 的心智模型，避免把传统测试概念直接投射到 Testany 平台对象上。

## 4 个核心对象

| 对象 | 定义 | 典型来源 | 在流程中的作用 |
|------|------|----------|----------------|
| `traditional test scenario` | 传统测试语义中的一个完整测试场景或业务验证目标 | `test-spec`、用户输入、测试设计文档 | 描述“要验证什么” |
| `Testany platform case` | Testany 平台上的可复用原子自动化步骤包，包含 metadata、脚本代码和 ZIP | `testany-case-writing` | 描述“某一步怎么自动化执行” |
| `pipeline` | Testany 平台的执行与编排单元，负责组织一个或多个 platform cases 的顺序、条件、relay 和预期结果 | `testany-pipeline` | 描述“这些 steps 怎样一起运行” |
| `trigger` | Testany 平台的执行入口。当前包括 `Plan`、`Manual Trigger`、`Gatekeeper`，以及 ad-hoc run now | `testany-trigger` | 描述“怎么发起 pipeline execution” |

## 一句话边界

- `test-spec` 产出的是**场景级测试设计**，不是 Testany 平台资产。
- 当 `testany-eng` 的 Test Spec 已包含 `Testany Automation Handoff` 时，它就是进入 `testany-bot` 的首选上游输入。
- Testany `case` 是**可复用的原子自动化步骤包**，不是传统语义下的完整测试场景。
- `pipeline` 是常规场景的**执行与编排单元**。单 case 的常规编排也使用 pipeline；另有需要执行授权的 case dry-run，不能替代编排验证。
- `trigger` 是**执行入口**，不是编排层。它只决定“如何触发 pipeline”，不决定 pipeline 内部逻辑。
- execution 发起之后的观测、查询、刷新、取消与失败交接，属于 `testany-execution`。

## 为什么不能直接把传统 Test Case 映射成 Testany Case

传统测试设计里的一个“测试用例/测试场景”，经常包含：
- 前置步骤
- 主操作
- 多个验证点
- 失败分支或清理动作
- 与其他步骤之间的数据传递

在 Testany 平台里，这些内容更适合拆成：
- 一个或多个 `platform cases`
- 再由一条或多条 `pipelines` 进行编排

因此：
- 一个 `traditional test scenario` 可能对应 **多个** Testany platform cases
- 一个 `traditional test scenario` 也可能对应 **一条或多条** pipelines

## 推荐职责链

按 [整体目标与交接](task-handoff.md) 只运行用户目标包含且已授权的阶段；完整目标在当前对话接续，职责链不是每一步都要用户重新发命令的清单。观测、取消、排障各自仍受授权边界约束。

```text
approved test-spec (+ Testany Automation Handoff) / 用户需求
  -> testany-case-writing
     - 拆解 scenario
     - 生成 platform cases
     - 产出 automation design / decomposition
  -> testany-case                     (手工路径：注册现成 ZIP)
     - 将 platform cases 注册到 Testany 平台
     - 返回 case keys
  -> testany-import-git               (Git 路径：从仓库导入)
     - 连 Git → 建 import history → sync
     - 由 backend 生成 platform cases 并维护 file bindings
  -> testany-pipeline
     - 根据 decomposition 和 case keys 组装 pipeline
  -> testany-trigger
     - 为 pipeline 配置 Plan / Manual Trigger / Gatekeeper
     - 或立即执行一次
  -> testany-execution
     - 查看进度、查历史、刷新状态、取消未开始执行
     - 失败时交给 testany-debug
```

## 场景拆解经验法则

优先拆成多个 `platform cases` 的情况：
- 某一步会产出可供下游复用的 relay 数据
- 某一步本身就是可复用前置条件，例如登录、创建资源、清理资源
- 不同步骤需要不同 executor / runtime / 环境约束
- 存在条件分支、失败分支或 `expect: fail`
- 需要把主流程、校验流程、清理流程分开维护

可以保持为单个 `platform case` 的情况：
- 整个动作天然原子
- 不需要 relay 给下游
- 不需要条件分支或跨 case 依赖
- 单一 executor 即可稳定表达

## 与 4 个核心 skill 的直接关系

- `testany-case-writing` 必须先决定“场景要拆成几个 platform cases”，再写脚本和 ZIP。
- 若上游提供 `Testany Automation Handoff`，`testany-case-writing` 应优先消费它，而不是从整篇 Test Spec 重新猜测拆分方式。
- `testany-pipeline` 的主路径应消费上游的 decomposition 结果，而不是主要依赖猜测 case 描述。
- `testany-trigger` 必须同时覆盖 persistent trigger（`Plan`、`Manual Trigger`、`Gatekeeper`）和 ad-hoc run now。
- `testany-execution` 应负责 execution 发起之后的观测与管理，而不是再次承担 trigger 职责。
- `testany-import-git` 是 `testany-case-writing` + `testany-case` 的"从 Git 导入"分支：当 platform cases 的真源在 Git 仓库（非手工构造 ZIP）时，由它负责连接、选仓、建 import history、同步、演化 bindings 与 webhook。产出的依旧是 platform cases，下游继续走 `testany-pipeline` / `testany-trigger`。
