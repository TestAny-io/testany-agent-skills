import test from 'node:test';
import assert from 'node:assert/strict';
import {openWorkspace,localServiceUrl} from '../../../scripts/one-click.mjs';

function fixture({online=false,running=false,shared=false,connected=true}={}) {
  const calls=[];
  return {calls,deps:{
    ensureService:async()=>{calls.push('service');return {url:'http://127.0.0.1:4322',state:{health:{connection:{online}}}};},
    isDesktopRunning:()=>running,hasSharedServer:()=>shared,
    launchDesktop:async()=>{calls.push('launch-codex');},
    reconnect:async()=>{calls.push('reconnect');},
    waitConnected:async()=>{calls.push('wait');return {health:{connection:{online:connected,error:connected?null:'原生握手未完成'}}};}
  }};
}
test('one click starts the service then shared Codex and returns Safari URL only after checking connection',async()=>{
  const {calls,deps}=fixture(),r=await openWorkspace(deps);
  assert.equal(r.status,'connected');assert.equal(r.url,'http://127.0.0.1:4322/#overview');assert.deepEqual(calls,['service','launch-codex','reconnect','wait']);
});
test('existing shared connection is reused without launching or sending model input',async()=>{
  const {calls,deps}=fixture({online:true,running:true,shared:true}),r=await openWorkspace(deps);
  assert.equal(r.status,'connected');assert.deepEqual(calls,['service']);
});
test('an old online status cannot skip cold startup after Desktop has exited',async()=>{
  const {calls,deps}=fixture({online:true,running:false}),r=await openWorkspace(deps);
  assert.equal(r.status,'connected');assert.deepEqual(calls,['service','launch-codex','reconnect','wait']);
});
test('an old online status cannot mistake ordinary Desktop for a shared instance',async()=>{
  const {deps}=fixture({online:true,running:true,shared:false});
  assert.equal((await openWorkspace(deps)).status,'restart_required');
});
test('ordinary running Desktop gets explicit restart guidance and the settings URL without being killed',async()=>{
  const {calls,deps}=fixture({running:true}),r=await openWorkspace(deps);
  assert.equal(r.status,'restart_required');assert.equal(r.url,'http://127.0.0.1:4322/#rules');assert.match(r.message,/正常退出/);assert.deepEqual(calls,['service']);
});
test('a shared Desktop reconnects and a failed handshake never claims successful startup',async()=>{
  const {calls,deps}=fixture({running:true,shared:true,connected:false}),r=await openWorkspace(deps);
  assert.equal(r.status,'connection_pending');assert.match(r.message,/原生握手未完成/);assert.deepEqual(calls,['service','reconnect','wait']);
});
test('service failure stops startup before opening another Desktop',async()=>{
  const {calls,deps}=fixture();deps.ensureService=async()=>{throw Error('端口占用');};
  await assert.rejects(openWorkspace(deps),/端口占用/);assert.deepEqual(calls,[]);
});
test('failed Desktop startup still opens the working TeamDesk settings page in Safari',async()=>{
  const {deps}=fixture();deps.launchDesktop=async()=>{throw Error('LaunchServices refused');};
  const result=await openWorkspace(deps);
  assert.equal(result.status,'launch_failed');assert.equal(result.url,'http://127.0.0.1:4322/#rules');assert.match(result.message,/LaunchServices refused/);
});
test('launcher runtime URL must stay on the loopback service and contain no embedded credentials or redirect',()=>{
  assert.equal(localServiceUrl('http://127.0.0.1:5432'),'http://127.0.0.1:5432');
  for(const url of ['https://example.com','http://localhost:4322','http://127.0.0.1:4322@evil.test','http://user:pass@127.0.0.1:4322','http://127.0.0.1:4322/path','http://127.0.0.1:4322/?next=evil'])assert.throws(()=>localServiceUrl(url));
});
test('startup stages never confirm partial recovery or a failed readiness read',async()=>{
  const {deps}=fixture({running:true,shared:true});let stages;
  deps.onStage=value=>{stages=structuredClone(value);};
  deps.waitConnected=async()=>({health:{connection:{online:true},recovery:{state:'partial',errors:[{message:'One employee unavailable'}]}}});
  let result=await openWorkspace(deps);
  assert.equal(result.status,'connection_pending');assert.match(result.message,/部分状态/);
  assert.equal(stages.find(s=>s.name==='shared_instance').state,'verified');
  assert.equal(stages.find(s=>s.name==='metadata_recovery').state,'pending');
  assert.equal(stages.filter(s=>s.name==='metadata_recovery').length,1);
  deps.waitConnected=async()=>{throw Error('service disconnected');};
  result=await openWorkspace(deps);
  assert.equal(result.status,'connection_pending');assert.equal(stages.find(s=>s.name==='shared_instance').state,'pending');
});
