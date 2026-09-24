import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { Workspace, page } from './workspace.mjs';
import { employeeCapabilities } from './capabilities.mjs';
import { collaborationProgress } from '../public/collaboration.js';
import {
  now,
  uid,
  line,
  body,
  identifier,
  requireValue,
  Problem,
} from "./db.mjs";
const lifecycle = new Set([
  "queued",
  "in_progress",
  "waiting_input",
  "blocked",
  "completed",
  "cancelled",
]);
const threads =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export class Team {
  constructor(store) {
    this.s = store;
    this.workspace = new Workspace(store);
  }
  settings() {
    return this.s.get("meta", "settings");
  }
  employee(id) {
    const e = this.s.get("employees", id);
    requireValue(e, "not_found", "员工不存在", 404);
    return e;
  }
  active(id) {
    const e = this.employee(id);
    requireValue(!e.archived, "employee_archived", "员工已归档");
    return e;
  }
  sequence() {
    const value = (this.s.get("meta", "sequence")?.value || 0) + 1;
    this.s.put("meta", "sequence", { value });
    return value;
  }
  operation(kind, employeeId, requestId = null) {
    const id = uid("OP");
    this.s.insert("operations", id, {
      id,
      kind,
      employeeId,
      requestId,
      state: "pending",
      createdAt: now(),
      sequence: this.sequence(),
      attempts: 0,
    });
    return id;
  }
  createEmployee(input) {
    return this.s.tx(() => {
      requireValue(
        this.s.list("employees").filter((e) => !e.archived).length < 32,
        "capacity",
        "MVP 最多支持 32 位在职员工",
        409,
      );
      const serial = (this.s.get("meta", "employeeSerial")?.value || 0) + 1,
        id = "EMP-" + String(serial).padStart(3, "0");
      const department = this.workspace.selectDepartment(input);
      const e = {
        id,
        name: line(input.name, "姓名", 60),
        role: line(input.role, "岗位", 80),
        departmentId: department?.id || null,
        departmentRevision: 0,
        group: department?.name || '未分配',
        skills: this.skillList(input.skills),
        instructions: body(input.instructions, "岗位约定", 8000, true),
        archived: false,
        createdAt: now(),
        updatedAt: now(),
        threadId: null,
        bindingVersion: 0,
        onboarding: "awaiting_binding",
      };
      requireValue(
        ["new", "existing"].includes(input.bindingMode),
        "binding_mode",
        "请选择新建或绑定已有 Codex 任务",
      );
      if (input.bindingMode === "existing") {
        requireValue(
          threads.test(input.threadId),
          "thread_id",
          "请选择有效的原生任务",
        );
      }
      this.s.put("meta", "employeeSerial", { value: serial });
      this.s.put("employees", id, e);
      if (input.bindingMode === "existing")
        this.bind(
          id,
          {
            threadId: input.threadId,
            cwd: input.cwd,
            title: input.threadTitle,
          },
          false,
        );
      this.operation(
        input.bindingMode === "new" ? "create_employee" : "onboard",
        id,
      );
      this.s.audit("employee.created", id);
      return this.employee(id);
    });
  }
  skillList(input) {
    requireValue(
      input === undefined || Array.isArray(input),
      "skills",
      "技能列表格式错误",
    );
    return [...new Set((input || []).map((s) => line(s, "技能", 220)))].slice(
      0,
      64,
    );
  }
  editEmployee(id, input) {
    return this.s.tx(() => {
      const e = this.active(id);
      e.name = line(input.name ?? e.name, "姓名", 60);
      e.role = line(input.role ?? e.role, "岗位", 80);
      const department = this.workspace.selectDepartment(input, e);
      if (input.departmentRevision !== undefined) requireValue(input.departmentRevision === (e.departmentRevision || 0),
        'stale', '员工部门归属已更新，请重新打开后操作', 409);
      if (e.departmentId !== (department?.id || null)) e.departmentRevision = (e.departmentRevision || 0) + 1;
      e.departmentId = department?.id || null; e.group = department?.name || '未分配';
      this.workspace.movedEmployee(e);
      e.skills = this.skillList(input.skills ?? e.skills);
      e.instructions = body(
        input.instructions ?? e.instructions,
        "岗位约定",
        8000,
        true,
      );
      e.updatedAt = now();
      this.s.put("employees", id, e);
      this.s.audit("employee.updated", id);
      if (e.threadId) this.operation("onboard", id);
      return e;
    });
  }
  changeEmployeeDepartment(id, input) {
    return this.s.tx(() => {
      const e = this.active(id);
      requireValue(input.revision === (e.departmentRevision || 0), 'stale', '员工部门归属已更新，请重新打开后操作', 409);
      requireValue(Object.hasOwn(input, 'departmentId'), 'department_required', '请选择转入部门或移出部门');
      const d = this.workspace.selectDepartment({ departmentId: input.departmentId });
      const fromDepartmentId = e.departmentId || null, departmentId = d?.id || null;
      if (fromDepartmentId === departmentId) return e;
      e.departmentId = departmentId; e.group = d?.name || '未分配';
      e.departmentRevision = (e.departmentRevision || 0) + 1; e.updatedAt = now();
      this.workspace.movedEmployee(e);
      this.s.put('employees', e.id, e);
      this.s.audit('employee.department_changed', e.id, 'human', { fromDepartmentId, departmentId });
      // Queries resolve current membership; moving people must not enqueue an onboarding turn.
      return e;
    });
  }
  deleteDepartment(id, input) {
    return this.s.tx(() => {
      const d = this.workspace.department(id);
      requireValue(d.revision === input.revision, 'stale', '部门已更新，请重新打开后操作', 409);
      const members = this.s.list('employees').filter(e => !e.archived && e.departmentId === id);
      const snapshot = list => list.map(e => [e.id, e.revision]).sort((a,b) => a[0].localeCompare(b[0]));
      requireValue(Array.isArray(input.members) && input.members.every(e => typeof e?.id === 'string' && Number.isSafeInteger(e.revision)) &&
        JSON.stringify(snapshot(input.members)) === JSON.stringify(snapshot(members.map(e => ({id:e.id,revision:e.departmentRevision || 0})))),
        'stale', '部门成员已变化，请重新打开删除窗口核对', 409);
      if (members.length) {
        requireValue(Object.hasOwn(input, 'targetDepartmentId'), 'department_required', '请选择这些员工的去向');
        requireValue(input.targetDepartmentId !== id, 'department_target', '不能转入即将删除的部门');
        for (const e of members) this.changeEmployeeDepartment(e.id, { departmentId:input.targetDepartmentId, revision:e.departmentRevision || 0 });
      }
      return this.workspace.deleteDepartment(id, { revision:this.workspace.department(id).revision });
    });
  }
  bind(id, native, notify = true) {
    return this.s.tx(() => {
      const e = this.active(id);
      requireValue(
        threads.test(native.threadId),
        "thread_id",
        "无效的原生任务编号",
      );
      requireValue(
        path.isAbsolute(native.cwd || "") &&
          fs.existsSync(native.cwd) &&
          fs.statSync(native.cwd).isDirectory(),
        "cwd",
        "原生任务工作目录不可用",
      );
      requireValue(
        native.threadId !== this.settings().bridgeThreadId,
        "bridge_reserved",
        "接入任务不能同时绑定业务员工",
        409,
      );
      requireValue(
        !this.s
          .list("employees")
          .some(
            (x) => x.id !== id && !x.archived && x.threadId === native.threadId,
          ),
        "thread_in_use",
        "该原生任务已绑定其他员工",
        409,
      );
      if (e.threadId === native.threadId) return e;
      for (const b of this.s
        .list("bindings")
        .filter((x) => x.employeeId === id && x.active)) {
        b.active = false;
        b.unboundAt = now();
        this.s.put("bindings", b.id, b);
      }
      e.threadId = native.threadId;
      e.cwd = path.resolve(native.cwd);
      e.threadTitle = line(native.title || e.name, "原生任务名称", 300);
      e.bindingVersion++;
      e.onboarding = "checking";
      e.boundAt = now();
      e.updatedAt = now();
      e.lastHook = null;
      this.s.put("employees", id, e);
      const binding = {
        id: uid("BIND"),
        employeeId: id,
        threadId: e.threadId,
        cwd: e.cwd,
        version: e.bindingVersion,
        active: true,
        boundAt: e.boundAt,
      };
      this.s.insert("bindings", binding.id, binding);
      for (const op of this.s
        .list("operations")
        .filter(
          (o) =>
            o.employeeId === id && ["leased", "sending", "uncertain"].includes(o.state),
        )) {
        op.state = "superseded";
        this.s.put("operations", op.id, op);
      }
      this.s.audit("employee.bound", id, "human", {
        bindingVersion: e.bindingVersion,
        threadId: e.threadId,
      });
      if (notify) this.operation("onboard", id);
      return e;
    });
  }
  archiveEmployee(id, archived) {
    return this.s.tx(() => {
      const e = this.employee(id);
      requireValue(typeof archived === "boolean", "archive", "归档状态无效");
      if (!archived && e.archived)
        requireValue(
          this.s.list("employees").filter((x) => !x.archived).length < 32,
          "capacity",
          "在职员工已达 32 位",
          409,
        );
      if (!archived && e.archived && e.threadId) {
        requireValue(
          !this.s
            .list("employees")
            .some(
              (x) => x.id !== id && !x.archived && x.threadId === e.threadId,
            ),
          "thread_in_use",
          "原生任务已被另一位在职员工绑定，无法恢复",
          409,
        );
        requireValue(
          e.threadId !== this.settings().bridgeThreadId,
          "bridge_reserved",
          "此原生任务已用作接入，不能恢复业务绑定",
          409,
        );
      }
      if (!archived && this.s.get("departments", e.departmentId)?.archived) {
        e.departmentId = null; e.group = '未分配'; e.departmentRevision = (e.departmentRevision || 0) + 1;
      }
      e.archived = archived;
      this.workspace.movedEmployee(e);
      e.updatedAt = now();
      this.s.put("employees", id, e);
      if (archived)
        for (const op of this.s
          .list("operations")
          .filter((o) => o.employeeId === id && o.state === "pending")) {
          op.state = "paused";
          this.s.put("operations", op.id, op);
        }
      else {
        for (const op of this.s
          .list("operations")
          .filter((o) => o.employeeId === id && o.state === "paused")) {
          op.state = "pending";
          this.s.put("operations", op.id, op);
        }
        if (e.threadId) this.operation("onboard", id);
      }
      this.s.audit(archived ? "employee.archived" : "employee.restored", id);
      return e;
    });
  }
  submit(input, source = "human") {
    return this.s.tx(() => {
      requireValue(
        this.settings().enabled,
        "paused",
        "团队接入已暂停，数据仍保留",
        409,
      );
      const e = this.active(input.employeeId);
      requireValue(
        ["fifo", "steer"].includes(input.mode),
        "mode",
        "请选择 FIFO 或 steer",
      );
      requireValue(
        input.participants === undefined || Array.isArray(input.participants),
        "participants",
        "参与员工列表格式错误",
      );
      const participants = [...new Set(input.participants || [])].filter(
        (id) => id !== e.id,
      );
      requireValue(participants.length <= 31, "participants", "参与员工过多");
      participants.forEach((id) => this.active(id));
      let task;
      if (input.mode === "steer") {
        task = this.s.get("tasks", input.taskRef);
        requireValue(
          task && task.ownerEmployeeId === e.id,
          "steer_target",
          "steer 必须关联该负责人已有的业务任务",
        );
      } else {
        task = {
          id: uid("TASK"),
          businessId: null,
          title: "等待负责人建档",
          category: "",
          stage: "待接收",
          status: "unregistered",
          ownerEmployeeId: e.id,
          participants,
          collaborationVersion: 1,
          collaborationRevision: 0,
          requiredCollaboratorIds: [...participants],
          requiredCollaboratorsSnapshot: participants.map(id => employeeCapabilities(this.employee(id))),
          goal: body(input.instruction, "任务目标"),
          acceptanceCriteria: body(
            input.acceptanceCriteria,
            "完成标准",
            4000,
            true,
          ),
          createdAt: now(),
          updatedAt: now(),
          revision: 0,
          acceptance: null,
        };
        this.s.insert("tasks", task.id, task);
      }
      const request = {
        id: uid("REQ"),
        taskRef: task.id,
        employeeId: e.id,
        ownerEmployeeId: task.ownerEmployeeId,
        mode: input.mode,
        expectedTurnId: input.expectedTurnId ? identifier(input.expectedTurnId, "目标轮次") : null,
        instruction: body(input.instruction, "业务输入"),
        createdAt: now(),
        sequence: this.sequence(),
        source,
        state: "saved",
        receivedAt: null,
        recordedAt: null,
      };
      this.s.insert("requests", request.id, request);
      this.operation("deliver", e.id, request.id);
      this.s.audit("input.saved", request.id, source, {
        employeeId: e.id,
        taskRef: task.id,
        mode: request.mode,
      });
      return { requestId: request.id, taskRef: task.id, state: request.state };
    });
  }
  peerRequest(threadId, input) {
    return this.s.tx(() => {
      const from = this.actor(threadId),
        target = this.active(input.employeeId),
        task = this.s.get("tasks", input.taskRef);
      requireValue(
        task &&
          (task.ownerEmployeeId === from.id ||
            task.participants.includes(from.id)),
        "task_scope",
        "只能交接本人参与的任务",
        403,
      );
      requireValue(target.threadId, "unbound", "目标员工尚未绑定");
      requireValue(from.id !== target.id, 'self_handoff', '请在当前任务中处理自己的工作，无需给自己交接');
      const kind = input.kind || (task.collaborationVersion === 1 ? 'work' : 'legacy');
      requireValue(['work', 'result', 'note', 'legacy'].includes(kind) &&
        !(kind === 'legacy' && task.collaborationVersion === 1), 'handoff_kind', '交接类型应为 work、result 或 note');
      let parentRequestId = null, replyToRequestId = null;
      if (kind === 'work') {
        const parent = this.s.get('requests', input.parentRequestId || '');
        requireValue(parent?.taskRef === task.id && parent.employeeId === from.id && parent.receivedAt && parent.kind !== 'acceptance_notice',
          'handoff_parent', '新交接必须关联本员工已收到的同业务请求 parentRequestId', 403);
        parentRequestId = parent.id;
      }
      if (kind === 'result') {
        const original = this.s.get('requests', input.replyToRequestId || '');
        requireValue(original?.kind === 'work' && original.taskRef === task.id && original.employeeId === from.id &&
          original.fromEmployeeId === target.id && original.receivedAt,
          'reply_scope', '结果必须回复本人收到的 work 请求及其真实发起方', 403);
        requireValue(['completed', 'blocked'].includes(input.outcome), 'result_outcome', '请报告 completed 或 blocked 的实际结果');
        replyToRequestId = original.id;
        parentRequestId = original.id;
      }
      if (
        !task.participants.includes(target.id) &&
        task.ownerEmployeeId !== target.id
      ) {
        task.participants.push(target.id);
        this.s.put("tasks", task.id, task);
      }
      const r = {
        id: uid("REQ"),
        taskRef: task.id,
        employeeId: target.id,
        ownerEmployeeId: task.ownerEmployeeId,
        mode: input.mode === "steer" ? "steer" : "fifo",
        instruction: body(input.instruction, "交接内容"),
        source: "employee",
        fromEmployeeId: from.id,
        sourceThreadId: from.threadId,
        targetThreadId: target.threadId,
        sourceBindingVersion: from.bindingVersion,
        targetBindingVersion: target.bindingVersion,
        kind,
        parentRequestId,
        replyToRequestId,
        purpose: line(input.purpose || (kind === 'result' ? '交回工作结果' : String(input.instruction || '').replace(/\s+/g, ' ').slice(0, 160)), '协作工作'),
        completionCriteria: body(input.completionCriteria, '协作完成标准', 2000, true),
        outcome: kind === 'result' ? input.outcome : null,
        capabilitySnapshot: [employeeCapabilities(from), employeeCapabilities(target)],
        createdAt: now(),
        sequence: this.sequence(),
        state: "saved",
        receivedAt: null,
        recordedAt: null,
      };
      this.s.insert("requests", r.id, r);
      if (['work', 'result'].includes(kind)) {
        task.collaborationRevision = (task.collaborationRevision || 0) + 1;
        this.s.put('tasks', task.id, task);
      }
      return { ...this.workspace.requestView(from, r), requestId: r.id, targetThreadId: target.threadId };
    });
  }
  actor(threadId) {
    const e = this.s
      .list("employees")
      .find((e) => !e.archived && e.threadId === threadId);
    requireValue(e, "unbound", "当前原生任务未绑定在职员工", 403);
    return e;
  }
  inbox(threadId, requestId) {
    return this.s.tx(() => {
      const e = this.actor(threadId);
      requireValue(requestId, 'request_required', '请指定本次 requestId；资料查询使用 query，身份查询使用 inbox --identity');
      const selected = requestId === '--identity' ? null : this.s.get('requests', requestId);
      requireValue(requestId === '--identity' || selected?.employeeId === e.id, 'request_scope', '此请求不属于当前员工', 403);
      if (selected && !selected.claimedAt) {
        selected.claimedAt = now(); selected.claimedThreadId = e.threadId; selected.claimedBindingVersion = e.bindingVersion;
        if (!selected.receivedAt) { selected.receivedAt = now(); selected.state = 'received'; }
        this.s.put('requests', selected.id, selected);
      }
      const task = selected && this.s.get('tasks', selected.taskRef);
      return {
        employee: { id: e.id, name: e.name, role: e.role, departmentId: e.departmentId },
        requests: selected ? [this.workspace.requestView(e, selected)] : [],
        tasks: task ? [this.workspace.taskView(e, task)] : [],
        references: { identity: 'query me', departments: 'query departments', colleagues: 'query department',
          resources: 'query resources', protocol: 'query resource SYS-entry',
          collaboration: 'query resource SYS-collaboration', worklog: 'query resource SYS-worklog',
          decisions: 'query decisions' + (task ? ' ' + task.id : '') },
        artifactsDirectory: path.join(this.s.root, 'artifacts'),
      };
    });
  }
  query(threadId, topic, id, options = {}) {
    const e = this.actor(threadId);
    if (!['task', 'records', 'decisions'].includes(topic)) return this.workspace.query(e, topic, id, options);
    const task = id && this.s.get('tasks', id);
    requireValue(!id || (task && (task.ownerEmployeeId === e.id || task.participants.includes(e.id))), 'task_scope', '只能查询本人参与的任务', 403);
    if (topic === 'task') {
      requireValue(task, 'task_missing', '请提供任务内部编号 TASK-…');
      return { task: this.workspace.taskView(e, task, true), collaboration: this.collaboration(task),
        requests: page(this.s.list('requests').filter(r => r.taskRef === id && r.employeeId === e.id && r.receivedAt)
          .map(r => ({id:r.id,kind:r.kind,fromEmployeeId:r.fromEmployeeId,state:r.state,receivedAt:r.receivedAt})), options) };
    }
    if (topic === 'records') {
      requireValue(task, 'task_missing', '请提供任务内部编号 TASK-…');
      return page(this.s.list('records').filter(r => r.taskRef === id), options);
    }
    return page(this.s.list('decisions').filter(d => id ? d.taskRef === id :
      (d.fromEmployeeId === e.id || d.ownerEmployeeId === e.id) && ['pending','needs_info','answering'].includes(d.state)), options);
  }
  collaboration(task) {
    return collaborationProgress(task, { requests: this.s.list('requests'), records: this.s.list('records') });
  }
  workScope(request) {
    const visited = new Set();
    while (request?.kind === 'result' && !visited.has(request.id)) {
      visited.add(request.id);
      const work = this.s.get('requests', request.replyToRequestId);
      request = work && this.s.get('requests', work.parentRequestId);
    }
    return request;
  }
  collaborationPrompt(taskRef) {
    const task = this.s.get('tasks', taskRef);
    if (!task?.collaborationVersion) return '';
    return '指定协作者必须实际参与：' + (task.requiredCollaboratorIds || []).join('、') +
      '。协作前按需查询员工与部门、读取 SYS-collaboration；完整任务证据使用 query task ' + taskRef + '。';
  }
  decisionAnswer(id, input) {
    return this.s.tx(() => {
      const d = this.s.get("decisions", id);
      requireValue(d, "not_found", "决定不存在", 404);
      requireValue(
        d.state === "pending" || d.state === "needs_info",
        "decision_resolved",
        "此决定已处理",
        409,
      );
      requireValue(
        input.revision === d.revision,
        "stale",
        "内容已更新，请刷新后再决定",
        409,
      );
      requireValue(
        ["resolve", "needs_info"].includes(input.action),
        "action",
        "请选择决定或请求补充",
      );
      if (d.source === "native_question") {
        const actor = this.active(d.fromEmployeeId);
        requireValue(
          d.taskRef &&
            d.nativeTool === "request_user_input_async" &&
            actor.threadId === d.sourceThreadId &&
            actor.bindingVersion === d.bindingVersion,
          "native_question_context",
          "此问题需在原生 Codex 任务中回答：业务关联不唯一、员工已换绑或原生提问正在阻塞等待",
          409,
        );
        requireValue(this.settings().enabled, "paused", "团队接入已暂停", 409);
      }
      d.answer = body(input.answer, "决定或补充要求", 4000);
      d.state = input.action === "resolve" ? "resolved" : "needs_info";
      d.decidedBy = "human";
      d.decidedAt = now();
      d.revision++;
      this.s.put("decisions", id, d);
      const instruction =
        (d.state === "resolved"
          ? "人类产品决定："
          : "请补充信息，尚未作出决定：") +
        (d.source === "native_question"
          ? "\n原生问题：" + d.question + "\n决定编号：" + d.id + "\n回答："
          : "") +
        d.answer;
      let result;
      if (d.source === "native_question") {
        const task = this.s.get("tasks", d.taskRef);
        requireValue(task, "not_found", "关联业务不存在", 404);
        const request = {
          id: uid("REQ"),
          taskRef: task.id,
          employeeId: d.fromEmployeeId,
          ownerEmployeeId: task.ownerEmployeeId,
          mode: "steer",
          instruction,
          source: "human_decision",
          decisionId: d.id,
          createdAt: now(),
          sequence: this.sequence(),
          state: "saved",
          receivedAt: null,
          recordedAt: null,
        };
        this.s.insert("requests", request.id, request);
        this.operation("deliver", request.employeeId, request.id);
        this.s.audit("input.saved", request.id, "human_decision", {
          employeeId: request.employeeId,
          taskRef: task.id,
          mode: "steer",
        });
        result = { requestId: request.id };
      } else
        result = this.submit(
          {
            employeeId: d.ownerEmployeeId,
            mode: "steer",
            taskRef: d.taskRef,
            instruction,
          },
          "human_decision",
        );
      d.responseRequestId = result.requestId;
      this.s.put("decisions", id, d);
      this.s.audit("decision." + d.state, id);
      return d;
    });
  }
  acceptTask(id, input) {
    return this.s.tx(() => {
      const t = this.s.get("tasks", id);
      requireValue(t, "not_found", "任务不存在", 404);
      requireValue(
        t.revision === input.revision,
        "stale",
        "任务已更新，请刷新最新证据后验收",
        409,
      );
      requireValue(
        t.status === "completed",
        "not_complete",
        "负责人尚未报告完成",
        409,
      );
      requireValue(
        ["accepted", "rejected"].includes(input.verdict),
        "verdict",
        "验收结论无效",
      );
      if (input.verdict === 'accepted' && t.collaborationVersion === 1) {
        requireValue((input.collaborationRevision || 0) === (t.collaborationRevision || 0), 'stale', '协作证据已更新，请刷新后验收', 409);
        requireValue(this.collaboration(t).complete, 'collaboration_incomplete', '指定协作或交接结果尚未完成，请先查看协作进度', 409);
      }
      const note = body(input.note, '验收说明', 4000, input.verdict === 'accepted');
      if (t.acceptance?.revision === t.revision &&
          t.acceptance.collaborationRevision === (t.collaborationRevision || 0) &&
          t.acceptance.verdict === input.verdict && t.acceptance.note === note && t.acceptance.notificationRequestId) return t;
      const employee = this.active(t.ownerEmployeeId);
      const requestId = uid('REQ');
      t.acceptance = {
        id: uid('ACC'), verdict: input.verdict, revision: t.revision,
        collaborationRevision: t.collaborationRevision || 0, by: 'human', at: now(), note,
        notificationRequestId: requestId,
      };
      this.s.put('tasks', id, t);
      const rejected = input.verdict === 'rejected';
      const request = { id: requestId, taskRef: id, employeeId: employee.id, ownerEmployeeId: employee.id,
        kind: rejected ? 'acceptance_rework' : 'acceptance_notice', mode: rejected ? 'steer' : 'fifo',
        source: 'human_acceptance', acceptance: { ...t.acceptance },
        instruction: rejected ? '人类验收未通过，请按以下要求整改：' + note :
          '人类已验收通过。验收说明：' + (note || '未附说明') + '。请确认收到并记录验收通知回执；本通知不创建新任务，不修改已验收交付，不启动后续工作。',
        createdAt: now(), sequence: this.sequence(), state: 'saved', receivedAt: null, recordedAt: null };
      this.s.insert('requests', requestId, request);
      this.operation('deliver', employee.id, requestId);
      this.s.audit('task.' + input.verdict, id, 'human', { revision: t.revision, note, requestId });
      return t;
    });
  }
  updateSettings(input) {
    return this.s.tx(() => {
      const c = this.settings();
      if (input.teamName !== undefined)
        c.teamName = line(input.teamName, "团队名称", 80);
      if (input.rules !== undefined) {
        const doc = this.s.get('documents', 'DOC-team-rules');
        this.workspace.writeDocument(doc.id, {...doc, content: body(input.rules, '团队约定', 12000), status: 'effective'});
      }
      if (input.enabled !== undefined) {
        requireValue(
          typeof input.enabled === "boolean",
          "enabled",
          "接入开关无效",
        );
        c.enabled = input.enabled;
      }
      if (input.bridgeThreadId !== undefined) {
        requireValue(
          input.bridgeThreadId === null || threads.test(input.bridgeThreadId),
          "thread_id",
          "接入任务编号无效",
        );
        requireValue(
          !this.s
            .list("employees")
            .some((e) => !e.archived && e.threadId === input.bridgeThreadId),
          "thread_in_use",
          "接入任务不能同时绑定业务员工",
        );
        c.bridgeThreadId = input.bridgeThreadId;
      }
      this.s.put("meta", "settings", c);
      this.s.audit("settings.updated", "team");
      return c;
    });
  }
  artifact(actor, value) {
    const absolute = path.isAbsolute(value)
      ? value
      : path.resolve(
          path.join(this.s.root, "artifacts"),
          value.startsWith("artifacts/") ? value.slice(10) : value,
        );
    const real = fs.realpathSync(absolute),
      roots = [
        fs.realpathSync(path.join(this.s.root, "artifacts")),
        fs.realpathSync(actor.cwd),
      ];
    requireValue(
      roots.some((r) => real.startsWith(r + path.sep)),
      "artifact_scope",
      "产物必须位于员工工作目录或团队产物目录",
    );
    const st = fs.statSync(real);
    requireValue(
      st.isFile() && st.size <= 4 * 1024 * 1024,
      "artifact_size",
      "产物须为不超过 4 MB 的文件",
    );
    return {
      path: real,
      name: path.basename(real),
      bytes: st.size,
      sha256: createHash("sha256").update(fs.readFileSync(real)).digest("hex"),
    };
  }
  applyWorklog(actor, turnId, entries, hookDigest) {
    return this.s.tx(() => {
      const current = this.actor(actor.threadId);
      requireValue(
        current.id === actor.id &&
          current.bindingVersion === actor.bindingVersion,
        "binding_changed",
        "绑定已变化，拒绝旧身份写入",
        409,
      );
      requireValue(
        Array.isArray(entries) && entries.length <= 32,
        "entries",
        "摘要 entries 必须为不超过 32 项的数组",
      );
      const validated = entries.map((raw, index) => {
        const req = this.s.get(
          "requests",
          identifier(raw.requestId, "请求编号"),
        );
        requireValue(
          req && req.employeeId === actor.id,
          "request_actor",
          "请求不属于当前员工",
          403,
        );
        const task = this.s.get("tasks", req.taskRef);
        requireValue(task, "task_missing", "关联任务不存在");
        if (req.kind === 'acceptance_notice') {
          requireValue(req.receivedAt, 'notice_unread', '先领取本次验收通知，再报告回执');
          requireValue(!raw.decision && !(raw.handledResults?.length) && !(raw.artifactPaths?.length),
            'notice_scope', '验收通过通知只记录收到，不修改交付、协作或决定');
          return { req, task, owner: false, decision: null, record: {
            id: actor.threadId + ':' + turnId + ':' + index, employeeId: actor.id, threadId: actor.threadId,
            bindingVersion: actor.bindingVersion, turnId, requestId: req.id, taskRef: task.id,
            businessId: task.businessId, ownerEmployeeId: task.ownerEmployeeId, title: task.title,
            category: task.category, stage: '验收通知已确认', status: 'completed',
            summary: body(raw.summary, '通知回执', 1000), nextAction: '', artifacts: [], handledResults: [],
            authority: 'acceptance_receipt', recordedAt: now(), source: 'native_stop_hook', hookDigest,
            acceptanceId: req.acceptance.id, acceptanceRevision: req.acceptance.revision,
          }};
        }
        requireValue(
          raw.ownerEmployeeId === task.ownerEmployeeId,
          "owner_mismatch",
          "负责人不可由工作摘要修改",
          403,
        );
        const owner = task.ownerEmployeeId === actor.id && req.kind !== 'note' && this.workScope(req)?.kind !== 'work',
          status = line(raw.status, "状态", 60);
        if (owner)
          requireValue(
            lifecycle.has(status),
            "status",
            "负责人状态必须使用约定生命周期值",
          );
        const businessId = identifier(raw.taskId, "业务编号");
        if (task.businessId)
          requireValue(
            task.businessId === businessId,
            "task_id_mismatch",
            "同一业务任务编号不可变更",
          );
        if (owner)
          requireValue(
            !this.s
              .list("tasks")
              .some((t) => t.id !== task.id && t.businessId === businessId),
            "duplicate_task_id",
            "业务编号已被其他任务使用",
            409,
          );
        const artifactPaths = raw.artifactPaths || [];
        requireValue(
          Array.isArray(artifactPaths) && artifactPaths.length <= 8,
          "artifacts",
          "产物列表无效",
        );
        const record = {
          id: actor.threadId + ":" + turnId + ":" + index,
          employeeId: actor.id,
          threadId: actor.threadId,
          bindingVersion: actor.bindingVersion,
          turnId,
          requestId: req.id,
          producedResultRequestId: req.kind === 'work' ? this.s.list('requests').filter(r => r.kind === 'result' &&
            r.replyToRequestId === req.id && r.fromEmployeeId === actor.id).sort((a,b) => a.sequence-b.sequence).at(-1)?.id || null : null,
          taskRef: task.id,
          businessId,
          ownerEmployeeId: task.ownerEmployeeId,
          title: line(raw.title, "任务名称"),
          category: line(raw.category, "类别", 80),
          stage: line(raw.stage || status, "业务阶段", 100),
          status,
          summary: body(raw.summary, "工作摘要", 1000, true),
          nextAction: body(raw.nextAction, "下一步", 600, true),
          artifacts: artifactPaths.map((v) =>
            this.artifact(actor, line(v, "产物路径", 1500)),
          ),
          authority: owner ? "owner_report" : "contributor_report",
          recordedAt: now(),
          source: "native_stop_hook",
          hookDigest,
          humanAcceptance: "not_recorded",
        };
        requireValue(raw.handledResults === undefined || (Array.isArray(raw.handledResults) && raw.handledResults.length <= 32),
          'handled_results', 'handledResults 必须为不超过 32 项的数组');
        record.handledResults = (raw.handledResults || []).map(handling => {
          const result = this.s.get('requests', identifier(handling.resultRequestId, '结果请求编号'));
          requireValue(result?.kind === 'result' && result.taskRef === task.id && result.employeeId === actor.id && result.receivedAt,
            'handling_scope', '只能处理自己已收到的同业务 result 请求', 403);
          requireValue(['accepted', 'changes_requested', 'blocked'].includes(handling.disposition), 'handling_outcome', '处理结论应为 accepted、changes_requested 或 blocked');
          requireValue(handling.disposition !== 'accepted' || result.outcome === 'completed', 'blocked_result', '受阻结果不能作为完成接受');
          return { resultRequestId: result.id, disposition: handling.disposition, summary: body(handling.summary, '结果处理说明', 600) };
        });
        let decision = null;
        if (raw.decision) {
          const d = raw.decision;
          requireValue(
            Array.isArray(d.options) && d.options.length <= 6,
            "decision_options",
            "决定选项无效",
          );
          decision = {
            id: d.id ? identifier(d.id, "决定编号") : uid("DEC"),
            taskRef: task.id,
            ownerEmployeeId: task.ownerEmployeeId,
            fromEmployeeId: actor.id,
            title: line(d.title, "决定标题"),
            question: body(d.question, "待决定事项", 2000),
            options: d.options.map((o) => line(o, "决定选项", 500)),
            state: "pending",
            revision: 1,
            createdAt: now(),
          };
        }
        return { record, req, task, owner, decision };
      });
      const newIds = new Map();
      for (const v of validated) {
        if (v.owner && newIds.has(v.record.businessId))
          requireValue(
            newIds.get(v.record.businessId) === v.task.id,
            "duplicate_task_id",
            "本轮业务编号重复",
          );
        newIds.set(v.record.businessId, v.task.id);
      }
      for (const v of validated) {
        const { record, req, owner, decision } = v;
        if (!this.s.insert("records", record.id, record)) continue;
        const task = this.s.get("tasks", record.taskRef);
        if (record.handledResults.length) task.collaborationRevision = (task.collaborationRevision || 0) + 1;
        if (owner) {
          Object.assign(task, {
            businessId: record.businessId,
            title: record.title,
            category: record.category,
            stage: record.stage,
            status: record.status,
            summary: record.summary,
            nextAction: record.nextAction,
            artifacts: record.artifacts,
            updatedAt: record.recordedAt,
            lastRecordId: record.id,
            revision: task.revision + 1,
          });
          this.s.put("tasks", task.id, task);
        }
        if (!owner && record.handledResults.length) this.s.put('tasks', task.id, task);
        req.state = [
          "queued",
          "in_progress",
          "waiting_input",
          "blocked",
        ].includes(record.status)
          ? "in_progress"
          : "recorded";
        req.receivedAt ||= now();
        req.recordedAt = now();
        this.s.put("requests", req.id, req);
        if (owner && ["completed", "cancelled"].includes(record.status)) {
          for (const older of this.s
            .list("requests")
            .filter(
              (r) =>
                r.taskRef === task.id &&
                r.employeeId === actor.id &&
                r.receivedAt &&
                r.sequence <= req.sequence &&
                !["recorded", "cancelled"].includes(r.state),
            )) {
            older.state =
              record.status === "cancelled" ? "cancelled" : "recorded";
            older.recordedAt = record.recordedAt;
            this.s.put("requests", older.id, older);
          }
        }
        if (decision) {
          const old = this.s.get("decisions", decision.id);
          requireValue(
            !old || old.taskRef === decision.taskRef,
            "decision_collision",
            "决定编号已被其他任务使用",
          );
          if (old?.state === "resolved")
            throw new Problem("decision_resolved", "已决定事项请新建后续决定");
          if (old) decision.revision = old.revision + 1;
          // Updating the business wording must not change the native reply target.
          if (old?.source === "native_question")
            decision.fromEmployeeId = old.fromEmployeeId;
          this.s.put("decisions", decision.id, { ...old, ...decision });
        }
      }
      return validated.map((v) => v.record.id);
    });
  }
}
