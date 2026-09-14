---
description: PRD review, 审查产品需求文档
argument-hint: <PRD 文件路径>
---

# PRD Reviewer

执行前读取 [工作流执行约定](../references/workflow-execution.md)：先取证再提问、按实际工具能力回退，并从本次安装位置定位资源。

启动 PRD 审查流程。作为"需求评审会议的 AI 化"，对 PRD 进行全方位审查，确保质量达到准出标准。
评审先读取 [证据、准出与复审规则](../references/review-assurance.md)。P2 不按数量阻断；缺证据不等于产品缺陷；提前门禁失败不取消独立安全检查；完成本轮评审不等于批准工件。



先区分 `formal_design` 与 `bounded_change`/`amendment`；有限增量使用既有有效基线及 Owner 批准，只处理受影响范围，不回补全生命周期文档。详见 `../references/document-amendments.md`；完整流程只适用于正式新功能/全量准出。
## 使用方式

提供需要审查的 PRD 文件路径：

$ARGUMENTS

启动后，reviewer 必须先执行：

```bash
python3 "$TESTANY_ENG_ROOT/scripts/trace_lint.py" --format json <PRD文件路径>
```

## 审查维度

1. **结构完整性** - 必填章节是否完整
2. **业务逻辑（PM 视角）** - 业务背景、用户故事、业务规则
3. **需求清晰度（开发视角）** - 是否能据此编写 HLD
4. **可测试性（QA 视角）** - 验收标准是否可测试
5. **业务方视角** - 业务现状、变更影响
6. **内容边界** - 是否越界到 HLD 领域
7. **证据可追溯性** - 相关能力识别是否有来源
8. **一致性** - 术语、需求描述是否一致
9. **Traceability Metadata** - `prd-profile-v1` 元数据是否完整、可解析、可追溯

## 问题分级

- **P0 阻塞**：必须修复才能准出
- **P1 严重**：准出前必须修复，任一未关闭 P1 不放行
- **P2 建议**：可选优化，不阻塞放行

请提供 PRD 文件路径开始审查；reviewer 会同时检查正文内容和 `TRACEABILITY-METADATA` block。
