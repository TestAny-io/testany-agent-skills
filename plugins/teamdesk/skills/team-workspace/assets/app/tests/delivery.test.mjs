import test from 'node:test';import assert from 'node:assert/strict';
import {deliveryProgress} from '../public/delivery.js';
const at=s=>'2026-09-24T00:00:'+String(s).padStart(2,'0')+'.000Z';
const request={id:'r',employeeId:'B',fromEmployeeId:'A',taskRef:'t',kind:'work',source:'employee',createdAt:at(0),sequence:1};
const state={requests:[request],operations:[],events:[],records:[],decisions:[],health:{connection:{online:true}}};
test('peer registration and native tool acceptance do not claim recipient read or FIFO',()=>{
 assert.match(deliveryProgress(request,state).reason,/仅登记/);
 const view=deliveryProgress(request,{...state,events:[{id:'e',kind:'native_tool',tool:'send_message_to_thread',requestId:'r',employeeId:'A',state:'accepted',at:at(1)}]});
 assert.equal(view.state,'native_accepted');assert.match(view.reason,/不能断言/);assert.equal(view.steps.find(s=>s.id==='input').confirmed,false);
});
test('queue delay and claim delay use distinct known timestamps',()=>{
 const r={...request,kind:undefined,nativeAcceptedAt:at(2),queuedSubmissionId:'q',nativeReceivedAt:at(22),receivedAt:at(22),claimedAt:at(25)};
 const view=deliveryProgress(r,state);assert.equal(view.durations.acceptedToInputMs,20000);assert.equal(view.durations.inputToClaimMs,3000);assert.equal(view.durations.claimToReportMs,null);
});
test('reconciled evidence is not presented as original latency and old receipts do not become claims',()=>{
 const view=deliveryProgress({...request,nativeReceivedAt:at(30),receiptRecovered:true},state);
 assert.equal(view.durations.submissionToInputMs,null);assert.equal(view.steps.find(s=>s.id==='input').observedOnly,true);
 const old=deliveryProgress({...request,receivedAt:at(10)},state);assert.equal(old.legacyReceipt,true);assert.equal(old.steps.find(s=>s.id==='claimed').confirmed,false);
});
test('result from another branch or wrong sender never closes this work',()=>{
 const other={id:'x',kind:'result',taskRef:'t',replyToRequestId:'other',fromEmployeeId:'B',employeeId:'A',createdAt:at(15)};
 const wrong={...other,id:'wrong',replyToRequestId:'r',fromEmployeeId:'C'};
 assert.equal(deliveryProgress(request,{...state,requests:[request,other,wrong]}).resultRequestId,null);
});
test('A-B-C-B-A associates each result and handling with its own initiating request',()=>{
 const ab={...request,receivedAt:at(1)},bc={...request,id:'bc',fromEmployeeId:'B',employeeId:'C',receivedAt:at(2)};
 const cb={id:'cb',kind:'result',taskRef:'t',replyToRequestId:'bc',fromEmployeeId:'C',employeeId:'B',outcome:'completed',createdAt:at(10),receivedAt:at(11)};
 const snapshot={...state,requests:[ab,bc,cb],records:[{id:'record',employeeId:'B',taskRef:'t',recordedAt:at(12),handledResults:[{resultRequestId:'cb',disposition:'accepted'}]}]};
 assert.equal(deliveryProgress(bc,snapshot).state,'handled');assert.equal(deliveryProgress(ab,snapshot).state,'awaiting_result');
});
test('uncertain results remain uncertain, failed native calls are not merely waiting',()=>{
 assert.equal(deliveryProgress(request,{...state,operations:[{requestId:'r',state:'uncertain'}]}).state,'uncertain');
 assert.equal(deliveryProgress(request,{...state,events:[{kind:'native_tool',tool:'send_message_to_thread',requestId:'r',employeeId:'A',state:'failed',at:at(2)}]}).state,'failed');
});
test('only same-employee same-task decisions explain waiting',()=>{
 const d={id:'d',taskRef:'t',fromEmployeeId:'C',state:'pending'};
 assert.notEqual(deliveryProgress(request,{...state,decisions:[d]}).state,'waiting_human');
 assert.equal(deliveryProgress(request,{...state,decisions:[{...d,fromEmployeeId:'B'}]}).state,'waiting_human');
});
test('out-of-order timestamps do not produce negative or manufactured duration',()=>{
 const p=deliveryProgress({...request,nativeAcceptedAt:at(20),nativeReceivedAt:at(10)},state);
 assert.equal(p.durations.acceptedToInputMs,null);
});
test('later send evidence replaces an earlier failure, but evidence addressed to another thread is excluded',()=>{
 const r={...request,targetThreadId:'B-thread'},event={kind:'native_tool',tool:'send_message_to_thread',requestId:'r',employeeId:'A',targetThreadId:'B-thread'};
 const events=[{...event,state:'failed',at:at(1)},{...event,state:'accepted',at:at(2)},{...event,targetThreadId:'other',state:'failed',at:at(3)}];
 assert.equal(deliveryProgress(r,{...state,events}).state,'native_accepted');
 assert.equal(deliveryProgress({...request,kind:'note',receivedAt:at(1)},state).label,'已记录接收 · 来源未细分');
});
