import {requireValue} from './db.mjs';
import {historyTables} from './metadata-history.mjs';
import {deliveryProgress} from '../public/delivery.js';
import {collaborationProgress} from '../public/collaboration.js';
const integer=(value,fallback)=>value===undefined||value===null||value===''?fallback:(/^\d+$/.test(String(value))?Number(value):NaN);
export function collaborationView(store, options={}) {
 store.reconcileHistory();
 const baseline=store.get('meta','collaborationHistory');
 const max=store.db.prepare('SELECT MAX(seq) AS seq FROM collaboration_history').get().seq||0;
 const cutoff=integer(options.at,max),before=integer(options.before,cutoff+1),limit=integer(options.limit,100);
 requireValue(Number.isSafeInteger(cutoff)&&cutoff>=baseline.baselineSeq&&cutoff<=max,'history_range','所选时间不在可还原历史范围内',400);
 requireValue(cutoff===0||!!store.db.prepare('SELECT 1 FROM collaboration_history WHERE seq=? AND commit_seq=seq').get(cutoff),'history_boundary','请选择完整事务对应的历史时刻',400);
 requireValue(Number.isSafeInteger(before)&&before>=1&&before<=max+1&&Number.isInteger(limit)&&limit>=1&&limit<=200,'history_page','历史分页范围无效',400);
 const snapshot=Object.fromEntries(historyTables.map(t=>[t,[]]));
 snapshot.settings={};snapshot.health={};snapshot.historical=options.at!==undefined&&options.at!==null&&options.at!=='';
 const rows=store.db.prepare('SELECT h.* FROM collaboration_history h JOIN (SELECT entity,entity_id,MAX(seq) AS last FROM collaboration_history WHERE seq<=? GROUP BY entity,entity_id) x ON h.seq=x.last ORDER BY h.seq').all(cutoff);
 for(const row of rows){const data=JSON.parse(row.data);if(!data)continue;if(row.entity==='meta')snapshot.settings=data;else snapshot[row.entity].push(data);}
 for(const employee of snapshot.employees) {
  const runtime=snapshot.runtime.find(r=>r.id===employee.id&&r.threadId===employee.threadId&&r.bindingVersion===employee.bindingVersion);
  employee.runtime=runtime?.status==='active'?'task_started':runtime?.status==='idle'?'task_complete':'not_observed';
  employee.activeTurnId=runtime?.turnId||null;employee.activeTaskRef=runtime?.taskRef||null;
 }
 const selectedTask=options.taskRef||null,selectedDepartment=options.departmentId||null;
 requireValue(!selectedTask||snapshot.tasks.some(t=>t.id===selectedTask)||store.get('tasks',selectedTask),'task_not_in_snapshot','找不到该任务',404);
 requireValue(!selectedDepartment||selectedDepartment==='unassigned'||snapshot.departments.some(d=>d.id===selectedDepartment)||store.get('departments',selectedDepartment),'department_not_in_snapshot','找不到该部门',404);
 const departmentEmployees=new Set(snapshot.employees.filter(e=>!selectedDepartment||(selectedDepartment==='unassigned'?!e.departmentId:e.departmentId===selectedDepartment)).map(e=>e.id));
 const tasks=snapshot.tasks.filter(t=>(!selectedTask||t.id===selectedTask)&&(!selectedDepartment||
  departmentEmployees.has(t.ownerEmployeeId)||t.participants?.some(id=>departmentEmployees.has(id))||
  snapshot.requests.some(r=>r.taskRef===t.id&&(departmentEmployees.has(r.employeeId)||departmentEmployees.has(r.fromEmployeeId)))));
 const taskIds=new Set(tasks.map(t=>t.id)),requests=snapshot.requests.filter(r=>taskIds.has(r.taskRef)).sort((a,b)=>a.sequence-b.sequence);
 const memberIds=new Set(tasks.flatMap(t=>[t.ownerEmployeeId,...(t.participants||[])]));
 requests.forEach(r=>{memberIds.add(r.employeeId);if(r.fromEmployeeId)memberIds.add(r.fromEmployeeId);});
 if(!selectedTask)for(const employee of snapshot.employees)if(!employee.archived&&departmentEmployees.has(employee.id))memberIds.add(employee.id);
 const employees=snapshot.employees.filter(e=>memberIds.has(e.id));
 const departments=snapshot.departments.filter(d=>employees.some(e=>e.departmentId===d.id));
 const edges=requests.filter(r=>r.fromEmployeeId).map(r=>({id:r.id,from:r.fromEmployeeId,to:r.employeeId,taskRef:r.taskRef,kind:r.kind||'note',parentRequestId:r.parentRequestId||null,replyToRequestId:r.replyToRequestId||null,...deliveryProgress(r,snapshot)}));
 const taskViews=tasks.map(t=>({...t,collaboration:collaborationProgress(t,snapshot)}));
 const scoped={...snapshot,employees,departments,tasks:taskViews,requests,
  operations:snapshot.operations.filter(o=>requests.some(r=>r.id===o.requestId)),
  records:snapshot.records.filter(r=>taskIds.has(r.taskRef)),
  decisions:snapshot.decisions.filter(d=>taskIds.has(d.taskRef)||(!selectedTask&&memberIds.has(d.fromEmployeeId))),
  events:snapshot.events.filter(e=>memberIds.has(e.employeeId)&&(taskIds.has(e.taskRef)||requests.some(r=>r.id===e.requestId)||!selectedTask)),
 };
 const placeholders=xs=>xs.map(()=>'?').join(',');
 const clauses=[],params=[Math.min(before,cutoff+1),baseline.baselineSeq];
 if(selectedTask||selectedDepartment) {
  const tids=[...taskIds],mids=[...memberIds],dids=departments.map(d=>d.id);
  if(tids.length){clauses.push('task_ref IN ('+placeholders(tids)+')');params.push(...tids);}
  if(mids.length){clauses.push("(entity IN ('employees','runtime') AND entity_id IN ("+placeholders(mids)+'))');params.push(...mids);}
  if(dids.length){clauses.push("(entity='departments' AND entity_id IN ("+placeholders(dids)+'))');params.push(...dids);}
 }
 const filter=selectedTask||selectedDepartment?' AND ('+(clauses.join(' OR ')||'0')+')':'';
 params.push(limit+1);
 const timeline=store.db.prepare('SELECT seq,commit_seq,at,entity,entity_id,task_ref,data,reason FROM collaboration_history WHERE seq<? AND seq>=?'+filter+' ORDER BY seq DESC LIMIT ?').all(...params);
 const more=timeline.length>limit, page=timeline.slice(0,limit);
 return {scope:{taskRef:selectedTask,departmentId:selectedDepartment},historical:snapshot.historical,cutoff,
  range:{baselineSeq:baseline.baselineSeq,maxSeq:max,startedAt:baseline.startedAt},
  at:store.db.prepare('SELECT at FROM collaboration_history WHERE seq=?').get(cutoff)?.at||baseline.startedAt,
  snapshot:scoped,edges,counts:{employees:employees.length,tasks:tasks.length,handoffs:edges.filter(e=>e.kind==='work').length,waiting:taskViews.reduce((count,t)=>count+t.collaboration.unresolved.length,0)},
  timeline:page.map(r=>({seq:r.seq,commitSeq:r.commit_seq,at:r.at,entity:r.entity,entityId:r.entity_id,taskRef:r.task_ref,reason:r.reason,data:JSON.parse(r.data)})),
  nextBefore:more?page.at(-1).seq:null};
}
