import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { Store } from '../src/db.mjs';
import { Team } from '../src/service.mjs';
import { NativeGateway } from '../src/native-gateway.mjs';
import { HookTrust } from '../src/hook-trust.mjs';
import { discoverSharedServer } from '../src/shared-connection.mjs';
import { AppServerClient, RpcError } from '../src/app-server-client.mjs';
import { createApp } from '../src/server.mjs';
import { applyQuestionEvent } from '../src/native-questions.mjs';
import { pluginVersion } from '../src/version.mjs';
import {FakeConnection} from './fixtures/native-connection.mjs';
function fixture(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'teamdesk-as-')),s=new Store(root),team=new Team(s),c=new FakeConnection(),g=new NativeGateway(s,{connection:c,migrate:false});g.hooks.state.recorded=true;
  function employee(name='Worker'){const tid=randomUUID(),cwd=path.join(root,tid);fs.mkdirSync(cwd);const e=team.createEmployee({name,role:'Reviewer',bindingMode:'existing',threadId:tid,cwd,threadTitle:name});c.threads.set(tid,{id:tid,cwd,name,status:{type:'idle'}});for(const o of s.list('operations'))if(o.employeeId===e.id)s.remove('operations',o.id);return e;}
  t.after(()=>{g.close();s.close();fs.rmSync(root,{recursive:true,force:true});});return {root,s,team,c,g,employee};
}
async function drain(g){g.kick();for(let i=0;i<20&&g.running.size;i++)await Promise.all([...g.running.values()]);}
const submit=(team,e,instruction='one',extra={})=>team.submit({employeeId:e.id,mode:'fifo',instruction,...extra});
test('FIFO starts native queue once; busy employee accepts later FIFO without steering',async t=>{
  const {s,team,c,g,employee}=fixture(t),e=employee(),a=submit(team,e);await drain(g);const b=submit(team,e,'two');await drain(g);
  assert.equal(s.get('requests',a.requestId).state,'received');assert.equal(s.get('requests',b.requestId).state,'native_queued');assert.equal(c.queues.get(e.threadId).length,1);await drain(g);
  assert.equal(c.calls.filter(x=>x.method==='thread/queue/add').length,2);assert.equal(c.calls.filter(x=>x.method==='turn/start').length,0);
});
test('steer stays in target turn; stale turn fails before sending',async t=>{
  const {s,team,c,g,employee}=fixture(t),e=employee(),a=submit(team,e);await drain(g);const turnId=s.get('requests',a.requestId).nativeTurnId;
  submit(team,e,'append',{mode:'steer',taskRef:a.taskRef,expectedTurnId:turnId});await drain(g);assert.equal(c.calls.filter(x=>x.method==='turn/steer').length,1);
  const stale=submit(team,e,'stale',{mode:'steer',taskRef:a.taskRef,expectedTurnId:randomUUID()});await drain(g);assert.equal(s.list('operations').find(o=>o.requestId===stale.requestId).state,'failed');assert.equal(c.calls.filter(x=>x.method==='turn/steer').length,1);
});
test('lost ACK blocks retry and later inputs; reconnect locates original queue entry without resending',async t=>{
  const {s,team,c,g,employee}=fixture(t),e=employee(),original=c.request.bind(c);let lose=true;c.request=async(m,p)=>{const r=await original(m,p);if(m==='thread/queue/add'&&lose){lose=false;throw new RpcError('lost',{sent:true});}return r;};
  const a=submit(team,e);await drain(g);const op=s.list('operations').find(o=>o.requestId===a.requestId);assert.equal(op.state,'uncertain');await assert.rejects(g.recover(op.id,{action:'retry'}),{code:'uncertain_retry'});
  submit(team,e,'later');await drain(g);assert.equal(c.calls.filter(x=>x.method==='thread/queue/add').length,1);await g.reconcile();assert.equal(s.get('operations',op.id).state,'done');assert.equal(c.calls.filter(x=>x.method==='thread/queue/add').length,1);
});
test('scoped inbox cannot consume future FIFO or another employee request',async t=>{
  const {s,team,g,employee}=fixture(t),a=employee('A'),b=employee('B');s.put('meta','onDemandMigration',{version:'0.0.1'});const one=submit(team,a);await drain(g);const two=submit(team,a,'two');await drain(g);
  assert.deepEqual(team.inbox(a.threadId,one.requestId).requests.map(r=>r.id),[one.requestId]);assert.equal(s.get('requests',two.requestId).state,'native_queued');assert.throws(()=>team.inbox(b.threadId,one.requestId),{code:'request_scope'});assert.deepEqual(team.inbox(a.threadId,'--identity').requests,[]);
});
test('HTTP duplicate clicks create one request; two employees receive inputs independently',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'teamdesk-http-as-')),c=new FakeConnection(),app=createApp({root,home:root,port:0,nativeConnection:c});
  t.after(async()=>{await new Promise(r=>app.close(r));await new Promise(r=>setImmediate(r));fs.rmSync(root,{recursive:true,force:true});});
  const addr=await app.listen(),url='http://127.0.0.1:'+addr.port,team=new Team(app.store);
  for(const name of ['A','B']){const tid=randomUUID(),cwd=path.join(root,name);fs.mkdirSync(cwd);team.createEmployee({name,role:'Dev',bindingMode:'existing',threadId:tid,cwd});c.threads.set(tid,{id:tid,cwd,status:{type:'idle'}});for(const o of app.store.list('operations'))app.store.remove('operations',o.id);}
  app.gateway.hooks.state.recorded=true;const {token}=await(await fetch(url+'/api/bootstrap')).json();
  const post=(id,key)=>fetch(url+'/api/inputs',{method:'POST',headers:{'Content-Type':'application/json','X-TeamDesk-Token':token,'Idempotency-Key':key},body:JSON.stringify({employeeId:id,mode:'fifo',instruction:'hello'})}).then(r=>r.json());
  const key=randomUUID(),[a,b]=await Promise.all([post('EMP-001',key),post('EMP-001',key),post('EMP-002',randomUUID())]);assert.equal(a.requestId,b.requestId);await drain(app.gateway);assert.equal(app.store.list('requests').length,2);assert.equal(c.calls.filter(x=>x.method==='thread/queue/add').length,2);
});
test('new employee binds shared native thread before first onboarding turn',async t=>{
  const {s,team,c,g}=fixture(t),e=team.createEmployee({name:'New employee',role:'Dev',bindingMode:'new'});await drain(g);const bound=s.get('employees',e.id);assert.ok(bound.threadId);assert.equal(c.threads.get(bound.threadId).name,'New employee');assert.equal(c.calls.filter(x=>x.method==='thread/start').length,1);assert.equal(c.calls.filter(x=>x.method==='thread/queue/add').length,1);assert.match(c.calls.find(x=>x.method==='thread/queue/add').params.input[0].text,/inbox --identity/);
});
test('native question appears before Stop; GUI answer retains question ID and human provenance',async t=>{
  const {s,team,c,g,employee}=fixture(t),e=employee(),a=submit(team,e);await drain(g);const turnId=s.get('requests',a.requestId).nativeTurnId;
  c.message('item/completed',{threadId:e.threadId,turnId,item:{id:'call_question_1',type:'agentMessage',text:'BODY-EXCLUDED',questions:[{title:'Choose',options:['BLUE','GREEN']}]}});const d=s.list('decisions')[0];assert.equal(d.taskRef,a.taskRef);assert.equal(d.state,'pending');g.answerQuestion(d.id,{revision:d.revision,answer:'BLUE'});await drain(g);
  assert.match(c.calls.find(x=>x.method==='turn/steer').params.input[0].text,/call_question_1/);assert.equal(s.get('decisions',d.id).state,'resolved');assert.equal(s.get('decisions',d.id).decidedBy,'human_gui');assert.ok(!JSON.stringify(s.list('events')).includes('BODY-EXCLUDED'));
});
test('onboarding question can be answered without inventing a business task',async t=>{
  const {s,c,g,employee}=fixture(t),e=employee();c.message('item/completed',{threadId:e.threadId,turnId:randomUUID(),item:{id:'call_unscoped',type:'agentMessage',text:'',questions:[{title:'Name?'}]}});const d=s.list('decisions')[0];assert.equal(d.taskRef,null);g.answerQuestion(d.id,{revision:d.revision,answer:'Boyi'});await drain(g);assert.equal(s.get('decisions',d.id).state,'resolved');assert.equal(s.list('tasks').length,0);
});
test('approval callback is scoped; native cleanup never implies human approval',async t=>{
  const {s,c,g,employee}=fixture(t),e=employee(),turnId=randomUUID();c.message('item/commandExecution/requestApproval',{threadId:randomUUID(),turnId,itemId:'x',command:'private'},100);assert.equal(s.list('decisions').length,0);
  c.message('item/commandExecution/requestApproval',{threadId:e.threadId,turnId,itemId:'a',command:'echo harmless',availableDecisions:['accept','decline','cancel']},101);const d=s.list('decisions')[0];await assert.rejects(g.answerCallback(d.id,{revision:d.revision,decision:'acceptForSession'}),{code:'decision'});await g.answerCallback(d.id,{revision:d.revision,decision:'decline'});assert.equal(s.get('decisions',d.id).state,'answering');c.message('serverRequest/resolved',{threadId:e.threadId,requestId:101});assert.equal(s.get('decisions',d.id).state,'resolved');
  c.message('item/commandExecution/requestApproval',{threadId:e.threadId,turnId,itemId:'b'},102);const other=s.list('decisions').find(d=>d.nativeRequestId===102);c.message('serverRequest/resolved',{threadId:e.threadId,requestId:102});assert.equal(s.get('decisions',other.id).state,'closed');assert.equal(s.get('decisions',other.id).answer,undefined);
});
test('disconnection invalidates live callback without guessing a decision',async t=>{
  const {s,c,g,employee}=fixture(t),e=employee();c.message('item/fileChange/requestApproval',{threadId:e.threadId,turnId:randomUUID(),itemId:'p'},11);const d=s.list('decisions')[0];c.emit('disconnect',c.client.generation);await assert.rejects(g.answerCallback(d.id,{revision:d.revision,decision:'accept'}),{code:'callback_unavailable'});assert.equal(c.calls.filter(x=>x.method==='response').length,0);
});
function hookFiles(root,c){const plugin=path.join(root,'plugin');fs.mkdirSync(path.join(plugin,'.codex-plugin'),{recursive:true});fs.writeFileSync(path.join(plugin,'.codex-plugin/plugin.json'),JSON.stringify({name:'teamdesk',version:pluginVersion}));for(const f of ['hooks/hooks.json','skills/team-workspace/scripts/hook.sh','skills/team-workspace/scripts/hook.mjs','skills/team-workspace/assets/app/src/hook-core.mjs','skills/team-workspace/assets/app/src/service.mjs','skills/team-workspace/assets/app/src/db.mjs','skills/team-workspace/assets/app/src/metadata-history.mjs','skills/team-workspace/assets/app/src/fingerprint.mjs','skills/team-workspace/assets/app/src/capabilities.mjs','skills/team-workspace/assets/app/src/workspace.mjs','skills/team-workspace/assets/app/src/version.mjs','skills/team-workspace/assets/app/public/collaboration.js','skills/team-workspace/assets/app/vendor/js-yaml.mjs']){fs.mkdirSync(path.dirname(path.join(plugin,f)),{recursive:true});fs.writeFileSync(path.join(plugin,f),'reviewed');}c.hook.sourcePath=path.join(plugin,'hooks/hooks.json');c.hook.trustStatus='untrusted';return plugin;}
test('hook review rejects a plugin version different from the running app before any trust write',async t=>{
  const {root,s,c}=fixture(t),plugin=hookFiles(root,c),manifest=path.join(plugin,'.codex-plugin/plugin.json');
  fs.writeFileSync(manifest,JSON.stringify({name:'teamdesk',version:'999.0.0'}));
  await assert.rejects(new HookTrust(s,c).review(),{code:'hook_version'});
  assert.equal(c.calls.filter(x=>x.method==='config/batchWrite').length,0);
});
test('hook trust requires explicit confirmation, limits config write to reviewed hash, verifies native readback',async t=>{
  const {root,s,c}=fixture(t);hookFiles(root,c);const h=new HookTrust(s,c),r=await h.review();await assert.rejects(h.trust({ticket:r.ticket}),{code:'human_confirmation'});assert.equal(c.calls.filter(x=>x.method==='config/batchWrite').length,0);assert.equal((await h.trust({ticket:r.ticket,confirmed:true})).recorded,true);assert.deepEqual(c.calls.find(x=>x.method==='config/batchWrite').params.edits,[{keyPath:'hooks.state',value:{[c.hook.key]:{trusted_hash:'sha256:one'}},mergeStrategy:'upsert'}]);
});
test('hook changes after review and managed settings block trust writes',async t=>{
  const {root,s,c}=fixture(t),plugin=hookFiles(root,c),h=new HookTrust(s,c),r=await h.review();fs.appendFileSync(path.join(plugin,'skills/team-workspace/scripts/hook.sh'),'changed');await assert.rejects(h.trust({ticket:r.ticket,confirmed:true}),{code:'hook_changed'});const r2=await h.review();c.hook.isManaged=true;await assert.rejects(h.trust({ticket:r2.ticket,confirmed:true}),{code:'managed_hook'});assert.equal(c.calls.filter(x=>x.method==='config/batchWrite').length,0);
});
test('upgrade preserves old pending work paused and converts interrupted send to uncertain',t=>{
  const {s,team,c,employee}=fixture(t),e=employee();submit(team,e);const id=team.operation('onboard',e.id),op=s.get('operations',id);op.state='sending';s.put('operations',id,op);const next=new NativeGateway(s,{connection:c});assert.equal(s.list('operations').find(o=>o.requestId).state,'paused');assert.equal(s.get('operations',id).state,'uncertain');next.close();
});
test('same-instance discovery rejects unrelated or externally bound server',()=>{
  const desktop={pid:1,ppid:0,command:'/Applications/ChatGPT.app/Contents/MacOS/ChatGPT'},adapter={pid:2,ppid:1,command:'node /adapter.mjs'},server={pid:3,ppid:2,command:'/Applications/ChatGPT.app/Contents/Resources/codex app-server --listen ws://127.0.0.1:4567'};assert.equal(discoverSharedServer([desktop,adapter,server]).pid,3);assert.throws(()=>discoverSharedServer([desktop,{...server,ppid:99}]),{code:'shared_connection_missing'});assert.throws(()=>discoverSharedServer([desktop,adapter,{...server,command:server.command.replace('127.0.0.1','0.0.0.0')}]),{code:'shared_connection_missing'});
});
test('RPC distinguishes never sent from missing acknowledgement',async()=>{
  const c=new AppServerClient('ws://127.0.0.1:1',{timeout:5});await assert.rejects(c.request('test'),e=>e.sent===false);c.ws={readyState:1,send(){}};await assert.rejects(c.request('test'),e=>e.sent===true&&!e.rpcError);
});


