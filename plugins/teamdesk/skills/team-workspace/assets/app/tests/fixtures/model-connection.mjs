import { EventEmitter } from 'node:events';
export class ModelConnection extends EventEmitter {
  constructor() {
    super(); this.state={online:true,pid:42};this.client={generation:'fixture',ready:true};this.calls=[];this.values=new Map();
    this.models=[{model:'model-a',displayName:'Model A',description:'General model',hidden:false,defaultReasoningEffort:'medium',supportedReasoningEfforts:[{reasoningEffort:'medium',description:'Balanced'},{reasoningEffort:'high',description:'Deep reasoning'}],serviceTiers:[{id:'priority',name:'Fast',description:'Faster, increased usage'}]},
      {model:'model-b',displayName:'Model B',description:'Lightweight model',hidden:false,defaultReasoningEffort:'low',supportedReasoningEfforts:[{reasoningEffort:'low',description:'Light reasoning'}],serviceTiers:[]}];
  }
  add(e) { this.values.set(e.threadId,{model:'model-a',modelProvider:'openai',reasoningEffort:'medium',serviceTier:null,thread:{id:e.threadId,cwd:e.cwd,name:e.name,status:{type:'idle'}},sandbox:{secret:'EXCLUDE-POLICY'},developerInstructions:'EXCLUDE-TEXT'}); }
  async request(method,params={}) {
    this.calls.push({method,params});const v=this.values.get(params.threadId);
    if(method==='model/list')return {data:this.models,nextCursor:null};
    if(method==='thread/resume')return structuredClone(v);
    if(method==='thread/settings/update') {
      for(const k of ['model','serviceTier'])if(Object.hasOwn(params,k))v[k]=params[k];
      if(params.effort)v.reasoningEffort=params.effort;
      this.notify(params.threadId);return {};
    }
    if(method==='hooks/list')return {data:[]};
    if(method==='thread/queue/list')return {data:[]};
    if(method==='thread/turns/list')return {data:[]};
    throw Error('Unexpected RPC '+method);
  }
  notify(id) {
    const v=this.values.get(id);
    this.emit('message',{method:'thread/settings/updated',params:{threadId:id,threadSettings:{...v,effort:v.reasoningEffort}}},this.client.generation);
  }
  async connect(){this.emit('connected');return this.state;}
  close(){this.state.online=false;}
}
