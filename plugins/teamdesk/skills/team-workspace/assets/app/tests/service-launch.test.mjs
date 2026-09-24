import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import http from 'node:http';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';import {fileURLToPath} from 'node:url';
const exec=promisify(execFile),launcher=fileURLToPath(new URL('../../../scripts/launcher.mjs',import.meta.url));
const listen=server=>new Promise(r=>server.listen(0,'127.0.0.1',()=>r(server.address().port)));
const pause=ms=>new Promise(r=>setTimeout(r,ms));
test('simultaneous isolated launchers create one service, reuse its verified PID and leave occupied ports alone',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'td-launch-test-')),reservation=http.createServer();
 const port=await listen(reservation);await new Promise(r=>reservation.close(r));
 const env={...process.env,TEAMDESK_HOME:root,CODEX_HOME:path.join(root,'codex'),TEAMDESK_PORT:String(port)};
 fs.mkdirSync(env.CODEX_HOME);let runtime;
 t.after(async()=>{
  if(runtime){try{await exec(process.execPath,[launcher,'stop'],{env,timeout:5000});}catch{}for(let n=0;n<50;n++){try{process.kill(runtime.pid,0);await pause(50);}catch{break;}}}
  fs.rmSync(root,{recursive:true,force:true});
 });
 const runs=await Promise.allSettled([0,1].map(()=>exec(process.execPath,[launcher,'start'],{env,timeout:20000})));
 runtime=JSON.parse(fs.readFileSync(path.join(root,'runtime.json'),'utf8'));
 for(const run of runs)assert.equal(run.status,'fulfilled',run.reason?.message);
 assert.equal(runs.filter(r=>r.value.stdout.includes('已启动')).length,1);
 assert.equal(runs.filter(r=>r.value.stdout.includes('已运行')).length,1);
 const boot=await(await fetch(runtime.url+'/api/bootstrap')).json();
 assert.equal(boot.health.dataDirectory,root);assert.equal(boot.version,runtime.version);
 await exec(process.execPath,[launcher,'start'],{env,timeout:20000});
 assert.equal(JSON.parse(fs.readFileSync(path.join(root,'runtime.json'),'utf8')).pid,runtime.pid);
 const occupied=http.createServer((req,res)=>{res.writeHead(200);res.end('unrelated local service');}),occupiedPort=await listen(occupied);
 t.after(()=>new Promise(r=>occupied.close(r)));
 const other=fs.mkdtempSync(path.join(os.tmpdir(),'td-occupied-test-'));
 t.after(()=>fs.rmSync(other,{recursive:true,force:true}));
 await assert.rejects(exec(process.execPath,[launcher,'start'],{env:{...env,TEAMDESK_HOME:other,TEAMDESK_PORT:String(occupiedPort)},timeout:5000}),/目标端口已有服务/);
 assert.equal(await(await fetch('http://127.0.0.1:'+occupiedPort)).text(),'unrelated local service');
 assert.equal(fs.existsSync(path.join(other,'runtime.json')),false);
});
