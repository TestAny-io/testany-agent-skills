const effortNames = { none:'None', minimal:'Minimal', low:'Low', medium:'Medium', high:'High', xhigh:'Extra High', max:'Max', ultra:'Ultra' };

export function employeeModelsUI({state, dialog, api, show, esc, time, toast, refresh}) {
  let editor;
  function description(e) {
    const v = e?.modelSettings, a = v?.actual;
    if (!a) return e?.threadId ? '尚未同步模型配置' : '绑定后继承 Codex 配置';
    const speed = a.serviceTier === null ? '标准速度' : ['priority','fast'].includes(a.serviceTier) ? 'Fast 开启' : a.serviceTier;
    return `${a.model} · ${effortNames[a.effort] || a.effort || '思考深度由 Codex 决定'} · ${speed}`;
  }
  function summary(e) {
    return `<span data-model-summary="${esc(e.id)}">${esc(description(e))}${e.modelSettings?.actual && !e.modelSettings?.current ? ' · 最近同步' : ''}</span>`;
  }
  function changed() {
    for (const box of document.querySelectorAll('[data-model-summary]')) {
      const e = state().employees.find(e => e.id === box.dataset.modelSummary);
      if (e) box.textContent = description(e) + (e.modelSettings?.actual && !e.modelSettings?.current ? ' · 最近同步' : '');
    }
    if (!editor?.container.isConnected || !dialog.open || editor.saving) return;
    const e = state().employees.find(e => e.id === editor.id), form = editor.container.querySelector('form');
    if (!form) return;
    const v = e?.modelSettings, invalid = !state().health.connection?.online || e?.archived || e?.bindingVersion !== editor.view.bindingVersion || (v?.revision && v.revision !== editor.view.revision);
    if (invalid) {
      form.querySelector('[type="submit"]').disabled = true;
      form.querySelector('.error').textContent = '连接、绑定或 Codex 设置已变化。已保留你的选择；请先点击“刷新配置”核对。';
    }
  }
  async function open(id) {
    const e = state().employees.find(x => x.id === id);
    if (!e) return;
    show('模型与运行偏好 · ' + e.name, '<div class="model-editor"><p role="status">正在读取 Codex 配置…</p></div>');
    editor = {id, container:dialog.querySelector('.model-editor'), view:e.modelSettings || {}, saving:false};
    await load(editor);
  }
  async function load(ed) {
    const results = await Promise.allSettled([api(`/api/employees/${ed.id}/models`),api('/api/model-catalog')]);
    if (!ed.container.isConnected || !dialog.open) return;
    ed.view = results[0].status === 'fulfilled' ? results[0].value : state().employees.find(e=>e.id===ed.id)?.modelSettings || {};
    ed.models = results[1].status === 'fulfilled' ? results[1].value.models : [];
    ed.error = results.filter(r=>r.status==='rejected').map(r=>r.reason.message).join('；');
    render(ed);
  }
  function render(ed) {
    const {view:v,models,container} = ed, a = v.actual;
    const editable = a && v.current && !ed.error && v.operation?.state !== 'uncertain';
    const currentModel = models.find(m=>m.model===a?.model);
    const options = (items,selected) => items.map(([id,name])=>`<option value="${esc(id)}" ${id===selected?'selected':''}>${esc(name)}</option>`).join('');
    container.innerHTML = `<p class="help">这是该员工后续轮次的默认配置，包括尚未开始的排队任务。当前轮次继续沿用原配置；协作员工保留各自设置。</p>
      <section class="model-observed"><strong>${v.current && !ed.error ? 'Codex 已同步的默认配置' : '最近同步的配置'}</strong>
      <p>${esc(description({threadId:v.threadId,modelSettings:v}))}</p>
      <p class="source">${a ? '同步于 '+esc(time(a.at)) : '连接并绑定 Codex 会话后可读取。'}</p></section>
      <div class="flow spacer"><button class="btn" type="button" data-model-refresh>刷新配置</button><span class="help">在 Codex 中修改后，这里会同步更新。</span></div>
      ${v.operation?.state==='uncertain'?'<p class="model-warning" role="status">上次修改结果待核对。请刷新读取原生结果，不会自动重发修改。</p>':''}
      ${v.operation?.desired && a && ['model','effort','serviceTier'].some(k=>a[k]!==v.operation.desired[k]) && ['verified','different'].includes(v.operation.state)?'<p class="model-warning" role="status">当前 Codex 配置与上次保存的选择不同，下面显示原生实际值。你可以重新选择并保存。</p>':''}
      ${ed.error?`<p class="error" role="alert">${esc(ed.error)}</p>`:''}
      <form class="model-preferences"><fieldset ${editable?'':'disabled'}>
        <label class="field">模型<select name="model" required aria-label="模型">${!currentModel?`<option value="" selected disabled>${a?'当前模型未列入可用目录，请选择':'连接后可选择模型'}</option>`:''}${options(models.map(m=>[m.model,m.name]),a?.model)}</select></label>
        <p class="help model-description"></p>
        <div class="grid2 spacer"><label class="field">思考深度<select name="effort" required aria-label="思考深度"></select></label>
        <label class="field">速度模式<select name="tier" required aria-label="速度模式"></select></label></div>
        <p class="help effort-description"></p><p class="help tier-description"></p>
        <p class="help spacer">Fast 会增加额度消耗，按 Codex 当前模型说明为准。只调整模型服务速度，不改变 FIFO 排队顺序。</p>
        <p class="help">当前 Codex 版本重新加载会话后可能恢复标准速度，请以同步读回的值为准。</p>
        <p class="model-change-note help" role="status"></p>
        <div class="error" role="alert"></div><div class="modal-footer"><button class="btn primary" type="submit">保存到 Codex</button></div>
      </fieldset></form>`;
    const form = container.querySelector('form');
    function fill(modelChanged=false) {
      const m=models.find(m=>m.model===form.elements.model.value);
      const previousEffort=modelChanged?form.elements.effort.value:a?.effort;
      const previousTier=modelChanged?(form.elements.tier.value.startsWith('native:')?form.elements.tier.value.slice(7):null):(a?.serviceTier??null);
      const effort=m?.efforts.some(x=>x.id===previousEffort)?previousEffort:m?.defaultEffort;
      const supportedTier=previousTier===null || m?.tiers.some(x=>x.id===previousTier);
      const tier=supportedTier?previousTier:null;
      form.elements.effort.innerHTML=options((m?.efforts||[]).map(x=>[x.id,effortNames[x.id]||x.id]),effort);
      form.elements.tier.innerHTML=(!modelChanged&&!supportedTier?'<option value="" selected disabled>当前速度模式未列入目录，请选择</option>':'')+options([['standard','标准速度（Fast 关闭）'],...(m?.tiers||[]).map(x=>['native:'+x.id,x.name])],!modelChanged&&!supportedTier?'':tier===null?'standard':'native:'+tier);
      form.querySelector('.model-description').textContent=m?.description||'';
      form.querySelector('.model-change-note').textContent=modelChanged && (effort!==previousEffort||tier!==previousTier)?'已按新模型调整不支持的选项，请核对思考深度与速度模式。':previousEffort!==effort&&m?'当前思考深度未指定或未列入模型目录，已显示模型建议值，请核对后保存。':'';
      details();
    }
    function details() {
      const m=models.find(m=>m.model===form.elements.model.value);
      form.querySelector('.effort-description').textContent=m?.efforts.find(x=>x.id===form.elements.effort.value)?.description||'';
      form.querySelector('.tier-description').textContent=form.elements.tier.value==='standard'?'使用标准速度。':m?.tiers.find(x=>'native:'+x.id===form.elements.tier.value)?.description||'请明确选择速度模式。';
    }
    fill();
    form.elements.model.addEventListener('change',()=>fill(true));
    form.elements.effort.addEventListener('change',details); form.elements.tier.addEventListener('change',details);
    container.querySelector('[data-model-refresh]').addEventListener('click',async event=>{
      event.currentTarget.disabled=true; await load(ed);
    });
    form.addEventListener('submit',async event=>{
      event.preventDefault(); event.stopPropagation(); if(ed.saving||!editable)return;
      ed.saving=true; form.querySelector('fieldset').disabled=true; container.querySelector('[data-model-refresh]').disabled=true;
      try {
        const body={model:form.elements.model.value,effort:form.elements.effort.value,serviceTier:form.elements.tier.value==='standard'?null:form.elements.tier.value.slice(7),revision:v.revision,bindingVersion:v.bindingVersion};
        const signature=JSON.stringify(body);
        if(ed.signature!==signature){ed.key=crypto.randomUUID();ed.signature=signature;}
        const result=await api(`/api/employees/${ed.id}/models`,body,ed.key);
        ed.view=result;ed.error=null;ed.key=null;ed.signature=null;
        await refresh();
        if(container.isConnected&&dialog.open){render(ed);toast('已读回确认，后续轮次使用新配置');}
      } catch(error) {
        if(container.isConnected){form.querySelector('.error').textContent=error.message+' 请刷新配置核对后再操作。';container.querySelector('[data-model-refresh]').disabled=false;}
      } finally {ed.saving=false;}
    });
  }
  return {open,summary,refresh:changed};
}
