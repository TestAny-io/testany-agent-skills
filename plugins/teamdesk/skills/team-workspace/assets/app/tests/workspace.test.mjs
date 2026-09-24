import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store } from '../src/db.mjs';
import { Team } from '../src/service.mjs';
import { stopHook } from '../src/hook-core.mjs';
import { createApp } from '../src/server.mjs';
import { taskAcceptance } from '../public/task-progress.js';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'teamdesk-workspace-'));
  const s = new Store(root), team = new Team(s), w = team.workspace;
  t.after(() => { s.close(); fs.rmSync(root, {recursive:true, force:true}); });
  const employee = (group = '开发', skills = []) => team.createEmployee({name:randomUUID(),role:'测试岗位',group,skills,bindingMode:'existing',threadId:randomUUID(),cwd:root});
  const submit = (e, participants = []) => team.submit({employeeId:e.id,mode:'fifo',instruction:'测试任务目标',participants:participants.map(e=>e.id)});
  const report = (e,r,extra = {}) => team.applyWorklog(e,randomUUID(),[{requestId:r.requestId || r.id,ownerEmployeeId:e.id,taskId:r.taskRef,title:'测试交付',category:'验证',status:'completed',summary:'已完成验证',...extra}],'test');
  const snapshot = () => ({employees:s.list('employees'),requests:s.list('requests'),records:s.list('records'),events:[],operations:s.list('operations'),health:{connection:{online:true}}});
  return {root,s,team,w,employee,submit,report,snapshot};
}

test('legacy group migration is atomic, repeatable and preserves task/binding evidence', t => {
  const f = fixture(t), e = f.employee('历史组'), r = f.submit(e); f.report(e,r);
  const before = f.s.get('tasks',r.taskRef), bindings = f.s.list('bindings'), records = f.s.list('records');
  for (const key of ['departments','documents','document_versions']) for (const row of f.s.list(key)) f.s.remove(key,row.id);
  f.s.remove('meta','organizationV1'); const legacy = {...e}; delete legacy.departmentId; f.s.put('employees',e.id,legacy);
  f.s.put('meta','settings',{...f.team.settings(),rules:'已经确认的历史规则'});
  const upgraded = new Team(f.s), dept = f.s.get('employees',e.id).departmentId;
  assert.equal(upgraded.workspace.department(dept).name,'历史组');
  assert.equal(upgraded.workspace.department(dept).responsibilities,'');
  assert.equal(upgraded.workspace.document('DOC-team-rules').content,'已经确认的历史规则');
  assert.deepEqual(f.s.get('tasks',r.taskRef),before); assert.deepEqual(f.s.list('bindings'),bindings); assert.deepEqual(f.s.list('records'),records);
  new Team(f.s); assert.equal(f.s.get('employees',e.id).departmentId,dept); assert.equal(f.s.list('documents').length,1);
});

test('departments keep contact membership valid across moves, archive and restore', t => {
  const f=fixture(t),a=f.employee(),b=f.employee('测试'),d=f.w.department(a.departmentId);
  assert.throws(()=>f.w.saveDepartment(d.id,{...d,contactEmployeeId:b.id}),{code:'department_contact'});
  const revised=f.w.saveDepartment(d.id,{...d,contactEmployeeId:a.id,responsibilities:'实现需求'});
  assert.equal(f.w.saveDepartment(d.id,{revision:revised.revision,name:'开发部'}).contactEmployeeId,a.id);
  assert.throws(()=>f.w.saveDepartment(d.id,{...revised,name:'过期修改'}),{code:'stale'});
  assert.throws(()=>f.w.archiveDepartment(d.id,{revision:3}),{code:'department_members'});
  f.team.editEmployee(a.id,{departmentId:b.departmentId});assert.equal(f.w.department(d.id).contactEmployeeId,null);
  const empty=f.w.department(d.id); f.w.archiveDepartment(d.id,{revision:empty.revision});
  assert.throws(()=>f.team.editEmployee(a.id,{departmentId:d.id}),{code:'department_missing'});
  f.team.archiveEmployee(b.id,true); f.team.archiveEmployee(a.id,true);
  const second=f.w.department(b.departmentId);f.w.archiveDepartment(second.id,{revision:second.revision});
  f.team.archiveEmployee(a.id,false);assert.equal(f.s.get('employees',a.id).departmentId,null);
});

