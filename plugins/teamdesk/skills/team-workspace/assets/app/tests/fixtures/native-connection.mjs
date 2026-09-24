import {EventEmitter} from 'node:events';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {RpcError} from '../../src/app-server-client.mjs';
export class FakeConnection extends EventEmitter {
  constructor(){ super();this.state={online:true,pid:42};this.calls=[];this.threads=new Map();this.queues=new Map();this.histories=new Map();this.client={ready:true,generation:'a'};this.hook={key:'teamdesk@personal:hooks/hooks.json:stop:0:0',currentHash:'sha256:one',source:'plugin',eventName:'stop',handlerType:'command',command:'/bin/sh "$PLUGIN_ROOT/skills/team-workspace/scripts/hook.sh"',enabled:true,isManaged:false,trustStatus:'trusted'}; }
  async connect(){this.emit('connected');return this.state;}
  async request(method,params={}){
    this.calls.push({method,params});const tid=params.threadId;
    if(method==='hooks/list')return {data:[{cwd:'',hooks:[this.hook],errors:[]}]};
    if(method==='thread/resume')return {thread:this.threads.get(tid)};
    if(method==='thread/turns/list')return {data:this.histories.get(tid)||[]};
    if(method==='thread/items/list')return {data:(this.histories.get(tid)||[]).flatMap(t=>t.items.map(item=>({item,turnId:t.id}))),nextCursor:null};
    if(method==='thread/queue/list')return {data:this.queues.get(tid)||[]};
    if(method==='thread/queue/add'){const q={id:randomUUID(),clientUserMessageId:params.clientUserMessageId,input:params.input};this.queues.set(tid,[...(this.queues.get(tid)||[]),q]);return {queuedSubmission:q};}
    if(method==='thread/queue/start'){
      const q=this.queues.get(tid)?.shift();if(!q)return {};
      const turn={id:randomUUID(),status:'inProgress',items:[]};this.threads.get(tid).status={type:'active'};this.histories.set(tid,[turn]);this.message('turn/started',{threadId:tid,turn});
      const item={type:'userMessage',id:randomUUID(),clientId:q.clientUserMessageId,content:q.input};turn.items.push(item);this.message('item/completed',{threadId:tid,turnId:turn.id,item});return {turn};
    }
    if(method==='turn/steer'){
      const turn=this.histories.get(tid)?.[0];if(!turn||params.expectedTurnId!==turn.id)throw new RpcError('stale',{sent:true,rpcError:{code:-32000}});
      const item={type:'userMessage',id:randomUUID(),clientId:params.clientUserMessageId,content:params.input};turn.items.push(item);this.message('item/completed',{threadId:tid,turnId:turn.id,item});return {turnId:turn.id};
    }
    if(method==='config/batchWrite'){this.hook.trustStatus='trusted';return {};}
    if(method==='thread/start'){const thread={id:randomUUID(),cwd:params.cwd,status:{type:'idle'},name:null};this.threads.set(thread.id,thread);return {thread};}
    if(method==='thread/name/set'){this.threads.get(tid).name=params.name;return {};}
    if(method==='thread/list')return {data:[...this.threads.values()],nextCursor:null};
    throw Error('unexpected RPC '+method);
  }
  message(method,params,id){this.emit('message',{method,params,...(id===undefined?{}:{id})},this.client.generation);}
  respond(id,result,generation){assert.equal(generation,this.client.generation);this.calls.push({method:'response',id,result});}
  close(){this.state.online=false;}
}
