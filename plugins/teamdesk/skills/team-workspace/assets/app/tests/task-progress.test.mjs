import test from 'node:test';
import assert from 'node:assert/strict';
import { taskProgress, matchesTaskProgress } from '../public/task-progress.js';

function fixture() {
  const task = {id:'task-a',ownerEmployeeId:'emp-a',businessId:null,title:'等待负责人建档',goal:'我需要一位研究数论专家的提示词',category:'',stage:'待接收',status:'unregistered',revision:0,acceptance:null};
  const employee = {id:'emp-a',threadId:'thread-a',bindingVersion:1,activeTurnId:'turn-a',activeTaskRef:'task-a',runtime:'task_started'};
  const request = {id:'req-a',taskRef:'task-a',employeeId:'emp-a',state:'received',nativeTurnId:'turn-a',receivedAt:'2026-09-17T04:42:14.939Z',sequence:1};
  const event = {employeeId:'emp-a',threadId:'thread-a',bindingVersion:1,turnId:'turn-a',kind:'runtime',state:'task_started',at:'2026-09-17T04:42:14.190Z'};
  const snapshot = {employees:[employee],requests:[request],operations:[{requestId:'req-a',threadId:'thread-a',bindingVersion:1}],events:[event],health:{connection:{online:true}}};
  return {task,employee,request,event,snapshot};
}
test('an unregistered task with its own native turn is working before the Stop report', () => {
  const {task,snapshot}=fixture(),before=JSON.stringify({task,snapshot});
  const view=taskProgress(task,snapshot);
  assert.equal(view.state,'executing');assert.equal(view.bucket,'working');assert.equal(view.title,task.goal);
  assert.equal(view.stage,'业务信息待负责人补充');
  assert.equal(matchesTaskProgress(task,snapshot,'in_progress'),true);assert.equal(matchesTaskProgress(task,snapshot,'queued'),false);
  assert.equal(matchesTaskProgress(task,snapshot,'unregistered'),true);
  assert.equal(JSON.stringify({task,snapshot}),before,'presentation must not generate owner metadata');
});
test('FIFO behind an active task stays waiting and cannot borrow the employee activity', () => {
  const {task,snapshot}=fixture();const queued={...task,id:'task-b',goal:'第二项业务'};
  snapshot.requests.push({id:'req-b',taskRef:'task-b',employeeId:'emp-a',state:'native_queued',sequence:2});
  snapshot.operations.push({requestId:'req-b',threadId:'thread-a',bindingVersion:1});
  assert.equal(taskProgress(queued,snapshot).bucket,'waiting');assert.equal(taskProgress(queued,snapshot).state,'native_queued');
  assert.equal([task,queued].filter(t=>taskProgress(t,snapshot).bucket==='working').length,1);
  assert.equal([task,queued].filter(t=>taskProgress(t,snapshot).bucket==='waiting').length,1);
});
test('native receipt and turn completion do not fabricate a completed business', () => {
  const {task,snapshot,employee,event}=fixture();employee.activeTurnId=null;employee.activeTaskRef=null;employee.runtime='task_complete';
  snapshot.events.push({...event,state:'task_complete',at:'2026-09-17T04:45:00.000Z'});
  assert.equal(taskProgress(task,snapshot).state,'awaiting_record');assert.equal(taskProgress(task,snapshot).bucket,'working');
  task.businessId='BIZ-1';task.title='负责人填写的名称';task.stage='交付';task.status='completed';task.revision=1;
  assert.equal(taskProgress(task,snapshot).state,'completed');assert.equal(taskProgress(task,snapshot).bucket,'finished');assert.equal(taskProgress(task,snapshot).title,'负责人填写的名称');
});
test('active follow-up is visible without overwriting the prior owner report or acceptance', () => {
  const {task,snapshot}=fixture();Object.assign(task,{businessId:'BIZ-1',status:'completed',revision:3,acceptance:{revision:3,verdict:'accepted'}});
  const before=JSON.stringify(task);assert.equal(taskProgress(task,snapshot).state,'executing');assert.equal(taskProgress(task,snapshot).bucket,'working');assert.equal(JSON.stringify(task),before);
});
test('stale bindings and collaborator turns cannot mark the owner task executing', () => {
  const {task,snapshot,employee,event}=fixture();employee.bindingVersion=2;
  assert.equal(taskProgress(task,snapshot).bucket,'waiting');
  snapshot.events.push({...event,employeeId:'emp-b',threadId:'thread-b',bindingVersion:1});
  snapshot.employees.push({id:'emp-b',threadId:'thread-b',bindingVersion:1,activeTurnId:'turn-a',activeTaskRef:task.id,runtime:'task_started'});
  assert.notEqual(taskProgress(task,snapshot).state,'executing');
});
test('disconnected state retains evidence of starting without claiming live execution', () => {
  const {task,snapshot}=fixture();snapshot.health.connection.online=false;
  assert.equal(taskProgress(task,snapshot).state,'execution_unknown');assert.equal(taskProgress(task,snapshot).bucket,'working');
  snapshot.health.connection.online=true;assert.equal(taskProgress(task,snapshot).state,'executing');
});
test('interruption and receipt remain distinct from waiting for dispatch', () => {
  const {task,snapshot,employee,event}=fixture();employee.activeTurnId=null;employee.activeTaskRef=null;snapshot.events=[];
  assert.equal(taskProgress(task,snapshot).state,'received');
  snapshot.events.push({...event,state:'turn_aborted'});assert.equal(taskProgress(task,snapshot).state,'turn_aborted');
  snapshot.events=[];snapshot.requests[0].receivedAt=null;snapshot.requests[0].nativeTurnId=null;snapshot.requests[0].state='saved';
  assert.equal(taskProgress(task,snapshot).state,'saved');assert.equal(taskProgress(task,snapshot).bucket,'waiting');
});

