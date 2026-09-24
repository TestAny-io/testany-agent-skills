// Human controls and employee CLI share the same versioned workspace records.
export function workspaceUI({ state, filters, esc, tag, btn, heading, panel, field, opts, empty, matched, filterbar, show, api, time, name }) {
  const activeDepartments = () => state().departments.filter(d => !d.archived);
  const departmentName = id => { const d = state().departments.find(d => d.id === id); return d ? d.name + (d.archived ? '（已删除）' : '') : '全团队'; };
  const members = id => state().employees.filter(e => !e.archived && e.departmentId === id);
  const kinds = [['rules', '工作约定'], ['sop', 'SOP'], ['reference', '参考资料'], ['proposal', '建议'], ['protocol', '员工协议']];
  const statuses = [['draft', '草案'], ['effective', '已生效'], ['deleted', '已删除'], ['archived', '已归档']];
  const retired = d => ['deleted','archived'].includes(d.latestStatus || d.status);
  const label = (list, value) => list.find(x => x[0] === value)?.[1] || value;
  function departments() {
    const list = state().departments.filter(d => (filters().select === 'archived' ? d.archived : !d.archived) && matched(d.name + ' ' + d.responsibilities));
    return heading('部门', '明确部门职责与交接联系人，让员工按需找到合适的同事', btn('新建部门', 'new-department', '', true)) +
      filterbar('搜索部门或职责', [['all', '在用部门'], ['archived', '已删除部门']]) + '<div class="employee-grid">' +
      (list.map(d => '<article class="employee-card"><div class="flow between"><h2>' + esc(d.name) + '</h2>' +
        tag(members(d.id).length + ' 位员工') + '</div><p class="pre department-summary">' + esc(d.responsibilities || '尚未填写部门职责') +
        '</p><p class="help spacer">交接联系人：' + esc(d.contactEmployeeId ? name(d.contactEmployeeId) : '未指定') +
        '</p><div class="spacer flow">' + btn('查看部门', 'department', d.id) +
        btn(d.archived ? '恢复部门' : '编辑', 'edit-department', d.id) + (!d.archived ? btn('删除部门', 'delete-department', d.id) : '') + '</div></article>').join('') ||
        empty('没有符合条件的部门', '可以新建部门，或调整筛选。')) + '</div>';
  }
  function departmentForm(id) {
    const d = state().departments.find(d => d.id === id);
    show(d?.archived ? '恢复部门' : d ? '编辑部门' : '新建部门', '<form data-form="department" data-id="' + esc(id || '') + '" data-revision="' + (d?.revision || 0) + '">' +
      (d?.archived ? '<p class="help spacer">恢复部门及其原有资料入口；员工保留当前归属，需要时可重新分配。</p>' : '') +
      field('部门名称', '<input name="name" required maxlength="80" value="' + esc(d?.name) + '">') +
      field('部门职责', '<textarea name="responsibilities" rows="5" maxlength="4000" placeholder="负责什么、适合接收哪些工作、职责边界">' + esc(d?.responsibilities) + '</textarea>', '所有员工都能按需查询。原分组迁移后，职责由你补充确认。') +
      field('交接联系人（选填）', '<select name="contactEmployeeId">' + opts([['', '不指定'], ...members(id).map(e => [e.id, e.name + ' · ' + e.role])], d?.contactEmployeeId || '') + '</select>', '联系人须为本部门在职员工；员工仍可直接联系其他成员。') +
      '<div class="error" role="alert"></div><div class="modal-footer">' + btn(d?.archived ? '保存并恢复' : '保存部门', 'submit', '', true) + '</div></form>');
  }
  function departmentDetail(id) {
    const d = state().departments.find(d => d.id === id);
    if (!d) return;
    show(d.name, '<p class="pre">' + esc(d.responsibilities || '尚未填写部门职责') + '</p><p class="help spacer">交接联系人：' +
      esc(d.contactEmployeeId ? name(d.contactEmployeeId) : '未指定') + ' · 版本 ' + d.revision + '</p>' +
      panel('部门成员', '<div class="card-body stack">' + (members(id).map(e => '<div class="flow between"><div><strong>' + esc(e.name) +
        '</strong><p class="help">' + esc(e.role) + '</p></div><div class="flow">' + btn('员工详情', 'employee', e.id) +
        btn('转部门', 'transfer-employee', e.id) + btn('移出部门', 'remove-employee-department', e.id) + '</div></div>').join('') || '<p class="help">暂无在职员工</p>') + '</div>') +
      '<p class="help">同部门可查询技能描述；其他部门可查询职责、成员岗位和联系入口。</p><div class="modal-footer flow">' +
      btn(d.archived ? '恢复部门' : '编辑部门', 'edit-department', id) + (!d.archived ? btn('删除部门', 'delete-department', id) : '') + '</div>');
  }
  function employeeDepartmentForm(id, remove = false) {
    const e = state().employees.find(e => e.id === id && !e.archived);
    if (!e) return;
    const destinations = activeDepartments().filter(d => d.id !== e.departmentId);
    show(remove ? '移出部门' : e.departmentId ? '转部门' : '分配部门',
      '<p><strong>' + esc(e.name) + '</strong> · 当前部门：' + esc(e.departmentId ? departmentName(e.departmentId) : '未分配') + '</p>' +
      '<form data-form="employee-department" data-id="' + esc(id) + '" data-revision="' + (e.departmentRevision || 0) + '">' +
      (remove ? '<input type="hidden" name="departmentId" value=""><p class="spacer">确认将这位员工移出部门？移出后显示为“未分配”。</p>' :
        field('转入部门', '<select name="departmentId" required>' + opts([['', '请选择部门'], ...destinations.map(d => [d.id,d.name])], '') + '</select>',
          destinations.length ? '员工将退出原部门，加入所选部门。' : '暂无其他部门，请先创建部门。') + (!destinations.length ? btn('新建部门', 'new-department') : '')) +
      '<p class="help spacer">员工身份、技能、Codex 会话和现有任务保留。若是原部门的交接联系人，该联系人设置会自动清空。</p>' +
      '<div class="error" role="alert"></div><div class="modal-footer flow">' + btn('取消', 'close') +
      btn(remove ? '确认移出' : '确认转入', 'submit', '', true) + '</div></form>');
  }
  function deleteDepartmentForm(id) {
    const d = state().departments.find(d => d.id === id && !d.archived);
    if (!d) return;
    const staff = members(id), snapshot = staff.map(e => ({id:e.id,revision:e.departmentRevision || 0}));
    show('删除部门', '<form data-form="department-delete" data-id="' + esc(id) + '" data-revision="' + d.revision +
      '" data-members="' + esc(JSON.stringify(snapshot)) + '"><p>确认删除 <strong>' + esc(d.name) + '</strong>？</p>' +
      (staff.length ? '<p class="spacer">本部门有 ' + staff.length + ' 位在职员工，请明确他们的去向：</p><ul>' +
        staff.map(e => '<li>' + esc(e.name) + ' · ' + esc(e.role) + '</li>').join('') + '</ul>' +
        field('员工去向（必选）', '<select name="targetDepartmentId" required>' + opts([['','请选择处理方式'],['unassigned','移出部门，暂时未分配'],
          ...activeDepartments().filter(x => x.id !== id).map(x => [x.id,'全部转入：' + x.name])], '') + '</select>',
          '此选择应用于以上所有员工。若需分别安排，可取消后在部门成员列表逐人转移。') : '<p class="spacer">本部门没有在职员工。</p>') +
      '<p class="help spacer">历史任务、员工会话和部门资料保留；资料仍属于原部门，不随员工转移。删除后可在“已删除部门”中恢复。</p>' +
      '<div class="error" role="alert"></div><div class="modal-footer flow">' + btn('取消','close') +
      btn(staff.length ? '确认处理员工并删除部门' : '确认删除部门','submit','',true) + '</div></form>');
  }
  function resources() {
    const list = state().resources.filter(d => ((!filters().select || filters().select === 'all') ? !retired(d) : filters().select === d.status) && matched(d.title + ' ' + departmentName(d.departmentId)));
    return heading('团队资料', '员工按需查询已生效的资料；草案保留供你审阅', btn('新建资料', 'new-resource', '', true)) +
      filterbar('搜索标题或部门', [['all', '在用资料'], ...statuses]) + '<div class="employee-grid">' +
      (list.map(d => '<article class="employee-card"><div class="flow between">' + tag(label(kinds, d.kind)) + tag(label(statuses, d.status), d.status === 'effective' ? 'green' : '') +
        '</div><h2>' + esc(d.title) + '</h2><p class="help spacer">' + esc(departmentName(d.departmentId)) + ' · ' + (d.readOnly ? '系统内置 · 随版本维护 · ' : '最新版本 ') + esc(d.revision) +
        '</p><p class="help">' + (d.readOnly ? esc(d.readOnlyReason) : retired(d) ? '员工查询已停用；恢复后先保存为草案' : state().departments.some(x => x.id === d.departmentId && x.archived) ? '所属部门已删除，资料保留供你查阅' : d.status === 'draft' && d.effectiveRevision ? '员工仍使用已生效版本 ' + d.effectiveRevision : d.status === 'draft' ? '尚未向员工生效' : '可供员工查询') +
        '</p><div class="spacer flow">' + btn('查看资料', 'resource', d.id) + resourceActions(d) + '</div></article>').join('') ||
        empty('没有符合条件的资料', '新增 SOP、工作约定、参考资料或建议。')) + '</div>';
  }
  function resourceActions(d, detail = false) {
    if (d.readOnly) return '';
    if (retired(d)) return btn('恢复为草案', 'restore-resource', d.id) + ((d.latestStatus || d.status) === 'archived' ? btn('删除资料', 'delete-resource', d.id) : '');
    return btn(detail ? '编辑最新版本' : '编辑', 'edit-resource', d.id) +
      ((d.latestStatus || d.status) === 'draft' ? btn('发布草案', 'publish-resource', d.id) : '') + btn('删除资料', 'delete-resource', d.id);
  }
  async function resourceDetail(id, revision) {
    const d = await api('/api/resources/' + encodeURIComponent(id) + (revision ? '?revision=' + revision : ''));
    const history = d.readOnly ? [] : (await api('/api/resources/' + encodeURIComponent(id) + '/history')).items;
    show(d.title, '<div class="flow">' + tag(label(kinds, d.kind)) + tag(label(statuses, d.status), d.status === 'effective' ? 'green' : '') +
      tag(departmentName(d.departmentId)) + '</div><p class="source spacer">版本 ' + esc(d.revision) + (d.readOnly ? ' · 随插件维护' : ' · ' + time(d.updatedAt)) +
      '</p>' + (d.readOnly ? '<p class="help">系统内置 · 随版本维护。' + esc(d.readOnlyReason) + '</p>' :
        (retired(d) ? '<p class="help">此资料当前' + (d.latestStatus === 'deleted' ? '已删除' : '已归档') + '，员工查询已停用；历史内容保留供你查看。</p>' : '') +
        (d.revision !== d.latestRevision ? '<p class="help">正在查看历史版本 ' + d.revision + '；当前最新版本为 ' + d.latestRevision + '（' + esc(label(statuses,d.latestStatus)) + '）。</p>' : '') +
        (d.status === 'draft' ? '<p class="help">这是草案；' + (d.effectiveRevision ? '员工仍使用版本 ' + d.effectiveRevision : '员工尚不可查询') + '。</p>' : '')) +
      '<pre class="resource-content">' + esc(d.content) + '</pre>' + (history.length ? '<details><summary>版本历史</summary><div class="stack spacer">' +
        history.map(v => '<div class="flow between"><span>版本 ' + v.revision + ' · ' + esc(label(statuses, v.status)) + ' · ' + time(v.updatedAt) + '</span>' +
          btn('查看', 'resource-version', id + '@' + v.revision) + '</div>').join('') + '</div></details>' : '') +
      '<div class="modal-footer flow">' + resourceActions(d, true) + '</div>');
  }
  async function resourceForm(id) {
    const d = id ? await api('/api/resources/' + encodeURIComponent(id)) : null;
    if (d && (d.readOnly || retired(d))) return resourceDetail(id);
    show(d ? '编辑资料' : '新建资料', '<form data-form="resource" data-id="' + esc(id || '') + '" data-revision="' + (d?.revision || 0) + '">' +
      field('标题', '<input name="title" required maxlength="160" value="' + esc(d?.title) + '">') + '<div class="grid2">' +
      field('类型', '<select name="kind">' + opts(kinds.filter(x => x[0] !== 'protocol'), d?.kind || 'reference') + '</select>') +
      field('适用范围', '<select name="departmentId">' + opts([['', '全团队'], ...activeDepartments().map(d => [d.id, d.name]),
        ...(d?.departmentId && !activeDepartments().some(x => x.id === d.departmentId) ? [[d.departmentId,departmentName(d.departmentId)]] : [])], d?.departmentId || '') + '</select>',
        '所属部门已删除时可保留草案或归档；重新发布前需恢复部门或明确选择新的范围。') + '</div>' +
      field('正文', '<textarea name="content" required rows="12" maxlength="20000" placeholder="明确可执行的约定或参考资料，保存草案后可再发布">' + esc(d?.content) + '</textarea>') +
      '<input type="hidden" name="status" value="draft"><p class="help spacer">先保存草案，再从资料卡片或详情中确认发布。' +
      (d?.effectiveRevision ? '保存草案期间，员工仍使用已生效版本 ' + d.effectiveRevision + '。' : '发布前，员工不可查询这份资料。') + '</p>' +
      '<div class="error" role="alert"></div><div class="modal-footer flow">' + btn('取消','close') + btn('保存草案', 'submit', '', true) + '</div></form>');
  }
  async function resourceTransition(id, action) {
    const d = await api('/api/resources/' + encodeURIComponent(id));
    if (d.readOnly) return resourceDetail(id);
    const titles = {delete:'删除资料',restore:'恢复资料',publish:'发布草案'};
    const hints = {delete:'删除后，这份资料会退出在用列表和员工查询。历史版本及任务引用保留，可在“已删除”中恢复为草案。',
      restore:'恢复最近保存的内容为草案，保留原编号和历史版本。员工暂时不可查询，检查内容并重新发布后才生效。',
      publish:'确认发布以下草案？发布后，适用范围内的员工下次查询会读取这个版本。'};
    show(titles[action], '<form data-form="resource-' + action + '" data-id="' + esc(id) + '" data-revision="' + d.revision + '">' +
      '<h3>' + esc(d.title) + '</h3><p class="source spacer">版本 ' + d.revision + ' · ' + esc(departmentName(d.departmentId)) + '</p><p class="spacer">' + hints[action] + '</p>' +
      (action === 'publish' ? '<pre class="resource-content">' + esc(d.content) + '</pre>' : '') +
      '<div class="error" role="alert"></div><div class="modal-footer flow">' + btn('取消','close') +
      btn(action === 'delete' ? '确认删除资料' : action === 'restore' ? '恢复为草案' : '确认发布', 'submit','',true) + '</div></form>');
  }
  async function action(type, id) {
    if (type === 'new-department' || type === 'edit-department') departmentForm(id);
    else if (type === 'department') departmentDetail(id);
    else if (type === 'delete-department') deleteDepartmentForm(id);
    else if (type === 'transfer-employee' || type === 'remove-employee-department') employeeDepartmentForm(id, type === 'remove-employee-department');
    else if (type === 'new-resource' || type === 'edit-resource') await resourceForm(id);
    else if (['delete-resource','restore-resource','publish-resource'].includes(type)) await resourceTransition(id, type.split('-')[0]);
    else if (type === 'resource') await resourceDetail(id);
    else if (type === 'resource-version') { const at = id.lastIndexOf('@'); await resourceDetail(id.slice(0, at), id.slice(at + 1)); }
    else return false;
    return true;
  }
  return { departments, resources, action };
}
