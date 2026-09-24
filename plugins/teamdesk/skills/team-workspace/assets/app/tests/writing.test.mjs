import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store } from '../src/db.mjs';
import { Team } from '../src/service.mjs';
import { WritingAssistant,validateWritingResult } from '../src/writing-assistant.mjs';
import { createApp } from '../src/server.mjs';
import { RpcError } from '../src/app-server-client.mjs';
import { WritingConnection } from './fixtures/writing-connection.mjs';
import { sameWritingForm,writingDiff } from '../public/writing-ui.js';
const draft={kind:'draft',draft:'负责产品需求与设计。',summary:'明确责任边界。',changes:['明确交付'],assumptions:[],conflicts:[],questions:[]};
const clarify={...draft,kind:'clarify',draft:'',questions:[{id:'q1',question:'是否负责反馈？',options:['负责','不负责']}]};
const input={kind:'department',form:{name:'产品部',text:'原始职责',skills:[]},instruction:'补充交付物与交接条件'};
function fixture(t) {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'teamdesk-writing-')),s=new Store(root),team=new Team(s),c=new WritingConnection(),w=new WritingAssistant(s,c,{skillProvider:()=>[]});
 t.after(async()=>{w.close();c.close();await Promise.allSettled([...w.jobs.values(),...w.syncs.values()]);s.close();fs.rmSync(root,{recursive:true,force:true});});return {root,s,team,c,w};
}
async function start(w,j){w.kick(j.id);await Promise.all([...w.jobs.values()]);return w.get(j.id);}
const tick=()=>new Promise(r=>setImmediate(r));
test('writing uses same connection, read-only context tool and schema; never changes employee/department/task data',async t=>{
 const {w,c,s,team}=fixture(t),department=team.workspace.saveDepartment(null,{name:'产品部',responsibilities:'原始职责'}),before=s.list('departments');
 const j=await start(w,w.create({...input,targetId:department.id,form:{...input.form,departmentId:department.id}}));
 const create=c.calls.find(x=>x.method==='thread/start').params,turn=c.calls.find(x=>x.method==='turn/start').params;
 assert.equal(create.sandbox,'read-only');assert.equal(create.config['features.plugins'],false);assert.deepEqual(create.environments,[]);assert.deepEqual(create.dynamicTools.map(t=>t.name),['teamdesk_writing_context','teamdesk_local_sources']);assert.ok(turn.outputSchema);
 c.finish(j.threadId,draft);await tick();assert.equal(w.get(j.id).state,'ready');assert.deepEqual(w.get(j.id).rounds[0].result,draft);
 assert.deepEqual(s.list('departments'),before);assert.equal(s.list('employees').length,0);assert.equal(s.list('tasks').length,0);
 assert.equal(w.view(w.get(j.id)).rounds[0].context,undefined);
});
test('clarification answers and refinements continue the same thread and preserve draft history',async t=>{
 const {w,c}=fixture(t);let j=await start(w,w.create(input));c.finish(j.threadId,clarify);await tick();assert.equal(w.get(j.id).state,'needs_input');
 assert.throws(()=>w.followup(j.id,{revision:1,instruction:'继续'}),{code:'invalid_field'});
 const next=w.followup(j.id,{revision:1,instruction:'继续',answers:{q1:'负责'}});j=await start(w,next);c.finish(j.threadId,draft);await tick();
 assert.equal(c.calls.filter(x=>x.method==='thread/start').length,1);assert.equal(w.get(j.id).rounds.length,2);assert.equal(w.get(j.id).rounds[1].answers.q1,'负责');
 assert.throws(()=>w.followup(j.id,{revision:1,instruction:'简短一点'}),{code:'writing_stale'});
});
test('on-demand context exposes only relevant effective resources and same-department skills',async t=>{
 const {w,c,s,team,root}=fixture(t);const a=team.workspace.saveDepartment(null,{name:'产品部',responsibilities:'产品设计'}),b=team.workspace.saveDepartment(null,{name:'运维部',responsibilities:'上线运维'});
 const skill=path.join(root,'SKILL.md');fs.writeFileSync(skill,'---\nname: design\ndescription: DESIGN-CAPABILITY\n---\n');
 for(const d of [a,b])s.put('employees',d.id,{id:d.id,name:d.name+'员工',role:'专家',departmentId:d.id,skills:[skill],archived:false});
 const doc=team.workspace.writeDocument(null,{title:'产品约定',kind:'rules',content:'EFFECTIVE',status:'effective',departmentId:a.id});
 team.workspace.writeDocument(doc.id,{...doc,revision:1,content:'SECRET-DRAFT',status:'draft'});
 team.workspace.writeDocument(null,{title:'其他部门私有参考',kind:'reference',content:'OTHER-DEPARTMENT',status:'effective',departmentId:b.id});
 const j=await start(w,w.create({...input,kind:'employee',form:{name:'小产品',role:'设计师',departmentId:a.id,skills:[skill],text:''}})),round=j.rounds[0];
 c.message('item/tool/call',{threadId:j.threadId,turnId:round.turnId,tool:'teamdesk_writing_context',arguments:{topic:'overview',id:''}},11);
 const result=JSON.parse(c.calls.find(x=>x.id===11).result.contentItems[0].text);
 assert.equal(result.selectedSkills[0].description,'DESIGN-CAPABILITY');assert.ok(result.departments.find(d=>d.id===a.id).members[0].skills);
 assert.equal(result.departments.find(d=>d.id===b.id).members[0].skills,undefined);assert.equal(result.resources.length,2);assert.ok(!JSON.stringify(result).includes('SECRET-DRAFT'));
 c.message('item/tool/call',{threadId:j.threadId,turnId:round.turnId,tool:'teamdesk_writing_context',arguments:{topic:'resource',id:doc.id}},12);
 assert.equal(JSON.parse(c.calls.find(x=>x.id===12).result.contentItems[0].text).content,'EFFECTIVE');
 c.message('item/tool/call',{threadId:j.threadId,turnId:'wrong-turn',tool:'teamdesk_writing_context',arguments:{topic:'overview',id:''}},13);
 assert.equal(c.calls.find(x=>x.id===13).result.success,false);
});
test('invalid outputs, oversized text, foreign events and callbacks cannot produce an adoptable draft',async t=>{
 const {w,c}=fixture(t),j=await start(w,w.create(input));
 c.message('item/completed',{threadId:'foreign',turnId:j.rounds[0].turnId,item:{type:'agentMessage',text:JSON.stringify(draft)}});
 c.message('item/tool/call',{threadId:j.threadId,turnId:j.rounds[0].turnId,tool:'write_config',arguments:{}},22);assert.equal(c.calls.find(x=>x.id===22).result.success,false);
 c.finish(j.threadId,'not JSON');await tick();assert.equal(w.get(j.id).state,'failed');assert.equal(w.get(j.id).rounds[0].result,undefined);
 assert.throws(()=>validateWritingResult({...draft,draft:'x'.repeat(4001)},'department'));
 assert.throws(()=>validateWritingResult({...draft,questions:clarify.questions},'department'));
});
test('lost turn ACK reconciles by native client id without resending model input',async t=>{
 const {w,c}=fixture(t),request=c.request.bind(c);c.request=async(m,p)=>{const result=await request(m,p);if(m==='turn/start')throw new RpcError('lost ACK',{sent:true});return result;};
 const j=await start(w,w.create(input));assert.equal(w.get(j.id).state,'uncertain');const thread=c.threads.get(j.threadId);
 // Simulate an output completed while TeamDesk was disconnected.
 w.c.off('message',w.onNative);c.finish(j.threadId,draft);w.c.on('message',w.onNative);
 await w.sync(j.id);assert.equal(w.get(j.id).state,'ready');assert.equal(c.calls.filter(x=>x.method==='turn/start').length,1);assert.equal(thread.turns.length,1);
});
test('native thread creation uncertainty is retained and never automatically duplicated',async t=>{
 const {w,c}=fixture(t),request=c.request.bind(c);c.request=async(m,p)=>{const result=await request(m,p);if(m==='thread/start')throw new RpcError('lost creation',{sent:true});return result;};
 const j=await start(w,w.create(input));assert.equal(j.state,'uncertain');assert.equal(j.threadId,undefined);w.kick(j.id);
 await assert.rejects(w.sync(j.id),{code:'writing_unknown_thread'});assert.equal(c.calls.filter(x=>x.method==='thread/start').length,1);assert.equal(c.calls.filter(x=>x.method==='turn/start').length,0);
});
test('restart recovery, cancellation and offline errors preserve suggestions and never mutate configuration',async t=>{
 const {w,c,s}=fixture(t),j=await start(w,w.create(input));w.close();
 const restored=new WritingAssistant(s,c,{skillProvider:()=>[]});t.after(()=>restored.close());assert.equal(restored.get(j.id).state,'uncertain');
 await restored.sync(j.id);assert.equal(restored.get(j.id).state,'running');await restored.cancel(j.id,1);assert.equal(restored.get(j.id).state,'cancelled');
 c.state.online=false;assert.throws(()=>restored.create(input),{code:'codex_offline'});assert.equal(s.list('departments').length,0);
});
test('form comparison guards edits and skill changes; diff preserves text and marks additions/removals',()=>{
 const base={name:'A',role:'PM',departmentId:'D',skills:['b','a'],text:'Original'};
 assert.ok(sameWritingForm(base,{...base,skills:['a','b']}));assert.ok(!sameWritingForm(base,{...base,text:'Human edit'}));assert.ok(!sameWritingForm(base,{...base,skills:['a']}));
 assert.deepEqual(writingDiff('a\nb','a\nc'),[{type:'same',text:'a'},{type:'added',text:'c'},{type:'removed',text:'b'}]);
});
test('stopping an uncertain request locates its native turn first; missing execution stays uncertain',async t=>{
 const {w,c}=fixture(t),j=await start(w,w.create(input));let uncertain=w.get(j.id);uncertain.state='uncertain';delete uncertain.rounds[0].turnId;w.save(uncertain);
 await w.cancel(j.id,1);assert.equal(w.get(j.id).state,'cancelled');assert.equal(c.calls.filter(x=>x.method==='turn/interrupt').length,1);
 const next=await start(w,w.create(input));uncertain=w.get(next.id);uncertain.state='uncertain';delete uncertain.rounds[0].turnId;w.save(uncertain);c.threads.get(next.threadId).turns=[];
 await assert.rejects(w.cancel(next.id,1),{code:'writing_unknown_turn'});assert.equal(w.get(next.id).state,'uncertain');assert.equal(c.calls.filter(x=>x.method==='turn/interrupt').length,1);
});
test('pending writing capacity is bounded and cancellation frees a slot without model dispatch',async t=>{
 const {w,c}=fixture(t),jobs=Array.from({length:4},()=>w.create(input));
 assert.throws(()=>w.create(input),{code:'writing_capacity'});await w.cancel(jobs[0].id,1);assert.ok(w.create(input).id);assert.equal(c.calls.length,0);
});
test('HTTP submissions are CSRF protected and idempotent; followup conflicts do not create duplicate turns',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'teamdesk-writing-http-')),c=new WritingConnection(),app=createApp({root,home:root,port:0,nativeConnection:c});
 t.after(async()=>{await new Promise(r=>app.close(r));await tick();fs.rmSync(root,{recursive:true,force:true});});
 const address=await app.listen(),url='http://127.0.0.1:'+address.port,{token}=await(await fetch(url+'/api/bootstrap')).json();
 const post=(route,data,key,csrf=token)=>fetch(url+route,{method:'POST',headers:{'Content-Type':'application/json','X-TeamDesk-Token':csrf,'Idempotency-Key':key},body:JSON.stringify(data)});
 assert.equal((await post('/api/writing',input,randomUUID(),'wrong')).status,403);
 const key=randomUUID(),rs=await Promise.all([post('/api/writing',input,key),post('/api/writing',input,key)]),[a,b]=await Promise.all(rs.map(r=>r.json()));assert.equal(a.id,b.id);
 await Promise.all([...app.writing.jobs.values()]);const j=app.writing.get(a.id);c.finish(j.threadId,draft);await tick();
 assert.equal(c.calls.filter(x=>x.method==='thread/start').length,1);assert.equal(c.calls.filter(x=>x.method==='turn/start').length,1);
 const body={revision:1,instruction:'简短一点'},k=randomUUID();await Promise.all([post('/api/writing/'+a.id+'/continue',body,k),post('/api/writing/'+a.id+'/continue',body,k)]);
 await Promise.all([...app.writing.jobs.values()]);assert.equal(c.calls.filter(x=>x.method==='turn/start').length,2);
 assert.equal((await post('/api/writing/'+a.id+'/continue',body,randomUUID())).status,409);
 assert.equal(app.store.list('employees').length,0);assert.equal(app.store.list('departments').length,0);
});
