// One evidence projection for message rows, details, history and the graph.
const latest = xs => xs.slice().sort((a,b)=>(a.sequence||0)-(b.sequence||0)).at(-1);
const earliest = xs => xs.slice().sort((a,b)=>(a.at||'').localeCompare(b.at||''))[0];
export function deliveryProgress(request, snapshot) {
 const r=request, operations=snapshot.operations||[], events=snapshot.events||[], records=snapshot.records||[];
 const op=latest(operations.filter(o=>o.requestId===r.id));
 const sent=events.filter(e=>e.requestId===r.id&&e.kind==='native_tool'&&e.tool==='send_message_to_thread'&&
   e.employeeId===r.fromEmployeeId&&(!r.sourceBindingVersion||e.bindingVersion===r.sourceBindingVersion)&&
   (!r.targetThreadId||e.targetThreadId===r.targetThreadId)).sort((a,b)=>(a.at||'').localeCompare(b.at||'')).at(-1);
 const input=earliest(events.filter(e=>e.requestId===r.id&&e.kind==='native_message'&&e.employeeId===r.employeeId&&
   (!r.targetBindingVersion||e.bindingVersion===r.targetBindingVersion)));
 const report=records.filter(x=>x.requestId===r.id&&x.employeeId===r.employeeId).at(-1);
 const result=latest((snapshot.requests||[]).filter(x=>x.kind==='result'&&x.replyToRequestId===r.id&&
   x.taskRef===r.taskRef&&x.fromEmployeeId===r.employeeId&&x.employeeId===r.fromEmployeeId));
 const handling=result&&records.filter(x=>x.employeeId===r.fromEmployeeId&&x.taskRef===r.taskRef&&x.handledResults?.some(h=>h.resultRequestId===result.id)).at(-1);
 const disposition=handling?.handledResults?.find(h=>h.resultRequestId===result?.id)?.disposition;
 const stage=(id,label,at,source,evidenceId,observedOnly=false)=>({id,label,at:at||null,source,evidenceId:evidenceId||null,confirmed:!!at,observedOnly});
 const steps=[
   stage('saved','本地登记',r.createdAt,'TeamDesk',r.id),
   stage('sent',sent?'原生发送事件':'开始发送',op?.sentAt||sent?.at,op?'App Server 请求':'原生工具记录',op?.id||sent?.id),
   stage('accepted',r.queuedSubmissionId||op?.queuedSubmissionId?'原生队列已接受':'原生已接受',r.nativeAcceptedAt||(sent?.state==='accepted'?sent.at:null),'原生回执',op?.id||sent?.id,!!r.acceptanceRecovered),
   stage('input','原生任务出现输入',r.nativeReceivedAt||input?.at,'原生接收证据',input?.id||r.nativeTurnId,!!r.receiptRecovered||!!input?.recovered),
   stage('claimed','员工领取请求',r.claimedAt,'员工 inbox',r.id),
   stage('report','员工工作报告',report?.recordedAt,'Stop hook',report?.id),
 ];
 if(r.kind==='work')steps.push(stage('result','登记关联结果',result?.createdAt,'结果请求',result?.id),
   stage('returned','发起方收到结果',result?.receivedAt,'结果接收证据',result?.id,!!result?.receiptRecovered),
   stage('handled','发起方处理结果',handling?.recordedAt,'工作报告',handling?.id));
 const nativeReceived=steps.find(x=>x.id==='input')?.confirmed;
 const received=!!(r.receivedAt||nativeReceived||r.claimedAt);
 const decision=(snapshot.decisions||[]).find(d=>d.taskRef===r.taskRef&&d.fromEmployeeId===r.employeeId&&['pending','needs_info','answering'].includes(d.state));
 const turnId=r.nativeTurnId||input?.turnId;
 const runtime=events.filter(e=>e.kind==='runtime'&&e.employeeId===r.employeeId&&e.turnId===turnId).sort((a,b)=>(a.at||'').localeCompare(b.at||'')).at(-1);
 const h=snapshot.health||{}, recovery=h.recovery, historical=snapshot.historical;
 let state='unconfirmed',label='投递进展尚未确认',reason='尚无可核验的后续证据。';
 if(r.state==='cancelled'||op?.state==='cancelled'){state='cancelled';label='已取消待派发';reason='本地待派发操作已取消。';}
 else if(op?.state==='superseded'){state='stale_binding';label='员工绑定已变化';reason='此输入属于旧绑定，请核对关联原生任务。';}
 else if(op?.state==='uncertain'){state='uncertain';label='原生结果待核对';reason='请求可能已送达；只核对原生证据，不自动重发。';}
 else if(op?.state==='failed'||(!received&&sent?.state==='failed')){state='failed';label='发送失败';reason=op?.error||'原生工具返回失败，尚未确认接收。';}
 else if(disposition){state=disposition==='accepted'?'handled':disposition;label=({accepted:'结果已处理',changes_requested:'已要求整改',blocked:'结果处理受阻'})[disposition]||disposition;reason='按 '+result.id+' 关联发起方处理记录；业务验收另行判断。';}
 else if(result){state=result.receivedAt?'awaiting_handling':'awaiting_result_delivery';label=result.receivedAt?'结果已到 · 待处理':'已登记结果 · 待确认送达';reason='关联结果 '+result.id+'，不以其他分支的回复替代。';}
 else if(decision){state='waiting_human';label=decision.state==='answering'?'等待人类回答回执':'等待人类决定';reason='本员工在同一业务下有待处理事项。';}
 else if(report?.status==='blocked'||report?.status==='waiting_input'){state='blocked';label='员工报告受阻';reason=report.summary||'详见员工工作报告。';}
 else if(r.kind==='work'&&received){state='awaiting_result';label=report?'已有报告 · 待回传结果':'已接收 · 等待工作结果';reason='尚未发现该交接的关联结果请求。';}
 else if(report){state='reported';label='本轮已记账';reason='工作报告已保存；不代表业务完成或人类验收。';}
 else if(runtime?.state==='task_complete'||runtime?.state==='turn_aborted'){state='awaiting_record';label='轮次已结束 · 待记录';reason='原生轮次结束不能替代工作报告。';}
 else if(received){state='received';label=r.claimedAt?'员工已领取':nativeReceived?'原生已接收':'已记录接收 · 来源未细分';reason=r.claimedAt?'领取已确认，后续工作进度以记录为准。':nativeReceived?'输入已出现在原生任务；尚无员工领取时间。':'旧数据仅确认收到，无法区分原生输入与员工领取时间。';}
 else if(r.queuedSubmissionId||op?.queuedSubmissionId){state='native_queued';label='已进入原生队列';reason='已核验原生入队回执，等待原生任务出现输入；不能据此推算开始时间。';}
 else if(op?.state==='pending'){
   state='saved';label='已保存 · 等待投递';
   const preceding=operations.find(o=>o.employeeId===r.employeeId&&o.sequence<op.sequence&&['sending','uncertain'].includes(o.state));
   reason=preceding?'同一员工的前一操作尚待核对：'+preceding.id:
     !historical&&h.connection?.online===false?'当前共享连接离线，输入已保留。':
     !historical&&recovery?.state==='recovering'?'正在恢复状态，核验后再派发。':
     !historical&&recovery?.employees?.some(e=>e.employeeId===r.employeeId&&!e.ready)?'该员工的原生状态尚未恢复。':
     snapshot.settings?.enabled===false?'团队派发已暂停。':
     !historical&&h.hookTrust?.recorded===false?'共享 hook 尚未核验信任。':'等待现有接入器派发。';
 } else if(op?.state==='sending'){state='sending';label='正在发送';reason='等待原生返回接受回执。';}
 else if(op?.state==='paused'){state='paused';label='投递已暂停';reason='在团队设置核对后恢复。';}
 else if(sent?.state==='accepted'){state='native_accepted';label='原生工具已接受';reason='尚未观察到接收端输入；不能断言正在 FIFO 排队。';}
 else if(sent){reason='已观察到原生发送调用，但未确认其结果或接收时间。';}
 else if(r.source==='employee'){reason='仅登记了交接请求，尚未观察到原生发送或接收证据。';}
 const elapsed=(a,b)=>{const x=steps.find(s=>s.id===a),y=steps.find(s=>s.id===b);const n=Date.parse(y?.at)-Date.parse(x?.at);
   return x?.confirmed&&y?.confirmed&&!x.observedOnly&&!y.observedOnly&&Number.isFinite(n)&&n>=0?n:null;};
 return {requestId:r.id,state,label,reason,steps,legacyReceipt:!!r.receivedAt&&!r.nativeReceivedAt&&!input&&!r.claimedAt,
   durations:{submissionToInputMs:elapsed('saved','input'),acceptedToInputMs:elapsed('accepted','input'),inputToClaimMs:elapsed('input','claimed'),claimToReportMs:elapsed('claimed','report')},
   resultRequestId:result?.id||null,handlingRecordId:handling?.id||null,decisionId:decision?.id||null,
   sourceThreadId:r.sourceThreadId||sent?.threadId||null,targetThreadId:r.claimedThreadId||input?.threadId||op?.threadId||r.targetThreadId||null};
}
export function formatDuration(ms) {
 if(ms===null||!Number.isFinite(ms))return '未确认';
 if(ms<1000)return Math.round(ms)+' 毫秒';
 if(ms<60000)return (ms/1000).toFixed(1)+' 秒';
 return Math.floor(ms/60000)+' 分 '+Math.round(ms%60000/1000)+' 秒';
}
export function deliveryDetails(r,s,{esc,time,native}) {
 const p=deliveryProgress(r,s);
 return '<section class="delivery-detail"><p><strong>'+esc(p.label)+'</strong></p><p class="help">'+esc(p.reason)+'</p>'+
   (p.legacyReceipt?'<p class="help">旧记录确认收到，但没有区分原生输入与员工领取时间，保留未知。</p>':'')+
   '<ol class="receipt-steps">'+p.steps.map(step=>'<li class="'+(step.confirmed?'confirmed':'unknown')+'"><strong>'+esc(step.label)+'</strong><div>'+ (step.confirmed?time(step.at):'尚未观察到')+'</div><small>'+esc(step.confirmed?step.source:'')+(step.observedOnly?' · 恢复时确认，原发生时间未知':'')+'</small>'+(step.evidenceId?'<div class="source mono">'+esc(step.evidenceId)+'</div>':'')+'</li>').join('')+'</ol>'+
   '<div class="receipt-durations"><span>登记→原生输入 <strong>'+formatDuration(p.durations.submissionToInputMs)+'</strong></span><span>原生接受→输入 <strong>'+formatDuration(p.durations.acceptedToInputMs)+'</strong></span><span>领取→报告 <strong>'+formatDuration(p.durations.claimToReportMs)+'</strong></span></div>'+
   '<p class="help">未确认的阶段不补造时间；这些耗时不统一解释为网络延迟。</p><div class="flow">'+(p.sourceThreadId?'<span>发送端 '+native(p.sourceThreadId)+'</span>':'')+(p.targetThreadId?'<span>接收端 '+native(p.targetThreadId)+'</span>':'')+'</div></section>';
}
