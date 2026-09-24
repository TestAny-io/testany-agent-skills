import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {Store} from '../src/db.mjs';
import {Team} from '../src/service.mjs';
import {NativeGateway} from '../src/native-gateway.mjs';
import {RpcError} from '../src/app-server-client.mjs';
import {createApp} from '../src/server.mjs';
import {ModelConnection} from './fixtures/model-connection.mjs';

function setup(t) {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'teamdesk-models-')),s=new Store(root),team=new Team(s),c=new ModelConnection(),g=new NativeGateway(s,{connection:c,migrate:false});
 const add=(name='Test')=>{const e=team.createEmployee({name,role:'Reviewer',bindingMode:'existing',threadId:randomUUID(),cwd:root});c.add(e);for(const o of s.list('operations'))s.remove('operations',o.id);return e;};
 t.after(()=>{g.close();s.close();fs.rmSync(root,{recursive:true,force:true});});return {root,s,team,c,g,add};
}
const desired=(view,extra={})=>({revision:view.revision,bindingVersion:view.bindingVersion,model:'model-a',effort:'high',serviceTier:'priority',...extra});

test('existing employee inherits native defaults; reads and events persist settings metadata only',async t=>{
 const {g,c,s,add}=setup(t),e=add();const before=s.list('employees');await g.load(e);
 assert.equal(g.models.view(e).actual.model,'model-a');assert.equal(g.models.view(e).actual.serviceTier,null);
 c.values.get(e.threadId).reasoningEffort='high';c.notify(e.threadId);
 assert.equal(g.models.view(e).actual.effort,'high');assert.equal(g.models.view(e).actual.source,'thread/settings/updated');
 assert.deepEqual(s.list('employees'),before);assert.ok(!JSON.stringify(s.list('meta')).includes('EXCLUDE-'));
 assert.ok(c.calls.every(x=>!x.method.includes('update')));
});
test('save updates only native model fields, verifies readback and preserves other employees and current turn',async t=>{
 const {g,c,s,add}=setup(t),a=add('A'),b=add('B');c.values.get(a.threadId).thread.status={type:'active'};
 const before=structuredClone(c.values.get(b.threadId)),v=await g.models.sync(a.id),result=await g.models.update(a.id,desired(v));
 assert.equal(result.saved,true);assert.equal(result.operation.state,'verified');assert.equal(result.actual.serviceTier,'priority');
 assert.deepEqual(c.calls.find(x=>x.method==='thread/settings/update').params,{threadId:a.threadId,model:'model-a',effort:'high',serviceTier:'priority'});
 assert.equal(c.values.get(a.threadId).thread.status.type,'active');assert.deepEqual(c.values.get(b.threadId),before);
 assert.ok(!c.calls.some(x=>/turn\/start|turn\/steer|queue\/|config\//.test(x.method)));assert.equal(s.list('requests').length,0);
 const off=await g.models.update(a.id,desired(result,{serviceTier:null}));assert.equal(off.actual.serviceTier,null);
});
test('catalog validates combinations and rejects permission fields and hidden models before writing',async t=>{
 const {g,c,add}=setup(t),e=add(),v=await g.models.sync(e.id);c.models.push({...c.models[0],model:'hidden',hidden:true});
 for(const [extra,code] of [[{model:'hidden'},'model_unavailable'],[{model:'model-b'},'effort_unavailable'],[{model:'model-b',effort:'low'},'tier_unavailable'],[{sandboxPolicy:{}},'settings_fields']])
  await assert.rejects(g.models.update(e.id,desired(v,extra)),{code});
 assert.ok(!c.calls.some(x=>x.method==='thread/settings/update'));
 const ok=await g.models.update(e.id,desired(v,{model:'model-b',effort:'low',serviceTier:null}));assert.equal(ok.actual.model,'model-b');
});
test('native-side edits invalidate stale editor; offline cache cannot appear current or accept edits',async t=>{
 const {g,c,add}=setup(t),e=add(),v=await g.models.sync(e.id);
 c.values.get(e.threadId).reasoningEffort='high';c.notify(e.threadId);
 await assert.rejects(g.models.update(e.id,desired(v)),{code:'settings_stale'});
 c.state.online=false;c.emit('disconnect','fixture');assert.equal(g.models.view(e).current,false);assert.equal(g.models.view(e).actual.effort,'high');
 await assert.rejects(g.models.update(e.id,desired(g.models.view(e))),{code:'codex_offline'});assert.ok(!c.calls.some(x=>x.method==='thread/settings/update'));
});
test('rebind and archive reject late writes; replacement inherits its own native configuration',async t=>{
 const {g,c,team,add,root}=setup(t),e=add(),v=await g.models.sync(e.id),replacement=team.bind(e.id,{threadId:randomUUID(),cwd:root,title:'replacement'},false);c.add(replacement);
 assert.equal(g.models.view(replacement).actual,null);await assert.rejects(g.models.update(e.id,desired(v)),{code:'binding_changed'});
 assert.equal((await g.models.sync(e.id)).actual.effort,'medium');
 const current=g.models.view(replacement);const orig=c.request.bind(c);
 c.request=async(m,p)=>{const result=await orig(m,p);if(m==='thread/resume')team.bind(e.id,{threadId:randomUUID(),cwd:root,title:'changed during read'},false);return result;};
 await assert.rejects(g.models.update(e.id,desired(current)),{code:'binding_changed'});assert.ok(!c.calls.some(x=>x.method==='thread/settings/update'));
});
test('lost ACK remains uncertain until readback confirms; reconnect never resends settings',async t=>{
 const {g,c,s,add}=setup(t),e=add(),v=await g.models.sync(e.id),orig=c.request.bind(c);let lost=true;
 c.request=async(m,p)=>{const r=await orig(m,p);if(m==='thread/settings/update'&&lost){lost=false;throw new RpcError('lost',{sent:true});}return r;};
 await assert.rejects(g.models.update(e.id,desired(v)),/lost/);assert.equal(g.models.view(e).operation.state,'uncertain');
 await assert.rejects(g.models.update(e.id,desired(g.models.view(e))),{code:'settings_uncertain'});
 const resumed=new NativeGateway(s,{connection:c,migrate:false});t.after(()=>resumed.close());const read=await resumed.models.sync(e.id);
 assert.equal(read.operation.state,'verified');assert.equal(c.calls.filter(x=>x.method==='thread/settings/update').length,1);
});
test('successful ACK with failed or mismatched readback does not claim saved',async t=>{
 const {g,c,add}=setup(t),e=add(),v=await g.models.sync(e.id),orig=c.request.bind(c);let written=false;
 c.request=async(m,p)=>{if(m==='thread/resume'&&written)throw new RpcError('cannot read',{sent:true,rpcError:{code:-1}});const r=await orig(m,p);if(m==='thread/settings/update')written=true;return r;};
 await assert.rejects(g.models.update(e.id,desired(v)),/cannot read/);assert.equal(g.models.view(e).operation.state,'uncertain');
});
test('explicit refresh can reconcile a different native value after an uncertain write without retrying it',async t=>{
 const {g,c,add}=setup(t),e=add(),v=await g.models.sync(e.id),orig=c.request.bind(c);let lost=true;
 c.request=async(m,p)=>{if(m==='thread/settings/update'&&lost){lost=false;throw new RpcError('lost before application',{sent:true});}return orig(m,p);};
 await assert.rejects(g.models.update(e.id,desired(v)),/lost before application/);
 const read=await g.models.sync(e.id);assert.equal(read.operation.state,'different');assert.equal(read.actual.effort,'medium');
 assert.equal(c.calls.filter(x=>x.method==='thread/settings/update').length,0);
 const saved=await g.models.update(e.id,desired(read));assert.equal(saved.saved,true);assert.equal(c.calls.filter(x=>x.method==='thread/settings/update').length,1);
});
test('unsupported native method fails explicitly without a global-config or model-run fallback',async t=>{
 const {g,c,add}=setup(t),e=add(),v=await g.models.sync(e.id),orig=c.request.bind(c);
 c.request=async(m,p)=>{if(m==='thread/settings/update')throw new RpcError('method not found',{sent:true,rpcError:{code:-32601}});return orig(m,p);};
 await assert.rejects(g.models.update(e.id,desired(v)),/尚不支持/);assert.equal(g.models.view(e).operation.state,'failed');assert.ok(!c.calls.some(x=>/config\/|turn\/|queue\//.test(x.method)));
});
test('native default tier normalizes to standard speed and a fresh rollout has an actionable error',async t=>{
 const {g,c,add}=setup(t),e=add();c.values.get(e.threadId).serviceTier='default';const v=await g.models.sync(e.id);
 assert.equal(v.actual.serviceTier,null);assert.equal(v.actual.nativeServiceTier,'default');
 const orig=c.request.bind(c);c.request=async(m,p)=>{if(m==='thread/resume')throw new RpcError('missing source rollout',{sent:true,rpcError:{code:-32600}});return orig(m,p);};
 await assert.rejects(g.models.sync(e.id),/等待入职检查/);assert.ok(!c.calls.some(x=>x.method==='turn/start'));
});
test('HTTP writes require CSRF and deduplicate clicks without triggering onboarding or business input',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'teamdesk-model-http-')),c=new ModelConnection(),app=createApp({root,home:root,port:0,nativeConnection:c});
 t.after(async()=>{app.server.closeAllConnections();await new Promise(r=>app.close(r));fs.rmSync(root,{recursive:true,force:true});});
 const team=new Team(app.store),e=team.createEmployee({name:'UI',role:'Reviewer',bindingMode:'existing',threadId:randomUUID(),cwd:root});c.add(e);
 for(const o of app.store.list('operations'))app.store.remove('operations',o.id);
 const addr=await app.listen(),url='http://127.0.0.1:'+addr.port,{token}=await(await fetch(url+'/api/bootstrap')).json();
 const view=await(await fetch(url+`/api/employees/${e.id}/models`)).json(),body=desired(view),key=randomUUID();
 const post=(tok=token)=>fetch(url+`/api/employees/${e.id}/models`,{method:'POST',headers:{'Content-Type':'application/json','X-TeamDesk-Token':tok,'Idempotency-Key':key},body:JSON.stringify(body)});
 assert.equal((await post('bad')).status,403);const [a,b]=await Promise.all([post(),post()]);assert.equal(a.status,200);assert.deepEqual(await a.json(),await b.json());
 assert.equal(c.calls.filter(x=>x.method==='thread/settings/update').length,1);assert.equal(app.store.list('operations').length,0);assert.equal(app.store.list('requests').length,0);
});
