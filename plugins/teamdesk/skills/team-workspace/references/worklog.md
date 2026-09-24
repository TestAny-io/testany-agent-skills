# 交付与自动工作记录

最终回复保留给人类看的正常工作结果，并在末尾增加以下标签。只有下列 metadata 被 hook 提取，正常回复不进入 TeamDesk。
没有业务（仅接入探测）可使用 {"entries":[]}。不要用空数组跳过本轮已处理业务。

<teamdesk_worklog>
{"entries":[{"requestId":"当前请求 REQ 编号","ownerEmployeeId":"原负责人 EMP 编号","taskId":"稳定业务编号","title":"名称","category":"自定类别","stage":"自定业务阶段","status":"completed","summary":"本轮完成事实，1000 字内","nextAction":"下一步，600 字内","artifactPaths":["产物绝对路径或团队 artifacts 目录下相对路径"]}]}
</teamdesk_worklog>

每轮最多 32 条；每条最多 8 个产物。产物必须位于当前员工工作目录或团队 artifacts 目录，常规文件不超过 4 MB；先写实际文件，再报告。摘要不包含密钥、对话逐字正文、思考过程或原始工具输出。
处理别人交回的 result 时，在该 entry 中添加（不可只写“收到”）：
"handledResults":[{"resultRequestId":"本人已领取的 result REQ 编号","disposition":"accepted 或 changes_requested 或 blocked","summary":"如何核对并采用结果，或具体整改/阻塞原因"}]。
此字段由真实发起方报告，不固定为业务负责人。必须先读对应 result；不能接受别人的结果、另一业务的结果或 blocked 结果为完成。系统核验回传关联、接收记录、工作报告和处理记录；这些是可追溯的员工报告，不等于人类验收或质量保证。
需要人类决定时，在该 entry 增加：
"decision":{"id":"可选稳定决定编号","title":"待决定事项","question":"具体问题","options":["方案 A","方案 B"]}。
补充同一未决事项沿用其 id，已解决事项新建后续 id。
摘要校验失败时修复数据，在下一轮补记；不伪造成功记录。无明确错误的情况下无需手动调用记账脚本。

## 验收通过通知

当本次 inbox 请求 kind 为 acceptance_notice，只确认收到该请求里的验收结论及说明，在自己的原生对话中显示确认。不要修改 PRD/产物、原任务状态、编号、协作结论，也不要启动后续任务。使用通知专用记录：

<teamdesk_worklog>
{"entries":[{"requestId":"本次验收通知 REQ 编号","summary":"已收到人类对指定证据版本的验收通过及说明。"}]}
</teamdesk_worklog>

系统把它保存为 acceptance_receipt，保留原验收版本，不能把通知回执当新的业务交付。验收未通过 acceptance_rework 则按其任务范围与整改说明继续工作，使用上面的标准业务 entry。回执的验收版本以该请求 acceptance 为准；若后续有新决定，以最新有效决定为准。