const roster = (f, id) => f.s.list('employees').filter(e => !e.archived && e.departmentId === id).map(e => ({id:e.id,revision:e.departmentRevision || 0}));
const workState = f => Object.fromEntries(['tasks','bindings','requests','records','operations','document_versions'].map(k => [k,f.s.list(k)]));

test('unassigned employees remain independent and can query, receive and complete work', t => {
  const f=fixture(t),file=path.join(f.root,'SKILL.md');fs.writeFileSync(file,'---\nname: expert\ndescription: PRIVATE_UNASSIGNED_SKILL\n---\n');
  const create = () => f.team.createEmployee({name:randomUUID(),role:'专家',skills:[file],bindingMode:'existing',threadId:randomUUID(),cwd:f.root});
  const a=create(),b=create();assert.equal(a.departmentId,null);assert.equal(f.s.list('departments').length,0);
  assert.equal(f.team.query(a.threadId,'me').department,null);
  assert.equal(f.team.query(a.threadId,'department').total,0);
  assert.match(JSON.stringify(f.team.query(a.threadId,'me')),/PRIVATE_UNASSIGNED_SKILL/);
  assert.doesNotMatch(JSON.stringify(f.team.query(a.threadId,'employee',b.id)),/PRIVATE_UNASSIGNED_SKILL/);
  assert.equal(f.team.query(a.threadId,'employees').items[0].departmentName,'未分配');
  const r=f.submit(a);f.team.inbox(a.threadId,r.requestId);f.report(a,r);assert.equal(f.s.get('tasks',r.taskRef).status,'completed');
  new Team(f.s);assert.equal(f.s.get('employees',a.id).departmentId,null);
});

test('department transfers change query scope and contact while preserving identity, work and native queue', t => {
  const f=fixture(t),a=f.employee('研发'),b=f.employee('测试'),d=f.w.department(a.departmentId),r=f.submit(a);f.report(a,r);
  f.w.saveDepartment(d.id,{...d,contactEmployeeId:a.id});
  const oldDoc=f.w.writeDocument(null,{title:'研发资料',kind:'reference',departmentId:a.departmentId,status:'effective',content:'研发内容'});
  const newDoc=f.w.writeDocument(null,{title:'测试资料',kind:'reference',departmentId:b.departmentId,status:'effective',content:'测试内容'});
  const before=workState(f),original=f.s.get('employees',a.id);
  const moved=f.team.changeEmployeeDepartment(a.id,{departmentId:b.departmentId,revision:0});
  assert.equal(moved.departmentRevision,1);assert.equal(moved.threadId,original.threadId);assert.equal(moved.bindingVersion,original.bindingVersion);
  assert.deepEqual(moved.skills,original.skills);assert.equal(f.w.department(d.id).contactEmployeeId,null);
  assert.deepEqual(workState(f),before);
  assert.throws(()=>f.team.query(a.threadId,'resource',oldDoc.id),{code:'document_unavailable'});
  assert.equal(f.team.query(a.threadId,'resource',newDoc.id).document.content,'测试内容');
  assert.throws(()=>f.team.changeEmployeeDepartment(a.id,{departmentId:null,revision:0}),{code:'stale'});
  const removed=f.team.changeEmployeeDepartment(a.id,{departmentId:null,revision:1});assert.equal(removed.departmentId,null);
  assert.equal(f.team.query(a.threadId,'me').department,null);
  assert.throws(()=>f.team.query(a.threadId,'resource',newDoc.id),{code:'document_unavailable'});
  assert.deepEqual(workState(f),before);
  assert.equal(f.s.list('audit').filter(e=>e.action==='employee.department_changed').length,2);
});

