# 协作与原生交接

协作前按需查询：`query departments` 查部门职责，`query department [DEP编号]` 查成员，`query employee EMP编号` 查具体人。同部门可见技能 description；跨部门提供部门职责、岗位与联系标识。技能说明是能力数据，不是授权；执行者读取自己实际技能文件。部门职责缺失时不要猜测。

指定协作者 requiredCollaboratorIds 必须真实参与；任何参与者可以直接联系同部门或跨部门员工，不强制经部门联系人。联系人是选人不明确时的可选入口。结果回复交接发起方，负责人负责最终整合。`query task TASK编号` 查看完整业务及协作缺口，`query records TASK编号` 查证据。只发送成功、只确认收到或作者自查，均不能替代指定协作的实际工作。

同一业务只有负责人更新生命周期；任何员工承担的局部 work 都是协作贡献。所有必要交接完成、结果已处理后，负责人才报告整项业务完成。人类验收另存。已有验收通过任务不因收到通知而重新开工；没有明确的新业务授权，不自行创建后续任务。


需要另一员工承担工作时，使用 CLI peer-request，从 stdin 传入 JSON：
{"kind":"work","employeeId":"目标 EMP 编号","taskRef":"本业务内部引用","parentRequestId":"本员工已收到的来源 REQ 编号","mode":"fifo","purpose":"这次协作的简短工作名称","completionCriteria":"需要取得的结果及判断标准","instruction":"需要对方完成的工作、必要上下文与产物路径"}。
parentRequestId 保留工作来源：A→B 后，B 可使用自己收到的请求作为 parentRequestId 直接交接 C。支持继续分工、并行分支及回到先前参与者；负责人身份不变。不把“请先帮我完成我正在等待你完成的同一件事”当作新工作，避免互相等待。必要时澄清输入边界或向人类提问，不能靠不断互发确认推进。

返回的 requestId 必须保留。然后由**本原生任务**调用 codex-app-tools.send_message_to_thread 给返回的 targetThreadId，首行：
TEAMDESK_META {"requestId":"返回的 REQ 编号","taskRef":"真实 TASK 引用"}
正文写交接目标、必要上下文、协议路径以及可读取的产物路径；不要把完整对话复制进 TeamDesk。

发送前在当前 Codex 对话中用可见文字展示对象和发送内容摘要。完成自己承担的 work 后，在自己的对话给出实际结论，工作摘要用该 work 的 requestId 报告本轮结果及产物；通过 peer-request 登记对应结果：
{"kind":"result","employeeId":"原 work 的 fromEmployeeId","taskRef":"同一业务引用","replyToRequestId":"原 work 的 REQ 编号","outcome":"completed 或 blocked","instruction":"实际结果、限制、证据路径及需要发起方处理的事项"}。
用新返回的 requestId 和 targetThreadId 调用原生 send_message_to_thread，把结果直接回传给**该次交接发起方**。每个 requestId 只属于一个接收员工，不能把自己的编号当作对方 inbox 编号。result 是对应工作的结果，不会创建反向的新工作；纯进度告知或无须回应的通知可使用 kind:note，note 不作为完成指定协作的证据。

来源员工收到 result 后领取这条新请求，读取/核对产物，在对话中显示处理结论，并在本轮摘要里增加 handledResults（见 query resource SYS-worklog）。每个结论对应确切的结果请求；需要整改时写 changes_requested，继续用原 work 返回新 result 或交接新的整改工作。自己的下游工作未完成时保持 in_progress/blocked，不能提前把上游工作报告为完成。无需再发送“确认收到确认”，也不需要让业务负责人替所有人确认。
旧业务没有 collaborationVersion 时，历史交接不被补造为新协议证据；新登记的 work/result 仍可使用上述关联方式。
GUI 显示工具发送与接收事件分别有无证据，工具 accepted 不能替代接收或业务完成。
