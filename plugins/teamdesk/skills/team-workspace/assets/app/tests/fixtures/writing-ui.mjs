// Deterministic browser fixture, no Codex/model connection. Run with node, terminate with SIGTERM.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../../src/server.mjs';
import { Team } from '../../src/service.mjs';
import { WritingConnection } from './writing-connection.mjs';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'teamdesk-writing-ui-'));
const app=createApp({root,home:root,port:0,nativeConnection:new WritingConnection({automatic:true,delay:2500}),writingSourceRoots:()=>[root]});
if(process.argv.includes('--sources'))for(const sub of ['first/guide-docs','second/guide-docs']){const dir=path.join(root,sub);fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'README.md'),'# 产品资料\n产品支持自动化测试与结果追踪。\n');}
const team=new Team(app.store);
const department=team.workspace.saveDepartment(null,{name:'产品部',responsibilities:'负责产品需求。'});
const other=team.workspace.saveDepartment(null,{name:'设计部',responsibilities:'负责交互与视觉设计。'});
const skill=path.join(root,'skills','test-product','SKILL.md');fs.mkdirSync(path.dirname(skill),{recursive:true});fs.writeFileSync(skill,'---\nname: test-product\ndescription: 将想法转为包含目标、范围和验收标准的产品需求。\n---\n');
app.store.put('employees','EMP-TEST',{id:'EMP-TEST',name:'撰写验证员工',role:'产品经理',departmentId:department.id,departmentRevision:0,group:department.name,skills:[skill],instructions:'原始工作说明。',archived:false,threadId:null,bindingVersion:1,createdAt:new Date().toISOString()});
if(process.argv.includes('--task'))app.store.put('employees','EMP-REVIEW',{id:'EMP-REVIEW',name:'需求评审员',role:'独立评审员',departmentId:other.id,departmentRevision:0,group:other.name,skills:[skill],instructions:'独立评审需求',archived:false,threadId:null,bindingVersion:1,createdAt:new Date().toISOString()});
const address=await app.listen();console.log(JSON.stringify({url:'http://127.0.0.1:'+address.port,root}));
for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>app.close(()=>setImmediate(()=>{fs.rmSync(root,{recursive:true,force:true});process.exit(0);})));