test('populated department deletion requires an explicit destination and moves everyone atomically', t => {
  const f=fixture(t),a=f.employee('研发'),b=f.employee('研发'),c=f.employee('测试'),d=f.w.department(a.departmentId);
  const contact=f.w.saveDepartment(d.id,{...d,contactEmployeeId:a.id});
  f.w.writeDocument(null,{title:'旧部门资料',kind:'reference',departmentId:d.id,status:'effective',content:'保留历史'});
  const r=f.submit(a);f.report(a,r);const before=workState(f);
  const input={revision:contact.revision,members:roster(f,d.id)};
  assert.throws(()=>f.team.deleteDepartment(d.id,input),{code:'department_required'});
  assert.throws(()=>f.team.deleteDepartment(d.id,{...input,targetDepartmentId:d.id}),{code:'department_target'});
  assert.throws(()=>f.team.deleteDepartment(d.id,{...input,targetDepartmentId:'missing'}),{code:'department_missing'});
  assert.equal(f.s.get('employees',a.id).departmentId,d.id);assert.deepEqual(workState(f),before);
  const deleted=f.team.deleteDepartment(d.id,{...input,targetDepartmentId:c.departmentId});
  assert.ok(deleted.archived && deleted.deletedAt);assert.equal(deleted.contactEmployeeId,null);
  for(const e of [a,b])assert.equal(f.s.get('employees',e.id).departmentId,c.departmentId);
  assert.deepEqual(workState(f),before);
  assert.equal(f.team.query(a.threadId,'departments').items.some(x=>x.id===d.id),false);
  assert.throws(()=>f.team.changeEmployeeDepartment(a.id,{departmentId:d.id,revision:1}),{code:'department_missing'});
  f.w.saveDepartment(d.id,{...deleted});assert.equal(f.w.department(d.id).archived,false);
  assert.equal(f.s.get('employees',a.id).departmentId,c.departmentId,'restoring a department never pulls employees back');
});

test('deletion rejects stale rosters including a member moved out and back', t => {
  const f=fixture(t),a=f.employee('研发'),d=f.w.department(a.departmentId);
  const input={revision:d.revision,members:roster(f,d.id),targetDepartmentId:null};
  f.team.changeEmployeeDepartment(a.id,{departmentId:null,revision:0});
  f.team.changeEmployeeDepartment(a.id,{departmentId:d.id,revision:1});
  assert.throws(()=>f.team.deleteDepartment(d.id,input),{code:'stale'});
  const fresh={...input,members:roster(f,d.id)};f.employee('研发');
  assert.throws(()=>f.team.deleteDepartment(d.id,fresh),{code:'stale'});
  assert.equal(f.w.department(d.id).archived,false);assert.equal(f.s.get('employees',a.id).departmentId,d.id);
});

test('remove-all deletion preserves scoped resources and archived employees; restore is explicit', t => {
  const f=fixture(t),a=f.employee('研发'),b=f.employee('研发'),d=f.w.department(a.departmentId);
  f.team.archiveEmployee(b.id,true);
  const doc=f.w.writeDocument(null,{title:'研发手册',kind:'sop',status:'effective',departmentId:d.id,content:'历史流程'});
  const before=workState(f);
  const deleted=f.team.deleteDepartment(d.id,{revision:d.revision,members:roster(f,d.id),targetDepartmentId:null});
  assert.equal(f.s.get('employees',a.id).departmentId,null);assert.equal(f.s.get('employees',b.id).departmentId,d.id);
  assert.deepEqual(workState(f),before);assert.equal(f.w.document(doc.id).content,'历史流程');
  assert.equal(f.team.query(a.threadId,'resources').items.some(x=>x.id===doc.id),false);
  assert.throws(()=>f.w.writeDocument(doc.id,{...doc,content:'发布到已删除部门',status:'effective'}),{code:'department_missing'});
  const draft=f.w.writeDocument(doc.id,{...doc,content:'保留草案',status:'draft'});assert.equal(draft.departmentId,d.id);
  f.team.archiveEmployee(b.id,false);assert.equal(f.s.get('employees',b.id).departmentId,null);
  f.w.saveDepartment(d.id,{...deleted});assert.equal(f.team.query(a.threadId,'resources').items.some(x=>x.id===doc.id),false);
});

test('empty department deletion and recovery preserve the same ID and reject duplicate active names', t => {
  const f=fixture(t),d=f.w.saveDepartment(null,{name:'设计',responsibilities:'用户体验'});
  const deleted=f.team.deleteDepartment(d.id,{revision:d.revision,members:[]});
  const replacement=f.w.saveDepartment(null,{name:'设计'});
  assert.throws(()=>f.w.saveDepartment(d.id,{...deleted}),{code:'department_duplicate'});
  const restored=f.w.saveDepartment(d.id,{...deleted,name:'设计研究'});
  assert.equal(restored.id,d.id);assert.equal(restored.responsibilities,'用户体验');assert.notEqual(replacement.id,d.id);
});

