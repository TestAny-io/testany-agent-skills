import path from 'node:path';
import crypto from 'node:crypto';
import { fail, readJson, writeJson, verifyDirectoryRoot, redact } from './files.mjs';
import { buildUpdateItems, targetKey } from './sources.mjs';

export function validateTarget(target) {
  if (!target || typeof target !== 'object' || Array.isArray(target) || Object.keys(target).some(key => !['kind', 'id'].includes(key)) || !['skill', 'plugin', 'host'].includes(target.kind) || typeof target.id !== 'string' || !target.id || target.id.length > 300 || /[\x00-\x1f]/.test(target.id)) fail(400, 'INVALID_TARGET', '更新目标无效。');
  return target;
}
export function validateSchedule(schedule) {
  if (!schedule || typeof schedule !== 'object' || Array.isArray(schedule) || Object.keys(schedule).some(key => !['enabled', 'intervalMinutes', 'timezone', 'autoApply', 'targets'].includes(key))) fail(400, 'INVALID_SCHEDULE', '自动更新配置格式无效。');
  if (typeof schedule.enabled !== 'boolean' || typeof schedule.autoApply !== 'boolean' || !Number.isInteger(schedule.intervalMinutes) || schedule.intervalMinutes < 15 || schedule.intervalMinutes > 10080) fail(400, 'INVALID_SCHEDULE', '周期必须是 15–10080 分钟的整数，开关必须是布尔值。');
  if (typeof schedule.timezone !== 'string' || schedule.timezone.length > 100) fail(400, 'INVALID_TIMEZONE', '请选择有效时区。');
  try { new Intl.DateTimeFormat('en', { timeZone: schedule.timezone }).format(); } catch { fail(400, 'INVALID_TIMEZONE', '请选择有效时区。'); }
  if (!Array.isArray(schedule.targets) || schedule.targets.length > 1000) fail(400, 'INVALID_TARGET', '目标列表无效或超过 1000 项。');
  schedule.targets.forEach(validateTarget);
  return schedule;
}

