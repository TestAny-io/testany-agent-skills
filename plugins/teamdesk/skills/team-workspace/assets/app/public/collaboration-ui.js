import {deliveryProgress,deliveryDetails} from './delivery.js';

const short=(text,n=16)=>{const v=Array.from(String(text||''));return v.length>n?v.slice(0,n).join('')+'…':v.join('');};
const statusText={task_started:'原生执行中',task_complete:'本轮已结束',not_observed:'状态未确认',unregistered:'待负责人建档',completed:'负责人报告完成',in_progress:'推进中',waiting_input:'等待输入',blocked:'受阻',cancelled:'已取消'};
export function topologyLayout(snapshot,collapsed=new Set()) {
 const employees=snapshot.employees.slice().sort((a,b)=>a.id.localeCompare(b.id,undefined,{numeric:true}));
 const groups=[],positions=new Map();let y=24,x=20,rowHeight=0;
 const ids=[...new Set(employees.map(e=>e.departmentId||'unassigned'))];
 for(const id of ids){
  const members=employees.filter(e=>(e.departmentId||'unassigned')===id),closed=collapsed.has(id);
  const columns=members.length<=2?2:4,width=columns===2?510:1040;
  if(x+width>1060){y+=rowHeight+24;x=20;rowHeight=0;}
  const height=closed?70:80+Math.ceil(members.length/columns)*114;
  groups.push({id,name:snapshot.departments.find(d=>d.id===id)?.name||'未分配部门',members,x,y,width,height,closed});
  members.forEach((e,i)=>positions.set(e.id,closed?{x:x+width/2,y:y+36,collapsed:true}:{x:x+24+(i%columns)*250,y:y+64+Math.floor(i/columns)*114}));
  x+=width+20;rowHeight=Math.max(rowHeight,height);
 }
 return {width:1080,height:y+rowHeight+24,groups,positions};
}
export function collaborationUI({state,api,esc,time,native,heading}) {
 let view=null,error='',loading=false,at=null,selectedTask='',department='',selection=null,collapsed=new Set(),zoom=1,entries=[],nextBefore=null,playing=false,playTimer,animate=true,lastMax=0,pulse=null,revision=0,scroll={left:0,top:0};
 const root=()=>document.querySelector('#collaboration-workspace');
 const button=(label,action,id='',attrs='')=>'<button type="button" class="btn" data-co-action="'+action+'" data-id="'+esc(id)+'" '+attrs+'>'+esc(label)+'</button>';
 const selected=(a,b)=>a===b?' selected':'';
 function page(){return heading('协作视图','从真实工作记录看清谁在联系谁、工作交给了谁')+'<div id="collaboration-workspace" aria-busy="'+loading+'">'+(view?content():'<div class="empty">正在读取协作 metadata…</div>')+'</div>';}
 function preserve(){const el=root()?.querySelector('.topology-viewport');if(el)scroll={left:el.scrollLeft,top:el.scrollTop};}
 function draw(){
  if(!root())return;
  preserve();const active=document.activeElement?.dataset,focus=active?.coAction?{action:active.coAction,id:active.id}:null;
  root().innerHTML=content();root().setAttribute('aria-busy',String(loading));
  pulse=null;
  const el=root().querySelector('.topology-viewport');if(el){el.scrollLeft=scroll.left;el.scrollTop=scroll.top;}
  if(focus)[...root().querySelectorAll('[data-co-action]')].find(x=>x.dataset.coAction===focus.action&&x.dataset.id===focus.id)?.focus({preventScroll:true});
 }
 const query=(extra={})=>{const params=new URLSearchParams({limit:'100',...(selectedTask?{taskRef:selectedTask}:{}),...(department?{departmentId:department}:{}),...(at!==null?{at:String(at)}:{}),...extra});return '/api/collaboration?'+params;};
 async function load({reset=false,cutoff}={}) {
  if(cutoff!==undefined)at=cutoff;
  const current=++revision;loading=true;error='';draw();
  try {
   const result=await api(query());if(current!==revision)return;
   if(at===null&&lastMax&&result.range.maxSeq>lastMax) {
    const e=result.timeline.find(e=>e.seq>lastMax&&e.entity==='events'&&['native_message','native_tool'].includes(e.data?.kind)&&(!e.data?.tool||e.data.tool==='send_message_to_thread'));
    pulse=e?.data?.requestId||null;
   } else if(playing) {
    pulse=entries.find(e=>e.commitSeq===result.cutoff&&e.entity==='events'&&['native_message','native_tool'].includes(e.data?.kind))?.data?.requestId||null;
   } else pulse=null;
   view=result;lastMax=result.range.maxSeq;
   if(reset||at===null||!entries.length){entries=result.timeline;nextBefore=result.nextBefore;}
   selection=selection&&hasSelection(selection)?selection:null;
  } catch(e){if(current===revision){error=e.message;pause();}}
  finally{if(current===revision){loading=false;draw();}}
 }
 function hasSelection(s){const data=view?.snapshot;return s.type==='edge'?data.requests.some(r=>r.id===s.id):s.type==='employee'?data.employees.some(e=>e.id===s.id):data.tasks.some(t=>t.id===s.id);}
 function timelineTitle(item) {
  const d=item.data||{},n=view?.snapshot.employees.find(e=>e.id===(d.employeeId||d.fromEmployeeId||d.ownerEmployeeId||(item.entity==='runtime'?d.id:null)))?.name;
  if(item.reason==='baseline')return '开始记录 · 当前 metadata 基线';
  if(item.reason==='reconciled')return '补充观察到更新 · '+(n||d.title||d.name||item.entityId);
  return ({employees:'员工资料更新',departments:'部门更新',runtime:'原生状态更新',tasks:'业务任务更新',requests:'请求 / 回执更新',operations:'原生投递更新',records:'工作报告',decisions:'人类决定状态',events:'原生证据',meta:'团队设置'})[item.entity]+' · '+(n||d.title||d.name||d.tool||d.state||d.status||item.entityId);
 }
 function stops(){return [...new Set([view?.range.baselineSeq,...entries.map(e=>e.commitSeq),view?.range.maxSeq].filter(Number.isSafeInteger))].sort((a,b)=>a-b);}
 function content() {
  const catalog=state(),data=view?.snapshot;
  const filters='<div class="co-toolbar"><label>业务任务<select data-co-filter="task"><option value="">所有任务</option>'+catalog.tasks.map(t=>'<option value="'+esc(t.id)+'"'+selected(selectedTask,t.id)+'>'+esc(t.businessId?t.title:t.title||t.id)+'</option>').join('')+'</select></label><label>部门参与范围<select data-co-filter="department"><option value="">所有部门</option><option value="unassigned"'+selected(department,'unassigned')+'>未分配部门</option>'+catalog.departments.map(d=>'<option value="'+esc(d.id)+'"'+selected(department,d.id)+'>'+esc(d.name)+(d.archived?'（已删除）':'')+'</option>').join('')+'</select></label>'+button('刷新','refresh')+'</div>';
  if(!data)return filters+'<p class="error">'+esc(error||'正在读取…')+'</p>';
  const points=stops(),index=at===null?points.length-1:Math.max(0,points.indexOf(at));
  const controls='<div class="co-playback"><div><span class="pill '+(at===null?'green':'purple')+'">'+(at===null?'实时观察':'历史回放 · 只读')+'</span> <span class="source">'+time(view.at)+' · #'+view.cutoff+'</span></div><div class="flow">'+button('上一步','prev','',index<=0?'disabled':'')+button(playing?'暂停回放':'播放历史',playing?'pause':'play')+button('下一步','next','',index>=points.length-1?'disabled':'')+button('回到实时','live','',at===null?'disabled':'')+'</div></div>';
  const counts='<div class="co-counts"><span><strong>'+view.counts.employees+'</strong> 位员工</span><span><strong>'+view.counts.tasks+'</strong> 项业务</span><span><strong>'+view.counts.handoffs+'</strong> 次工作交接</span><span><strong>'+view.counts.waiting+'</strong> 项交接待跟进</span></div>';
  const tools='<div class="co-canvas-tools"><div class="co-legend"><span class="co-dot green"></span> 接收/处理证据 <span class="co-dot amber"></span> 等待或结果待核对 <span class="co-dot blue"></span> 明确工作归属</div><div class="flow">'+button('−','zoom-out','', 'aria-label="缩小协作图"')+'<span>'+Math.round(zoom*100)+'%</span>'+button('+','zoom-in','', 'aria-label="放大协作图"')+button('重置','reset')+button(animate?'关闭动画':'开启动画','animation')+'</div></div>';
  const timeline='<section class="panel co-timeline"><div class="panel-heading"><h3>协作时间线</h3><span class="source">观察时间 · 基线始于 '+time(view.range.startedAt)+'</span></div><p class="help card-body">升级前的数据作为初始基线；回放展示当时已记录的事实。选中一条记录会还原该事务完成后的完整状态。播放与上下步遍历已加载的时刻；更早历史可继续加载。</p><div class="co-timeline-list">'+entries.map(item=>'<button type="button" class="co-timeline-row '+(at===item.commitSeq?'selected':'')+'" data-co-action="moment" data-id="'+item.commitSeq+'"><time>'+time(item.at)+'</time><span>'+esc(timelineTitle(item))+'</span><small>#'+item.commitSeq+'</small></button>').join('')+'</div>'+button('加载更早记录','older','',nextBefore?'':'disabled')+'</section>';
  return filters+(error?'<div class="error" role="alert">'+esc(error)+' '+button('重试读取','refresh')+'</div>':'')+controls+counts+
   '<div class="co-workbench '+(selection?'has-detail':'')+'"><section class="panel co-canvas">'+tools+'<div class="topology-viewport" tabindex="0" role="region" aria-label="员工协作拓扑，可用触控板或方向键平移">'+graph(data)+'</div><p class="help co-caption">箭头表示登记的通信方向；颜色表示当前证据状态。点选员工、箭头、任务或交接查看详情。动画仅标记新观察到的消息，不代表投递速度。</p></section>'+details()+'</div>'+timeline;
 }
 function graph(data) {
  if(!data.employees.length)return '<div class="empty"><h3>此范围还没有协作成员</h3><p>员工与工作记录会随实际业务出现，也可调整部门、任务或历史时刻。</p></div>';
  const layout=topologyLayout(data,collapsed),pos=layout.positions;
  let backgrounds='',nodes='',links='',labels='';
  const action=(type,id,label)=>' role="button" tabindex="0" data-co-action="'+type+'" data-id="'+esc(id)+'" aria-label="'+esc(label)+'"';
  for(const g of layout.groups){
   backgrounds+='<rect class="co-department" x="'+g.x+'" y="'+g.y+'" width="'+g.width+'" height="'+g.height+'" rx="16"/>';
   nodes+='<g class="co-group-toggle"'+action('collapse',g.id,(g.closed?'展开':'折叠')+g.name)+'><rect x="'+(g.x+14)+'" y="'+(g.y+10)+'" width="'+(g.width-32)+'" height="34" rx="8"/><text x="'+(g.x+28)+'" y="'+(g.y+33)+'">'+(g.closed?'＋':'−')+' '+esc(g.name)+' · '+g.members.length+' 人</text></g>';
   if(g.closed)continue;
   for(const e of g.members){const p=pos.get(e.id),selected=selection?.type==='employee'&&selection.id===e.id;
    nodes+='<g class="co-member '+(selected?'selected':'')+'"'+action('employee',e.id,e.name+'，'+e.role+'，'+(statusText[e.runtime]||'状态未确认'))+'><title>'+esc(e.name+' · '+e.role)+'</title><rect x="'+p.x+'" y="'+p.y+'" width="220" height="82" rx="12"/><circle class="co-avatar" cx="'+(p.x+26)+'" cy="'+(p.y+29)+'" r="15"/><text class="co-initial" x="'+(p.x+26)+'" y="'+(p.y+34)+'" text-anchor="middle">'+esc(short(e.name,1).replace('…',''))+'</text><text class="co-member-name" x="'+(p.x+50)+'" y="'+(p.y+29)+'">'+esc(short(e.name,11))+'</text><text class="co-muted" x="'+(p.x+50)+'" y="'+(p.y+48)+'">'+esc(short(e.role,16))+'</text><circle class="co-state '+(e.runtime==='task_started'?'active':'')+'" cx="'+(p.x+17)+'" cy="'+(p.y+67)+'" r="3"/><text class="co-muted" x="'+(p.x+28)+'" y="'+(p.y+71)+'">'+esc(e.archived?'已归档':statusText[e.runtime]||'状态未确认')+'</text></g>';
   }
  }
  const groups=new Map();
  for(const edge of view.edges){const key=edge.from+'>'+edge.to;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(edge);}
  let lane=0;
  for(const edges of groups.values()) {
   const edge=edges.at(-1),a=pos.get(edge.from),b=pos.get(edge.to);if(!a||!b)continue;
   if(a.collapsed&&b.collapsed&&a.x===b.x&&a.y===b.y)continue;
   const x1=a.x+(a.collapsed?0:110),y1=a.y+(a.collapsed?0:82),x2=b.x+(b.collapsed?0:110),y2=b.y;
   const bend=70+(lane++%4)*18,d='M '+x1+' '+y1+' C '+x1+' '+(y1+bend)+', '+x2+' '+(y2-bend)+', '+x2+' '+y2;
   const confirmed=edges.every(e=>['handled','reported','received','awaiting_result','awaiting_handling'].includes(e.state));
   const chosen=selection?.type==='edge'&&edges.some(e=>e.id===selection.id),pulseEdge=edges.find(e=>e.id===pulse);
   links+='<g class="co-edge '+(confirmed?'confirmed':'pending')+' '+(chosen?'selected':'')+'"'+action('edge',edge.id,(data.employees.find(e=>e.id===edge.from)?.name||edge.from)+' 联系 '+(data.employees.find(e=>e.id===edge.to)?.name||edge.to)+'，'+edges.length+' 条请求，'+edge.label)+'><title>'+esc(edges.length+' 条请求 · '+edge.label)+'</title><path class="co-edge-hit" d="'+d+'"/><path class="co-edge-line" marker-end="url(#co-arrow)" d="'+d+'"/></g>';
   labels+='<g class="co-edge-label"'+action('edge',edge.id,'查看 '+edges.length+' 条协作请求')+'><rect x="'+((x1+x2)/2-24)+'" y="'+((y1+y2)/2+9)+'" width="48" height="22" rx="11"/><text text-anchor="middle" x="'+((x1+x2)/2)+'" y="'+((y1+y2)/2+25)+'">'+edges.length+' 条</text></g>';
   if(pulseEdge&&animate&&!matchMedia('(prefers-reduced-motion: reduce)').matches)links+='<circle class="co-flight" r="5"><animateMotion path="'+d+'" dur="1.2s" repeatCount="1" fill="freeze"/></circle>';
  }
  let y=layout.height+20;
  const tasks=data.tasks.slice().sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||'')).slice(0,12),taskPositions=new Map();
  if(tasks.length) {
   nodes+='<text class="co-section-label" x="28" y="'+y+'">业务任务 · 负责人归属'+(data.tasks.length>12?'（显示最近 12 项，可用上方任务筛选聚焦）':'')+'</text>';y+=22;
   tasks.forEach((t,i)=>{const x=28+i%3*352,top=y+Math.floor(i/3)*112;taskPositions.set(t.id,{x:x+166,y:top+92});
    nodes+='<g class="co-task '+(selection?.id===t.id?'selected':'')+'"'+action('task',t.id,'任务 '+(t.title||t.businessId||t.id))+'><rect x="'+x+'" y="'+top+'" width="328" height="92" rx="12"/><text class="co-member-name" x="'+(x+14)+'" y="'+(top+25)+'">'+esc(short(t.title||t.businessId||'待负责人建档',19))+'</text><text class="co-muted" x="'+(x+14)+'" y="'+(top+48)+'">负责人：'+esc(data.employees.find(e=>e.id===t.ownerEmployeeId)?.name||t.ownerEmployeeId)+'</text><text class="co-muted" x="'+(x+14)+'" y="'+(top+73)+'">'+esc(statusText[t.status]||t.status)+' · '+(t.collaboration.unresolved.length?'待跟进交接 '+t.collaboration.unresolved.length:t.collaboration.missing.length?'尚缺指定协作 '+t.collaboration.missing.length:t.collaboration.edges.length?'协作记录已核对':'尚无工作交接')+'</text></g>';
    const owner=pos.get(t.ownerEmployeeId);if(owner&&selectedTask)links+='<path class="co-ownership" d="M '+(owner.x+(owner.collapsed?0:110))+' '+(owner.y+(owner.collapsed?0:82))+' L '+(x+164)+' '+top+'"/>';
   });y+=Math.ceil(tasks.length/3)*112+30;
  }
  const allWork=data.requests.filter(r=>r.kind==='work'&&taskPositions.has(r.taskRef)),work=allWork.slice(-12),workPositions=new Map();
  if(work.length){
   nodes+='<text class="co-section-label" x="28" y="'+y+'">明确登记的工作交接 · 连线按上游请求关联'+(allWork.length>12?'（显示最近 12 项，全部请求见消息列表）':'')+'</text>';y+=22;
   work.forEach((r,i)=>{const x=28+i%3*352,top=y+Math.floor(i/3)*100,p=deliveryProgress(r,data);workPositions.set(r.id,{x:x+164,y:top});
    nodes+='<g class="co-task co-handoff '+(selection?.id===r.id?'selected':'')+'"'+action('edge',r.id,'交接 '+(r.purpose||r.id))+'><rect x="'+x+'" y="'+top+'" width="328" height="80" rx="12"/><text class="co-member-name" x="'+(x+14)+'" y="'+(top+25)+'">'+esc(short(r.purpose||'协作工作',18))+'</text><text class="co-muted" x="'+(x+14)+'" y="'+(top+48)+'">'+esc(data.employees.find(e=>e.id===r.fromEmployeeId)?.name||r.fromEmployeeId)+' → '+esc(data.employees.find(e=>e.id===r.employeeId)?.name||r.employeeId)+'</text><text class="co-muted" x="'+(x+14)+'" y="'+(top+68)+'">'+esc(p.label)+'</text></g>';
   });
   for(const r of work){const to=workPositions.get(r.id),parent=workPositions.get(r.parentRequestId),from=parent?{x:parent.x,y:parent.y+80}:taskPositions.get(r.taskRef);if(from)links+='<path class="co-ownership" marker-end="url(#co-arrow)" d="M '+from.x+' '+from.y+' C '+from.x+' '+(from.y+25)+', '+to.x+' '+(to.y-25)+', '+to.x+' '+to.y+'"/>';}
   y+=Math.ceil(work.length/3)*100+20;
  }
  return '<svg class="co-svg" xmlns="http://www.w3.org/2000/svg" width="'+layout.width*zoom+'" height="'+y*zoom+'" viewBox="0 0 '+layout.width+' '+y+'" aria-label="部门、员工通信与工作交接"><defs><marker id="co-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z"/></marker></defs>'+backgrounds+links+nodes+labels+'</svg>';
 }
 function details() {
  if(!selection||!view)return '';
  const data=view.snapshot,s=selection;
  let title='',html='';
  if(s.type==='employee'){
   const e=data.employees.find(x=>x.id===s.id);if(!e)return '';
   title=e.name;const requests=data.requests.filter(r=>r.employeeId===e.id||r.fromEmployeeId===e.id);
   html='<p>'+esc(e.role)+' · '+esc(data.departments.find(d=>d.id===e.departmentId)?.name||'未分配部门')+'</p><p class="source">'+esc(e.id)+' · 绑定版本 '+e.bindingVersion+'</p>'+native(e.threadId)+'<h4>相关请求（'+requests.length+'）</h4>'+requests.slice().reverse().map(r=>button((r.fromEmployeeId===e.id?'发出':'接收')+' · '+(r.purpose||r.id),'edge',r.id)).join('');
  } else if(s.type==='task'){
   const t=data.tasks.find(x=>x.id===s.id);if(!t)return '';
   title=t.title||t.businessId||'待负责人建档';
   html='<p class="source">'+esc(t.businessId||t.id)+'</p><p>负责人：'+esc(data.employees.find(e=>e.id===t.ownerEmployeeId)?.name||t.ownerEmployeeId)+'</p><p>'+esc(statusText[t.status]||t.status)+'</p><p>人类验收：'+esc(t.acceptance?.revision===t.revision&&t.acceptance?.collaborationRevision===t.collaborationRevision?t.acceptance.verdict==='accepted'?'当前版本已通过':'已退回':'当前版本尚未通过')+'</p><h4>工作交接</h4>'+data.requests.filter(r=>r.taskRef===t.id&&r.kind==='work').map(r=>button(r.purpose||r.id,'edge',r.id)).join('');
  } else {
   const r=data.requests.find(x=>x.id===s.id);if(!r)return '';
   title=r.purpose||'请求与回执';
   const related=data.requests.filter(x=>x.fromEmployeeId===r.fromEmployeeId&&x.employeeId===r.employeeId);
   html='<p class="source">'+esc(r.id)+'</p>'+deliveryDetails(r,{...data,historical:view.historical,...(!view.historical?{health:state().health}:{})},{esc,time,native})+
    (r.parentRequestId?'<p class="source">上游请求：'+esc(r.parentRequestId)+'</p>':'')+(r.replyToRequestId?'<p class="source">回复请求：'+esc(r.replyToRequestId)+'</p>':'')+
    (related.length>1?'<h4>这个方向的其他请求</h4>'+related.filter(x=>x.id!==r.id).map(x=>button(x.purpose||x.id,'edge',x.id)).join(''):'');
  }
  return '<aside class="panel co-detail" aria-label="协作详情"><header><h3>'+esc(title)+'</h3>'+button('关闭','close-detail')+'</header><div class="co-detail-body">'+html+'</div></aside>';
 }
 function pause(){playing=false;clearTimeout(playTimer);}
 async function playStep(){
  if(!playing||!root())return pause();
  const points=stops(),i=at===null?-1:points.indexOf(at);
  if(i>=points.length-1){pause();draw();return;}
  await load({cutoff:points[i+1]});if(playing)playTimer=setTimeout(playStep,1100);
 }
 async function handle(action,id) {
  if(['employee','edge','task'].includes(action)){selection={type:action,id};pulse=null;draw();return;}
  if(action==='close-detail'){selection=null;draw();return;}
  if(action==='collapse'){collapsed.has(id)?collapsed.delete(id):collapsed.add(id);draw();return;}
  if(action==='zoom-in'||action==='zoom-out'){zoom=Math.max(.6,Math.min(1.6,Math.round((zoom+(action==='zoom-in'?.1:-.1))*10)/10));draw();return;}
  if(action==='reset'){zoom=1;collapsed.clear();scroll={left:0,top:0};draw();const el=root()?.querySelector('.topology-viewport');if(el)el.scrollTo(0,0);return;}
  if(action==='animation'){animate=!animate;draw();return;}
  if(action==='pause'){pause();draw();return;}
  if(action==='play'){pause();playing=true;if(at===stops().at(-1))at=null;await playStep();return;}
  if(action==='live'){pause();at=null;await load({reset:true});return;}
  if(action==='moment'){pause();await load({cutoff:Number(id)});return;}
  if(action==='prev'||action==='next'){pause();const p=stops(),i=at===null?p.length-1:p.indexOf(at);if(p[i+(action==='next'?1:-1)]!==undefined)await load({cutoff:p[i+(action==='next'?1:-1)]});return;}
  if(action==='older'&&nextBefore){
   const current=revision;
   const page=await api(query({at:String(view.range.maxSeq),before:String(nextBefore)}));if(current!==revision)return;
   entries=[...new Map([...entries,...page.timeline].map(e=>[e.seq,e])).values()].sort((a,b)=>b.seq-a.seq);nextBefore=page.nextBefore;draw();return;
  }
  if(action==='refresh')await load();
 }
 document.addEventListener('click',e=>{const b=e.target.closest?.('[data-co-action]');if(b&&root()?.contains(b)){e.preventDefault();handle(b.dataset.coAction,b.dataset.id).catch(err=>{error=err.message;draw();});}});
 document.addEventListener('change',e=>{
  if(!e.target.matches?.('[data-co-filter]'))return;
  pause();if(e.target.dataset.coFilter==='task')selectedTask=e.target.value;else department=e.target.value;
  at=null;selection=null;entries=[];scroll={left:0,top:0};load({reset:true});
 });
 document.addEventListener('keydown',e=>{
  if(!root()?.contains(e.target))return;
  if(e.key==='Escape'){pause();selection=null;draw();}
  else if((e.key==='Enter'||e.key===' ')&&e.target.matches?.('g[data-co-action]')){e.preventDefault();handle(e.target.dataset.coAction,e.target.dataset.id);}
 });
 return {page,preserve,async mount(){if(!root()){pause();return;}if(at===null||!view)await load();else draw();},
  async open(taskRef){pause();selectedTask=taskRef||'';department='';at=null;entries=[];selection=null;view=null;location.hash='#collaboration';if(root())await load({reset:true});},
  async refresh(){if(root()&&at===null&&!loading)await load();}};
}
