import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
export class WritingConnection extends EventEmitter {
  constructor({automatic=false,delay=100}={}) {super();this.state={online:true,pid:42};this.client={generation:'fixture'};this.calls=[];this.threads=new Map();this.automatic=automatic;this.delay=delay;this.timers=new Set();}
  async connect(){this.emit('connected');return this.state;}
  async request(method,params={}) {
    this.calls.push({method,params});
    if(method==='hooks/list')return {data:[]};
    if(method==='thread/list')return {data:[...this.threads.values()],nextCursor:null};
    if(method==='thread/start') {const thread={id:randomUUID(),cwd:params.cwd,name:null,status:{type:'idle'},turns:[]};this.threads.set(thread.id,thread);return {thread};}
    const thread=this.threads.get(params.threadId);
    if(method==='thread/name/set'){thread.name=params.name;return {};}
    if(method==='thread/resume')return {thread};
    if(method==='thread/turns/list')return {data:[...thread.turns].reverse(),nextCursor:null};
    if(method==='turn/start') {
      const turn={id:randomUUID(),status:'inProgress',items:[]};thread.turns.push(turn);thread.status={type:'active'};
      this.message('turn/started',{threadId:thread.id,turn});
      const input={id:randomUUID(),type:'userMessage',clientId:params.clientUserMessageId,content:params.input};turn.items.push(input);
      this.message('item/completed',{threadId:thread.id,turnId:turn.id,item:input});
      if(this.automatic) {
        const timer=setTimeout(()=>{
          this.timers.delete(timer);const contextId=randomUUID();this.message('item/tool/call',{threadId:thread.id,turnId:turn.id,callId:randomUUID(),tool:'teamdesk_writing_context',arguments:{topic:'overview',id:''}},contextId);
          const context=JSON.parse(this.calls.find(c=>c.id===contextId)?.result.contentItems[0].text||'{}');
          for(const ref of context.localReferences||[])if(ref.status!=='waived') {
            const id=randomUUID();this.message('item/tool/call',{threadId:thread.id,turnId:turn.id,tool:'teamdesk_local_sources',arguments:{action:'locate',reference:ref.label,path:'',query:'',offset:0,limit:100}},id);
            const found=JSON.parse(this.calls.find(c=>c.id===id)?.result.contentItems[0].text||'{}');
            if(found.rootPath)this.message('item/tool/call',{threadId:thread.id,turnId:turn.id,tool:'teamdesk_local_sources',arguments:{action:'read',reference:ref.label,path:found.candidates[0].type==='file'?'':'README.md',query:'',offset:0,limit:100}},randomUUID());
          }
          const round=thread.turns.length;
          let result=round===1?{kind:'clarify',draft:'',summary:'需要确认交接边界。',changes:[],assumptions:[],conflicts:[],questions:[{id:'handoff',question:'是否负责上线后的用户反馈分析？',options:['负责分析并交给产品负责人','只负责上线前交付']}]}:
          {kind:'draft',draft:round>2?'负责产品需求与设计。交付经评审的需求和设计说明，交接给研发部门。':'负责产品需求与设计，明确目标、范围与验收标准。\n交付经评审的需求和设计说明，交接给研发部门。\n上线后收集反馈并交给产品负责人确认。\n建议：跨部门职责有争议时提交人类确认。',summary:'根据你的回答补充了交付与交接条件。',changes:['明确交付物与接收方','补充反馈处理边界'],assumptions:round>2?[]:['跨部门职责争议由人类最终确认'],conflicts:[],questions:[]};
          if(params.outputSchema?.properties.acceptanceCriteria)result=round===1?
            {kind:'clarify',draft:'',acceptanceCriteria:'',summary:'需要确认此次交付范围。',changes:[],assumptions:[],conflicts:[],questions:[{id:'scope',question:'本次是否仅编写与评审 PRD？',options:['只做 PRD 和评审','还需设计原型'] }]}:
            {kind:'draft',draft:round>2?'编写天气应用 PRD，交由评审员独立评审并整合；不做原型或代码。':'编写天气应用 PRD，明确城市查询、天气展示和异常状态。\n请已指定的评审员工独立评审，由负责人整合必改项。\n只交付需求说明与评审证据，不做原型或代码。',acceptanceCriteria:round>2?'PRD 与评审记录齐全；必改项已处理并提供证据。':'1. PRD 覆盖约定范围及异常情况，各需求可核验。\n2. 指定评审员工实际参与，提交独立评审记录。\n3. 必改项处理完毕并附证据；交付 PRD 与记录供人类验收。',summary:'任务范围与完成标准已联动整理。',changes:['明确交付范围','增加独立评审与处理证据'],assumptions:round>2?[]:['天气展示细项由需求提出方确认'],conflicts:[],questions:[]};
          if(context.localReferences?.length&&result.kind==='clarify')result={kind:'draft',draft:'建议：依据本地资料明确工作职责、交付物和协作边界。',summary:'已生成待核对的职责建议。',changes:['结合参考资料'],assumptions:['组织职责由人类确认'],conflicts:[],questions:[]};
          this.finish(thread.id,result);
        },this.delay);this.timers.add(timer);
      }
      return {turn};
    }
    if(method==='turn/interrupt') {const turn=thread.turns.find(t=>t.id===params.turnId);turn.status='interrupted';thread.status={type:'idle'};this.message('turn/completed',{threadId:thread.id,turn});return {};}
    throw Error('Unexpected writing fixture RPC '+method);
  }
  finish(threadId,result,status='completed') {const t=this.threads.get(threadId),turn=t.turns.at(-1);if(turn.status!=='inProgress')return;const item={id:randomUUID(),type:'agentMessage',phase:'final_answer',text:typeof result==='string'?result:JSON.stringify(result)};turn.items.push(item);this.message('item/completed',{threadId,turnId:turn.id,item});turn.status=status;t.status={type:'idle'};this.message('turn/completed',{threadId,turn});}
  message(method,params,id){this.emit('message',{method,params,...(id===undefined?{}:{id})},this.client.generation);}
  respond(id,result,generation){this.calls.push({method:'response',id,result,generation});}
  close(){for(const t of this.timers)clearTimeout(t);this.state.online=false;}
}