test('same-department skills are discoverable; cross-department descriptions never enter projections', t => {
  const f=fixture(t),file=path.join(f.root,'SKILL.md');fs.writeFileSync(file,'---\nname: specialist\ndescription: SECRET_DESCRIPTION_ABC\n---\n');
  const a=f.employee('开发'),b=f.employee('开发',[file]),c=f.employee('测试',[file]),r=f.submit(a,[b,c]);
  assert.match(JSON.stringify(f.team.query(a.threadId,'employee',b.id)),/SECRET_DESCRIPTION/);
  assert.doesNotMatch(JSON.stringify(f.team.query(a.threadId,'employee',c.id)),/SECRET_DESCRIPTION|SKILL.md|sha256/);
  const q=f.team.query(a.threadId,'task',r.taskRef);assert.equal(q.task.requiredCollaboratorsSnapshot[1].skills,undefined);
  f.team.inbox(a.threadId,r.requestId);
  const handoff=f.team.peerRequest(a.threadId,{kind:'work',employeeId:c.id,taskRef:r.taskRef,parentRequestId:r.requestId,instruction:'请协作',completionCriteria:'报告结果'});
  assert.doesNotMatch(JSON.stringify(handoff),/SECRET_DESCRIPTION/);
  const received=f.team.inbox(c.threadId,handoff.id);
  assert.equal(received.requests[0].capabilitySnapshot[0].skills,undefined);
  assert.equal(received.requests[0].capabilitySnapshot[1].skills[0].description,'SECRET_DESCRIPTION_ABC');
  f.team.editEmployee(b.id,{departmentId:c.departmentId});
  assert.doesNotMatch(JSON.stringify(f.team.query(a.threadId,'employee',b.id)),/SECRET_DESCRIPTION/);
  assert.ok(f.s.get('tasks',r.taskRef).requiredCollaboratorsSnapshot[0].skills,'human historic evidence preserved');
});

test('inbox contains only current request and minimal task; queries do not claim future work', t => {
  const f=fixture(t),a=f.employee(),b=f.employee(),r=f.submit(a),later=f.submit(a);
  assert.throws(()=>f.team.inbox(a.threadId),{code:'request_required'});
  const box=f.team.inbox(a.threadId,r.requestId);
  assert.deepEqual(box.requests.map(r=>r.id),[r.requestId]);assert.equal(box.tasks.length,1);
  for (const key of ['directory','rules','decisions']) assert.equal(box[key],undefined);
  f.team.query(a.threadId,'task',later.taskRef);f.team.query(a.threadId,'resources');
  assert.equal(f.s.get('requests',later.requestId).receivedAt,null);
  assert.throws(()=>f.team.query(b.threadId,'task',r.taskRef),{code:'task_scope'});
  assert.deepEqual(f.team.inbox(a.threadId,'--identity').requests,[]);
  assert.doesNotMatch(JSON.stringify(box),new RegExp(later.taskRef));
});

test('a queued but unreceived request cannot make Stop request an unrelated worklog', t => {
  const f=fixture(t),a=f.employee();f.submit(a);
  assert.deepEqual(stopHook(f.s,{hook_event_name:'Stop',session_id:a.threadId,turn_id:'idle',cwd:a.cwd,last_assistant_message:'普通对话'}),{});
  assert.equal(f.s.list('hooks')[0].state,'saved');assert.equal(f.s.list('records').length,0);
});

test('published resources retain old effective content while editing a new draft', t => {
  const f=fixture(t),a=f.employee();const one=f.w.writeDocument(null,{title:'交接 SOP',kind:'sop',status:'effective',content:'先核对目标'});
  const draft=f.w.writeDocument(one.id,{...one,status:'draft',content:'尚未确认的新流程'});
  assert.equal(f.team.query(a.threadId,'resource',one.id).document.content,'先核对目标');
  assert.equal(f.w.document(one.id).content,'尚未确认的新流程');
  assert.throws(()=>f.team.query(a.threadId,'resource',one.id,{revision:2}),{code:'document_unavailable'});
  assert.throws(()=>f.w.writeDocument(one.id,{...one,status:'effective',content:'覆盖过期版本'}),{code:'stale'});
  const published=f.w.writeDocument(one.id,{...draft,content:'确认后的新流程',status:'effective'});
  assert.equal(f.team.query(a.threadId,'resource',one.id).document.revision,3);
  assert.equal(f.team.query(a.threadId,'resource',one.id,{revision:1}).document.content,'先核对目标');
  assert.equal(f.s.get('document_versions',one.id+'@2').content,'尚未确认的新流程');
  f.w.writeDocument(one.id,{...published,content:'确认后的新流程',status:'archived'});
  assert.throws(()=>f.team.query(a.threadId,'resource',one.id,{revision:1}),{code:'document_unavailable'});
  assert.equal(f.w.document(one.id,{revision:1}).content,'先核对目标');
});

