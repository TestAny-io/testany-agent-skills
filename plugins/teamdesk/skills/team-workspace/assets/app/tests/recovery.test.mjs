import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {randomUUID} from 'node:crypto';import {EventEmitter} from 'node:events';
import {Store} from '../src/db.mjs';import {Team} from '../src/service.mjs';
import {NativeGateway} from '../src/native-gateway.mjs';import {SharedConnection} from '../src/shared-connection.mjs';
import {FakeConnection} from './fixtures/native-connection.mjs';
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'td-recovery-')),s=new Store(root),team=new Team(s),c=new FakeConnection(),g=new NativeGateway(s,{connection:c,migrate:false});
 s.put('meta','settings',{...team.settings(),enabled:false});
 const employee=name=>{const e=team.createEmployee({name,role:'Test',bindingMode:'existing',threadId:randomUUID(),cwd:root});c.threads.set(e.threadId,{id:e.threadId,cwd:root,status:{type:'idle'}});return e;};
 t.after(()=>{g.close();s.close();fs.rmSync(root,{recursive:true,force:true});});return {s,team,c,g,employee};
}
test('recovery reconstructs an offline question and native answer across pages in chronological order',async t=>{
 const {s,c,g,employee}=fixture(t),e=employee('A'),ask={id:'ask',status:'completed',items:[{id:'call_x',type:'agentMessage',text:'PRIVATE_BODY',questions:[{title:'Choose'}]}]};
 const answer={id:'answer',status:'completed',items:[{id:'u',type:'userMessage',content:[{type:'text',text:'<send_user_message_question_reply>\n'+JSON.stringify([{questionItemId:JSON.stringify(['request_user_input_async','call_x',0]),answer:'BLUE'}])+'\n</send_user_message_question_reply>'}]}]};
 const request=c.request.bind(c);c.request=async(m,p)=>m==='thread/turns/list'?(p.cursor?{data:[ask]}:{data:[answer],nextCursor:'older'}):request(m,p);
 await g.connected();assert.equal(g.recovery.state,'ready');assert.equal(s.list('decisions')[0].state,'resolved');
 assert.equal(g.runtime.get(e.threadId).turnId,null);assert.equal(g.runtime.get(e.threadId).taskRef,null);
 assert.ok(!JSON.stringify(s.list('events')).includes('PRIVATE_BODY'));assert.equal(c.calls.filter(x=>x.method==='thread/queue/add').length,0);
});
test('one unavailable employee does not prevent other state recovery and stale callbacks cannot answer',async t=>{
 const {s,c,g,employee}=fixture(t),a=employee('A'),b=employee('B'),request=c.request.bind(c);
 c.message('item/tool/requestUserInput',{threadId:b.threadId,turnId:'old',questions:[{id:'q',question:'Continue?'}]},8);
 c.histories.set(b.threadId,[{id:'old',status:'completed',items:[]}]);
 c.request=async(m,p)=>{if(m==='thread/resume'&&p.threadId===a.threadId)throw Error('missing history');return request(m,p);};
 await g.connected();assert.equal(g.recovery.state,'partial');
 assert.equal(g.recovery.employees.find(x=>x.employeeId===b.id).ready,true);
 const d=s.list('decisions')[0];assert.equal(d.state,'closed');assert.equal(d.callbackAvailable,false);
 await assert.rejects(g.answerCallback(d.id,{revision:d.revision,answers:{q:'yes'}}));
 assert.equal(c.calls.filter(x=>x.method==='response').length,0);
});
test('a rebind during pending metadata resume cannot populate the new binding',async t=>{
 const {team,c,g,employee}=fixture(t),e=employee('A'),request=c.request.bind(c);let done;
 c.request=(m,p)=>m==='thread/resume'?new Promise(r=>done=r):request(m,p);
 const loading=g.load(e);const thread={...c.threads.get(e.threadId)};
 team.bind(e.id,{threadId:randomUUID(),cwd:e.cwd,title:'Replacement'},false);
 done({thread});await assert.rejects(loading,{code:'binding_changed'});assert.equal(g.runtime.size,0);
});
test('events from an old connection generation do not change runtime or decisions',t=>{
 const {s,c,g,employee}=fixture(t),e=employee('A');c.client.generation='new';
 c.emit('message',{method:'turn/started',params:{threadId:e.threadId,turn:{id:'stale',status:'inProgress'}}},'a');
 c.emit('message',{id:2,method:'item/tool/requestUserInput',params:{threadId:e.threadId,turnId:'stale',questions:[{id:'q',question:'stale'}]}},'a');
 assert.equal(g.runtime.size,0);assert.equal(s.list('decisions').length,0);
});
test('shutdown during handshake cannot resurrect shared connection and concurrent opens are coalesced',async()=>{
 let complete,created=0;const client=new EventEmitter();client.generation='one';client.connect=()=>new Promise(r=>complete=r);client.request=async()=>({process:{id:7}});client.close=()=>{};
 const c=new SharedConnection({verify:false,discover:()=>({url:'ws://127.0.0.1:1',pid:7}),clientFactory:()=>{created++;return client;}});
 const a=c.connect(),b=c.connect();c.close();complete();await Promise.all([a,b]);
 assert.equal(created,1);assert.equal(c.state.online,false);assert.equal(c.retry,null);
 let received=0;c.on('message',()=>received++);client.emit('message',{method:'turn/started'});assert.equal(received,0);
});
test('recovered metadata is not advertised ready while subscription is pending',async t=>{
 const {s,team,c,g,employee}=fixture(t),e=employee('A'),request=c.request.bind(c);let release;
 c.request=(m,p)=>m==='thread/resume'?new Promise(r=>release=()=>r({thread:c.threads.get(e.threadId)})):request(m,p);
 s.put('meta','settings',{...team.settings(),enabled:true});const recovery=g.connected();await new Promise(r=>setImmediate(r));
 assert.equal(g.recovery.state,'recovering');g.kick();assert.equal(g.running.size,0);c.request=request;release();await recovery;
 assert.equal(g.recovery.state,'ready');await Promise.all([...g.running.values()]);
});
test('a late resume or history page cannot overwrite a newer live turn',async t=>{
 const {c,g,employee}=fixture(t),e=employee('A'),request=c.request.bind(c);let release;
 c.request=(m,p)=>m==='thread/resume'?new Promise(r=>release=r):request(m,p);
 const loading=g.load(e,{recover:true});
 c.message('turn/started',{threadId:e.threadId,turn:{id:'fresh',status:'inProgress'}});
 release({thread:{...c.threads.get(e.threadId),status:{type:'idle'}}});await loading;
 assert.equal(g.runtime.get(e.threadId).status,'active');assert.equal(g.runtime.get(e.threadId).turnId,'fresh');
 c.request=(m,p)=>m==='thread/turns/list'?new Promise(r=>release=r):request(m,p);
 c.threads.get(e.threadId).status={type:'active'};
 const paged=g.load(e,{recover:true});await new Promise(r=>setImmediate(r));
 c.message('turn/completed',{threadId:e.threadId,turn:{id:'fresh',status:'completed'}});
 release({data:[{id:'fresh',status:'inProgress',items:[]}]});await paged;
 assert.equal(g.runtime.get(e.threadId).status,'idle');assert.equal(g.runtime.get(e.threadId).turnId,null);
});
test('an old callback after rebind and an old completed turn cannot mutate the current binding or turn',t=>{
 const {s,c,g,team,employee}=fixture(t),e=employee('A');
 c.message('item/tool/requestUserInput',{threadId:e.threadId,turnId:'old',questions:[{id:'q',question:'Continue?'}]},8);
 const old=s.list('decisions')[0];team.bind(e.id,{threadId:randomUUID(),cwd:e.cwd,title:'Other binding'},false);
 team.bind(e.id,{threadId:e.threadId,cwd:e.cwd,title:'Rebound'},false);
 const afterBind=s.get('decisions',old.id);
 c.message('serverRequest/resolved',{threadId:e.threadId,requestId:8});
 assert.deepEqual(s.get('decisions',old.id),afterBind);
 c.message('turn/started',{threadId:e.threadId,turn:{id:'new',status:'inProgress'}});
 c.message('turn/completed',{threadId:e.threadId,turn:{id:'old',status:'completed'}});
 assert.equal(g.runtime.get(e.threadId).turnId,'new');assert.equal(g.runtime.get(e.threadId).status,'active');
});
test('an old hook check cannot mark a later connection trusted',async t=>{
 const {c,g}=fixture(t),request=c.request.bind(c);let release;
 c.request=(m,p)=>m==='hooks/list'?new Promise(r=>release=r):request(m,p);
 const first=g.hooks.refresh();c.client.generation='replacement';
 release({data:[{hooks:[c.hook]}]});await assert.rejects(first,{code:'hook_connection_changed'});
 assert.equal(g.hooks.state.recorded,false);
});
test('hook trust from a prior connection cannot release queued work when current verification fails',async t=>{
 const {s,c,g,team,employee}=fixture(t);employee('A');await g.hooks.refresh();assert.equal(g.hooks.state.recorded,true);
 c.state.online=false;c.emit('disconnect',c.client.generation);assert.equal(g.hooks.state.recorded,false);
 c.state.online=true;c.client.generation='new';const request=c.request.bind(c);
 c.request=async(m,p)=>{if(m==='hooks/list')throw Error('hook service unavailable');return request(m,p);};
 s.put('meta','settings',{...team.settings(),enabled:true});await g.connected();
 assert.equal(g.recovery.state,'partial');assert.equal(g.hooks.state.recorded,false);
 assert.equal(g.running.size,0);assert.equal(c.calls.filter(x=>x.method==='thread/queue/add').length,0);
});
