import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { dataHome } from '../assets/app/src/db.mjs';
import { discoverSharedServer, launchSharedDesktop, processTable } from '../assets/app/src/shared-connection.mjs';

const scripts = path.dirname(fileURLToPath(import.meta.url));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const desktopRunning = () => processTable().some(row => /^\/.*\.app\/Contents\/MacOS\/(ChatGPT|Codex)$/.test(row.command));

export function localServiceUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.username || url.password || url.pathname !== '/' || url.search || url.hash)
    throw Error('TeamDesk 服务地址不合法；只能打开本机工作台。');
  return url.origin;
}

// Pure orchestration is shared by the icon and tests; no model input is created.
export async function openWorkspace({ensureService, reconnect, isDesktopRunning, hasSharedServer, launchDesktop, waitConnected, onStage = () => {}}) {
  const trace = [];
  const step = async (name, work) => {
    const row = { name, state: 'running', startedAt: new Date().toISOString() }; trace.push(row); onStage(trace);
    try { const value = await work(); Object.assign(row, {state:'verified', finishedAt:new Date().toISOString()}); onStage(trace); return value; }
    catch(error) { Object.assign(row, {state:'failed', error:error.message, finishedAt:new Date().toISOString()}); onStage(trace); throw error; }
  };
  const ready = s => s.health?.connection?.online && (!s.health.recovery || s.health.recovery.state === 'ready');
  const {url, state} = await step('service', ensureService);
  const running=isDesktopRunning();
  const shared=running && hasSharedServer();
  if (ready(state) && shared) {
    onStage([...trace, ...['shared_instance','metadata_recovery'].map(name=>({name,state:'verified',finishedAt:new Date().toISOString()}))]);
    return {url:url+'/#overview', status:'connected', message:'Codex 与 TeamDesk 已就绪。'};
  }
  if (!running) {
    try {await step('desktop_launch', launchDesktop);}
    catch(error) {return {url:url+'/#rules',status:'launch_failed',message:'TeamDesk 已打开，Codex 启动未完成：'+error.message};}
  }
  else if (!shared) return {url:url+'/#rules', status:'restart_required', message:'Codex 已运行，但尚未启用共享接入。请先在 Codex 中正常退出，再点击 TeamDesk 图标。工作台已在 Safari 打开，可先查看已有资料。'};
  const identity={name:'shared_instance',state:'running',startedAt:new Date().toISOString()};
  const recovery={name:'metadata_recovery',state:'running',startedAt:new Date().toISOString()};
  trace.push(identity,recovery);onStage(trace);
  let latest=state,reconnectError;
  try {await reconnect();} catch(error) {reconnectError=error.message;}
  try {latest=await waitConnected();} catch(error) {reconnectError=error.message;latest={health:{connection:{online:false,error:error.message}}};}
  const error=latest.health?.connection?.error||reconnectError||'仍有 metadata 等待恢复';
  Object.assign(identity,{state:latest.health?.connection?.online?'verified':'pending',finishedAt:new Date().toISOString(),...(!latest.health?.connection?.online?{error}:{})});
  Object.assign(recovery,{state:ready(latest)?'verified':'pending',finishedAt:new Date().toISOString(),...(!ready(latest)?{error:latest.health?.recovery?.errors?.[0]?.message||error}:{})});
  onStage(trace);
  if (ready(latest)) return {url:url+'/#overview', status:'connected', message:'Codex 与 TeamDesk 已就绪。'};
  return {url:url+'/#rules', status:'connection_pending', message:'TeamDesk 已打开，'+(latest.health?.connection?.online?'Codex 已连接，部分状态仍待恢复。':'Codex 连接尚未完成。')+(recovery.error||'请在团队设置查看连接状态。')};
}

async function readState(url, root) {
  const response = await fetch(url+'/api/bootstrap', {signal:AbortSignal.timeout(2000), redirect:'error'});
  if (!response.ok) throw Error('无法读取 TeamDesk 服务状态。');
  const state = await response.json();
  if (state.health?.dataDirectory !== path.resolve(root) || typeof state.token !== 'string') throw Error('端口上的服务不是当前 TeamDesk 数据目录。');
  return state;
}