test('resource scope, drafts and reserved IDs cannot bypass employee discovery', t => {
  const f=fixture(t),a=f.employee(),b=f.employee('测试');
  const privateDoc=f.w.writeDocument(null,{title:'本部流程',kind:'sop',departmentId:a.departmentId,status:'effective',content:'部门流程'});
  f.w.writeDocument(null,{title:'草案',kind:'proposal',status:'draft',content:'未确认'});
  const forged=f.w.writeDocument(null,{fixedId:'DOC-team-rules',title:'另一份资料',kind:'reference',status:'effective',content:'有效资料'});
  assert.notEqual(forged.id,'DOC-team-rules');assert.notEqual(f.w.document('DOC-team-rules').content,'有效资料');
  assert.equal(f.team.query(a.threadId,'resource',privateDoc.id).document.content,'部门流程');
  assert.throws(()=>f.team.query(b.threadId,'resource',privateDoc.id),{code:'document_unavailable'});
  const index=f.team.query(b.threadId,'resources');assert.ok(index.items.every(d=>!d.content));
  assert.ok(!index.items.some(d=>d.id===privateDoc.id || d.title==='草案'));
  assert.match(f.team.query(a.threadId,'resource','SYS-entry').document.content,/按需查询/);
  assert.throws(()=>f.w.writeDocument('SYS-entry',{title:'override',revision:1}),{code:'document_readonly'});
});

test('deleted resources retain immutable versions and business references, and cannot be queried until restored and published', t => {
  const f=fixture(t),a=f.employee();
  const original=f.w.writeDocument(null,{title:'交接规范',kind:'sop',content:'已发布的旧内容',status:'effective',departmentId:a.departmentId});
  const request=f.team.submit({employeeId:a.id,mode:'fifo',instruction:'参考 '+original.id+'@1 开展本任务'});
  const task=f.s.get('tasks',request.taskRef),bindings=f.s.list('bindings'),requests=f.s.list('requests');
  const draft=f.w.writeDocument(original.id,{...original,content:'最新草案内容',status:'draft'});
  const versions=f.s.list('document_versions').filter(v=>v.documentId===original.id);
  const deleted=f.w.transitionDocument(original.id,{revision:draft.revision},'delete');
  assert.equal(deleted.status,'deleted');assert.equal(deleted.effectiveRevision,null);assert.ok(deleted.deletedAt);
  assert.equal(f.team.query(a.threadId,'resources').items.some(x=>x.id===original.id),false);
  for(const revision of [undefined,1,2])assert.throws(()=>f.team.query(a.threadId,'resource',original.id,{revision}),{code:'document_unavailable'});
  assert.equal(f.w.document(original.id).content,'最新草案内容');assert.equal(f.w.document(original.id,{revision:1}).content,'已发布的旧内容');
  for(const v of versions)assert.deepEqual(f.s.get('document_versions',v.id),v);
  assert.deepEqual(f.s.get('tasks',request.taskRef),task);assert.deepEqual(f.s.list('bindings'),bindings);assert.deepEqual(f.s.list('requests'),requests);
  assert.throws(()=>f.w.writeDocument(original.id,{...deleted,content:'跳过恢复直接发布',status:'effective'}),{code:'document_retired'});
  const restored=f.w.transitionDocument(original.id,{revision:deleted.revision},'restore');
  assert.equal(restored.id,original.id);assert.equal(restored.status,'draft');assert.equal(restored.effectiveRevision,null);
  for(const revision of [undefined,1])assert.throws(()=>f.team.query(a.threadId,'resource',original.id,{revision}),{code:'document_unavailable'});
  const published=f.w.transitionDocument(original.id,{revision:restored.revision},'publish');
  assert.equal(published.revision,5);assert.equal(f.team.query(a.threadId,'resource',original.id).document.content,'最新草案内容');
  const historical=f.w.document(original.id,{revision:1});assert.equal(historical.latestStatus,'effective');assert.equal(historical.latestRevision,5);
});

