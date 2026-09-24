import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createApp} from '../src/server.mjs';
test('collaboration module graph is served, empty history is readable and errors retain the same HTTP boundary',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'td-co-http-')),app=createApp({root,home:root,port:0,nativeConnection:false});
 t.after(()=>new Promise(resolve=>{app.server.closeAllConnections();app.close(()=>{fs.rmSync(root,{recursive:true,force:true});resolve();});}));
 const {port}=await app.listen(),url='http://127.0.0.1:'+port;
 const result=await(await fetch(url+'/api/collaboration')).json();assert.equal(result.snapshot.employees.length,0);assert.equal(result.counts.handoffs,0);
 const todo=['/app.js'],seen=new Set();
 while(todo.length){const file=todo.shift();if(seen.has(file))continue;seen.add(file);const response=await fetch(url+file);assert.equal(response.status,200,file);assert.match(response.headers.get('content-type'),/javascript/);const source=await response.text();for(const match of source.matchAll(/from\s+['"]\.\/([^'"]+)['"]/g))todo.push('/'+match[1]);}
 assert.ok(seen.has('/collaboration-ui.js'));assert.ok(seen.has('/delivery.js'));assert.ok(seen.has('/connection-ui.js'));
 assert.equal((await fetch(url+'/api/collaboration?at=9999999')).status,400);
 assert.equal((await fetch(url+'/api/collaboration',{headers:{Origin:'https://unrelated.invalid'}})).status,403);
 assert.equal((await fetch(url+'/api/collaboration',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,403);
});
