import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {Store} from '../src/db.mjs';
import {WritingAssistant} from '../src/writing-assistant.mjs';
import {LocalWritingSources,extractLocalReferences,sourceReferences,missingSources} from '../src/writing-sources.mjs';
import {WritingConnection} from './fixtures/writing-connection.mjs';

const draft={kind:'draft',draft:'根据参考资料建议职责。',summary:'职责建议。',changes:[],assumptions:[],conflicts:[],questions:[]};
const tick=()=>new Promise(r=>setImmediate(r));
const input={kind:'department',form:{name:'市场部',text:'原始职责',skills:[]},instruction:'请参考 alpha-docs 仓库撰写职责'};
function fixture(t) {
  const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'teamdesk-sources-'))),repo=path.join(root,'projects','alpha-docs');
  fs.mkdirSync(repo,{recursive:true});fs.writeFileSync(path.join(repo,'README.md'),'# 产品\n支持自动化测试。\n第二个事实。\n');
  const s=new Store(path.join(root,'data')),c=new WritingConnection(),w=new WritingAssistant(s,c,{skillProvider:()=>[],sourceRoots:()=>[path.join(root,'projects')]});
  t.after(async()=>{w.close();c.close();await Promise.allSettled([...w.jobs.values(),...w.syncs.values()]);s.close();fs.rmSync(root,{recursive:true,force:true});});return {root,repo,s,c,w};
}
async function start(w,view){w.kick(view.id);await Promise.all([...w.jobs.values()]);return w.get(view.id);}
function call(w,c,id,action,extra={}) {
  const j=w.get(id),r=j.rounds.at(-1),requestId=Math.random();
  c.message('item/tool/call',{threadId:j.threadId,turnId:r.turnId,tool:'teamdesk_local_sources',arguments:{action,reference:r.localReferences[0]?.label||'alpha-docs',path:'',query:'',offset:0,limit:100,...extra}},requestId);
  const response=c.calls.find(x=>x.id===requestId).result;
  return {...response,value:JSON.parse(response.contentItems[0].text)};
}
test('natural references tolerate repository separators/plurals and use explicit parent hints without treating parent as a required source',t=>{
  const {root}=fixture(t),sources=new LocalWritingSources({roots:()=>[root]});
  const text='你可以看到本地的source code 文件夹下有 hephos-website 仓库和testany_doc_for_users 仓库，里面有很多你可以参考的资料';
  assert.deepEqual(extractLocalReferences([text]),['hephos-website','testany_doc_for_users']);
  for(const p of ['source code/hephos_website','source code/testany_docs_for_user','other/testany_docs_for_user'])fs.mkdirSync(path.join(root,p),{recursive:true});
  assert.equal(sources.find('testany_doc_for_users').candidates.length,2);
  assert.deepEqual(sources.find('testany_doc_for_users',[text]).candidates.map(c=>c.path),[path.join(root,'source code/testany_docs_for_user')]);
  assert.equal(sources.find('hephos-website',[text]).candidates[0].path,path.join(root,'source code/hephos_website'));
  const file=path.join(root,'source code','产品说明.md');
  assert.deepEqual(extractLocalReferences(['请参考 `'+file+'`']),[file]);
  assert.deepEqual(extractLocalReferences(['请参考 '+file+'，写一份职责。']),[file]);
});
test('hyphenated business terms and selected skills are not mistaken for mandatory local repositories',()=>{
  assert.deepEqual(extractLocalReferences(['参考团队资料，面向 mid-market 客户，交付 end-to-end 方案。']),[]);
  assert.deepEqual(extractLocalReferences(['请参考 prd-writer 技能，写任务目标。']),[]);
  assert.deepEqual(extractLocalReferences(['请参考 `prd-writer` 技能，写任务目标。']),[]);
  assert.deepEqual(extractLocalReferences(['请参考 `产品资料` 目录与 guide-docs 仓库。']),['产品资料','guide-docs']);
});
test('locating and searching cannot count as reading; real read records exact file/range/hash and leaves all files unchanged',async t=>{
  const {w,c,repo,s}=fixture(t),before=fs.readFileSync(path.join(repo,'README.md')),j=await start(w,w.create(input));
  assert.equal(call(w,c,j.id,'locate').success,true);
  assert.equal(call(w,c,j.id,'list').value.entries[0].name,'README.md');
  assert.ok(call(w,c,j.id,'search',{query:'自动化'}).value.matches[0].text.includes('自动化'));
  assert.equal(missingSources(w.get(j.id).rounds[0]).length,1);
  c.finish(j.threadId,draft);await tick();assert.equal(w.get(j.id).state,'needs_sources');assert.equal(w.get(j.id).rounds[0].result.draft,draft.draft);
  const continued=await start(w,w.followup(j.id,{revision:1,instruction:'请重试读取资料'}));
  call(w,c,j.id,'locate');const read=call(w,c,j.id,'read',{path:'README.md',offset:1,limit:1});assert.equal(read.success,true);assert.match(read.value.content,/2: 支持自动化测试/);
  c.finish(continued.threadId,draft);await tick();const result=w.get(j.id);assert.equal(result.state,'ready');assert.equal(result.rounds.length,2);
  const source=result.rounds[1].sources[0];assert.equal(source.sha256,createHash('sha256').update(before).digest('hex'));assert.equal(source.startLine,2);assert.equal(source.endLine,2);assert.ok(source.at);
  assert.deepEqual(fs.readFileSync(path.join(repo,'README.md')),before);assert.equal(s.list('tasks').length,0);assert.equal(s.list('departments').length,0);
});
test('ambiguous references require human path selection; sources cannot choose their own candidate or enlarge the scope',async t=>{
  const {w,c,root,repo}=fixture(t);fs.mkdirSync(path.join(root,'projects','second','alpha-docs'),{recursive:true});
  let j=await start(w,w.create(input));const result=call(w,c,j.id,'locate');assert.equal(result.value.status,'ambiguous');assert.equal(result.value.candidates.length,2);
  assert.equal(call(w,c,j.id,'read',{path:path.join(repo,'README.md')}).success,false);
  assert.equal(call(w,c,j.id,'locate',{reference:'/etc/passwd'}).success,false);
  c.finish(j.threadId,draft);await tick();j=w.get(j.id);const id=j.rounds[0].localReferences[0].id;
  j=await start(w,w.followup(j.id,{revision:1,instruction:'使用选择的位置继续',referenceChoices:{[id]:repo}}));
  assert.equal(j.rounds[1].localReferences.length,1);assert.equal(call(w,c,j.id,'locate').value.rootPath,repo);assert.equal(call(w,c,j.id,'read',{path:'README.md'}).success,true);
  c.finish(j.threadId,draft);await tick();assert.equal(w.get(j.id).state,'ready');
});
test('missing references only become optional after an explicit human skip, preserved and reversible across rounds',async t=>{
  const {w,c}=fixture(t);let j=await start(w,w.create({...input,instruction:'请参考 missing-repo 仓库'}));assert.equal(call(w,c,j.id,'locate').value.status,'missing');
  c.finish(j.threadId,draft);await tick();j=w.get(j.id);const ref=j.rounds[0].localReferences[0];
  assert.throws(()=>w.followup(j.id,{revision:1,instruction:'继续',skipReferenceIds:['wrong']}),{code:'writing_sources'});
  j=await start(w,w.followup(j.id,{revision:1,instruction:'暂不参考这些资料',skipReferenceIds:[ref.id]}));assert.equal(call(w,c,j.id,'locate').success,false);
  c.finish(j.threadId,draft);await tick();assert.equal(w.get(j.id).state,'ready');assert.ok(w.get(j.id).rounds[1].localReferences[0].waivedAt);
  j=await start(w,w.followup(j.id,{revision:2,instruction:'简短一点'}));assert.equal(j.rounds[2].localReferences[0].status,'waived');
  c.finish(j.threadId,draft);await tick();j=await start(w,w.followup(j.id,{revision:3,instruction:'现在请参考 missing-repo 仓库'}));assert.equal(j.rounds[3].localReferences[0].status,'pending');
});
test('local tools reject traversal, symlink escape, secret/binary/oversize files, foreign turns and unsupported operations',async t=>{
  const {w,c,repo,root}=fixture(t),j=await start(w,w.create(input));call(w,c,j.id,'locate');
  fs.writeFileSync(path.join(root,'private.txt'),'OUTSIDE');fs.symlinkSync(path.join(root,'private.txt'),path.join(repo,'linked.txt'));
  fs.writeFileSync(path.join(repo,'.env'),'SECRET');fs.writeFileSync(path.join(repo,'binary.bin'),Buffer.from([1,0,2]));fs.writeFileSync(path.join(repo,'large.txt'),'x'.repeat(2*1024*1024+1));
  for(const file of ['../../private.txt','linked.txt','.env','binary.bin','large.txt'])assert.equal(call(w,c,j.id,'read',{path:file}).success,false,file);
  assert.equal(call(w,c,j.id,'write',{path:'README.md'}).success,false);
  const requestId='foreign';c.message('item/tool/call',{threadId:j.threadId,turnId:'foreign',tool:'teamdesk_local_sources',arguments:{action:'read',reference:'alpha-docs',path:'README.md',offset:0,limit:100}},requestId);
  assert.equal(c.calls.find(x=>x.id===requestId).result.success,false);assert.equal(w.get(j.id).rounds[0].sources.length,0);
  assert.equal(call(w,c,j.id,'read',{path:'README.md'}).success,true);
});
test('legacy suggestions migrate on continuation with history and original links; active native work is not replaced',async t=>{
  const {w,c,s}=fixture(t);let j=await start(w,w.create(input));c.finish(j.threadId,draft);await tick();j=w.get(j.id);
  delete j.capabilityVersion;delete j.rounds[0].localReferences;j.state=j.rounds[0].state='ready';w.save(j);const oldThread=j.threadId;w.close();
  const restored=new WritingAssistant(s,c,{skillProvider:()=>[],sourceRoots:()=>[]});t.after(()=>restored.close());assert.equal(restored.get(j.id).state,'needs_sources');assert.deepEqual(restored.get(j.id).rounds[0].result,draft);
  const next=restored.followup(j.id,{revision:1,instruction:'请读取资料后完善'});j=await start(restored,next);assert.notEqual(j.threadId,oldThread);assert.equal(j.rounds[0].threadId,oldThread);
  const latest=c.calls.findLast(x=>x.method==='turn/start').params;assert.match(latest.input[0].text,/原始职责/);assert.match(latest.input[0].text,/根据参考资料建议职责/);
  assert.equal(c.calls.filter(x=>x.method==='thread/start').length,2);assert.deepEqual(restored.get(j.id).rounds[0].result,draft);
  const activeJob=await start(restored,restored.create({...input,instruction:'职责建议'}));let change=restored.get(activeJob.id);delete change.capabilityVersion;change.state=change.rounds[0].state='ready';restored.save(change);
  await start(restored,restored.followup(change.id,{revision:1,instruction:'继续'}));assert.equal(restored.get(change.id).threadId,activeJob.threadId);assert.equal(restored.get(change.id).state,'failed');
});
test('reconnect reconciliation retains actual read evidence and never resubmits a completed turn',async t=>{
  const {w,c,s,repo}=fixture(t);const j=await start(w,w.create(input));call(w,c,j.id,'locate');call(w,c,j.id,'read',{path:'README.md'});w.close();
  c.finish(j.threadId,draft);
  const restored=new WritingAssistant(s,c,{skillProvider:()=>[],sourceRoots:()=>[repo]});t.after(()=>restored.close());await restored.sync(j.id);
  assert.equal(restored.get(j.id).state,'ready');assert.equal(restored.get(j.id).rounds[0].sources.length,1);assert.equal(c.calls.filter(x=>x.method==='turn/start').length,1);
});