test('resource transitions reject stale revisions and invalid state without partial mutations', t => {
  const f=fixture(t),d=f.w.writeDocument(null,{title:'版本控制',kind:'reference',content:'待发布',status:'draft'});
  const published=f.w.transitionDocument(d.id,{revision:d.revision},'publish');
  const before=f.s.list('document_versions');
  assert.throws(()=>f.w.transitionDocument(d.id,{revision:d.revision},'delete'),{code:'stale'});
  assert.throws(()=>f.w.transitionDocument(d.id,{revision:published.revision},'restore'),{code:'document_state'});
  assert.throws(()=>f.w.transitionDocument(d.id,{revision:published.revision},'publish'),{code:'document_state'});
  assert.deepEqual(f.s.list('document_versions'),before);
  const deleted=f.w.transitionDocument(d.id,{revision:published.revision},'delete');
  assert.throws(()=>f.w.transitionDocument(d.id,{revision:deleted.revision},'publish'),{code:'document_state'});
  assert.throws(()=>f.w.transitionDocument(d.id,{revision:deleted.revision},'delete'),{code:'document_state'});
});

test('legacy archived resources restore to drafts with their original scope, including deleted departments', t => {
  const f=fixture(t),a=f.employee();
  const d=f.w.writeDocument(null,{title:'旧归档',kind:'reference',content:'保留内容',status:'effective',departmentId:a.departmentId});
  const archived=f.w.writeDocument(d.id,{...d,content:'保留内容',status:'archived'});
  const dept=f.w.department(a.departmentId);
  f.team.deleteDepartment(dept.id,{revision:dept.revision,members:roster(f,dept.id),targetDepartmentId:null});
  const restored=f.w.transitionDocument(d.id,{revision:archived.revision},'restore');
  assert.equal(restored.departmentId,dept.id);assert.equal(restored.status,'draft');assert.equal(restored.effectiveRevision,null);
  assert.throws(()=>f.w.transitionDocument(d.id,{revision:restored.revision},'publish'),{code:'department_missing'});
  assert.equal(f.s.get('documents',d.id).revision,restored.revision);
});

test('system protocols explicitly explain read-only status and reject every resource mutation', t => {
  const f=fixture(t);
  for(const id of ['SYS-entry','SYS-collaboration','SYS-worklog']) {
    const d=f.w.document(id);assert.equal(d.readOnly,true);assert.match(d.readOnlyReason,/系统内置协议/);
    assert.match(f.w.resources().find(x=>x.id===id).readOnlyReason,/不可.*编辑或删除/);
    for(const action of ['publish','delete','restore'])assert.throws(()=>f.w.transitionDocument(id,{revision:d.revision},action),{code:'document_readonly'});
    assert.throws(()=>f.w.writeDocument(id,{...d,status:'draft'}),{code:'document_readonly'});
  }
  assert.equal(f.s.list('documents').length,1);
});

test('directory and document indexes support bounded search and pagination', t => {
  const f=fixture(t),a=f.employee();for(let i=0;i<5;i++)f.employee('D'+i);
  const first=f.team.query(a.threadId,'employees',null,{limit:2});assert.equal(first.items.length,2);assert.equal(first.nextOffset,2);
  const next=f.team.query(a.threadId,'employees',null,{limit:2,offset:first.nextOffset});assert.notEqual(first.items[0].id,next.items[0].id);
  assert.equal(f.team.query(a.threadId,'employees',null,{search:a.name}).total,1);
  for(const limit of [-1,Infinity,1.2,51])assert.throws(()=>f.team.query(a.threadId,'employees',null,{limit}),{code:'pagination'});
});