function ownedProcess(info) {
  if (!Number.isInteger(info?.pid) || info.pid<=1 || typeof info.serverPath!=='string') return false;
  // The previous cache may have been removed by a plugin update. Match its recorded
  // TeamDesk path and exact live process arguments before stopping only this service.
  if (!/\/teamdesk\/[^/]+\/skills\/team-workspace\/assets\/app\/src\/server\.mjs$/.test(info.serverPath)) return false;
  try {
    const command=execFileSync('/bin/ps',['-p',String(info.pid),'-o','command='],{encoding:'utf8'}).trim();
    return command===(info.nodePath||process.execPath)+' '+info.serverPath;
  } catch {return false;}
}

export async function ensureService(root) {
  const env={...process.env,TEAMDESK_HOME:root};
  let old;
  try {old=JSON.parse(fs.readFileSync(path.join(root,'runtime.json'),'utf8'));} catch {}
  const expected=path.resolve(scripts,'../assets/app/src/server.mjs');
  if (old && ownedProcess(old) && old.serverPath!==expected) {
    const url=localServiceUrl(old.url);
    await readState(url,root);
    if(!env.TEAMDESK_PORT)env.TEAMDESK_PORT=new URL(url).port;
    process.kill(old.pid,'SIGTERM');
    for(let n=0;n<60 && ownedProcess(old);n++) await pause(100);
    if(ownedProcess(old)) throw Error('旧版 TeamDesk 尚未停止，请稍后再点图标。Codex 继续运行。');
  }
  execFileSync(process.execPath,[path.join(scripts,'launcher.mjs'),'start'],{env,encoding:'utf8',timeout:15000,stdio:['ignore','pipe','pipe']});
  const info=JSON.parse(fs.readFileSync(path.join(root,'runtime.json'),'utf8')),url=localServiceUrl(info.url);
  return {url,state:await readState(url,root)};
}

export async function run() {
  const root=path.resolve(dataHome()); fs.mkdirSync(root,{recursive:true,mode:0o700});
  const lock=path.join(root,'one-click.lock');
  let acquired=false;
  for(let n=0;n<2;n++) {
    try {fs.writeFileSync(lock,String(process.pid),{flag:'wx',mode:0o600});acquired=true;break;}
    catch(error) {
      if(error.code!=='EEXIST') throw error;
      let pid;try {pid=Number(fs.readFileSync(lock,'utf8'));} catch {}
      if(!Number.isInteger(pid)||pid<=1) throw Error('另一个启动操作尚未完成，请稍后再试。');
      try {process.kill(pid,0);throw Error('TeamDesk 正在启动，请等待当前启动窗口。');}
      catch(e){if(e.code!=='ESRCH') throw e;fs.unlinkSync(lock);}
    }
  }
  if(!acquired) throw Error('无法取得 TeamDesk 启动锁。');
  const cleanup=()=>{try {if(fs.readFileSync(lock,'utf8')===String(process.pid))fs.unlinkSync(lock);}catch{}};
  process.once('exit',cleanup);
  let service;
  try {
    return await openWorkspace({
      onStage:stages=>{
        const file=path.join(root,'startup.json'),tmp=file+'.'+process.pid;
        fs.writeFileSync(tmp,JSON.stringify({version:1,pid:process.pid,at:new Date().toISOString(),stages}),{mode:0o600});
        fs.renameSync(tmp,file);
      },
      ensureService:async()=>{service=await ensureService(root);return service;},
      isDesktopRunning:desktopRunning,
      hasSharedServer:()=>{try{discoverSharedServer();return true;}catch{return false;}},
      launchDesktop:()=>launchSharedDesktop(root),
      reconnect:async()=>{
        const response=await fetch(service.url+'/api/connection/reconnect',{method:'POST',headers:{'Content-Type':'application/json','X-TeamDesk-Token':service.state.token,'Idempotency-Key':randomUUID()},body:'{}',signal:AbortSignal.timeout(18000),redirect:'error'});
        if(!response.ok)throw Error('请求重新连接失败（HTTP '+response.status+'）');
      },
      waitConnected:async()=>{
        let latest=service.state;
        for(let n=0;n<20;n++) {latest=await readState(service.url,root);if(latest.health?.connection?.online && ['ready','partial'].includes(latest.health?.recovery?.state))return latest;await pause(500);}
        return latest;
      }
    });
  } finally {cleanup();process.removeListener('exit',cleanup);}
}

if(process.argv[1] && fs.realpathSync(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {console.log(JSON.stringify(await run()));}
  catch(error) {console.log(JSON.stringify({status:'error',message:error.message}));process.exitCode=1;}
}
