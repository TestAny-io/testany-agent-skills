import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store } from '../src/db.mjs';
import { Team } from '../src/service.mjs';
import { skillCapability } from '../src/capabilities.mjs';
import { taskProgress, taskAcceptance } from '../public/task-progress.js';

function fixture(t, count = 4) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'teamdesk-collaboration-'));
  const s = new Store(root), team = new Team(s);
  t.after(() => { s.close(); fs.rmSync(root, { recursive: true, force: true }); });
  const actors = Array.from({ length: count }, (_, i) => team.createEmployee({ name: 'Actor ' + i, role: '跨职能', group: '产品团队',
    bindingMode: 'existing', threadId: randomUUID(), cwd: root }));
  const task = (...participants) => team.submit({ employeeId: actors[0].id, mode: 'fifo', instruction: '写一份 PRD', participants: participants.map(a => a.id) });
  const report = (actor, request, extra = {}) => team.applyWorklog(actor, randomUUID(), [{ requestId: request.requestId || request.id,
    ownerEmployeeId: actors[0].id, taskId: 'BUSINESS-1', title: '测试协作', category: '任意业务', status: 'completed',
    summary: '实际工作结果', ...extra }], 'test-only');
  const work = (from, to, parent) => {
    team.inbox(from.threadId, parent.requestId || parent.id);
    return team.peerRequest(from.threadId, { kind: 'work', employeeId: to.id, taskRef: parent.taskRef,
      parentRequestId: parent.requestId || parent.id, purpose: from.name + ' 的请求', instruction: '核对所附材料', completionCriteria: '给出实际结论' });
  };
  const result = (from, to, parent, outcome = 'completed') => {
    team.inbox(from.threadId, parent.id);
    return team.peerRequest(from.threadId, { kind: 'result', employeeId: to.id, taskRef: parent.taskRef,
      replyToRequestId: parent.id, outcome, instruction: outcome === 'completed' ? '已检查材料，结论和限制如下' : '缺少输入' });
  };
  const handle = (actor, result, disposition = 'accepted') => {
    team.inbox(actor.threadId, result.id);
    return report(actor, result, { handledResults: [{ resultRequestId: result.id, disposition, summary: '已核对结果，并纳入交付或提出具体整改' }] });
  };
  const finish = (from, to, w) => { const r = result(to, from, w); report(to, w); handle(from, r); return r; };
  const snapshot = () => ({ employees: s.list('employees'), tasks: s.list('tasks'), requests: s.list('requests'), records: s.list('records'), events: [], operations: s.list('operations'), health: {} });
  const progress = r => team.collaboration(s.get('tasks', r.taskRef));
  return { root, s, team, actors, task, report, work, result, handle, finish, progress, snapshot };
}

test('skill frontmatter uses YAML strings, preserves descriptions and hashes; never guesses from body', t => {
  const f = fixture(t), file = path.join(f.root, 'SKILL.md');
  const read = text => { fs.writeFileSync(file, text); return skillCapability(file); };
  assert.equal(read('---\nname: "quality: review"\ndescription: >-\n  Read documents\n  and report gaps.\n---\nbody').description, 'Read documents and report gaps.');
  assert.equal(read("---\nname: reviewer\ndescription: 'Review: it''s useful' # comment\n---\n").description, "Review: it's useful");
  assert.equal(read('---\nname: reviewer\ndescription: |\n  First line\n  Second line\n---\n').description, 'First line\nSecond line\n');
  assert.equal(read('---\nname: reviewer\n---\ndescription: do not borrow this body').status, 'missing_description');
  assert.equal(read('---\nname: reviewer\ndescription: a\ndescription: b\n---\n').status, 'unavailable');
  assert.equal(read('---\nname: reviewer\ndescription: !!js/function "function() {}"\n---\n').status, 'unavailable');
  const before = read('---\nname: review\ndescription: v1\n---\n');
  const after = read('---\nname: review\ndescription: v2\n---\n');
  assert.notEqual(before.sha256, after.sha256);
  assert.equal(after.description, 'v2');
  fs.unlinkSync(file); assert.equal(skillCapability(file).status, 'unavailable');
});

