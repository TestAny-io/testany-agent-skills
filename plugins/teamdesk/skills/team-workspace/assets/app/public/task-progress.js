// Read-only presentation: execution evidence does not change the owner's report.
import { collaborationProgress } from './collaboration.js';
const terminal = new Set(['completed', 'cancelled']);
export function taskProgress(task, snapshot) {
  const employee = snapshot.employees.find(e => e.id === task.ownerEmployeeId && !e.archived);
  const requests = snapshot.requests.filter(r => r.taskRef === task.id && r.employeeId === task.ownerEmployeeId && r.kind !== 'acceptance_notice');
  const events = snapshot.events.filter(e => e.employeeId === employee?.id && e.threadId === employee?.threadId && e.bindingVersion === employee?.bindingVersion);
  const operation = r => snapshot.operations.find(o => o.requestId === r.id);
  const currentRequests = requests.filter(r => {
    const op = operation(r);
    return !op?.bindingVersion || (op.bindingVersion === employee?.bindingVersion && op.threadId === employee?.threadId);
  });
  const requestIds = new Set(currentRequests.map(r => r.id));
  const inputs = events.filter(e => e.kind === 'native_message' && e.state === 'received' && requestIds.has(e.requestId));
  const turns = new Set([...currentRequests.map(r => r.nativeTurnId), ...inputs.map(e => e.turnId)].filter(Boolean));
  const latest = events.filter(e => e.kind === 'runtime' && turns.has(e.turnId)).sort((a, b) => a.at.localeCompare(b.at)).at(-1);
  const live = !!employee?.activeTurnId && employee.runtime === 'task_started' && turns.has(employee.activeTurnId) &&
    (!employee.activeTaskRef || employee.activeTaskRef === task.id);
  const title = task.businessId ? task.title : (task.goal || '新任务').replace(/\s+/g, ' ').slice(0, 72);
  const base = {
    state: task.status,
    bucket: terminal.has(task.status) ? 'finished' : task.status === 'queued' || task.status === 'unregistered' ? 'waiting' : 'working',
    title,
    stage: task.businessId ? task.stage : '业务信息待负责人补充',
    detail: '',
  };
  if (live && snapshot.health.connection?.online) return {
    ...base, state: 'executing', bucket: 'working',
    detail: task.businessId ? '员工正在处理本项业务。' : '员工已开始工作，编号、名称和类别待负责人补充。',
  };
  if (task.status === 'completed' && !collaborationProgress(task, snapshot).complete) return {
    ...base, state: 'collaboration_pending', bucket: 'working',
    detail: '负责人已报告完成；指定协作或交接结果仍待完成。',
  };
  if (task.status !== 'unregistered') return base;
  if (latest?.state === 'task_complete') return {
    ...base, state: 'awaiting_record', bucket: 'working', detail: '本轮已结束，尚未收到负责人的业务记录。',
  };
  if (latest?.state === 'turn_aborted') return {
    ...base, state: 'turn_aborted', bucket: 'working', detail: '已开工的轮次被中断，尚未收到负责人的业务记录。',
  };
  if (latest?.state === 'task_started') return {
    ...base, state: 'execution_unknown', bucket: 'working', detail: '已确认开工，正在核对当前执行状态。',
  };
  if (inputs.length || currentRequests.some(r => r.receivedAt)) return {
    ...base, state: 'received', bucket: 'working', detail: '员工已收到这项业务，正在等待执行状态更新。',
  };
  const pending = currentRequests.filter(r => !['recorded', 'cancelled'].includes(r.state)).sort((a, b) => a.sequence - b.sequence).at(-1);
  return { ...base, state: pending?.state || 'saved', detail: '尚未观察到这项业务开始执行。' };
}
export function matchesTaskProgress(task, snapshot, filter) {
  if (!filter || filter === 'all') return true;
  const view = taskProgress(task, snapshot);
  if (['awaiting_acceptance', 'accepted_complete'].includes(filter)) return taskAcceptance(task, snapshot) === filter;
  if (filter === 'unregistered') return !task.businessId;
  if (filter === 'queued') return view.bucket === 'waiting';
  if (filter === 'in_progress') return view.bucket === 'working';
  return view.state === filter;
}

export function taskAcceptance(task, snapshot) {
  if (task.status !== 'completed' || taskProgress(task, snapshot).bucket !== 'finished') return null;
  const current = task.acceptance?.revision === task.revision &&
    (!task.collaborationVersion || (task.acceptance?.collaborationRevision || 0) === (task.collaborationRevision || 0)) ? task.acceptance : null;
  if (current?.verdict === 'accepted') return 'accepted_complete';
  if (current?.verdict === 'rejected') return 'rejected';
  return 'awaiting_acceptance';
}
