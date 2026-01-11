# HLD Writer Evals

本目录包含 hld-writer skill 的评估用例，用于验证 skill 行为是否符合预期。

## Eval vs Reviewer 的区别

| 维度 | Eval（本目录） | hld-reviewer |
|------|---------------|--------------|
| 评估对象 | hld-writer **skill 本身** | HLD **文档质量** |
| 回答的问题 | "skill 工作正常吗？" | "文档质量达标吗？" |
| 执行时机 | skill 开发/迭代时 | HLD 完成后 |

## 目录结构

```
evals/
├── README.md                           # 本文件
├── eval-1-basic-hld.md                 # 基础场景：单 PRD → 单 HLD
├── eval-2-1-to-n-split.md              # 1:N 场景：大 PRD → 多 HLD
├── eval-3-integration.md               # 集成场景：第三方服务接入
└── test-inputs/
    ├── prd-user-auth.md                # 测试用 PRD：用户认证
    ├── prd-ecommerce-large.md          # 测试用 PRD：电商系统（大，适合 1:N）
    └── prd-payment-integration.md      # 测试用 PRD：支付集成
```

## 如何运行 Eval

### 手动执行

1. 打开 Claude Code
2. 加载测试用 PRD：`@test-inputs/prd-user-auth.md`
3. 触发 skill：`帮我写这个 PRD 的 HLD`
4. 对照 eval 文件中的「预期行为」和「评分标准」打分

### 评分方法

每个 eval 包含评分维度和权重，总分 100 分：
- **90-100**：优秀，skill 工作完全符合预期
- **70-89**：良好，有小问题但不影响核心功能
- **50-69**：及格，核心功能正常但有明显缺陷
- **<50**：不及格，需要修复 skill

## 评估驱动开发流程

1. **识别问题**：在无 skill 情况下运行，记录失败点
2. **建立基准**：用现有 skill 跑 eval，记录得分
3. **修改 skill**：针对问题修改 SKILL.md
4. **验证改进**：重新跑 eval，对比得分
5. **迭代优化**：直到达到目标分数

## 不同模型的测试

建议在以下模型上测试：
- **Haiku**：快速、低成本，适合简单场景
- **Sonnet**：平衡性能和成本，推荐默认
- **Opus**：最强能力，适合复杂场景

记录不同模型的得分差异，确保 skill 在各模型上表现稳定。