test('awaiting acceptance and completed counts use the current delivery revision', async () => {
  const {taskAcceptance}=await import('../public/task-progress.js');
  const {task,snapshot,employee}=fixture();employee.activeTurnId=null;employee.activeTaskRef=null;
  Object.assign(task,{businessId:'BIZ-1',status:'completed',revision:2});
  assert.equal(taskAcceptance(task,snapshot),'awaiting_acceptance');
  assert.equal(matchesTaskProgress(task,snapshot,'awaiting_acceptance'),true);
  task.acceptance={verdict:'accepted',revision:2};
  assert.equal(taskAcceptance(task,snapshot),'accepted_complete');
  assert.equal(matchesTaskProgress(task,snapshot,'accepted_complete'),true);
  assert.equal(matchesTaskProgress(task,snapshot,'awaiting_acceptance'),false);
  task.revision=3;
  assert.equal(taskAcceptance(task,snapshot),'awaiting_acceptance','new delivery needs fresh acceptance');
  assert.equal(matchesTaskProgress(task,snapshot,'accepted_complete'),false);
});
test('rejected, cancelled and actively reworked tasks are not counted as completed', async () => {
  const {taskAcceptance}=await import('../public/task-progress.js');
  const {task,snapshot,employee}=fixture();Object.assign(task,{businessId:'BIZ-1',status:'completed',revision:2,acceptance:{verdict:'accepted',revision:2}});
  assert.equal(taskAcceptance(task,snapshot),null,'active follow-up is work in progress');
  employee.activeTurnId=null;employee.activeTaskRef=null;task.acceptance.verdict='rejected';
  assert.equal(taskAcceptance(task,snapshot),'rejected');assert.equal(matchesTaskProgress(task,snapshot,'awaiting_acceptance'),false);
  task.status='cancelled';assert.equal(taskAcceptance(task,snapshot),null);
  task.status='in_progress';assert.equal(taskAcceptance(task,snapshot),null);
});
