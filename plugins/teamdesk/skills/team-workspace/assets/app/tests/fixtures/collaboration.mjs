// Manual UI-only fixture: no native connection, no model, no production data.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Team } from '../../src/service.mjs';
import { createApp } from '../../src/server.mjs';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'teamdesk-collab-ui-'));
const app = createApp({root,home:root,port:0,nativeConnection:false}), team = new Team(app.store);
const staff = ['作者 A','评审 B','专家 C'].map((name,i) => {
  const skill = path.join(root,`skill-${i}`,'SKILL.md');fs.mkdirSync(path.dirname(skill),{recursive:true});
  fs.writeFileSync(skill,`---\nname: capability-${i}\ndescription: >-\n  独立检查需求的完整性、边界情况和验收标准。\n  按实际分工给出可验证的结论，不代替人类验收。\n---\n`);
  return team.createEmployee({name,role:['作者','评审','领域专家'][i],skills:[skill],bindingMode:'existing',threadId:randomUUID(),cwd:root});
});
const [a,b,c]=staff;
if (process.argv.includes('--departments')) {
  const authoring=team.workspace.saveDepartment(null,{name:'研发部',responsibilities:'实现产品需求'});
  const review=team.workspace.saveDepartment(null,{name:'测试部',responsibilities:'独立评审与测试'});
  for(const e of [a,b])team.changeEmployeeDepartment(e.id,{departmentId:authoring.id,revision:0});
  team.changeEmployeeDepartment(c.id,{departmentId:review.id,revision:0});
  team.workspace.saveDepartment(authoring.id,{...authoring,contactEmployeeId:a.id});
  team.workspace.writeDocument(null,{title:'研发参考',kind:'reference',departmentId:authoring.id,status:'effective',content:'删除部门后仍保留的隔离测试资料。'});
}
const task=team.submit({employeeId:a.id,mode:'fifo',instruction:'网状协作界面测试',participants:[b.id,c.id]});
team.inbox(a.threadId,task.requestId);
const ab=team.peerRequest(a.threadId,{kind:'work',employeeId:b.id,taskRef:task.taskRef,parentRequestId:task.requestId,purpose:'检查需求完整性',instruction:'检查需求完整性'});
team.inbox(b.threadId,ab.id);
const bc=team.peerRequest(b.threadId,{kind:'work',employeeId:c.id,taskRef:task.taskRef,parentRequestId:ab.id,purpose:'核对领域边界',instruction:'核对领域边界'});
team.inbox(c.threadId,bc.id);
const cb=team.peerRequest(c.threadId,{kind:'result',employeeId:b.id,taskRef:task.taskRef,replyToRequestId:bc.id,outcome:'completed',instruction:'领域边界已核对'});
const base={ownerEmployeeId:a.id,taskId:'UI-COLLAB-01',title:'网状协作界面测试',category:'测试',status:'completed',summary:'仅为隔离界面测试数据'};
team.applyWorklog(c,'fixture-c',[{...base,requestId:bc.id}], 'fixture-only');
team.inbox(b.threadId,cb.id);
team.applyWorklog(b,'fixture-b',[{...base,requestId:cb.id,handledResults:[{resultRequestId:cb.id,disposition:'accepted',summary:'已核对专家结论，纳入评审报告；后续由 B 向 A 交付。'}]}], 'fixture-only');
team.applyWorklog(a,'fixture-a',[{...base,requestId:task.requestId}], 'fixture-only');
if (process.argv.includes('--complete')) {
  const ba=team.peerRequest(b.threadId,{kind:'result',employeeId:a.id,taskRef:task.taskRef,replyToRequestId:ab.id,outcome:'completed',instruction:'评审与专家核对均完成'});
  team.applyWorklog(b,'fixture-b-final',[{...base,requestId:ab.id}], 'fixture-only');
  team.inbox(a.threadId,ba.id);
  team.applyWorklog(a,'fixture-a-final',[{...base,requestId:ba.id,handledResults:[{resultRequestId:ba.id,disposition:'accepted',summary:'已核对评审结论并整合交付。'}]}], 'fixture-only');
}
const address=await app.listen();
console.log(JSON.stringify({url:`http://127.0.0.1:${address.port}/#tasks`,root,nativeConnection:false}));
let closing=false;
function close(){if(closing)return;closing=true;app.server.closeAllConnections();app.close(()=>setImmediate(()=>{fs.rmSync(root,{recursive:true,force:true});process.exit(0);}));}
process.on('SIGINT',close);process.on('SIGTERM',close);