test('specified collaborators have immutable capability snapshots, shared discovery and explicit dispatch requirements', t => {
  const f = fixture(t), [a,b,c] = f.actors, file = path.join(f.root, 'SKILL.md');
  fs.writeFileSync(file, '---\nname: prd-reviewer\ndescription: >-\n  Review PRD\n  and find gaps.\n---\n');
  f.team.editEmployee(b.id, { skills: [file] });
  const r = f.task(b), original = f.s.get('tasks', r.taskRef);
  assert.deepEqual(original.requiredCollaboratorIds, [b.id]);
  assert.equal(original.requiredCollaboratorsSnapshot[0].skills[0].description, 'Review PRD and find gaps.');
  fs.writeFileSync(file, '---\nname: changed\ndescription: Changed scope\n---\n');
  const inbox = f.team.inbox(a.threadId, r.requestId);
  assert.equal(inbox.directory, undefined);
  assert.equal(f.team.query(a.threadId, 'employee', b.id).employee.skills[0].description, 'Changed scope');
  assert.equal(inbox.tasks[0].requiredCollaboratorsSnapshot, undefined);
  assert.equal(f.team.query(a.threadId, 'task', r.taskRef).task.requiredCollaboratorsSnapshot[0].skills[0].description, 'Review PRD and find gaps.');
  assert.match(f.team.collaborationPrompt(r.taskRef), /必须实际参与/);
  assert.doesNotMatch(f.team.collaborationPrompt(r.taskRef), /Review PRD and find gaps/);
  assert.equal(f.s.list('requests').length, 1, 'no central automatic peer dispatch');
  f.work(a,c,r);
  assert.deepEqual(f.s.get('tasks', r.taskRef).requiredCollaboratorIds, [b.id]);
  assert.deepEqual(f.s.get('tasks', r.taskRef).participants, [b.id,c.id]);
});

test('owner completion and receipts alone never pass required collaboration or acceptance', t => {
  const f = fixture(t), [a,b] = f.actors, r = f.task(b);
  f.report(a,r);
  let task = f.s.get('tasks', r.taskRef);
  assert.equal(task.status, 'completed', 'preserve raw owner report');
  assert.equal(taskProgress(task,f.snapshot()).state, 'collaboration_pending');
  assert.equal(taskAcceptance(task,f.snapshot()), null);
  assert.throws(() => f.team.acceptTask(task.id,{ revision: task.revision, verdict:'accepted' }), /协作/);
  const w = f.work(a,b,r); f.team.inbox(b.threadId,w.id);
  assert.equal(f.progress(r).complete,false);
  const response = f.result(b,a,w);
  f.handle(a,response);
  assert.equal(f.progress(r).edges[0].state,'awaiting_work_record');
  f.report(b,w);
  assert.equal(f.progress(r).complete,true);
  task = f.s.get('tasks',r.taskRef);
  assert.throws(() => f.team.acceptTask(task.id,{ revision:task.revision, verdict:'accepted',collaborationRevision:0 }),/更新/);
  f.team.acceptTask(task.id,{ revision:task.revision, verdict:'accepted',collaborationRevision:task.collaborationRevision });
  assert.equal(taskAcceptance(f.s.get('tasks',task.id),f.snapshot()),'accepted_complete');
});

test('mesh A to B to C returns C to B; only the initiator handles each result', t => {
  const f = fixture(t), [a,b,c] = f.actors, r = f.task(b,c);
  f.report(a,r,{status:'in_progress'});
  const ab = f.work(a,b,r), bc = f.work(b,c,ab);
  const cb = f.finish(b,c,bc);
  assert.equal(f.s.get('requests',cb.id).employeeId,b.id);
  assert.equal(f.s.get('tasks',r.taskRef).ownerEmployeeId,a.id);
  assert.equal(f.s.get('tasks',r.taskRef).status,'in_progress');
  assert.deepEqual(f.progress(r).missing.map(x=>x.employeeId),[b.id]);
  f.finish(a,b,ab);
  assert.equal(f.progress(r).complete,true);
  assert.equal(f.s.list('requests').filter(x=>x.kind==='work').length,2,'results do not create reverse work');
  assert.ok(!f.s.list('requests').some(x=>x.fromEmployeeId===c.id && x.employeeId===a.id),'owner never receives C raw reply');
});

