const stages = { discover:'定位共享服务', desktop:'核验桌面连接', handshake:'原生握手', identity:'核验同一实例',
  service:'本地服务', desktop_launch:'请求启动桌面', shared_instance:'共享实例', metadata_recovery:'恢复状态',
  entry_resolved:'定位安装组件', codex_window_requested:'已请求显示 Codex 窗口', safari_opened:'已请求 Safari 打开', failed:'启动失败' };
export function connectionDetails(health, {esc,time,name}) {
  const c = health.connection || {}, r = health.recovery || {};
  const title = !c.online ? '连接尚未核验' : r.state === 'ready' ? '连接与状态恢复已完成' : r.state === 'partial' ? '已连接 · 部分状态待恢复' : '已连接 · 正在恢复状态';
  const rows = [
    ...(c.stages || []).map(s => ({...s, state:s.error?'失败':s.finishedAt?'已核验':'进行中'})),
    ...(health.startup?.startup?.stages || []).map(s => ({...s,state:({verified:'已核验',running:'进行中',failed:'失败',pending:'待核对'})[s.state] || s.state})),
    ...(health.startup?.desktop || []).map(s => ({...s,finishedAt:s.at,state:s.error?'失败':'系统已接受打开请求'})),
  ];
  return '<section class="connection-details"><h3>'+esc(title)+'</h3><p class="help">共享传输与业务状态分别核验。桌面/浏览器打开请求的回执不代表页面已经可见。</p>'+
    (r.startedAt ? '<p class="source">状态恢复：'+esc(({recovering:'进行中',ready:'完成',partial:'部分完成',disconnected:'连接断开'})[r.state] || r.state)+' · 已检查 '+(r.employees?.length||0)+' 位员工 · '+time(r.finishedAt || r.startedAt)+'</p>':'')+
    (r.errors?.length ? '<ul class="error">'+r.errors.map(e=>'<li>'+esc(e.employeeId?name(e.employeeId)+'：':'')+esc(e.message)+'</li>').join('')+'</ul>':'')+
    (c.nextRetryAt && !c.online ? '<p class="help">自动重连计划：'+time(c.nextRetryAt)+'；仅恢复连接，不重新发送未知结果的输入。</p>':'')+
    '<details><summary>启动与连接阶段</summary><ol class="stage-list">'+rows.map(s=>{
      const ms = Date.parse(s.finishedAt)-Date.parse(s.startedAt);
      return '<li><strong>'+esc(stages[s.name]||s.name)+'</strong> · '+esc(s.state)+'<div class="source">'+time(s.finishedAt||s.startedAt)+(Number.isFinite(ms)?' · '+(Math.max(0,ms)/1000).toFixed(1)+' 秒':'')+'</div>'+(s.error?'<p class="error">'+esc(s.error)+'</p>':'')+'</li>';
    }).join('')+'</ol></details></section>';
}
