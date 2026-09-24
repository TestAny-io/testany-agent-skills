import fs from "node:fs";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { Team } from "./service.mjs";
import { skillRoot, protocolPath } from "./bridge.mjs";
import { now, requireValue, body } from "./db.mjs";
import { SharedConnection } from "./shared-connection.mjs";
import { HookTrust } from "./hook-trust.mjs";
import { textInput } from "./app-server-client.mjs";
import { projectQuestion, applyQuestionEvent } from "./native-questions.mjs";
import { EmployeeModels } from './employee-models.mjs';

const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 40);
const terminalRequests = new Set(["recorded", "cancelled"]);
const callbackMethods = new Set(["item/commandExecution/requestApproval", "item/fileChange/requestApproval", "item/tool/requestUserInput"]);

export class NativeGateway extends EventEmitter {
  constructor(store, { connection = new SharedConnection(), migrate = true } = {}) {
    super(); this.s = store; this.team = new Team(store); this.connection = connection;
    this.hooks = new HookTrust(store, connection); this.running = new Map(); this.runtime = new Map(); this.callbacks = new Map();
    this.closed = false;
    this.runtimeVersions = new Map();
    this.recovery = { state: "not_started", employees: [], errors: [] };
    this.recoveryEpoch = 0;
    this.models = new EmployeeModels(this);
    if (migrate) this.migrate();
    connection.on("connected", () => { this.connected().catch((e) => this.report(e)); });
    connection.on("change", () => this.emit("change"));
    connection.on("disconnect", (generation) => {
      this.recoveryEpoch++;
      this.recovery = { ...this.recovery, state: "disconnected" };
      this.hooks.refreshVersion=(this.hooks.refreshVersion||0)+1;
      this.hooks.state={...this.hooks.state,recorded:false,verified:false,status:'unknown',error:'连接已断开，等待重新核验'};
      for (const d of this.s.list("decisions")) if (d.callbackGeneration === generation && ["pending", "answering"].includes(d.state)) {
        d.callbackAvailable = false; this.s.put("decisions", d.id, d);
      }
      for (const [threadId, runtime] of this.runtime) this.setRuntime(threadId, {...runtime,status:'unknown',turnId:null});
      this.callbacks.clear(); this.runtime.clear(); this.emit("change");
    });
    connection.on("message", (message, generation) => {
      try { this.s.tx(() => this.onMessage(message, generation)); } catch (e) { this.report(e); }
    });
  }
  migrate() {
    this.s.tx(() => {
      if (!this.s.get("meta", "onDemandMigration")) {
        for (const op of this.s.list("operations")) {
          if (op.state === "pending") { op.state = "paused"; op.error = "旧版待派请求已保留，请核对后恢复"; }
          else if (["leased", "sending"].includes(op.state)) { op.state = "uncertain"; op.error = "升级前操作缺少回执，需要核对"; }
          else continue;
          this.s.put("operations", op.id, op);
        }
        this.s.put("meta", "onDemandMigration", { version: "0.0.1", at: now() });
      }
      for (const op of this.s.list("operations")) if (op.state === "sending") {
        op.state = "uncertain"; op.error = "服务重启前已发出，正在核对原生结果"; this.s.put("operations", op.id, op);
      }
      for (const d of this.s.list("decisions")) if (d.source === "native_callback" && !["resolved", "closed"].includes(d.state)) {
        d.callbackAvailable = false; this.s.put("decisions", d.id, d);
      }
    });
  }
  report(error) { if (!this.closed) { this.lastError = error.message; this.emit("change"); } }
  async start() { await this.connection.connect(); await this.recoveryPromise; return this.connection.state; }
  connected() {
    const generation = this.connection.client?.generation;
    if (this.recoveryPromise && this.recovery.generation === generation && this.recovery.state === "recovering") return this.recoveryPromise;
    const epoch = ++this.recoveryEpoch;
    this.recovery = { state: "recovering", generation, startedAt: now(), phase: "hooks", employees: [], errors: [] };
    this.emit("change");
    this.recoveryPromise = this.restore(generation, epoch);
    return this.recoveryPromise;
  }
  async restore(generation, epoch) {
    const valid = () => !this.closed && epoch === this.recoveryEpoch && this.connection.state.online && generation === this.connection.client?.generation;
    const error = (phase, e, employeeId = null) => {
      if (valid()) this.recovery.errors.push({ phase, employeeId, message: e.message });
    };
    try { await this.hooks.refresh(); } catch (e) { error("hooks", e); }
    if (!valid()) return;
    this.recovery.phase = "employees";
    const employees = this.s.list("employees").filter((e) => !e.archived && e.threadId);
    // Subscribing is metadata-only; no model invocation and no policy override.
    for (let i = 0; i < employees.length; i += 4) {
      const batch = employees.slice(i, i + 4);
      const settled = await Promise.allSettled(batch.map((e) => this.load(e, { recover: true })));
      if (!valid()) return;
      settled.forEach((r, j) => {
        this.recovery.employees.push({ employeeId: batch[j].id, bindingVersion: batch[j].bindingVersion, ready: r.status === "fulfilled", checkedAt: now() });
        if (r.status === "rejected") error("employee", r.reason, batch[j].id);
      });
      this.emit("change");
    }
    this.recovery.phase = "receipts";
    const checked = await this.reconcile(undefined, { tolerate: true });
    if (!valid()) return;
    for (const item of checked.errors) this.recovery.errors.push({ phase: "receipt", ...item });
    this.recovery.state = this.recovery.errors.length ? "partial" : "ready";
    this.recovery.finishedAt = now(); this.recovery.phase = "complete";
    this.lastError = this.recovery.errors[0]?.message || null;
    this.kick(); this.emit("change");
  }
  async load(employee, { recover = false } = {}) {
    const generation = this.connection.client?.generation;
    const runtimeVersion = this.runtimeVersions.get(employee.threadId) || 0;
    const runtimeUnchanged = () => runtimeVersion === (this.runtimeVersions.get(employee.threadId) || 0);
    const check = () => {
      const current = this.s.get("employees", employee.id);
      requireValue(!this.closed && this.connection.state.online && generation === this.connection.client?.generation &&
        current && !current.archived && current.bindingVersion === employee.bindingVersion && current.threadId === employee.threadId,
        "binding_changed", "连接或员工绑定已变化，旧的恢复结果已忽略", 409);
    };
    let thread, settings;
    try {
      settings = await this.connection.request("thread/resume", { threadId: employee.threadId, excludeTurns: true });
      ({ thread } = settings);
    } catch (error) {
      // A newly created paginated thread has no rollout until its first input.
      // Resume rejects it even though it is live in this exact server. Do not recreate it.
      const createdHere = this.s.list("operations").some((o) => o.transport === "app_server" && o.createdThreadId === employee.threadId && o.employeeId === employee.id);
      if (!createdHere || !error.rpcError || !/missing source rollout/.test(error.message)) throw error;
      const loaded = await this.connection.request("thread/loaded/list", {});
      requireValue(loaded.data?.includes(employee.threadId), "new_thread_not_loaded", "新会话尚未在当前 Codex 实例中加载，请核对原生任务", 409);
      ({ thread } = await this.connection.request("thread/read", { threadId: employee.threadId, includeTurns: false }));
    }
    check();
    requireValue(thread?.id === employee.threadId && path.resolve(thread.cwd) === path.resolve(employee.cwd), "native_binding", "原生任务或工作目录与绑定不符", 409);
    if (settings) this.models.observe(employee, settings, 'thread/resume');
    const previous = this.runtime.get(employee.threadId) || {};
    if(runtimeUnchanged())this.setRuntime(employee.threadId, { ...previous, ...(thread.status?.type !== "active" || recover ? { turnId: null, taskRef: null } : {}), status: thread.status?.type || "unknown", name: thread.name, bindingVersion: employee.bindingVersion });
    if (thread.status?.type === "active" || recover) {
      let cursor; const turns = [];
      for (let n = 0; n < (recover ? 4 : 1); n++) {
      const page = await this.connection.request("thread/turns/list", { threadId: thread.id, sortDirection: "desc", limit: recover ? 20 : 1, itemsView: "full", ...(cursor ? { cursor } : {}) });
      check();
      turns.push(...(page.data || []));
      cursor = page.nextCursor; if (!cursor) break;
      }
      for (const turn of turns.reverse()) {
        if (runtimeUnchanged() && turn.status === "inProgress" && thread.status?.type === "active") this.setRuntime(thread.id, { ...this.runtime.get(thread.id), turnId: turn.id });
        for (const item of turn.items || []) this.item(employee, turn.id, item, { recovered: recover });
        if (turn.status !== "inProgress" && recover) {
          this.event(employee, { kind: "runtime", state: turn.status === "interrupted" ? "turn_aborted" : "task_complete", turnId: turn.id, outcome: turn.status, recovered: true }, ["turn/completed", turn.id]);
          for (const d of this.s.list("decisions")) if (d.source === "native_callback" && d.sourceThreadId === thread.id && d.bindingVersion === employee.bindingVersion && d.sourceTurnId === turn.id && ["pending","answering"].includes(d.state)) {
            d.state = "closed"; d.callbackAvailable = false; d.closeReason = "recovered_turn_ended"; d.revision++;
            this.s.put("decisions", d.id, d);
          }
        }
      }
    }
    return this.runtime.get(employee.threadId);
  }
  setRuntime(threadId, value) {
    this.runtime.set(threadId, value);
    const employee=this.employeeFor(threadId);
    if (!employee || employee.bindingVersion !== value.bindingVersion) return;
    const next={id:employee.id,threadId,bindingVersion:value.bindingVersion,status:value.status,turnId:value.turnId||null,taskRef:value.taskRef||null};
    const old=this.s.get('runtime',employee.id);
    if(JSON.stringify({...old,observedAt:undefined})!==JSON.stringify(next))this.s.put('runtime',employee.id,{...next,observedAt:now()});
  }
  employeeFor(threadId) { return this.s.list("employees").find((e) => !e.archived && e.threadId === threadId); }
  event(employee, value, identity) {
    const event = { at: now(), threadId: employee.threadId, employeeId: employee.id, bindingVersion: employee.bindingVersion, source: "app_server", ...value };
    event.id = "EVT-AS-" + hash([employee.threadId, employee.bindingVersion, identity]);
    if (!this.s.get("events", event.id)) this.s.insert("events", event.id, event);
    return event;
  }
  onMessage(message, generation) {
    if (this.closed || generation !== this.connection.client?.generation) return;
    const p = message.params || {}, employee = this.employeeFor(p.threadId);
    if (!employee) return;
    if (message.method === 'thread/settings/updated') {
      this.models.observe(employee, p.threadSettings, 'thread/settings/updated'); this.emit('change'); return;
    }
    if (message.id !== undefined && callbackMethods.has(message.method)) {
      this.callback(employee, message, generation); this.emit("change"); return;
    }
    if (message.method === "serverRequest/resolved") {
      const key = hash([this.connection.state.pid, p.threadId, p.requestId]);
      const d = this.s.get("decisions", "DEC-AS-" + key);
      if (d && d.bindingVersion === employee.bindingVersion && !["resolved", "closed"].includes(d.state)) {
        const submitted = d.state === "answering";
        d.state = submitted ? "resolved" : "closed";
        d.closeReason = submitted ? "native_request_ended_after_reply" : "native_resolved_or_cancelled";
        d.decidedAt = now(); d.callbackAvailable = false; d.revision++;
        this.s.put("decisions", d.id, d);
      }
      this.callbacks.delete(key); this.emit("change"); return;
    }
    if (["turn/started", "turn/completed"].includes(message.method)) {
      const started = message.method === "turn/started", turn = p.turn;
      this.runtimeVersions.set(employee.threadId,(this.runtimeVersions.get(employee.threadId)||0)+1);
      const current=this.runtime.get(employee.threadId);
      if(started || !current?.turnId || current.turnId===turn.id)
        this.setRuntime(employee.threadId, { ...current, status: started ? "active" : "idle", turnId: started ? turn.id : null, taskRef: null, lastTurnId: turn.id, bindingVersion: employee.bindingVersion });
      this.event(employee, { kind: "runtime", state: started ? "task_started" : turn.status === "interrupted" ? "turn_aborted" : "task_complete", turnId: turn.id, outcome: turn.status }, [message.method, turn.id]);
      if (!started) {
        for (const d of this.s.list("decisions")) if (d.source === "native_callback" && d.sourceThreadId === employee.threadId && d.bindingVersion === employee.bindingVersion && d.sourceTurnId === turn.id && ["pending", "answering"].includes(d.state)) {
          d.state = d.state === "answering" ? "resolved" : "closed"; d.callbackAvailable = false; d.closeReason = "turn_ended"; d.revision++; this.s.put("decisions", d.id, d);
        }
      }
      this.emit("change");
    } else if (["item/started", "item/completed"].includes(message.method)) {
      this.item(employee, p.turnId, p.item);
      this.emit("change");
    } else if (message.method === "thread/status/changed") {
      this.runtimeVersions.set(employee.threadId,(this.runtimeVersions.get(employee.threadId)||0)+1);
      this.setRuntime(employee.threadId, { ...this.runtime.get(employee.threadId), ...(p.status?.type!=='active'?{turnId:null,taskRef:null}:{}), status: p.status?.type || "unknown", bindingVersion: employee.bindingVersion });
      this.emit("change");
    } else if (message.method === "thread/queue/changed") {
      this.emit("change");
    }
  }
  item(employee, turnId, item, { recovered = false } = {}) {
    if (!item) return;
    if (item.type === "userMessage") {
      const route = (item.content || []).filter((p) => p.type === "text").map((p) => p.text).join("\n").match(/^TEAMDESK_META (\{[^\n]+\})/);
      let meta = null;
      try { if (route) meta = JSON.parse(route[1]); } catch {}
      const op = this.s.list("operations").find((o) => o.employeeId === employee.id && o.bindingVersion === employee.bindingVersion && (o.clientUserMessageId === item.clientId || (meta?.requestId && o.requestId === meta.requestId)));
      if (op) {
        this.accept(op, { turnId, received: true, recovered });
        const request = op.requestId && this.s.get("requests", op.requestId);
        if (request) {
          this.event(employee, { kind: "native_message", state: "received", direction: "received", turnId, requestId: request.id, taskRef: request.taskRef }, ["input", item.id]);
          if (this.runtime.get(employee.threadId)?.turnId === turnId)
            this.setRuntime(employee.threadId, { ...this.runtime.get(employee.threadId), taskRef: request.taskRef });
        }
      }
      const answer = projectQuestion({ type: "event_msg", payload: { type: "item_completed", item: { type: "UserMessage", content: item.content } } }, { employeeId: employee.id, threadId: employee.threadId, bindingVersion: employee.bindingVersion, at: now(), turnId });
      if (answer) { const event = this.event(employee, answer, ["question-answer", item.id]); applyQuestionEvent(this.s, event); }
    } else if (item.type === "agentMessage" && Array.isArray(item.questions) && item.id?.startsWith("call_")) {
      const projected = projectQuestion({ type: "response_item", payload: { type: "function_call", name: "request_user_input_async", call_id: item.id, arguments: { questions: item.questions }, internal_chat_message_metadata_passthrough: { turn_id: turnId } } }, { employeeId: employee.id, threadId: employee.threadId, bindingVersion: employee.bindingVersion, at: now() });
      if (projected) { const event = this.event(employee, projected, ["questions", item.id]); applyQuestionEvent(this.s, event); }
    }
    // Tool arguments, results, assistant prose and reasoning are intentionally not stored.
  }
  callback(employee, message, generation) {
    const p = message.params, key = hash([this.connection.state.pid, employee.threadId, message.id]);
    const id = "DEC-AS-" + key, old = this.s.get("decisions", id);
    if (old && ["resolved", "closed"].includes(old.state)) return;
    const question = message.method === "item/tool/requestUserInput";
    const secret = question && p.questions?.some((q) => q.isSecret);
    const reviewableCommand = message.method === "item/commandExecution/requestApproval" && typeof p.command === "string" && p.command.length > 0 && !p.additionalPermissions && !p.networkApprovalContext && (!p.kind || p.kind === "command");
    const choices = question ? [] : (p.availableDecisions || ["accept", "decline", "cancel"]).filter((v) => ["accept", "decline", "cancel"].includes(v));
    const d = {
      id, source: "native_callback", nativeMethod: message.method, nativeRequestId: message.id,
      sourceThreadId: employee.threadId, sourceTurnId: p.turnId, bindingVersion: employee.bindingVersion,
      fromEmployeeId: employee.id, ownerEmployeeId: employee.id, taskRef: this.runtime.get(employee.threadId)?.taskRef || null,
      title: question ? "员工提问" : "Codex 执行审批", question: question ? (secret ? "此问题含私密输入，请在 Codex 中回答" : (p.questions || []).map((q) => q.question).join("\n")) : p.reason || "请审查此原生操作",
      command: question ? null : p.command || null, cwd: question ? null : p.cwd || null,
      grantRoot: p.grantRoot || null, options: choices, callbackQuestions: secret ? [] : (p.questions || []).map(({ id, question, options }) => ({ id, question, options })),
      callbackAvailable: !secret && (question || (reviewableCommand && choices.length > 0)), callbackGeneration: generation,
      state: "pending", revision: old?.revision || 1, createdAt: old?.createdAt || now(),
    };
    this.s.put("decisions", id, d);
    this.callbacks.set(key, { id: message.id, generation, decisionId: id });
  }
  async answerCallback(id, input) {
    const d = this.s.get("decisions", id), e = d && this.employeeFor(d.sourceThreadId);
    requireValue(d?.source === "native_callback" && d.state === "pending" && d.revision === input.revision, "stale", "原生请求已变化，请刷新后再处理", 409);
    requireValue(e?.bindingVersion === d.bindingVersion && d.callbackAvailable, "callback_unavailable", "此请求现在需在 Codex 中处理", 409);
    let result;
    if (d.nativeMethod === "item/tool/requestUserInput") {
      requireValue(input.answers && typeof input.answers === "object", "answers", "请回答每个问题");
      result = { answers: Object.fromEntries(d.callbackQuestions.map((q) => [q.id, { answers: [body(input.answers[q.id], "回答", 4000)] }])) };
      d.answer = d.callbackQuestions.map((q) => q.question + "：" + result.answers[q.id].answers[0]).join("\n");
    } else {
      requireValue(d.options.includes(input.decision), "decision", "请选择当前允许的审批结果");
      result = { decision: input.decision }; d.answer = input.decision;
    }
    // The only caller is the CSRF-protected human action endpoint. No default decision.
    this.connection.respond(d.nativeRequestId, result, d.callbackGeneration);
    d.state = "answering"; d.decidedBy = "human_gui"; d.sentAt = now(); d.revision++;
    this.s.put("decisions", d.id, d); this.s.audit("native_decision.sent", d.id, "human_gui", { turnId: d.sourceTurnId });
    this.emit("change"); return d;
  }
  answerQuestion(id, input) {
    return this.s.tx(() => {
      const d = this.s.get("decisions", id), e = d && this.employeeFor(d.sourceThreadId);
      requireValue(d?.source === "native_question" && d.nativeTool === "request_user_input_async" && ["pending", "needs_info"].includes(d.state) && d.revision === input.revision, "stale", "问题已变化，请刷新后再回答", 409);
      requireValue(e?.bindingVersion === d.bindingVersion, "binding_changed", "提问员工已换绑，请在原生任务中核对此问题", 409);
      requireValue(this.team.settings().enabled, "paused", "团队接入已暂停", 409);
      d.answer = body(input.answer, "回答", 4000);
      d.state = "answering"; d.decidedBy = "human_gui"; d.revision++;
      const operationId = this.team.operation("answer_question", e.id);
      const op = this.s.get("operations", operationId); op.decisionId = d.id;
      this.s.put("operations", operationId, op);
      d.responseOperationId = operationId; this.s.put("decisions", id, d);
      this.s.audit("question.answer_saved", id, "human_gui"); return d;
    });
  }
  prompt(op, employee) {
    const request = op.requestId && this.s.get("requests", op.requestId);
    const decisionId = op.decisionId || request?.decisionId;
    const decision = decisionId && this.s.get("decisions", decisionId);
    if (decision?.source === "native_question" && decision.questionItemId)
      return `<send_user_message_question_reply>\n${JSON.stringify([{ questionItemId: decision.questionItemId, question: decision.question, answer: decision.answer }])}\n</send_user_message_question_reply>`;
    const header = "TEAMDESK_META " + JSON.stringify({ operationId: op.id, requestId: request?.id || null, taskRef: request?.taskRef || null }) + "\n";
    return header + `TeamDesk ${employee.name}（${employee.id}）· ${request?.kind === 'acceptance_notice' ? '人类验收通知' : request ? '业务输入' : '入职检查'}。\n资料入口：${protocolPath}。\n先领取本次请求：用可用 Node.js 运行 ${path.join(skillRoot, 'assets/app/src/cli.mjs')} inbox ${request?.id || '--identity'}。身份来自原生 CODEX_THREAD_ID；资料按需使用 query，不直接改数据库或手动执行 hook。\n` +
      (request ? `本次输入：\n${request.instruction}\n` + (request.kind === 'acceptance_notice' ?
        '请读取 SYS-worklog 中的验收通知规则，只确认收到并记录通知回执。' :
        '工作前按资料入口核对本人技能及生效团队约定；协作与交付时再读取对应规范。') :
        '仅查询 query me 核对身份、技能和绑定，最终回复接入确认及 <teamdesk_worklog>{"entries":[]}</teamdesk_worklog>。');

  }
  kick() {
    if (this.closed || !this.connection.state.online || this.recovery.state === "recovering" || !this.team.settings().enabled || !this.hooks.state.recorded) return;
    const candidates = this.s.list("operations").filter((o) => o.state === "pending").sort((a, b) => a.sequence - b.sequence);
    for (const op of candidates) {
      if (this.running.size >= 4) break;
      const e = this.s.get("employees", op.employeeId);
      if (!e || e.archived || this.running.has(e.id)) continue;
      if (this.recovery.employees.some(r => r.employeeId === e.id && r.bindingVersion === e.bindingVersion && !r.ready)) continue;
      if (this.s.list("operations").some((other) => other.employeeId === e.id && other.sequence < op.sequence && ["sending", "uncertain"].includes(other.state))) continue;
      const work = this.dispatch(op.id).catch((e) => this.report(e)).finally(() => { this.running.delete(e.id); this.emit("change"); this.kick(); });
      this.running.set(e.id, work);
    }
  }
  async dispatch(id) {
    let op = this.s.get("operations", id), employee = this.team.active(op.employeeId);
    if (op.state !== "pending") return;
    try {
      if (op.kind === "create_employee") {
        const cwd = path.join(this.s.root, "employees", employee.id);
        fs.mkdirSync(cwd, { recursive: true, mode: 0o700 });
        op.state = "sending"; op.transport = "app_server"; op.bindingVersion = employee.bindingVersion; op.attempts++; op.cwd = cwd; this.s.put("operations", id, op);
        const result = await this.connection.request("thread/start", { cwd, threadSource: "agent_created_thread" });
        // Persist identity before any follow-up RPC; naming failure must never recreate a thread.
        op.createdThreadId = result.thread.id; this.s.put("operations", id, op);
        const current = this.s.get("employees", employee.id);
        if (current.archived || current.bindingVersion !== op.bindingVersion) {
          op.state = "uncertain"; op.error = "原生任务已创建，但员工绑定发生变化；请从任务列表核对后手动绑定";
          this.s.put("operations", id, op); return;
        }
        employee = this.team.bind(employee.id, { threadId: result.thread.id, cwd: result.thread.cwd, title: employee.name }, false);
        this.models.observe(employee, result, 'thread/start');
        op.state = "done"; op.completedAt = now(); this.s.put("operations", id, op);
        this.team.operation("onboard", employee.id);
        try { await this.connection.request("thread/name/set", { threadId: employee.threadId, name: employee.name }); } catch (error) { this.report(error); }
        this.s.audit("native.created", id, "app_server", { threadId: employee.threadId });
        return;
      }
      requireValue(employee.threadId, "unbound", "员工尚未绑定 Codex 任务", 409);
      const runtime = await this.load(employee);
      op = this.s.get("operations", id);
      requireValue(op.state === "pending" && this.team.active(employee.id).bindingVersion === employee.bindingVersion, "binding_changed", "员工绑定已变化", 409);
      const request = op.requestId && this.s.get("requests", op.requestId);
      const decision = op.decisionId && this.s.get("decisions", op.decisionId);
      const active = runtime.status === "active";
      if (request?.mode === "steer" && active) {
        requireValue(runtime.turnId && (!request.expectedTurnId || request.expectedTurnId === runtime.turnId), "stale_turn", "当前轮次已变化，请核对后重新提交补充", 409);
        requireValue(runtime.taskRef === request.taskRef, "steer_business", "当前轮次未关联这项业务；请在目标业务继续时重试此补充", 409);
      }
      op.state = "sending"; op.transport = "app_server"; op.bindingVersion = employee.bindingVersion; op.threadId = employee.threadId;
      op.clientUserMessageId ||= randomUUID(); op.attempts++; op.sentAt = now();
      op.method = (request?.mode === "steer" && active) || (decision && active && decision.sourceTurnId === runtime.turnId) ? "turn/steer" : "thread/queue/add";
      this.s.put("operations", id, op); this.emit("change");
      const input = textInput(this.prompt(op, employee));
      if (op.method === "turn/steer") {
        const result = await this.connection.request(op.method, { threadId: employee.threadId, expectedTurnId: runtime.turnId, clientUserMessageId: op.clientUserMessageId, input });
        this.accept(op, { turnId: result.turnId || runtime.turnId });
      } else {
        const result = await this.connection.request(op.method, { threadId: employee.threadId, clientUserMessageId: op.clientUserMessageId, input });
        this.accept(op, { queuedSubmissionId: result.queuedSubmission.id });
        // Starting an existing queue entry cannot duplicate its submission. Never use turn/start as FIFO.
        if (!active) {
          try { await this.connection.request("thread/queue/start", { threadId: employee.threadId }); }
          catch (error) { if (!error.rpcError || !/queue is empty/i.test(error.message)) this.report(error); }
        }
      }
    } catch (error) {
      const saved = this.s.get("operations", id);
      if (["done", "superseded", "cancelled"].includes(saved?.state)) return;
      op = saved || op;
      op.state = op.createdThreadId || (error.sent && !error.rpcError) ? "uncertain" : "failed";
      op.error = error.message; this.s.put("operations", id, op);
      this.s.audit("native." + op.state, id, "app_server");
    }
  }
  accept(original, { turnId, queuedSubmissionId, received = false, recovered = false } = {}) {
    this.s.tx(() => {
      const op = this.s.get("operations", original.id) || original;
      if (["superseded", "cancelled"].includes(op.state)) return;
      const employee = this.s.get("employees", op.employeeId);
      if (!employee || employee.archived || (op.bindingVersion && employee.bindingVersion !== op.bindingVersion)) return;
      op.state = "done"; op.completedAt ||= now(); op.error = null;
      if (turnId) op.nativeTurnId = turnId;
      if (queuedSubmissionId) op.queuedSubmissionId = queuedSubmissionId;
      this.s.put("operations", op.id, op);
      if (op.decisionId) {
        const d = this.s.get("decisions", op.decisionId);
        if (d && ["answering", "resolved"].includes(d.state)) {
          d.nativeAcceptedAt ||= now();
          if (received && d.state === "answering") { d.state = "resolved"; d.decidedAt = now(); d.revision++; }
          this.s.put("decisions", d.id, d);
        }
      }
      const r = op.requestId && this.s.get("requests", op.requestId);
      if (r) {
        if (!r.nativeAcceptedAt || (r.acceptanceRecovered && !received && !recovered)) {
          r.nativeAcceptedAt = now(); r.acceptanceRecovered = received || recovered;
        }
        if (turnId) r.nativeTurnId = turnId;
        if (queuedSubmissionId) r.queuedSubmissionId = queuedSubmissionId;
        if (received && !r.nativeReceivedAt) { r.nativeReceivedAt = now(); r.receiptRecovered = recovered; }
        if (received) r.receivedAt ||= now();
        if (!terminalRequests.has(r.state) && r.state !== "in_progress") r.state = received || r.receivedAt ? "received" : queuedSubmissionId ? "native_queued" : "native_accepted";
        this.s.put("requests", r.id, r);
      }
    });
  }
  async reconcile(id, { tolerate = false } = {}) {
    const errors = [], generation = this.connection.client?.generation;
    const operations = this.s.list("operations").filter((o) => (!id || o.id === id) && o.transport === "app_server" && (o.state === "uncertain" || (o.state === "done" && o.queuedSubmissionId && (!o.requestId || !this.s.get("requests", o.requestId)?.receivedAt))));
    for (const op of operations) {
      try {
      const e = this.s.get("employees", op.employeeId);
      if (!e?.threadId || e.archived || op.bindingVersion !== e.bindingVersion) continue;
      const queue = await this.connection.request("thread/queue/list", { threadId: e.threadId });
      requireValue(!this.closed && this.connection.state.online && generation === this.connection.client?.generation, "connection_changed", "核对期间连接已变化", 409);
      const found = queue.data?.find((q) => q.clientUserMessageId === op.clientUserMessageId);
      if (found) {
        this.accept(op, { queuedSubmissionId: found.id });
        if (this.runtime.get(e.threadId)?.status === "idle") {
          try { await this.connection.request("thread/queue/start", { threadId: e.threadId }); }
          catch (error) { if (!error.rpcError || !/queue is empty/i.test(error.message)) this.report(error); }
        }
        continue;
      }
      // Bounded history scan reads only to locate a client ID. Bodies are never persisted.
      let cursor = null, matched = false;
      for (let page = 0; page < 4 && !matched; page++) {
        const result = await this.connection.request("thread/items/list", { threadId: e.threadId, limit: 100, sortDirection: "desc", ...(cursor ? { cursor } : {}) });
        requireValue(!this.closed && this.connection.state.online && generation === this.connection.client?.generation, "connection_changed", "核对期间连接已变化", 409);
        for (const entry of result.data || []) {
          if (entry.item?.type === "userMessage" && entry.item.clientId === op.clientUserMessageId) {
            this.accept(op, { turnId: entry.turnId, received: true, recovered: true }); matched = true; break;
          }
        }
        cursor = result.nextCursor; if (!cursor) break;
      }
      // No match is not proof of non-delivery. Leave uncertain; never auto-retry.
      } catch (e) { if (!tolerate) throw e; errors.push({ operationId: op.id, employeeId: op.employeeId, message: e.message }); }
    }
    this.emit("change");
    return { errors };
  }
  async recover(id, input) {
    let op = this.s.get("operations", id);
    requireValue(op && ["failed", "uncertain", "paused"].includes(op.state), "recovery_state", "当前操作无需恢复", 409);
    if (input.action === "reconcile") { await this.reconcile(id); return this.s.get("operations", id); }
    if (input.action === "cancel") {
      requireValue(op.state !== "uncertain", "uncertain_cancel", "结果不确定时不能宣称已取消。请先核对原生会话。", 409);
      op.state = "cancelled";
      if (op.requestId) { const r = this.s.get("requests", op.requestId); r.state = "cancelled"; this.s.put("requests", r.id, r); }
    } else {
      requireValue(input.action === "retry" && op.state !== "uncertain", "uncertain_retry", "缺少原生回执时禁止盲目重发；请先核对", 409);
      op.state = "pending"; op.error = null;
    }
    this.s.put("operations", id, op); this.s.audit("native.recovery", id, "human_gui", { action: input.action });
    this.kick(); return op;
  }
  async catalog() {
    const threads = []; let cursor = null;
    do {
      const result = await this.connection.request("thread/list", { limit: 100, archived: false, useStateDbOnly: true, ...(cursor ? { cursor } : {}) });
      for (const t of result.data || []) threads.push({ id: t.id, title: t.name || "未命名任务 · " + t.id.slice(0, 8), cwd: t.cwd, archived: false, updatedAt: t.updatedAt });
      cursor = result.nextCursor;
    } while (cursor && threads.length < 2000);
    return { available: true, adapter: "shared_app_server", threads, nextCursor: cursor };
  }
  close() { this.closed = true; this.connection.close(); }
}