test('diamond collaboration keeps two requests to D separate; a result cannot close both', t => {
  const f = fixture(t), [a,b,c,d] = f.actors, r = f.task(b,c,d);
  const ab=f.work(a,b,r), ac=f.work(a,c,r), bd=f.work(b,d,ab), cd=f.work(c,d,ac);
  const db=f.finish(b,d,bd);
  assert.equal(f.progress(r).edges.find(x=>x.id===cd.id).state,'awaiting_delivery');
  assert.throws(()=>f.handle(c,db),/不属于/);
  f.finish(a,b,ab);
  f.finish(c,d,cd);
  f.finish(a,c,ac);
  assert.equal(f.progress(r).complete,true);
  assert.equal(f.progress(r).edges.length,4);
});

test('mesh can return local work to the owner without completing the whole business', t => {
  const f=fixture(t),[a,b,c]=f.actors,r=f.task(b,c);
  f.report(a,r,{status:'in_progress',summary:'整体业务仍在推进'});
  const ab=f.work(a,b,r),ba=f.work(b,a,ab),ac=f.work(a,c,ba);
  f.finish(a,c,ac); // A handles a result inside B's request, not the root task.
  let task=f.s.get('tasks',r.taskRef);
  assert.equal(task.status,'in_progress');assert.equal(task.summary,'整体业务仍在推进');
  f.finish(b,a,ba);
  task=f.s.get('tasks',r.taskRef);
  assert.equal(task.status,'in_progress');
  const aLocalReports=f.s.list('records').filter(x=>x.employeeId===a.id && x.requestId!==r.requestId);
  assert.ok(aLocalReports.length>=2 && aLocalReports.every(x=>x.authority==='contributor_report'));
  f.finish(a,b,ab);
  assert.equal(f.progress(r).complete,true);
  assert.equal(f.s.get('tasks',r.taskRef).status,'completed');
});

test('wrong parent, wrong reply recipient and foreign results fail without mutation', t => {
  const f=fixture(t),[a,b,c]=f.actors,r=f.task(b),ab=f.work(a,b,r);
  const count=f.s.list('requests').length;
  assert.throws(()=>f.team.peerRequest(c.threadId,{kind:'work',employeeId:b.id,taskRef:r.taskRef,parentRequestId:ab.id,instruction:'wrong'}),/本人参与/);
  f.team.inbox(b.threadId,ab.id);
  assert.throws(()=>f.team.peerRequest(b.threadId,{kind:'result',employeeId:c.id,taskRef:r.taskRef,replyToRequestId:ab.id,outcome:'completed',instruction:'wrong target'}),/真实发起方/);
  assert.throws(()=>f.team.peerRequest(b.threadId,{kind:'work',employeeId:c.id,taskRef:r.taskRef,parentRequestId:r.requestId,instruction:'wrong parent'}),/本员工/);
  assert.equal(f.s.list('requests').length,count);
});

test('blocked/rework results stay open; each revised result needs its own handling', t => {
  const f=fixture(t),[a,b]=f.actors,r=f.task(b),ab=f.work(a,b,r);
  f.report(b,ab,{status:'blocked'});
  const blocked=f.result(b,a,ab,'blocked');
  assert.throws(()=>f.handle(a,blocked),/受阻结果/);
  assert.equal(f.progress(r).complete,false);
  f.report(b,ab);
  const revision1=f.result(b,a,ab);f.handle(a,revision1,'changes_requested');
  assert.equal(f.progress(r).edges[0].state,'changes_requested');
  const revision2=f.result(b,a,ab); f.handle(a,revision2);
  assert.equal(f.progress(r).complete,false,'old work report cannot substantiate a revised result');
  f.report(b,ab);
  assert.equal(f.progress(r).complete,true);
  const revision3=f.result(b,a,ab);
  assert.equal(f.progress(r).complete,false,'old handling cannot accept a new result');
  f.handle(a,revision3);f.report(b,ab);assert.equal(f.progress(r).complete,true);
});

test('legacy participants are not silently reclassified as user requirements', t => {
  const f=fixture(t),[a,b]=f.actors,r=f.task(b);f.report(a,r);
  const task=f.s.get('tasks',r.taskRef);delete task.collaborationVersion;delete task.requiredCollaboratorIds;delete task.requiredCollaboratorsSnapshot;
  f.s.put('tasks',task.id,task);
  assert.equal(f.progress(r).enforced,false);assert.equal(f.progress(r).required.length,0);
  assert.equal(taskAcceptance(task,f.snapshot()),'awaiting_acceptance');
});