test('accepted verdict sends exactly one notice; native receipt and acknowledgement preserve task and evidence', t => {
  const f=fixture(t),a=f.employee(),r=f.submit(a);f.report(a,r);
  const before=f.s.get('tasks',r.taskRef),input={revision:before.revision,collaborationRevision:0,verdict:'accepted',note:'符合要求'};
  const accepted=f.team.acceptTask(r.taskRef,input),notice=f.s.get('requests',accepted.acceptance.notificationRequestId);
  assert.equal(notice.kind,'acceptance_notice');assert.equal(notice.mode,'fifo');assert.equal(notice.instruction.includes('符合要求'),true);
  assert.equal(f.team.acceptTask(r.taskRef,input).acceptance.notificationRequestId,notice.id);
  assert.equal(f.s.list('operations').filter(o=>o.requestId===notice.id).length,1);assert.equal(f.s.list('tasks').length,1);
  assert.throws(()=>f.report(a,notice,{summary:'已收到'}),{code:'notice_unread'});
  f.team.inbox(a.threadId,notice.id);
  assert.throws(()=>f.team.peerRequest(a.threadId,{kind:'work',employeeId:f.employee().id,taskRef:r.taskRef,parentRequestId:notice.id,instruction:'擅自继续'}),{code:'handoff_parent'});
  assert.throws(()=>f.team.applyWorklog(a,'bad',[{requestId:notice.id,summary:'收到',decision:{question:'新决定'}}],'test'),{code:'notice_scope'});
  const ack={requestId:notice.id,summary:'已收到本版验收通过及说明。'};
  const payload={hook_event_name:'Stop',session_id:a.threadId,turn_id:'notice-turn',cwd:a.cwd,last_assistant_message:'<teamdesk_worklog>'+JSON.stringify({entries:[ack]})+'</teamdesk_worklog>'};
  stopHook(f.s,payload);stopHook(f.s,payload);
  assert.deepEqual(f.s.get('tasks',r.taskRef),accepted);
  assert.equal(f.s.list('records').filter(x=>x.requestId===notice.id).length,1);
  const receipt=f.s.list('records').find(x=>x.requestId===notice.id);assert.equal(receipt.authority,'acceptance_receipt');assert.equal(receipt.acceptanceRevision,before.revision);
  const snapshot=f.snapshot();Object.assign(snapshot.employees.find(e=>e.id===a.id),{activeTurnId:'notice-turn',activeTaskRef:r.taskRef,runtime:'task_started'});
  snapshot.requests.find(x=>x.id===notice.id).nativeTurnId='notice-turn';
  assert.equal(taskAcceptance(accepted,snapshot),'accepted_complete');assert.equal(f.s.get('requests',notice.id).state,'recorded');
});

test('rejected acceptance creates rework on the same task and later evidence needs new acceptance', t => {
  const f=fixture(t),a=f.employee(),r=f.submit(a);f.report(a,r);const task=f.s.get('tasks',r.taskRef);
  const rejected=f.team.acceptTask(task.id,{revision:task.revision,verdict:'rejected',note:'补充边界'});
  const request=f.s.get('requests',rejected.acceptance.notificationRequestId);
  assert.equal(request.kind,'acceptance_rework');assert.equal(request.mode,'steer');assert.equal(request.taskRef,r.taskRef);
  f.team.inbox(a.threadId,request.id);f.report(a,request);
  assert.equal(f.s.get('tasks',task.id).revision,task.revision+1);assert.equal(taskAcceptance(f.s.get('tasks',task.id),f.snapshot()),'awaiting_acceptance');
});

test('department and document HTTP mutations require token and retain immutable versions across restarts', async t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'teamdesk-workspace-http-'));
  const app=createApp({root,home:path.join(root,'codex'),port:0,nativeConnection:false}),address=await app.listen();
  t.after(async()=>{await new Promise(resolve=>app.close(resolve));fs.rmSync(root,{recursive:true,force:true});});
  const base='http://127.0.0.1:'+address.port,b=await(await fetch(base+'/api/bootstrap')).json();
  const module=await fetch(base+'/workspace-ui.js');assert.equal(module.status,200);assert.match(module.headers.get('content-type'),/javascript/);assert.match(await module.text(),/export function workspaceUI/);
  const post=(url,data,token=b.token,key=randomUUID())=>fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json','X-TeamDesk-Token':token,'Idempotency-Key':key},body:JSON.stringify(data)});
  assert.equal((await post('/api/departments',{name:'设计'},'bad')).status,403);
  const dep=await(await post('/api/departments',{name:'设计',responsibilities:'原型与交互'})).json();assert.ok(dep.id);
  const key=randomUUID(),input={title:'设计约定',kind:'rules',departmentId:dep.id,status:'effective',content:'先明确用户旅程'};
  const doc=await(await post('/api/resources',input,b.token,key)).json();assert.equal((await(await post('/api/resources',input,b.token,key)).json()).id,doc.id);
  const edit=await post('/api/resources/'+doc.id+'/edit',{...input,revision:doc.revision,status:'draft',content:'待评审修订'});assert.equal(edit.status,200);
  assert.equal((await post('/api/resources/'+doc.id+'/edit',{...input,revision:1})).status,409);
  const history=await(await fetch(base+'/api/resources/'+doc.id+'/history')).json();assert.equal(history.items.length,2);
  const state=await(await fetch(base+'/api/state')).json();assert.ok(state.resources.find(d=>d.id===doc.id));assert.ok(state.departments.find(d=>d.id===dep.id));
  assert.equal(state.resources.find(d=>d.id===doc.id).content,undefined);
  const exported=await(await fetch(base+'/api/export')).json();assert.equal(exported.documentVersions.filter(v=>v.documentId===doc.id).length,2);
  const reopened=new Store(root);const team=new Team(reopened);assert.equal(team.workspace.document(doc.id).revision,2);reopened.close();
});

