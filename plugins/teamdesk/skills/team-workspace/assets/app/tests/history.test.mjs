import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {randomUUID} from 'node:crypto';
import {Store} from '../src/db.mjs';import {Team} from '../src/service.mjs';import {collaborationView} from '../src/collaboration-view.mjs';
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'td-history-')),s=new Store(root),team=new Team(s);
 const employee=name=>team.createEmployee({name,role:'Dev',bindingMode:'existing',threadId:randomUUID(),cwd:root});
 t.after(()=>{try{s.close();}catch{}fs.rmSync(root,{recursive:true,force:true});});return {root,s,team,employee};
}
test('replay keeps historical names, department, binding, task state and acceptance',t=>{
 const {s,team,employee}=fixture(t),a=employee('Original'),b=employee('Reviewer');
 const dept=team.workspace.saveDepartment(null,{name:'Engineering',responsibilities:'PRIVATE_DEPARTMENT_TEXT'});
 team.changeEmployeeDepartment(a.id,{departmentId:dept.id,revision:0});
 const submitted=team.submit({employeeId:a.id,mode:'fifo',instruction:'PRIVATE_BUSINESS_INPUT',participants:[b.id]});
 const before=collaborationView(s);
 const e=s.get('employees',a.id);e.name='Renamed';e.departmentId=null;e.threadId=randomUUID();e.bindingVersion++;s.put('employees',e.id,e);
 const task=s.get('tasks',submitted.taskRef);task.status='completed';task.acceptance={verdict:'accepted',revision:task.revision};s.put('tasks',task.id,task);
 const old=collaborationView(s,{at:before.cutoff});
 assert.equal(old.snapshot.employees.find(x=>x.id===a.id).name,'Original');assert.equal(old.snapshot.employees.find(x=>x.id===a.id).departmentId,dept.id);
 assert.equal(old.snapshot.tasks[0].status,'unregistered');assert.equal(old.snapshot.tasks[0].acceptance,undefined);
 assert.notEqual(collaborationView(s).snapshot.employees.find(x=>x.id===a.id).threadId,old.snapshot.employees.find(x=>x.id===a.id).threadId);
 assert.ok(!JSON.stringify(old).includes('PRIVATE_BUSINESS_INPUT'));assert.ok(!JSON.stringify(old).includes('PRIVATE_DEPARTMENT_TEXT'));
});
test('all views use one committed cutoff; failed transactions and duplicate writes create no phantom history',t=>{
 const {s}=fixture(t),before=collaborationView(s).cutoff;
 assert.throws(()=>s.tx(()=>{s.put('employees','a',{id:'a',name:'A'});throw Error('rollback');}));
 assert.equal(collaborationView(s).cutoff,before);
 s.tx(()=>{s.put('employees','a',{id:'a',name:'A'});s.put('employees','b',{id:'b',name:'B'});});
 const current=collaborationView(s);assert.equal(current.counts.employees,2);
 const row=s.db.prepare("SELECT seq,commit_seq FROM collaboration_history WHERE entity='employees' ORDER BY seq LIMIT 1").get();
 assert.throws(()=>collaborationView(s,{at:row.seq}),{code:'history_boundary'});
 assert.equal(row.commit_seq,current.cutoff);
 s.put('employees','a',{id:'a',name:'A'});assert.equal(collaborationView(s).cutoff,current.cutoff);
});
test('old schema gets an explicit baseline and restart retains all committed versions',t=>{
 const {root,s,employee}=fixture(t);employee('Existing');
 s.remove('meta','collaborationHistory');s.db.exec('DROP TABLE collaboration_history');s.close();
 const upgraded=new Store(root),v=collaborationView(upgraded);assert.equal(v.counts.employees,1);
 assert.equal(v.cutoff,v.range.baselineSeq);assert.ok(v.timeline.every(x=>x.reason==='baseline'));
 assert.throws(()=>collaborationView(upgraded,{at:v.range.baselineSeq-1}),{code:'history_range'});
 upgraded.close();const next=new Store(root);assert.equal(collaborationView(next).cutoff,v.cutoff);next.close();
});
test('work topology preserves mesh and task scope; pagination has no duplicate or skipped row',t=>{
 const {s,team,employee}=fixture(t),a=employee('A'),b=employee('B'),c=employee('C');
 const task=team.submit({employeeId:a.id,mode:'fifo',instruction:'mesh'});team.inbox(a.threadId,task.requestId);
 const ab=team.peerRequest(a.threadId,{employeeId:b.id,taskRef:task.taskRef,kind:'work',parentRequestId:task.requestId,instruction:'review'});
 team.inbox(b.threadId,ab.id);
 const bc=team.peerRequest(b.threadId,{employeeId:c.id,taskRef:task.taskRef,kind:'work',parentRequestId:ab.id,instruction:'check'});
 const v=collaborationView(s,{taskRef:task.taskRef,limit:2});assert.equal(v.edges.length,2);assert.equal(v.edges[1].from,b.id);assert.equal(v.edges[1].parentRequestId,ab.id);assert.equal(v.counts.waiting,2);
 const seen=[];let before;
 do{const page=collaborationView(s,{taskRef:task.taskRef,limit:2,before});seen.push(...page.timeline.map(x=>x.seq));before=page.nextBefore;}while(before);
 assert.equal(new Set(seen).size,seen.length);assert.deepEqual(seen,collaborationView(s,{taskRef:task.taskRef,limit:200}).timeline.map(x=>x.seq));
 assert.equal(collaborationView(s,{taskRef:task.taskRef}).edges.find(e=>e.id===bc.id).label,'投递进展尚未确认');
});
test('native question, answer and tool bodies are excluded from metadata versions',t=>{
 const {s,employee}=fixture(t),e=employee('A');
 s.put('events','e',{id:'e',employeeId:e.id,kind:'native_question',questions:[{question:'PRIVATE_QUESTION'}],arguments:'PRIVATE_ARGS',output:'PRIVATE_OUTPUT'});
 s.put('decisions','d',{id:'d',state:'pending',question:'PRIVATE_QUESTION',answer:'PRIVATE_ANSWER',command:'PRIVATE_COMMAND'});
 const raw=s.db.prepare('SELECT data FROM collaboration_history').all().map(r=>r.data).join('');
 assert.ok(!raw.includes('PRIVATE_'));assert.equal(collaborationView(s).snapshot.events.length,1);
});
test('history API rejects invalid bounds and deleted entities stay in past snapshots',t=>{
 const {s,employee}=fixture(t),e=employee('A'),before=collaborationView(s).cutoff;
 s.remove('employees',e.id);assert.equal(collaborationView(s).counts.employees,0);assert.equal(collaborationView(s,{at:before}).counts.employees,1);
 for(const options of [{at:-1},{at:1.5},{at:999999},{limit:201},{limit:0},{before:'oops'}])assert.throws(()=>collaborationView(s,options));
});
test('a pre-upgrade writer is caught up as an observation without rewriting earlier snapshots',t=>{
 const {s,employee}=fixture(t),e=employee('Before upgrade'),before=collaborationView(s);
 const changed={...s.get('employees',e.id),name:'Late old hook update'};
 s.db.prepare('UPDATE employees SET data=?,updated_at=? WHERE id=?').run(JSON.stringify(changed),new Date().toISOString(),e.id);
 const current=collaborationView(s);assert.equal(current.snapshot.employees[0].name,changed.name);
 assert.equal(current.timeline[0].reason,'reconciled');
 assert.equal(collaborationView(s,{at:before.cutoff}).snapshot.employees[0].name,e.name);
 assert.equal(collaborationView(s).cutoff,current.cutoff);
 s.db.prepare('DELETE FROM employees WHERE id=?').run(e.id);
 assert.equal(collaborationView(s).counts.employees,0);
 assert.equal(collaborationView(s,{at:current.cutoff}).counts.employees,1);
});
test('handling a result does not remove a handoff from follow-up until its completed work report exists',t=>{
 const {s,team,employee}=fixture(t),a=employee('A'),b=employee('B');
 const task=team.submit({employeeId:a.id,mode:'fifo',instruction:'review'});team.inbox(a.threadId,task.requestId);
 const work=team.peerRequest(a.threadId,{employeeId:b.id,taskRef:task.taskRef,kind:'work',parentRequestId:task.requestId,instruction:'review'});team.inbox(b.threadId,work.id);
 const result=team.peerRequest(b.threadId,{employeeId:a.id,taskRef:task.taskRef,kind:'result',replyToRequestId:work.id,outcome:'completed',instruction:'review complete'});team.inbox(a.threadId,result.id);
 s.put('records','handling',{id:'handling',employeeId:a.id,taskRef:task.taskRef,recordedAt:new Date().toISOString(),handledResults:[{resultRequestId:result.id,disposition:'accepted'}]});
 assert.equal(collaborationView(s).counts.waiting,1);
 s.put('records','work-report',{id:'work-report',requestId:work.id,employeeId:b.id,taskRef:task.taskRef,status:'completed',producedResultRequestId:result.id,recordedAt:new Date().toISOString()});
 assert.equal(collaborationView(s).counts.waiting,0);
});
