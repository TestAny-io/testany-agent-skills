import fs from 'node:fs';
import { now, uid, line, body, requireValue } from './db.mjs';
import { employeeCapabilities } from './capabilities.mjs';
import { pluginVersion } from './version.mjs';

const builtins = [
  { id: 'SYS-entry', title: '员工资料入口', kind: 'protocol', file: 'worker.md' },
  { id: 'SYS-collaboration', title: '协作与原生交接', kind: 'protocol', file: 'collaboration.md' },
  { id: 'SYS-worklog', title: '交付与自动工作记录', kind: 'protocol', file: 'worklog.md' },
];
const readOnlyReason = '这是系统内置协议，随 TeamDesk 版本维护，因此不可在资料库中编辑或删除。';
const retiredDocument = doc => ['archived', 'deleted'].includes(doc.status);
export const page = (items, options = {}) => {
  const limit = Number(options.limit ?? 20), offset = Number(options.offset ?? 0);
  requireValue(Number.isSafeInteger(limit) && limit >= 1 && limit <= 50 && Number.isSafeInteger(offset) && offset >= 0,
    'pagination', 'limit 应为 1–50 的整数，offset 应为非负整数');
  const q = String(options.search || '').trim().toLowerCase();
  const found = q ? items.filter(x => JSON.stringify(x).toLowerCase().includes(q)) : items;
  return { items: found.slice(offset, offset + limit), total: found.length, offset, nextOffset: offset + limit < found.length ? offset + limit : null };
};
const meta = ({ content, ...rest }) => rest;