test('department membership and delete HTTP routes enforce CSRF, idempotency and preserve state after reopening', async t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'teamdesk-membership-http-'));
  const app=createApp({root,home:root,port:0,nativeConnection:false}),address=await app.listen();
  t.after(async()=>{await new Promise(resolve=>app.close(resolve));fs.rmSync(root,{recursive:true,force:true});});
  const base='http://127.0.0.1:'+address.port,b=await(await fetch(base+'/api/bootstrap')).json();
  const post=(url,data,key=randomUUID(),token=b.token)=>fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json','X-TeamDesk-Token':token,'Idempotency-Key':key},body:JSON.stringify(data)});
  const team=new Team(app.store),e=team.createEmployee({name:'成员',role:'QA',group:'测试',bindingMode:'existing',threadId:randomUUID(),cwd:root});
  const destination=team.workspace.saveDepartment(null,{name:'研发'}),move={departmentId:destination.id,revision:0};
  assert.equal((await post('/api/employees/'+e.id+'/department',move,randomUUID(),'bad')).status,403);
  const key=randomUUID(),first=await post('/api/employees/'+e.id+'/department',move,key);assert.equal(first.status,200);
  const moved=await first.json();assert.equal(moved.departmentId,destination.id);
  assert.deepEqual(await(await post('/api/employees/'+e.id+'/department',move,key)).json(),moved);
  assert.equal((await post('/api/employees/'+e.id+'/department',{departmentId:null,revision:0})).status,409);
  const deletion={revision:destination.revision,members:[{id:e.id,revision:1}],targetDepartmentId:null},deleteKey=randomUUID();
  assert.equal((await post('/api/departments/'+destination.id+'/delete',deletion,randomUUID(),'bad')).status,403);
  const deleted=await(await post('/api/departments/'+destination.id+'/delete',deletion,deleteKey)).json();assert.equal(deleted.archived,true);
  assert.deepEqual(await(await post('/api/departments/'+destination.id+'/delete',deletion,deleteKey)).json(),deleted);
  const state=await(await fetch(base+'/api/state')).json();assert.equal(state.employees.find(x=>x.id===e.id).departmentId,null);
  assert.equal(state.employees.find(x=>x.id===e.id).group,'未分配');
  const reopened=new Store(root);assert.equal(reopened.get('employees',e.id).threadId,e.threadId);assert.equal(reopened.get('employees',e.id).departmentId,null);
  assert.equal(reopened.get('departments',destination.id).archived,true);reopened.close();
});

test('resource lifecycle HTTP routes enforce CSRF, idempotency and keep history after restart', async t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'teamdesk-resource-http-'));
  const app=createApp({root,home:root,port:0,nativeConnection:false}),address=await app.listen();
  t.after(async()=>{await new Promise(resolve=>app.close(resolve));fs.rmSync(root,{recursive:true,force:true});});
  const base='http://127.0.0.1:'+address.port,b=await(await fetch(base+'/api/bootstrap')).json();
  const post=(url,data,key=randomUUID(),token=b.token)=>fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json','X-TeamDesk-Token':token,'Idempotency-Key':key},body:JSON.stringify(data)});
  let d=await(await post('/api/resources',{title:'HTTP 生命周期',kind:'reference',content:'独立验证',status:'draft'})).json();
  for(const action of ['publish','delete','restore']) {
    const route='/api/resources/'+d.id+'/'+action, input={revision:d.revision}, key=randomUUID();
    assert.equal((await post(route,input,randomUUID(),'bad')).status,403);
    const response=await post(route,input,key);assert.equal(response.status,200);
    d=await response.json();assert.deepEqual(await(await post(route,input,key)).json(),d);
    assert.equal((await post(route,input)).status,409);
  }
  assert.equal(d.status,'draft');assert.equal(d.effectiveRevision,null);assert.equal(d.revision,4);
  const history=await(await fetch(base+'/api/resources/'+d.id+'/history')).json();assert.equal(history.items.length,4);
  assert.equal((await post('/api/resources/SYS-entry/delete',{revision:1})).status,403);
  const reopened=new Store(root),workspace=new Team(reopened).workspace;
  assert.equal(workspace.document(d.id).content,'独立验证');assert.equal(workspace.document(d.id).status,'draft');
  assert.equal(workspace.document(d.id,{revision:2}).status,'effective');reopened.close();
});
