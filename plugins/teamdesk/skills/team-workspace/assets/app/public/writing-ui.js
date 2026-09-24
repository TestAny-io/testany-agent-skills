// Reusable form assistant: adoption only fills selected fields; the original form submits them.
const busyStates = new Set(['pending','creating','sending','running','uncertain']);
const stateLabels = {pending:'请求已保存',creating:'正在准备 Codex 撰写任务',sending:'正在送入 Codex',running:'AI 正在撰写',uncertain:'原生结果待核对',ready:'建议稿已生成',needs_input:'有几个关键问题需要确认',needs_sources:'参考资料尚未读取，当前稿待完善',failed:'本次生成未完成',cancelled:'已停止生成'};
const sourceLabels={pending:'尚未读取',located:'已找到，待阅读',read:'已读取正文',missing:'未找到资料',ambiguous:'请选择正确位置',unreadable:'读取未完成',waived:'你已选择暂不参考'};
export function sameWritingForm(a, b) {
  const normalized = f => ({name:(f?.name || '').trim(),role:(f?.role || '').trim(),departmentId:f?.departmentId || null,
    skills:[...(f?.skills || [])].sort(),text:(f?.text || '').trim(),
    employeeId:f?.employeeId || null,participants:[...(f?.participants || [])].sort(),mode:f?.mode || null,acceptanceCriteria:(f?.acceptanceCriteria || '').trim()});
  return JSON.stringify(normalized(a)) === JSON.stringify(normalized(b));
}
export function taskWritingPatch(current, baseline, result, fields) {
  if(current.mode!=='fifo'||!sameWritingForm(current,baseline))throw Error('表单内容已变化，请基于当前表单重新生成');
  if(result?.kind!=='draft'||!result.draft||!result.acceptanceCriteria)throw Error('任务建议尚未完整就绪');
  if(!fields.length||fields.some(f=>!['text','acceptanceCriteria'].includes(f)))throw Error('请选择要采用的任务目标或完成标准');
  return Object.fromEntries(fields.map(f=>[f==='text'?'instruction':f,f==='text'?result.draft:result.acceptanceCriteria]));
}
export function writingDiff(before, after) {
  const a = before.split('\n'), b = after.split('\n');
  // A bounded line diff keeps even long descriptions responsive.
  if (a.length * b.length > 80000) return [{type:'removed',text:before},{type:'added',text:after}];
  const dp = Array.from({length:a.length+1},()=>new Uint16Array(b.length+1));
  for (let i=a.length-1;i>=0;i--) for(let j=b.length-1;j>=0;j--) dp[i][j]=a[i]===b[j]?dp[i+1][j+1]+1:Math.max(dp[i+1][j],dp[i][j+1]);
  const out=[]; let i=0,j=0;
  while(i<a.length||j<b.length) {
    if(i<a.length&&j<b.length&&a[i]===b[j]) {out.push({type:'same',text:a[i++]});j++;}
    else if(j<b.length&&(i===a.length||dp[i][j+1]>=dp[i+1][j])) out.push({type:'added',text:b[j++]});
    else out.push({type:'removed',text:a[i++]});
  }
  return out;
}
export function writingUI({dialog,api,esc,toast,state}) {
  let current = null;
  const button=(label,action,disabled=false)=>'<button type="button" class="btn writing-'+action+'" data-writing="'+action+'"'+(disabled?' disabled':'')+'>'+esc(label)+'</button>';
  function formSnapshot(ctx) {
    const f = new FormData(ctx.form);
    if(ctx.kind==='task')return {employeeId:f.get('employeeId'),participants:f.getAll('participants'),mode:f.get('mode'),text:ctx.textarea.value,acceptanceCriteria:ctx.form.elements.acceptanceCriteria.value};
    return {name:f.get('name') || '',role:ctx.kind==='employee'?f.get('role')||'':'',departmentId:ctx.kind==='employee'?f.get('departmentId')||null:ctx.targetId,
      skills:ctx.kind==='employee'?f.getAll('skills'):[],text:ctx.textarea.value};
  }
  function remember(ctx) { try { sessionStorage.setItem(ctx.key,ctx.job.id); } catch {} }
  function mount() {
    current = null;
    const form=dialog.querySelector('form[data-form="department"],form[data-form="employee"],form[data-form="input"]');
    if(!form) return;
    const kind=form.dataset.form==='input'?'task':form.dataset.form,field={department:'responsibilities',employee:'instructions',task:'instruction'}[kind],textarea=form.elements.namedItem(field);
    const title={department:'部门职责',employee:'工作说明',task:'任务目标与完成标准'}[kind];
    const host=document.createElement('section');host.className='writing-assistant';host.setAttribute('aria-label',title+' AI 助手');
    host.innerHTML='<div class="writing-launch">'+button(textarea.value.trim()?'AI 帮我完善':'AI 帮我写','open')+'<span class="help">'+(kind==='task'?'一起撰写目标与标准，选择采用后再提交任务':'生成建议后，由你采用并保存')+'</span></div><div class="writing-body" hidden></div>';
    (kind==='task'?form.querySelector('#fifo-fields'):textarea.closest('.field')).after(host);
    const ctx=current={form,kind,title,textarea,host,targetId:form.dataset.id||null,key:'teamdesk-writing:'+kind+':'+(form.dataset.id||'new'),job:null,busy:false};
    form.addEventListener('input',()=>checkStale(ctx)); form.addEventListener('change',()=>checkStale(ctx));
    host.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.tagName!=='TEXTAREA'){e.preventDefault();if(e.target.tagName==='BUTTON')e.target.click();}});
    host.addEventListener('click',e=>{
      const b=e.target.closest('[data-writing]'); if(!b)return;
      e.preventDefault();e.stopPropagation();
      act(ctx,b.dataset.writing,b).catch(error=>{
        if(!ctx.host.isConnected)return;
        ctx.host.querySelector('.writing-error').textContent=error.message;
      });
    });
    checkStale(ctx);
  }
  function checkStale(ctx) {
    if(!ctx.host.isConnected)return;
    if(ctx.kind==='task')ctx.host.hidden=ctx.form.elements.mode.value!=='fifo';
    ctx.host.querySelector('[data-writing="open"]').textContent=ctx.textarea.value.trim()||(ctx.kind==='task'&&ctx.form.elements.acceptanceCriteria.value.trim())?'AI 帮我完善':'AI 帮我写';
    const stale=ctx.job&&!sameWritingForm(formSnapshot(ctx),ctx.job.form),note=ctx.host.querySelector('.writing-stale');
    if(note) {note.hidden=!stale;note.textContent='表单内容已变化。请基于当前表单重新生成，避免覆盖你的修改。';}
    const apply=ctx.host.querySelector('[data-writing="apply"]'),confirm=ctx.host.querySelector('.writing-confirm');
    if(apply)apply.disabled=ctx.job?.state!=='ready'||!!stale||ctx.busy||!!(confirm&&!confirm.checked)||(ctx.kind==='task'&&!ctx.host.querySelector('.writing-adopt:checked'));
  }
  function paint(ctx) {
    if(!ctx.host.isConnected)return;
    const box=ctx.host.querySelector('.writing-body');
    const oldInput=box.querySelector('.writing-intent')?.value || '',oldFeedback=box.querySelector('.writing-feedback')?.value || '';
    const answers=new Map([...box.querySelectorAll('.writing-answer')].map(el=>[el.dataset.question,el.value]));
    const sourcePaths=new Map([...box.querySelectorAll('.writing-source-path')].map(el=>[el.dataset.reference,el.value]));
    const checked=box.querySelector('.writing-confirm')?.checked,previousRevision=box.dataset.revision;
    const selected=new Map([...box.querySelectorAll('.writing-adopt')].map(el=>[el.dataset.field,el.checked]));
    const job=ctx.job,r=job?.rounds.at(-1),result=r?.result,busy=job&&busyStates.has(job.state),offline=!state().health.connection?.online||!state().settings.enabled;
    const unresolved=(r?.localReferences||[]).filter(ref=>!['read','waived'].includes(ref.status));
    box.dataset.revision=String(job?.revision||0);
    const lists=(title,items,kind='')=>items?.length?'<section class="writing-notes '+kind+'"><h4>'+title+'</h4><ul>'+items.map(t=>'<li>'+esc(t)+'</li>').join('')+'</ul></section>':'';
    const preview=(title,before,after,field)=>'<section class="writing-preview">'+(field?'<label class="confirmation-check"><input type="checkbox" class="writing-adopt" data-field="'+field+'" checked aria-label="采用'+title+'"><strong>'+title+'</strong></label>':'<h4>'+title+'</h4>')+'<pre>'+esc(after)+'</pre></section>'+
      (before?'<details class="writing-diff"><summary>查看'+(field?title:'')+'与原文的修改对比</summary><p class="help">− 删除 · + 新增</p><div>'+writingDiff(before,after).map(l=>'<div class="diff-'+l.type+'"><span aria-hidden="true">'+({same:' ',added:'+',removed:'−'}[l.type])+'</span><span>'+esc(l.text||' ')+'</span></div>').join('')+'</div></details>':'');
    box.innerHTML='<div class="flow between"><h3>'+ctx.title+'撰写助手</h3>'+button('收起','hide')+'</div>'+
      '<p class="help">'+(ctx.kind==='task'?'参考当前目标、标准、负责人及指定协作者的技能和相关生效资料。可选择采用一个或两个字段，提交任务后才派发。':'参考当前表单、相关部门、已选技能和生效团队资料。建议采用到表单后，再由你保存。')+' 也可直接在要求中提供本地仓库名或文件路径。</p>'+
      (offline?'<p class="writing-warning">'+(!state().settings.enabled?'团队接入已暂停。':'Codex 暂未连接。')+'已有表单和建议保留，可在团队设置中恢复连接。</p>':'')+
      (!job?'<label class="field spacer"><span>用一句话说说你的意图</span><textarea class="writing-intent" rows="3" maxlength="4000" placeholder="'+(ctx.kind==='task'?'例如：写一份天气应用 PRD，请协作者评审，明确交付范围和完成标准。':'例如：负责产品需求与设计，把想法推进到开发可以接手。')+'">'+esc(oldInput)+'</textarea></label>'+button('生成建议','generate',offline):
        '<div class="writing-status" role="status">'+esc(stateLabels[job.state]||job.state)+'</div>'+
        (job.threadId?'<a class="native-link" href="codex://threads/'+encodeURIComponent(job.threadId)+'">在 Codex 查看撰写过程 ↗</a>':'')+
        (busy?'<p class="help spacer">你可以继续编辑表单。建议生成后会显示在这里，采用前不会改动原文。</p>'+button('核对结果','sync',offline||!job.threadId)+
          button('停止生成','cancel',offline||['creating','sending'].includes(job.state)):'')+
        (job.error?'<p class="writing-warning pre">'+esc(job.error)+'</p>':'')+
        (r.localReferences?.length?'<section class="writing-sources spacer"><h4>本地参考资料</h4>'+r.localReferences.map(ref=>'<div class="writing-source"><div class="flow between"><strong>'+esc(ref.label)+'</strong><span class="badge">'+esc(sourceLabels[ref.status]||ref.status)+'</span></div>'+
          (ref.rootPath?'<p class="help writing-path">'+esc(ref.rootPath)+'</p>':'')+(ref.error?'<p class="help">'+esc(ref.error)+'</p>':'')+
          (job.state==='needs_sources'&&!['read','waived'].includes(ref.status)?'<label class="field"><span>资料完整路径（可补充或更正）</span><input type="text" class="writing-source-path" data-reference="'+esc(ref.id)+'" value="'+esc(sourcePaths.get(ref.id)||ref.selectedPath||'')+'" placeholder="例如 /Users/你的用户名/项目/资料仓库"></label>'+
            (ref.candidates||[]).map((candidate,i)=>'<button type="button" class="btn writing-source-option" data-writing="source-option" data-reference="'+esc(ref.id)+'" data-candidate="'+i+'">选择 '+esc(candidate.path)+'</button>').join(''):'')+'</div>').join('')+
          (job.state==='needs_sources'?'<p class="help">原表单与已有建议均保留。补充位置后重试，或明确选择暂不参考尚未读取的资料。</p><div class="flow">'+button('重试读取并完善','retry-sources',offline)+button('暂不参考这些资料，继续撰写','skip-sources',offline||!unresolved.length)+'</div>':'')+'</section>':'')+
        (result?'<p class="spacer">'+esc(result.summary)+'</p>'+lists('待确认的假设',result.assumptions,'writing-warning')+lists(ctx.kind==='task'?'目标、标准或约定冲突':'职责或约定冲突',result.conflicts,'writing-warning')+
          (result.questions.length?'<div class="writing-questions">'+result.questions.map((q,i)=>'<label class="field spacer"><span>'+esc(q.question)+'</span><textarea class="writing-answer" data-question="'+esc(q.id)+'" rows="2" maxlength="2000" placeholder="请选择下方建议，或输入自己的回答">'+esc(answers.get(q.id)||'')+'</textarea></label><div class="flow">'+q.options.map((option,j)=>'<button type="button" class="btn" data-writing="option" data-question-index="'+i+'" data-option-index="'+j+'">'+esc(option)+'</button>').join('')+'</div>').join('')+'</div>':'')+
          (result.kind==='draft'?(ctx.kind==='task'?preview('任务目标建议',job.form.text,result.draft,'text')+preview('完成标准建议',job.form.acceptanceCriteria,result.acceptanceCriteria,'acceptanceCriteria')+'<p class="help">勾选想采用的字段；未勾选的字段保留原文。采用后请一起核对目标与标准是否一致。</p>':preview('建议稿',job.form.text,result.draft))+
            lists('主要修改',result.changes)+
            ((result.assumptions.length||result.conflicts.length)?'<label class="confirmation-check"><input type="checkbox" class="writing-confirm">我已审阅待确认的假设及'+(ctx.kind==='task'?'目标、标准或约定冲突，将按需要修改后再提交任务。':'职责冲突，将按需要修改后再保存。')+'</label>':'')+
            '<p class="writing-stale writing-warning" hidden></p><div class="flow spacer">'+button(ctx.kind==='task'?'采用所选内容到表单':'采用到表单','apply')+'</div>':'')+
          '<details class="spacer"><summary>参考依据（实际读取记录）</summary><ul class="help writing-evidence">'+(r.sources||[]).map(s=>'<li>'+esc(s.title)+(s.type==='local'?'<div class="writing-path">'+esc(s.path)+'</div><div>第 '+s.startLine+'–'+s.endLine+' 行 · 读取于 '+esc(new Date(s.at).toLocaleString())+'</div><details><summary>文件版本</summary><span class="writing-path">SHA-256：'+esc(s.sha256)+'</span></details>':s.revision?' · 生效版本 '+esc(s.revision):' · 本轮查询快照')+'</li>').join('')+'</ul></details>':'')+
        (!busy?'<label class="field spacer"><span>'+(result?.kind==='clarify'?'补充要求（选填）':'继续修改建议')+'</span><textarea class="writing-feedback" rows="2" maxlength="4000" placeholder="例如：简短一点，增加交接条件。">'+esc(oldFeedback)+'</textarea></label><div class="flow">'+
          (job.state!=='cancelled'?button(result?.kind==='clarify'?'提交回答，继续撰写':'按要求修改','continue',offline):'')+button('基于当前表单重新生成','restart',offline)+'</div>':'')
      )+(job?.rounds.length>1?'<details class="writing-history spacer"><summary>撰写历史（'+(job.rounds.length-1)+' 轮）</summary>'+job.rounds.slice(0,-1).map((round,i)=>'<section class="writing-preview"><h4>第 '+(i+1)+' 轮 · '+esc(stateLabels[round.state]||round.state)+'</h4>'+(round.threadId?'<a class="native-link" href="codex://threads/'+encodeURIComponent(round.threadId)+'">查看本轮原生撰写 ↗</a>':'')+'<p class="help pre">'+esc(round.instruction)+'</p>'+(round.result?'<p>'+esc(round.result.summary)+'</p>'+(round.result.draft?'<pre>'+esc(round.result.draft)+'</pre>':'')+(round.result.acceptanceCriteria?'<h4>完成标准</h4><pre>'+esc(round.result.acceptanceCriteria)+'</pre>':''):'')+'</section>').join('')+'</details>':'')+'<p class="writing-error" role="alert"></p>';
    if(checked&&previousRevision===String(job?.revision)) {const check=box.querySelector('.writing-confirm');if(check)check.checked=true;}
    if(previousRevision===String(job?.revision))for(const el of box.querySelectorAll('.writing-adopt'))if(selected.has(el.dataset.field))el.checked=selected.get(el.dataset.field);
    checkStale(ctx);
  }
  async function load(ctx,id) {
    const job=await api('/api/writing/'+encodeURIComponent(id));
    if(current!==ctx)return;
    ctx.job=job;remember(ctx);paint(ctx);
  }
  async function act(ctx,action,b) {
    if(ctx.busy)return;
    if(ctx.kind==='task'&&ctx.form.elements.mode.value!=='fifo')throw Error('任务目标与完成标准助手用于新的独立业务');
    const box=ctx.host.querySelector('.writing-body');
    if(action==='open') {
      box.hidden=false;paint(ctx);
      if(!ctx.job) {let saved;try{saved=sessionStorage.getItem(ctx.key);}catch{}
        if(saved) await load(ctx,saved).catch(()=>{});}
      box.querySelector('textarea')?.focus();return;
    }
    if(action==='hide') {box.hidden=true;return;}
    if(action==='source-option') {
      const ref=ctx.job.rounds.at(-1).localReferences.find(r=>r.id===b.dataset.reference);
      const field=[...box.querySelectorAll('.writing-source-path')].find(el=>el.dataset.reference===ref.id);
      field.value=ref.candidates[Number(b.dataset.candidate)].path;field.focus();return;
    }
    if(action==='option') {
      const question=ctx.job.rounds.at(-1).result.questions[Number(b.dataset.questionIndex)];
      [...box.querySelectorAll('.writing-answer')].find(el=>el.dataset.question===question.id).value=question.options[Number(b.dataset.optionIndex)];return;
    }
    if(action==='apply') {
      if(!sameWritingForm(formSnapshot(ctx),ctx.job.form))throw Error('表单内容已变化，请基于当前表单重新生成');
      const check=box.querySelector('.writing-confirm');if(check&&!check.checked)throw Error('请先审阅待确认假设及职责冲突');
      const result=ctx.job.rounds.at(-1).result;if(ctx.job.state!=='ready'||result?.kind!=='draft')throw Error('建议尚未就绪');
      if(ctx.kind==='task') {
        const patch=taskWritingPatch(formSnapshot(ctx),ctx.job.form,result,[...box.querySelectorAll('.writing-adopt:checked')].map(el=>el.dataset.field));
        for(const [field,value] of Object.entries(patch))ctx.form.elements.namedItem(field).value=value;
      } else ctx.textarea.value=result.draft;
      ctx.textarea.dispatchEvent(new Event('input',{bubbles:true}));box.hidden=true;
      ctx.textarea.focus();toast(ctx.kind==='task'?'所选建议已填入，请核对目标与标准后再提交任务':'建议已填入表单，你可以修改后再保存');return;
    }
    if(action==='restart') {ctx.job=null;ctx.pending=null;try{sessionStorage.removeItem(ctx.key);}catch{}paint(ctx);box.querySelector('.writing-intent')?.focus();return;}
    let url,payload;
    if(action==='generate') {url='/api/writing';payload={kind:ctx.kind,targetId:ctx.targetId,form:formSnapshot(ctx),instruction:box.querySelector('.writing-intent').value.trim()};if(!payload.instruction)throw Error('请先写一句你的意图');}
    if(['continue','retry-sources','skip-sources'].includes(action)) {
      if(!sameWritingForm(formSnapshot(ctx),ctx.job.form))throw Error('表单已变化，请选择“基于当前表单重新生成”');
      const answers=Object.fromEntries([...box.querySelectorAll('.writing-answer')].map(el=>[el.dataset.question,el.value.trim()]));
      if(ctx.job.state!=='needs_sources'&&Object.values(answers).some(a=>!a))throw Error('请回答以上关键问题');
      const instruction=action==='retry-sources'?'请重新定位和读取指定本地资料，结合资料完善已有建议稿。':action==='skip-sources'?'本轮暂不参考明确跳过的资料，基于其余实际读取的内容继续撰写；未核实信息仍标为假设。':box.querySelector('.writing-feedback').value.trim()||(Object.keys(answers).length?'根据以上回答继续撰写建议稿':'');
      if(!instruction)throw Error('请说明希望如何修改');
      url='/api/writing/'+ctx.job.id+'/continue';payload={revision:ctx.job.revision,instruction,answers};
      payload.referenceChoices=Object.fromEntries([...box.querySelectorAll('.writing-source-path')].filter(el=>el.value.trim()).map(el=>[el.dataset.reference,el.value.trim()]));
      if(action==='skip-sources')payload.skipReferenceIds=ctx.job.rounds.at(-1).localReferences.filter(ref=>!['read','waived'].includes(ref.status)).map(ref=>ref.id);
    }
    if(action==='sync'||action==='cancel') {url='/api/writing/'+ctx.job.id+'/'+action;payload={revision:ctx.job.revision};}
    if(!url)return;
    ctx.busy=true;box.querySelectorAll('button').forEach(el=>el.disabled=true);box.querySelector('.writing-error').textContent='';
    const signature=JSON.stringify([url,payload]);if(ctx.pending?.signature!==signature)ctx.pending={signature,key:crypto.randomUUID()};
    try {
      const job=await api(url,payload,ctx.pending.key);ctx.pending=null;
      ctx.job=job;remember(ctx);
      if(['continue','retry-sources','skip-sources'].includes(action)){const el=box.querySelector('.writing-feedback');if(el)el.value='';}
      await load(ctx,job.id);
    } finally {ctx.busy=false;if(current===ctx)paint(ctx);}
  }
  async function refresh() {
    const ctx=current;if(!ctx?.job||ctx.busy||!ctx.host.isConnected)return;
    const meta=state().writing?.find(j=>j.id===ctx.job.id);
    if(meta?.updatedAt!==ctx.job.updatedAt)await load(ctx,ctx.job.id).catch(()=>{});
  }
  return {mount,refresh,formChanged:()=>{if(current)checkStale(current);}};
}