test('a log-observed GUI question answer retains GUI provenance before RPC ACK',async t=>{
  const {s,c,g,employee}=fixture(t),e=employee();c.message('item/completed',{threadId:e.threadId,turnId:randomUUID(),item:{id:'call_log_race',type:'agentMessage',text:'',questions:[{title:'Race?'}]}});
  const d=s.list('decisions')[0];g.answerQuestion(d.id,{revision:d.revision,answer:'BLUE'});
  applyQuestionEvent(s,{kind:'native_question_answer',threadId:e.threadId,bindingVersion:e.bindingVersion,at:new Date().toISOString(),answers:[{questionItemId:d.questionItemId,answer:'BLUE'}]});
  assert.equal(s.get('decisions',d.id).decidedBy,'human_gui');
});

test('a binding changed during native creation cannot be overwritten by the late result',async t=>{
  const {s,team,c,g,employee,root}=fixture(t),e=employee(),original=c.request.bind(c);let changed=false;
  c.request=async(m,p)=>{const result=await original(m,p);if(m==='thread/start'&&!changed){changed=true;const tid=randomUUID(),cwd=path.join(root,'replacement');fs.mkdirSync(cwd);team.bind(e.id,{threadId:tid,cwd,title:'Human chosen'},false);}return result;};
  const id=team.operation('create_employee',e.id);await drain(g);assert.equal(s.get('employees',e.id).threadTitle,'Human chosen');assert.equal(s.get('operations',id).state,'uncertain');assert.ok(s.get('operations',id).createdThreadId);assert.equal(c.calls.filter(x=>x.method==='thread/start').length,1);
});

test('fresh shared thread without rollout uses live metadata and starts exactly one first turn',async t=>{
 const {s,team,c,g}=fixture(t),original=c.request.bind(c);let fresh;
 c.request=async(m,p={})=>{
  if(m==='thread/resume'&&p.threadId===fresh)throw new RpcError('invalid paginated history lineage: missing source rollout',{sent:true,rpcError:{code:-32000}});
  if(m==='thread/loaded/list')return {data:[fresh]};
  if(m==='thread/read')return {thread:c.threads.get(p.threadId)};
  const result=await original(m,p);if(m==='thread/start')fresh=result.thread.id;return result;
 };
 const e=team.createEmployee({name:'Fresh',role:'Test',bindingMode:'new'});await drain(g);
 assert.equal(s.get('employees',e.id).threadId,fresh);assert.equal(c.calls.filter(x=>x.method==='thread/start').length,1);assert.equal(c.calls.filter(x=>x.method==='thread/queue/add').length,1);assert.ok(s.list('operations').every(o=>o.state==='done'));
});