export async function createScheduler({ environments, snapshot, perform, signature, hasPreview, coreBusy, clock = () => Date.now(), pollMs = 1000, startTimer = true }) {
  const states = {}; const writes = {}; const configuring = new Set(); let running = false; let activeMode; let closed = false; let runningPromise; let timer;
  const timestamp = () => new Date(clock()).toISOString();
  const defaultSchedule = () => ({ enabled: false, intervalMinutes: 1440, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', autoApply: false, targets: [], running: false });
  async function persist(mode) {
    writes[mode] = (writes[mode] || Promise.resolve()).catch(() => {}).then(async () => { await verifyDirectoryRoot(environments[mode].stateBoundary); await writeJson(path.join(environments[mode].root, 'updates.json'), states[mode]); });
    return writes[mode];
  }
  for (const mode of Object.keys(environments)) {
    const state = await readJson(path.join(environments[mode].root, 'updates.json'), { version: 1, schedule: defaultSchedule(), bindings: {}, observations: {}, runs: [], activity: [] });
    if (!state || state.version !== 1 || !Array.isArray(state.runs) || typeof state.bindings !== 'object' || !state.schedule || !state.observations) fail(422, 'INVALID_UPDATE_STATE', '更新状态文件格式无效，未启用自动更新。');
    validateSchedule({ enabled: state.schedule.enabled, intervalMinutes: state.schedule.intervalMinutes, timezone: state.schedule.timezone, autoApply: state.schedule.autoApply, targets: state.schedule.targets });
    state.activity ||= []; state.schedule.running = false; states[mode] = state;
    let interrupted = false;
    for (const run of state.runs.filter(item => item.status === 'running')) {
      run.status = 'error'; run.finishedAt = timestamp(); interrupted = true;
      run.items.push({ target: { kind: 'host', id: 'interrupted-run' }, name: 'Interrupted update run', status: 'error', reasonCode: 'RUN_INTERRUPTED', message: '上次服务在运行中停止，执行结果未确认。恢复后重新检查实际状态，不重放旧的写请求。' });
    }
    if (interrupted) { state.schedule.lastOutcome = 'error'; if (state.schedule.enabled) state.schedule.nextRunAt = timestamp(); await persist(mode); }
  }
  function progress(mode) {
    const record = states[mode].runs[0];
    if (!record) return null;
    const active = running && activeMode === mode;
    const counts = { current: 0, updated: 0, available: 0, skipped: 0, error: 0 };
    for (const item of record.items) if (Object.hasOwn(counts, item.status)) counts[item.status]++;
    const completed = record.items.filter(item => !['update-run', 'interrupted-run'].includes(item.target.id)).length;
    return structuredClone({ id: record.id, trigger: record.trigger, startedAt: record.startedAt,
      finishedAt: active ? undefined : record.finishedAt, status: active ? 'running' : record.status,
      phase: active ? record.phase || 'preparing' : 'finished', total: record.total ?? null,
      completed: record.total === undefined ? completed : Math.min(completed, record.total),
      current: active ? record.current : undefined, counts });
  }
  function data(mode, currentSnapshot) {
    const state = states[mode];
    return { updateProgress: progress(mode), updates: buildUpdateItems(currentSnapshot, state.observations, hasPreview), schedule: { ...state.schedule, running: state.schedule.running }, updateRuns: state.runs.slice(0, 50), extraActivity: state.activity.slice(0, 100) };
  }
  function canonicalTarget(target, current) {
    validateTarget(target);
    if (target.kind === 'skill') {
      const skill = current.skills.find(item => item.id === target.id);
      if (skill?.pluginId && current.plugins.some(plugin => plugin.id === skill.pluginId && plugin.installed)) return { kind: 'plugin', id: skill.pluginId };
      if (skill?.scope === 'system') return { kind: 'host', id: 'codex-system-skills' };
    }
    return target;
  }
  async function normalize(mode, targets, current) {
    const result = []; const seen = new Set();
    for (const original of targets) { const target = canonicalTarget(original, current); const key = targetKey(target); if (!seen.has(key)) { seen.add(key); result.push(target); } }
    return result;
  }
  async function configure(mode, input) {
    if (configuring.has(mode)) fail(409, 'BUSY', '计划配置正在保存，请完成后重试。');
    configuring.add(mode);
    try { return await configureTransaction(mode, input); } finally { configuring.delete(mode); }
  }
  async function configureTransaction(mode, input) {
    validateSchedule(input); const state = states[mode];
    if (running && input.enabled) fail(409, 'BUSY', '一轮更新正在执行；可先关闭计划，执行结束后再调整。');
    let targets = input.targets; const bindings = {};
    if (input.enabled) {
      const current = await snapshot(mode); targets = await normalize(mode, targets, current);
      if (!targets.length) fail(400, 'EMPTY_TARGETS', '启用计划前至少选择一个有效目标。');
      for (const target of targets) {
        const item = current.updates.find(item => targetKey(item.target) === targetKey(target));
        if (!item || !item.canCheck) fail(422, 'TARGET_NOT_READY', '所选目标尚不能检查更新，请先确认来源。');
        bindings[targetKey(target)] = await signature(mode, target, current);
      }
    }
    const event = { id: crypto.randomUUID(), action: 'schedule.configure', target: mode, createdAt: timestamp(), status: 'success', message: input.enabled ? `已启用固定 ${input.intervalMinutes} 分钟周期，${targets.length} 个明确目标；${input.autoApply ? '自动应用已验证更新' : '仅检查'}。` : '已关闭自动更新；在途单项安全结束后不启动后续对象。', canRestore: false };
    // Commit the proposed configuration before exposing it to the timer. Failed
    // saves must never leave an unacknowledged plan enabled in memory.
    writes[mode] = (writes[mode] || Promise.resolve()).catch(() => {}).then(async () => {
      const proposed = structuredClone(state);
      proposed.schedule = { ...proposed.schedule, ...structuredClone(input), targets };
      if (input.enabled) proposed.schedule.nextRunAt = new Date(clock() + input.intervalMinutes * 60000).toISOString();
      else delete proposed.schedule.nextRunAt;
      if (input.enabled) proposed.bindings = bindings;
      proposed.activity.unshift(event); proposed.activity = proposed.activity.slice(0, 100);
      await verifyDirectoryRoot(environments[mode].stateBoundary);
      await writeJson(path.join(environments[mode].root, 'updates.json'), proposed);
      // The active run keeps this state object; preserve runtime fields that may
      // have advanced while the atomic file write was awaiting IO.
      const runtime = { running: state.schedule.running, lastRunAt: state.schedule.lastRunAt, lastOutcome: state.schedule.lastOutcome };
      state.schedule = { ...proposed.schedule, ...runtime };
      if (input.enabled) state.bindings = bindings;
      state.activity.unshift(event); state.activity = state.activity.slice(0, 100);
    });
    await writes[mode]; return { message: event.message, schedule: { ...state.schedule } };
  }
  async function observe(mode, target, updateItem) {
    const { sourceInfo, installedPath, affectedSkillIds, ...publicState } = updateItem;
    states[mode].observations[targetKey(target)] = publicState; await persist(mode);
  }
  async function observeError(mode, target, error) {
    states[mode].observations[targetKey(target)] = { status: 'error', canApply: false, message: redact(error.message), reasonCode: error.code || 'UPDATE_FAILED', checkedAt: timestamp() }; await persist(mode);
  }
  async function beforeOwnUpdate(mode, target) {
    const binding = states[mode].bindings[targetKey(target)];
    if (!binding) return null;
    try { const actual = await signature(mode, target); return JSON.stringify(actual) === JSON.stringify(binding) ? binding : null; } catch { return null; }
  }
  async function afterOwnUpdate(mode, target, originalBinding) {
    if (originalBinding && JSON.stringify(states[mode].bindings[targetKey(target)]) === JSON.stringify(originalBinding)) states[mode].bindings[targetKey(target)] = await signature(mode, target);
    states[mode].observations[targetKey(target)] = { status: 'current', canApply: false, message: '更新已读回确认。', checkedAt: timestamp() };
    await persist(mode);
  }
  async function afterOwnerRefresh(mode, target, originalBinding) {
    if (!originalBinding || JSON.stringify(states[mode].bindings[targetKey(target)]) !== JSON.stringify(originalBinding)) return;
    const actual = await signature(mode, target);
    // A CLI marketplace refresh may install the new package itself. Preserve a
    // plan only for the same source/owner; source changes still require consent.
    if (JSON.stringify(actual.sourceIdentity) !== JSON.stringify(originalBinding.sourceIdentity)) return;
    states[mode].bindings[targetKey(target)] = actual;
    await persist(mode);
  }
  async function run(mode, { targets, autoApply, trigger = 'manual' }) {
    if (typeof autoApply !== 'boolean') fail(400, 'INVALID_ACTION', 'autoApply 必须显式为布尔值。');
    if (closed || running || coreBusy()) fail(409, 'BUSY', '已有写操作或更新批次正在执行，请稍后重试。');
    running = true; activeMode = mode;
    const operation = (async () => {
      const state = states[mode];
      const record = { id: crypto.randomUUID(), trigger, startedAt: timestamp(), status: 'running', phase: 'preparing', items: [] };
      state.runs.unshift(record); state.runs = state.runs.slice(0, 50); state.schedule.running = true;
      let stopped = false;
      try {
        await persist(mode);
        const current = await snapshot(mode);
        const selected = await normalize(mode, targets || current.updates.map(item => item.target), current);
        record.total = selected.length;
        for (const target of selected) {
          if (closed || trigger !== 'manual' && !state.schedule.enabled) { stopped = true; break; }
          record.phase = 'checking';
          record.current = { target, name: current.updates.find(item => targetKey(item.target) === targetKey(target))?.name || target.id };
          const currentState = await snapshot(mode); const item = currentState.updates.find(candidate => targetKey(candidate.target) === targetKey(target));
          const name = item?.name || target.id;
          if (!item) { record.items.push({ target, name, status: 'skipped', message: '原目标已不存在；重新选择目标后才会纳入计划。', reasonCode: 'TARGET_MISSING' }); await persist(mode); continue; }
          if (trigger !== 'manual') {
            let actual; try { actual = await signature(mode, target, currentState); } catch { actual = null; }
            if (!actual || JSON.stringify(actual) !== JSON.stringify(state.bindings[targetKey(target)])) { record.items.push({ target, name, status: 'skipped', reasonCode: 'TARGET_BINDING_CHANGED', message: '来源、所有者、安装目录或内容已变化；旧计划不接管新对象，请重新选择。' }); await persist(mode); continue; }
          }
          if (!item.canCheck) { record.items.push({ target, name, status: 'skipped', message: item.message, reasonCode: item.reasonCode }); await persist(mode); continue; }
          try {
            const checked = (await perform({ mode, action: 'update.check', target })).updateItem;
            if (checked.updatedDuringCheck) {
              record.items.push({ target, name, status: 'updated', message: checked.message });
            } else if (checked.status === 'available' && autoApply && checked.canAutoApply && checked.canApply) {
              if (trigger !== 'manual') {
                const actual = await signature(mode, target);
                if (JSON.stringify(actual) !== JSON.stringify(state.bindings[targetKey(target)])) {
                  record.items.push({ target, name, status: 'skipped', reasonCode: 'TARGET_BINDING_CHANGED', message: '检查期间来源或安装身份发生变化；重新选择后才会自动应用。' }); await persist(mode); continue;
                }
              }
              record.phase = 'applying';
              await perform({ mode, action: 'update.apply', target, previewId: checked.previewId });
              record.items.push({ target, name, status: 'updated', message: '已更新并确认结果。' });
            } else record.items.push({ target, name, status: checked.status === 'current' ? 'current' : checked.status === 'available' ? 'available' : checked.status === 'error' ? 'error' : 'skipped', message: checked.message, reasonCode: checked.reasonCode });
          } catch (error) { record.items.push({ target, name, status: 'error', message: redact(error.message), reasonCode: error.code || 'UPDATE_FAILED' }); }
          await persist(mode);
        }
        const failures = record.items.filter(item => ['error', 'skipped'].includes(item.status));
        record.status = stopped || failures.length ? record.items.length && failures.length === record.items.length && record.items.every(item => item.status === 'error') ? 'error' : 'partial' : 'success';
      } catch (error) {
        record.status = 'error'; record.items.push({ target: { kind: 'host', id: 'update-run' }, name: 'Update run', status: 'error', reasonCode: error.code || 'UPDATE_FAILED', message: redact(error.message) });
      } finally {
        record.phase = 'finalizing'; delete record.current;
        record.finishedAt = timestamp(); state.schedule.running = false; state.schedule.lastRunAt = record.startedAt; state.schedule.lastOutcome = record.status;
        if (state.schedule.enabled) state.schedule.nextRunAt = new Date(clock() + state.schedule.intervalMinutes * 60000).toISOString();
        else delete state.schedule.nextRunAt;
        try { await persist(mode); } catch (error) { record.status = 'error'; throw error; }
      }
      return { message: `更新批次结束：${record.items.filter(item => item.status === 'updated').length} 项已更新。`, run: structuredClone(record) };
    })();
    runningPromise = operation;
    try { return await operation; } finally { running = false; activeMode = undefined; runningPromise = undefined; }
  }
  let initialTick = true;
  async function tick() {
    if (closed || running || coreBusy()) return;
    for (const mode of Object.keys(environments)) {
      const schedule = states[mode].schedule;
      if (schedule.enabled && (!schedule.nextRunAt || Date.parse(schedule.nextRunAt) <= clock())) {
        try { await run(mode, { targets: structuredClone(schedule.targets), autoApply: schedule.autoApply, trigger: initialTick ? 'catch-up' : 'scheduled' }); } catch (error) { if (error.code !== 'BUSY') { schedule.lastOutcome = 'error'; schedule.nextRunAt = new Date(clock() + schedule.intervalMinutes * 60000).toISOString(); await persist(mode); } }
        break;
      }
    }
    initialTick = false;
  }
  if (startTimer) { timer = setInterval(() => { tick().catch(() => {}); }, pollMs); timer.unref(); setTimeout(() => { tick().catch(() => {}); }, 0).unref(); }
  return { data, progress, configure, observe, observeError, beforeOwnUpdate, afterOwnUpdate, afterOwnerRefresh, run, tick, canonicalTarget, isRunning: () => running, close: async () => { closed = true; clearInterval(timer); if (runningPromise) await runningPromise.catch(() => {}); await Promise.all(Object.values(writes).map(promise => promise.catch(() => {}))); } };
}
