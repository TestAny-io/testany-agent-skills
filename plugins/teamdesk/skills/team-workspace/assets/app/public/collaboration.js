// The same evidence projection is used by inbox, UI and acceptance validation.
// The owner is accountable for the task; each requester handles their own replies.
export function collaborationProgress(task, snapshot) {
  const requests = (snapshot.requests || []).filter(r => r.taskRef === task.id);
  const records = (snapshot.records || []).filter(r => r.taskRef === task.id);
  const latest = items => items.slice().sort((a, b) => (a.sequence || 0) - (b.sequence || 0)).at(-1);
  const work = requests.filter(r => r.kind === 'work').sort((a,b) => a.sequence - b.sequence);
  const edges = work.map(request => {
    const result = latest(requests.filter(r => r.kind === 'result' && r.replyToRequestId === request.id));
    const report = records.filter(r => r.requestId === request.id && r.employeeId === request.employeeId).at(-1);
    const handlingRecord = result && records.filter(r => r.employeeId === request.fromEmployeeId &&
      r.handledResults?.some(h => h.resultRequestId === result.id)).at(-1);
    const handling = handlingRecord?.handledResults.find(h => h.resultRequestId === result?.id);
    let state = request.receivedAt ? 'working' : 'awaiting_delivery';
    if (report?.status === 'blocked' || report?.status === 'waiting_input') state = 'blocked';
    if (result) state = result.receivedAt ? 'awaiting_handling' : 'awaiting_result_delivery';
    if (result?.outcome === 'blocked') state = 'blocked';
    if (handling?.disposition === 'changes_requested') state = 'changes_requested';
    if (handling?.disposition === 'blocked') state = 'blocked';
    if (handling?.disposition === 'accepted' && result?.receivedAt && result.outcome === 'completed')
      state = report?.status === 'completed' && report.producedResultRequestId === result.id ? 'handled' : 'awaiting_work_record';
    return { id: request.id, fromEmployeeId: request.fromEmployeeId, employeeId: request.employeeId,
      purpose: request.purpose, parentRequestId: request.parentRequestId, state,
      resultRequestId: result?.id || null, reportId: report?.id || null,
      handlingRecordId: handlingRecord?.id || null, handlingSummary: handling?.summary || null };
  });
  const required = (task.requiredCollaboratorIds || []).map(employeeId => ({
    employeeId, complete: edges.some(e => e.employeeId === employeeId && e.state === 'handled'),
    assigned: edges.some(e => e.employeeId === employeeId),
  }));
  const unresolved = edges.filter(e => e.state !== 'handled');
  const missing = required.filter(e => !e.complete);
  const enforced = task.collaborationVersion === 1;
  return { enforced, required, edges, unresolved, missing,
    complete: !enforced || (!missing.length && !unresolved.length) };
}
