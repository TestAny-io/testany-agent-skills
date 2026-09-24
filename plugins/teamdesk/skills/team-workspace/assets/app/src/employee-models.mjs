import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { requireValue, now } from './db.mjs';

// Codex owns these defaults. The stored copy is evidence, never an enforcement policy.
export class EmployeeModels {
  constructor(gateway) {
    this.g = gateway; this.s = gateway.s; this.c = gateway.connection; this.busy = new Set();
    for (const row of this.s.list('meta')) if (row.kind === 'employee_model_settings' && row.operation?.state === 'sending') {
      row.operation.state = 'uncertain'; row.operation.error = '服务重启前未完成读回，请刷新核对。';
      this.s.put('meta', this.key(row.employeeId), row);
    }
  }
  key(id) { return 'employee-models:' + id; }
  identity(e) { return [e.threadId, e.bindingVersion]; }
  same(e) {
    const current = this.s.get('employees', e.id);
    return current && !current.archived && current.threadId === e.threadId && current.bindingVersion === e.bindingVersion;
  }
  stored(e) {
    const row = this.s.get('meta', this.key(e.id));
    return row?.threadId === e.threadId && row?.bindingVersion === e.bindingVersion ? row : null;
  }
  view(e) {
    const row = this.stored(e);
    return { threadId: e.threadId, bindingVersion: e.bindingVersion, online: !!this.c.state.online,
      actual: row?.actual || null, revision: row?.revision || null, operation: row?.operation || null,
      error: row?.error || null, current: !!(this.c.state.online && row?.generation === this.c.client?.generation) };
  }
  observe(e, value, source) {
    if (!this.same(e) || typeof value?.model !== 'string' || !value.model || !Object.hasOwn(value, 'serviceTier')) return;
    const actual = { model: value.model, modelProvider: value.modelProvider || null,
      effort: value.effort ?? value.reasoningEffort ?? null, serviceTier: value.serviceTier === 'default' ? null : value.serviceTier ?? null };
    const revision = createHash('sha256').update(JSON.stringify([...this.identity(e), actual])).digest('hex');
    const old = this.stored(e);
    const row = { ...old, kind: 'employee_model_settings', employeeId: e.id, threadId: e.threadId, bindingVersion: e.bindingVersion,
      actual: { ...actual, nativeServiceTier: value.serviceTier ?? null, at: now(), source }, revision, generation: this.c.client?.generation, error: null };
    this.s.put('meta', this.key(e.id), row);
    return row;
  }
  async read(id) {
    const e = this.g.team.active(id);
    requireValue(e.threadId, 'unbound', '绑定 Codex 会话后可设置模型与运行偏好。', 409);
    requireValue(this.c.state.online, 'codex_offline', 'Codex 未连接；当前显示最近同步的数据，连接后才能修改。', 409);
    const generation = this.c.client?.generation;
    try {
      const result = await this.c.request('thread/resume', { threadId: e.threadId, excludeTurns: true });
      requireValue(this.same(e) && generation === this.c.client?.generation && this.c.state.online,
        'binding_changed', '员工绑定或连接已变化，请重新打开设置。', 409);
      requireValue(result.thread?.id === e.threadId && path.resolve(result.thread.cwd) === path.resolve(e.cwd),
        'native_binding', '原生会话与员工绑定不符。', 409);
      requireValue(this.observe(e, result, 'thread/resume'), 'settings_unavailable', '当前 Codex 未返回完整模型设置，请在 Codex 中查看。', 409);
      return this.view(e);
    } catch (error) {
      if (error.rpcError && /missing source rollout/.test(error.message)) error.message = '新会话尚未完成首轮初始化，请等待入职检查后再设置；不会为读取配置创建额外轮次。';
      if (this.same(e)) {
        const row = this.stored(e);
        if (row) { row.error = error.message; row.generation = null; this.s.put('meta', this.key(id), row); }
      }
      throw error;
    }
  }
  async catalog() {
    requireValue(this.c.state.online, 'codex_offline', '连接 Codex 后可读取可用模型。', 409);
    const models = [], seen = new Set(); let cursor;
    do {
      const result = await this.c.request('model/list', { ...(cursor ? { cursor } : {}) });
      for (const m of result.data || []) {
        if (m.hidden || !m.model || models.some(x => x.model === m.model)) continue;
        models.push({ model: m.model, name: m.displayName || m.model, description: m.description || '',
          defaultEffort: m.defaultReasoningEffort,
          efforts: (m.supportedReasoningEfforts || []).map(x => ({ id: x.reasoningEffort, description: x.description || '' })),
          tiers: (m.serviceTiers || []).map(x => ({ id: x.id, name: x.name, description: x.description || '' })) });
      }
      cursor = result.nextCursor;
      requireValue(!cursor || (!seen.has(cursor) && models.length < 500), 'model_catalog', '模型目录分页异常，请刷新后重试。', 409);
      if (cursor) seen.add(cursor);
    } while (cursor);
    return models;
  }
  equal(actual, desired) { return actual && ['model', 'effort', 'serviceTier'].every(k => actual[k] === desired[k]); }
  async sync(id) {
    const view = await this.read(id), e = this.g.team.active(id), row = this.stored(e);
    if (row?.operation?.state === 'uncertain') {
      const matched = this.equal(view.actual, row.operation.desired);
      row.operation.state = matched ? 'verified' : 'different'; row.operation.checkedAt = now();
      if (matched) row.operation.verifiedAt = now();
      row.operation.error = null;
      this.s.put('meta', this.key(id), row);
      this.s.audit('employee.models_reconciled', id, 'app_server', { operationId: row.operation.id, matched });
    }
    this.g.emit('change'); return this.view(e);
  }
  async update(id, input) {
    requireValue(!this.busy.has(id), 'settings_busy', '这位员工的设置正在更新，请稍候。', 409);
    requireValue(Object.keys(input).every(k => ['model', 'effort', 'serviceTier', 'revision', 'bindingVersion'].includes(k)),
      'settings_fields', '仅支持修改模型、思考深度和速度模式。');
    this.busy.add(id);
    let operation, employee, acknowledged = false;
    try {
      employee = this.g.team.active(id);
      requireValue(input.bindingVersion === employee.bindingVersion, 'binding_changed', '员工已换绑，请重新打开设置。', 409);
      requireValue(this.stored(employee)?.operation?.state !== 'uncertain', 'settings_uncertain', '上次设置尚待核对，请先刷新；不会自动重发。', 409);
      const models = await this.catalog();
      const model = models.find(m => m.model === input.model);
      requireValue(model, 'model_unavailable', '该模型当前不可用，请刷新模型列表。', 409);
      requireValue(model.efforts.some(x => x.id === input.effort), 'effort_unavailable', '所选模型不支持这个思考深度。', 409);
      requireValue(input.serviceTier === null || model.tiers.some(x => x.id === input.serviceTier), 'tier_unavailable', '所选模型不支持这个速度模式。', 409);
      const current = await this.read(id);
      requireValue(current.revision === input.revision, 'settings_stale', 'Codex 设置已变化，请刷新后重新选择。', 409);
      requireValue(this.same(employee), 'binding_changed', '员工已换绑，请重新打开设置。', 409);
      const desired = { model: input.model, effort: input.effort, serviceTier: input.serviceTier };
      if (this.equal(current.actual, desired)) return { ...current, saved: true };
      operation = { id: randomUUID(), state: 'sending', desired, at: now() };
      const row = this.stored(employee); row.operation = operation; this.s.put('meta', this.key(id), row);
      this.g.emit('change');
      // Intentionally omit every tool, permission, collaboration and global-config field.
      await this.c.request('thread/settings/update', { threadId: employee.threadId, ...desired });
      acknowledged = true;
      const readback = await this.read(id);
      requireValue(this.same(employee) && this.equal(readback.actual, desired), 'settings_mismatch', '原生读回与选择不一致，请核对当前设置。', 409);
      operation.state = 'verified'; operation.verifiedAt = now();
      const saved = this.stored(employee); saved.operation = operation; this.s.put('meta', this.key(id), saved);
      this.s.audit('employee.models_updated', id, 'human_gui', { threadId: employee.threadId, ...desired });
      return { ...this.view(employee), saved: true };
    } catch (error) {
      if (error.rpcError?.code === -32601) error.message = '当前 Codex 版本尚不支持直接修改这些设置，请在 Codex 中设置后刷新。';
      if (operation && this.same(employee)) {
        // An ACK without a successful readback is also uncertain. Never retry a write automatically.
        operation.state = !acknowledged && (error.rpcError || error.sent === false) ? 'failed' : 'uncertain'; operation.error = error.message;
        const row = this.stored(employee); row.operation = operation; this.s.put('meta', this.key(id), row);
        this.s.audit('employee.models_' + operation.state, id, 'app_server', { operationId: operation.id });
      }
      throw error;
    } finally { this.busy.delete(id); this.g.emit('change'); }
  }
}
