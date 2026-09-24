// Append-only, allowlisted metadata versions. This module never stores native bodies.
const fields = {
 runtime:['id','threadId','bindingVersion','status','turnId','taskRef','observedAt'],
 employees:['id','name','role','departmentId','group','threadId','threadTitle','bindingVersion','archived','createdAt'],
 departments:['id','name','contactEmployeeId','archived','deletedAt','revision'],
 tasks:['id','businessId','title','category','stage','status','ownerEmployeeId','participants','requiredCollaboratorIds','collaborationVersion','collaborationRevision','revision','createdAt','updatedAt'],
 requests:['id','taskRef','employeeId','ownerEmployeeId','fromEmployeeId','source','kind','mode','parentRequestId','replyToRequestId','purpose','outcome','sequence','state','createdAt','nativeAcceptedAt','acceptanceRecovered','nativeReceivedAt','receiptRecovered','receivedAt','claimedAt','claimedThreadId','claimedBindingVersion','recordedAt','nativeTurnId','queuedSubmissionId','sourceThreadId','targetThreadId','sourceBindingVersion','targetBindingVersion'],
 operations:['id','employeeId','requestId','kind','state','sequence','transport','threadId','bindingVersion','nativeTurnId','queuedSubmissionId','createdAt','sentAt','completedAt','attempts','error'],
 records:['id','employeeId','threadId','bindingVersion','turnId','requestId','taskRef','businessId','ownerEmployeeId','title','category','stage','status','authority','recordedAt','source','producedResultRequestId'],
 decisions:['id','taskRef','ownerEmployeeId','fromEmployeeId','source','sourceThreadId','sourceTurnId','bindingVersion','nativeTool','nativeMethod','state','revision','createdAt','decidedAt','sentAt','callbackAvailable','closeReason'],
 events:['id','at','employeeId','threadId','bindingVersion','turnId','requestId','taskRef','kind','state','source','outcome','tool','targetThreadId','sourceThreadId','recovered'],
};
const pick=(value,keys)=>Object.fromEntries(keys.filter(k=>value[k]!==undefined).map(k=>[k,value[k]]));
export const historyTables=Object.keys(fields);
export function metadata(table,id,value) {
 if(value===null)return null;
 if(table==='meta')return id==='settings'?pick(value,['teamName','enabled']):undefined;
 if(!fields[table])return undefined;
 const out=pick(value,fields[table]);
 if(table==='tasks'&&value.acceptance)out.acceptance=pick(value.acceptance,['id','revision','collaborationRevision','verdict','at','decidedAt','notificationRequestId']);
 if(table==='records'){
  out.summary=String(value.summary||'').slice(0,1000);
  out.handledResults=(value.handledResults||[]).map(h=>({...pick(h,['resultRequestId','disposition']),summary:String(h.summary||'').slice(0,500)}));
 }
 return out;
}
export function initializeHistory(db) {
 db.exec('CREATE TABLE IF NOT EXISTS collaboration_history (seq INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, entity TEXT NOT NULL, entity_id TEXT NOT NULL, task_ref TEXT, data TEXT NOT NULL, reason TEXT NOT NULL, commit_seq INTEGER); CREATE INDEX IF NOT EXISTS collaboration_history_entity ON collaboration_history(entity,entity_id,seq DESC); CREATE INDEX IF NOT EXISTS collaboration_history_task ON collaboration_history(task_ref,seq DESC);');
}
export function captureMetadata(db,table,id,value,reason='change') {
 const projected=metadata(table,id,value);
 if(projected===undefined || (!historyTables.includes(table)&&table!=='meta') || (table==='meta'&&id!=='settings'))return;
 const data=JSON.stringify(projected);
 const old=db.prepare('SELECT data FROM collaboration_history WHERE entity=? AND entity_id=? ORDER BY seq DESC LIMIT 1').get(table,id);
 if(old?.data===data)return;
 let taskRef=table==='tasks'?id:value?.taskRef||null;
 if(!taskRef && value?.requestId)taskRef=db.prepare("SELECT json_extract(data,'$.taskRef') AS taskRef FROM requests WHERE id=?").get(value.requestId)?.taskRef||null;
 db.prepare('INSERT INTO collaboration_history(at,entity,entity_id,task_ref,data,reason) VALUES(?,?,?,?,?,?)').run(
  new Date().toISOString(),table,id,taskRef,data,reason);
}
export function baselineHistory(store) {
 if(store.get('meta','collaborationHistory'))return;
 store.tx(()=>{
  for(const table of historyTables)for(const row of store.list(table))captureMetadata(store.db,table,row.id,row,'baseline');
  const settings=store.get('meta','settings');if(settings)captureMetadata(store.db,'meta','settings',settings,'baseline');
  const last=store.db.prepare('SELECT MAX(seq) AS seq FROM collaboration_history').get().seq||0;
  store.db.prepare('UPDATE collaboration_history SET commit_seq=? WHERE commit_seq IS NULL').run(last);
  store.put('meta','collaborationHistory',{version:1,startedAt:new Date().toISOString(),baselineSeq:last});
 });
}
// An already running older hook can finish after an upgrade. Record its latest
// metadata when observed; never invent the intermediate history it did not log.
export function reconcileHistory(store) {
 store.tx(()=>{
  for(const table of [...historyTables,'meta']) {
   const scope=table==='meta'?" AND t.id='settings'":'';
   const rows=store.db.prepare('SELECT t.id,t.data FROM '+table+' t LEFT JOIN collaboration_history h ON h.seq=(SELECT MAX(seq) FROM collaboration_history WHERE entity=? AND entity_id=t.id) WHERE (h.seq IS NULL OR t.updated_at>=h.at)'+scope).all(table);
   for(const row of rows)captureMetadata(store.db,table,row.id,JSON.parse(row.data),'reconciled');
   const missing=store.db.prepare('SELECT h.entity_id,h.data FROM collaboration_history h WHERE entity=? AND h.seq=(SELECT MAX(seq) FROM collaboration_history WHERE entity=h.entity AND entity_id=h.entity_id) AND h.data<>\'null\' AND NOT EXISTS (SELECT 1 FROM '+table+' t WHERE t.id=h.entity_id)').all(table);
   for(const row of missing)captureMetadata(store.db,table,row.entity_id,null,'reconciled');
  }
 });
}
