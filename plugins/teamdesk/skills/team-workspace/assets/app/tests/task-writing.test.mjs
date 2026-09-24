import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store } from '../src/db.mjs';
import { Team } from '../src/service.mjs';
import { WritingAssistant, validateWritingResult } from '../src/writing-assistant.mjs';
import { WritingConnection } from './fixtures/writing-connection.mjs';
import { taskWritingPatch, sameWritingForm } from '../public/writing-ui.js';
import { createApp } from '../src/server.mjs';

const input={kind:'task',form:{employeeId:'EMP-A',participants:['EMP-B'],mode:'fifo',text:'写天气应用 PRD，不实现代码。',acceptanceCriteria:'评审通过，保留问题处理证据。'},instruction:'整理目标和可核验标准'};
const draft={kind:'draft',draft:'提交天气应用 PRD；由评审员 B 独立评审后整合。只交付需求，不实现代码。',acceptanceCriteria:'提交 PRD 与评审记录；评审必改项闭环，并附处理证据。',summary:'目标与完成条件已对齐。',changes:['明确评审交付与证据'],assumptions:[],conflicts:[],questions:[]};
const tick=()=>new Promise(r=>setImmediate(r));
function seed(s,root) {
 const team=new Team(s),departments=['产品部','评审部','运维部'].map(name=>team.workspace.saveDepartment(null,{name,responsibilities:name+'的职责'}));
 for(const [i,id] of ['EMP-A','EMP-B','EMP-C'].entries()) {
  const skill=path.join(root,'skills',id,'SKILL.md');fs.mkdirSync(path.dirname(skill),{recursive:true});fs.writeFileSync(skill,'---\nname: skill-'+id+'\ndescription: CAPABILITY-'+id+'\n---\n');
  s.put('employees',id,{id,name:id,role:['需求作者','独立评审员','运维工程师'][i],skills:[skill],departmentId:departments[i].id,group:departments[i].name,archived:false,instructions:'遵守既定职责',threadId:null});
 }
 return {team,departments};
}
function fixture(t) {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'teamdesk-task-writing-')),s=new Store(root),c=new WritingConnection(),data=seed(s,root),w=new WritingAssistant(s,c,{skillProvider:()=>[]});
 t.after(async()=>{w.close();c.close();await Promise.allSettled([...w.jobs.values(),...w.syncs.values()]);s.close();fs.rmSync(root,{recursive:true,force:true});});return {root,s,c,w,...data};
}
async function start(w,j){w.kick(j.id);await Promise.all([...w.jobs.values()]);return w.get(j.id);}
test('task writing uses selected owner/collaborators and only their effective resources; it never creates business work',async t=>{
 const {s,c,w,team,departments}=fixture(t);
 const docs=departments.map((d,i)=>team.workspace.writeDocument(null,{title:'约定'+i,kind:'rules',departmentId:d.id,status:'effective',content:'RULE-'+i}));
 team.workspace.writeDocument(docs[1].id,{...docs[1],revision:1,status:'draft',content:'UNPUBLISHED'});
 const before=['employees','departments','tasks','requests','operations'].map(k=>[k,s.list(k)]);
 const j=await start(w,w.create(input)),r=j.rounds[0];
 assert.deepEqual(c.calls.find(x=>x.method==='turn/start').params.outputSchema.required.slice(-1),['acceptanceCriteria']);
 c.message('item/tool/call',{threadId:j.threadId,turnId:r.turnId,tool:'teamdesk_writing_context',arguments:{topic:'overview',id:''}},'ctx');
 const overview=JSON.parse(c.calls.find(x=>x.id==='ctx').result.contentItems[0].text);
 assert.equal(overview.owner.skills[0].description,'CAPABILITY-EMP-A');assert.equal(overview.collaborators[0].skills[0].description,'CAPABILITY-EMP-B');
 assert.ok(!JSON.stringify(overview).includes('CAPABILITY-EMP-C'));assert.equal(overview.resources.length,3);
 assert.ok(!overview.resources.some(d=>d.id===docs[2].id));assert.equal(r.context.documents.find(d=>d.id===docs[1].id).content,'RULE-1');
 c.finish(j.threadId,draft);await tick();assert.deepEqual(w.get(j.id).rounds[0].result,draft);
 for(const [table,values] of before)assert.deepEqual(s.list(table),values,table);
});
test('task form rejects steer, existing targets and unavailable staff before creating a session',t=>{
 const {s,w}=fixture(t);
 assert.throws(()=>w.create({...input,form:{...input.form,mode:'steer'}}),{code:'writing_mode'});
 assert.throws(()=>w.create({...input,targetId:'TASK-existing'}),{code:'writing_target'});
 for(const form of [{...input.form,employeeId:'missing'},{...input.form,participants:['missing']}])assert.throws(()=>w.create({...input,form}));
 const e=s.get('employees','EMP-B');e.archived=true;s.put('employees',e.id,e);assert.throws(()=>w.create(input));
 assert.equal(s.list('writing_sessions').length,0);assert.equal(s.list('operations').length,0);
});
test('task drafts require two bounded outputs, retain clarification, and reject oversized or incomplete suggestions',()=>{
 assert.deepEqual(validateWritingResult(draft,'task'),draft);
 assert.throws(()=>validateWritingResult({...draft,acceptanceCriteria:''},'task'));
 assert.throws(()=>validateWritingResult({...draft,acceptanceCriteria:'x'.repeat(4001)},'task'));
 assert.throws(()=>validateWritingResult({...draft,draft:'x'.repeat(12001)},'task'));
 assert.equal(validateWritingResult({...draft,kind:'clarify',draft:'',acceptanceCriteria:'',questions:[{id:'scope',question:'范围是什么？',options:['只写 PRD','也做原型']}]},'task').kind,'clarify');
});
test('selective adoption retains the other field; owner, collaborator, mode and either text changes invalidate the pair',()=>{
 const current=structuredClone(input.form);
 assert.deepEqual(taskWritingPatch(current,input.form,draft,['text']),{instruction:draft.draft});
 assert.equal(current.acceptanceCriteria,input.form.acceptanceCriteria);
 assert.deepEqual(taskWritingPatch(current,input.form,draft,['acceptanceCriteria']),{acceptanceCriteria:draft.acceptanceCriteria});
 assert.deepEqual(taskWritingPatch(current,input.form,draft,['text','acceptanceCriteria']),{instruction:draft.draft,acceptanceCriteria:draft.acceptanceCriteria});
 for(const change of [{employeeId:'EMP-B'},{participants:[]},{mode:'steer'},{text:'人工新目标'},{acceptanceCriteria:'人工新标准'}]) {
  assert.ok(!sameWritingForm({...current,...change},input.form));assert.throws(()=>taskWritingPatch({...current,...change},input.form,draft,['text']));
 }
 assert.throws(()=>taskWritingPatch(current,input.form,draft,[]));
});
test('task clarification and refinement preserve both outputs and revalidate active collaborators',async t=>{
 const {s,c,w}=fixture(t);let j=await start(w,w.create(input));
 c.finish(j.threadId,{...draft,kind:'clarify',draft:'',acceptanceCriteria:'',questions:[{id:'scope',question:'是否只交付 PRD？',options:['只交付 PRD','也做原型']}]});await tick();
 j=await start(w,w.followup(j.id,{revision:1,instruction:'继续',answers:{scope:'只交付 PRD'}}));c.finish(j.threadId,draft);await tick();
 assert.equal(c.calls.filter(x=>x.method==='thread/start').length,1);assert.equal(w.get(j.id).rounds.length,2);assert.equal(w.get(j.id).rounds[1].result.acceptanceCriteria,draft.acceptanceCriteria);
 const e=s.get('employees','EMP-B');e.archived=true;s.put('employees',e.id,e);assert.throws(()=>w.followup(j.id,{revision:2,instruction:'简短一点'}));assert.equal(w.get(j.id).rounds.length,2);
});
test('HTTP task writing is idempotent and separate from the explicit original task submission',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'teamdesk-task-writing-http-')),c=new WritingConnection(),app=createApp({root,home:root,port:0,nativeConnection:c});seed(app.store,root);
 t.after(async()=>{await new Promise(r=>app.close(r));await tick();fs.rmSync(root,{recursive:true,force:true});});
 const address=await app.listen(),url='http://127.0.0.1:'+address.port,{token}=await(await fetch(url+'/api/bootstrap')).json();
 const post=(route,data,key)=>fetch(url+route,{method:'POST',headers:{'Content-Type':'application/json','X-TeamDesk-Token':token,'Idempotency-Key':key},body:JSON.stringify(data)});
 const key=randomUUID(),a=await(await post('/api/writing',input,key)).json(),b=await(await post('/api/writing',input,key)).json();assert.equal(a.id,b.id);
 await Promise.all([...app.writing.jobs.values()]);const j=app.writing.get(a.id);c.finish(j.threadId,draft);await tick();
 assert.equal(app.store.list('tasks').length,0);assert.equal(app.store.list('requests').length,0);assert.equal(app.store.list('operations').length,0);
 const patch=taskWritingPatch(input.form,input.form,draft,['text','acceptanceCriteria']);
 const response=await post('/api/inputs',{employeeId:'EMP-A',participants:['EMP-B'],mode:'fifo',...patch},randomUUID());assert.equal(response.status,200);
 const business=app.store.list('tasks')[0];assert.equal(business.goal,draft.draft);assert.equal(business.acceptanceCriteria,draft.acceptanceCriteria);assert.deepEqual(business.requiredCollaboratorIds,['EMP-B']);
 assert.equal(app.store.list('requests').length,1);assert.equal(c.calls.filter(x=>x.method==='turn/start').length,1);
});