// One source of truth for human UI and native employee queries. No model execution.
export class Workspace {
  constructor(store) {
    this.s = store;
    this.migrate();
  }
  migrate() {
    if (this.s.get('meta', 'organizationV1')) return;
    this.s.tx(() => {
      if (this.s.get('meta', 'organizationV1')) return;
      for (const employee of this.s.list('employees')) {
        const department = employee.group ? this.legacyDepartment(employee.group) : null;
        this.s.put('employees', employee.id, { ...employee, departmentId: department?.id || null });
      }
      const settings = this.s.get('meta', 'settings');
      this.writeDocument(null, { title: '团队约定', kind: 'rules', content: settings.rules,
        status: 'effective' }, { fixedId: 'DOC-team-rules' });
      delete settings.rules;
      this.s.put('meta', 'settings', settings);
      this.s.put('meta', 'organizationV1', { at: now(), version: 1 });
      this.s.audit('workspace.migrated', 'organizationV1', 'migration');
    });
  }
  legacyDepartment(name) {
    const found = this.s.list('departments').find(d => !d.archived && d.name === name);
    return found || this.saveDepartment(null, { name, responsibilities: '' });
  }
  department(id, active = true) {
    const d = this.s.get('departments', id);
    requireValue(d && (!active || !d.archived), 'department_missing', '部门不存在或已删除', 404);
    return d;
  }
  selectDepartment(input, employee) {
    if (Object.hasOwn(input, 'departmentId')) {
      requireValue(input.departmentId === null || typeof input.departmentId === 'string', 'department_required', '部门编号格式错误');
      return input.departmentId ? this.department(input.departmentId) : null;
    }
    // Compatibility for pre-0.0.3 clients and historic fixtures; GUI uses IDs.
    if (input.group) return this.legacyDepartment(line(input.group, '部门名称', 80));
    if (employee?.departmentId) return this.department(employee.departmentId);
    return null;
  }
  saveDepartment(id, input) {
    return this.s.tx(() => {
      const old = id ? this.department(id, false) : null;
      if (old) requireValue(old.revision === input.revision, 'stale', '部门已更新，请刷新后重试', 409);
      const name = line(input.name ?? old?.name, '部门名称', 80);
      requireValue(!this.s.list('departments').some(d => d.id !== id && !d.archived && d.name === name), 'department_duplicate', '部门名称已存在', 409);
      const contactEmployeeId = (input.contactEmployeeId === undefined ? old?.contactEmployeeId : input.contactEmployeeId) || null;
      if (contactEmployeeId) {
        const contact = this.s.get('employees', contactEmployeeId);
        requireValue(contact && !contact.archived && contact.departmentId === id, 'department_contact', '交接联系人须为本部门在职员工');
      }
      const d = { id: id || uid('DEP'), name,
        responsibilities: body(input.responsibilities ?? old?.responsibilities, '部门职责', 4000, true),
        contactEmployeeId, archived: false, deletedAt: null, revision: (old?.revision || 0) + 1,
        createdAt: old?.createdAt || now(), updatedAt: now() };
      this.s.put('departments', d.id, d);
      this.s.audit(old ? 'department.updated' : 'department.created', d.id);
      return d;
    });
  }
  archiveDepartment(id, input) {
    // Compatibility for 0.0.3 clients. Removal remains recoverable.
    return this.deleteDepartment(id, input);
  }
  deleteDepartment(id, input) {
    return this.s.tx(() => {
      const d = this.department(id, false);
      requireValue(d.revision === input.revision, 'stale', '部门已更新，请刷新后重试', 409);
      requireValue(!this.s.list('employees').some(e => !e.archived && e.departmentId === id), 'department_members', '请先移出或转移本部门的在职员工', 409);
      d.archived = true; d.deletedAt = now(); d.contactEmployeeId = null; d.revision++; d.updatedAt = now();
      this.s.put('departments', id, d); this.s.audit('department.deleted', id); return d;
    });
  }
  movedEmployee(employee) {
    for (const d of this.s.list('departments')) if (d.contactEmployeeId === employee.id && (employee.archived || d.id !== employee.departmentId)) {
      d.contactEmployeeId = null; d.revision++; d.updatedAt = now(); this.s.put('departments', d.id, d);
    }
  }
  employeeView(viewer, employee, snapshot = null) {
    const d = employee.departmentId ? this.s.get('departments', employee.departmentId) : null;
    const basic = { id: employee.id, name: employee.name, role: employee.role, departmentId: employee.departmentId,
      departmentName: d?.name || '未分配', threadId: employee.threadId, bindingVersion: employee.bindingVersion,
      updatedAt: employee.updatedAt, capabilityDetail: viewer.id === employee.id ||
        (!!d && !d.archived && !!viewer.departmentId && viewer.departmentId === employee.departmentId) };
    if (basic.capabilityDetail) basic.skills = snapshot?.skills || employeeCapabilities(employee).skills;
    if (viewer.id === employee.id) basic.instructions = employee.instructions;
    return basic;
  }
  projectSnapshot(viewer, snapshot) {
    const employee = this.s.get('employees', snapshot.id);
    if (employee && !employee.archived) return this.employeeView(viewer, employee, snapshot);
    return { id: snapshot.id, name: snapshot.name, role: snapshot.role, unavailable: true };
  }
  requestView(viewer, request) {
    const { capabilitySnapshot, ...rest } = request;
    return capabilitySnapshot ? { ...rest, capabilitySnapshot: capabilitySnapshot.map(x => this.projectSnapshot(viewer, x)) } : rest;
  }
  taskView(viewer, task, detailed = false) {
    const { requiredCollaboratorsSnapshot, ...rest } = task;
    if (!detailed) return { id: task.id, businessId: task.businessId, title: task.title,
      ownerEmployeeId: task.ownerEmployeeId, status: task.status, stage: task.stage, category: task.category,
      revision: task.revision, goal: task.goal, acceptanceCriteria: task.acceptanceCriteria,
      requiredCollaboratorIds: task.requiredCollaboratorIds || [], acceptance: task.acceptance,
      updatedAt: task.updatedAt, detailsQuery: 'query task ' + task.id };
    return { ...rest, requiredCollaboratorsSnapshot: (requiredCollaboratorsSnapshot || []).map(x => this.projectSnapshot(viewer, x)) };
  }
  writeDocument(id, input, { fixedId } = {}) {
    return this.s.tx(() => {
      requireValue(!builtins.some(d => d.id === id), 'document_readonly', readOnlyReason, 403);
      const old = id && this.s.get('documents', id);
      requireValue(!id || old, 'document_missing', '资料不存在', 404);
      if (old) requireValue(old.revision === input.revision, 'stale', '资料已更新，请刷新后重试', 409);
      requireValue(!old || !retiredDocument(old), 'document_retired', '资料已删除或归档，请先恢复为草案', 409);
      requireValue(['draft', 'effective', 'archived'].includes(input.status), 'document_status', '请选择草案、生效或归档');
      requireValue(['rules', 'sop', 'reference', 'proposal'].includes(input.kind), 'document_kind', '资料类型无效');
      const departmentId = input.departmentId || null;
      if (departmentId) {
        const department = this.department(departmentId, false);
        requireValue(!department.archived || (old?.departmentId === departmentId && input.status !== 'effective'),
          'department_missing', '所属部门已删除，请恢复部门或选择新的适用范围后发布', 409);
      }
      const doc = { id: id || fixedId || uid('DOC'), title: line(input.title, '资料标题'), kind: input.kind,
        departmentId, content: body(input.content, '资料正文', 20000), status: input.status,
        revision: (old?.revision || 0) + 1, createdAt: old?.createdAt || now(), updatedAt: now(),
        effectiveRevision: old?.effectiveRevision || null };
      if (doc.status === 'effective') doc.effectiveRevision = doc.revision;
      if (doc.status === 'archived') doc.effectiveRevision = null;
      return this.saveDocumentVersion(doc, doc.status);
    });
  }
  saveDocumentVersion(doc, action) {
    this.s.put('documents', doc.id, doc);
    this.s.insert('document_versions', doc.id + '@' + doc.revision, { ...doc, documentId: doc.id, id: doc.id + '@' + doc.revision });
    this.s.audit('document.' + action, doc.id, 'human', { revision: doc.revision });
    return meta(doc);
  }
  transitionDocument(id, input, action) {
    return this.s.tx(() => {
      requireValue(!builtins.some(d => d.id === id), 'document_readonly', readOnlyReason, 403);
      const old = this.s.get('documents', id);
      requireValue(old, 'document_missing', '资料不存在', 404);
      requireValue(old.revision === input.revision, 'stale', '资料已更新，请重新打开后核对', 409);
      if (action === 'publish') {
        requireValue(old.status === 'draft', 'document_state', '仅草案可以发布，请先编辑或恢复为草案', 409);
        return this.writeDocument(id, { ...old, status:'effective' });
      }
      requireValue(['delete','restore'].includes(action), 'document_action', '资料操作无效');
      requireValue(action === 'delete' ? old.status !== 'deleted' : retiredDocument(old),
        'document_state', action === 'delete' ? '资料已删除' : '只有已删除或归档的资料可以恢复', 409);
      const doc = { ...old, status:action === 'delete' ? 'deleted' : 'draft',
        effectiveRevision:null, revision:old.revision + 1, updatedAt:now(),
        deletedAt:action === 'delete' ? now() : null };
      return this.saveDocumentVersion(doc, action === 'delete' ? 'deleted' : 'restored');
    });
  }
  document(id, options = {}, viewer = null) {
    const builtin = builtins.find(d => d.id === id);
    if (builtin) return { ...meta(builtin), revision: pluginVersion, status: 'effective', readOnly: true, readOnlyReason,
      content: fs.readFileSync(new URL('../../../references/' + builtin.file, import.meta.url), 'utf8') };
    const doc = this.s.get('documents', id);
    requireValue(doc, 'document_missing', '资料不存在', 404);
    const revision = options.revision ? Number(options.revision) : viewer ? doc.effectiveRevision : doc.revision;
    const v = revision && this.s.get('document_versions', id + '@' + revision);
    requireValue(v && (!viewer || (!retiredDocument(doc) && doc.effectiveRevision && v.status === 'effective' &&
      (!v.departmentId || (v.departmentId === viewer.departmentId && !this.department(v.departmentId, false).archived)))), 'document_unavailable', '资料尚未生效、已删除/归档或不属于本部门', 404);
    return { ...v, id: doc.id, current: revision === doc.effectiveRevision, latestRevision: doc.revision,
      latestStatus:doc.status, effectiveRevision: doc.effectiveRevision };
  }
  resources(viewer = null) {
    const docs = this.s.list('documents').flatMap(d => {
      if (!viewer) return [meta(d)];
      try { return [meta(this.document(d.id, {}, viewer))]; } catch { return []; }
    });
    return [...builtins.map(({file, ...d}) => ({ ...d, revision: pluginVersion, status: 'effective', readOnly: true, readOnlyReason })), ...docs];
  }
  query(viewer, topic, id, options = {}) {
    const envelope = { at: now(), employeeId: viewer.id, departmentId: viewer.departmentId };
    const departments = this.s.list('departments').filter(d => !d.archived);
    const employees = this.s.list('employees').filter(e => !e.archived);
    const employeeDepartment = e => e.departmentId ? this.department(e.departmentId, false) : null;
    if (topic === 'me') return { ...envelope, employee: this.employeeView(viewer, viewer), department: employeeDepartment(viewer) };
    if (topic === 'departments') return { ...envelope, ...page(departments, options) };
    if (topic === 'department') {
      if (!id && !viewer.departmentId) return { ...envelope, department: null, ...page([], options) };
      const d = this.department(id || viewer.departmentId);
      return { ...envelope, department: d, ...page(employees.filter(e => e.departmentId === d.id).map(e =>
        ({ id: e.id, name: e.name, role: e.role, detailQuery: 'query employee ' + e.id })), options) };
    }
    if (topic === 'employees') return { ...envelope, ...page(employees.map(e => ({ id: e.id, name: e.name, role: e.role,
      departmentId: e.departmentId, departmentName: employeeDepartment(e)?.name || '未分配', detailQuery: 'query employee ' + e.id })), options) };
    if (topic === 'employee') {
      const target = employees.find(e => e.id === id);
      requireValue(target, 'employee_missing', '员工不存在或已归档', 404);
      return { ...envelope, employee: this.employeeView(viewer, target), department: employeeDepartment(target) };
    }
    if (topic === 'resources') return { ...envelope, ...page(this.resources(viewer), options) };
    if (topic === 'resource') return { ...envelope, document: this.document(id, options, viewer) };
    throw Object.assign(Error('查询类型无效：me / departments / department / employees / employee / resources / resource / task / records / decisions'), { code: 'query_topic', status: 400 });
  }
}
