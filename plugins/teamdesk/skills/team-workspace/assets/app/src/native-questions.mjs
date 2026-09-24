import { createHash } from "node:crypto";

const questionTools = new Set([
  "request_user_input_async",
  "request_user_input",
]);
const text = (value, max) =>
  typeof value === "string" &&
  value.trim() &&
  value.length <= max &&
  !value.includes("\0")
    ? value.trim()
    : null;

// Read only the native question envelope, never ordinary assistant/user prose.
export function projectQuestion(row, base) {
  const p = row.payload;
  if (!p || !base.employeeId) return null;
  if (
    row.type === "response_item" &&
    p.type === "function_call" &&
    questionTools.has(p.name)
  ) {
    try {
      const args =
        typeof p.arguments === "string" ? JSON.parse(p.arguments) : p.arguments;
      if (
        !text(p.call_id, 160) ||
        !Array.isArray(args?.questions) ||
        !args.questions.length ||
        args.questions.length > 10
      )
        return null;
      const questions = args.questions.map((q, index) => {
        const question = text(
          p.name === "request_user_input_async" ? q.title : q.question,
          2000,
        );
        if (
          !question ||
          (q.options !== undefined &&
            (!Array.isArray(q.options) || q.options.length > 12))
        )
          throw Error("invalid question");
        const options = (q.options || []).map((option) => {
          const label = text(
            typeof option === "string" ? option : option.label,
            500,
          );
          if (!label) throw Error("invalid option");
          return label;
        });
        return {
          questionItemId: JSON.stringify([p.name, p.call_id, index]),
          title: text(q.header, 160) || "员工提问",
          question,
          options,
        };
      });
      return {
        ...base,
        turnId: p.internal_chat_message_metadata_passthrough?.turn_id || null,
        kind: "native_question",
        state: "asked",
        tool: p.name,
        callId: p.call_id,
        questions,
      };
    } catch {
      return null;
    }
  }
  const item = p.type === "item_completed" ? p.item : null;
  if (row.type !== "event_msg" || item?.type !== "UserMessage") return null;
  const parts = (item.content || []).filter((c) => c.type === "text");
  if (
    parts.length !== 1 ||
    typeof parts[0].text !== "string" ||
    parts[0].text.length > 60000
  )
    return null;
  const match = parts[0].text.match(
    /^\s*<send_user_message_question_reply>\s*([\s\S]*?)\s*<\/send_user_message_question_reply>\s*$/,
  );
  if (!match) return null;
  try {
    const input = JSON.parse(match[1]);
    if (!Array.isArray(input) || input.length > 10) return null;
    const answers = input.map((a) => {
      const key = JSON.parse(a.questionItemId);
      if (
        !Array.isArray(key) ||
        key.length !== 3 ||
        !questionTools.has(key[0]) ||
        !text(key[1], 160) ||
        !Number.isInteger(key[2]) ||
        key[2] < 0 ||
        key[2] >= 10 ||
        !text(a.answer, 4000)
      )
        throw Error("invalid answer");
      return { questionItemId: JSON.stringify(key), answer: a.answer.trim() };
    });
    return {
      ...base,
      kind: "native_question_answer",
      state: "answered",
      answers,
    };
  } catch {
    return null;
  }
}

const decisionId = (event, questionItemId) =>
  "DEC-NATIVE-" +
  createHash("sha256")
    .update(
      JSON.stringify([event.threadId, event.bindingVersion, questionItemId]),
    )
    .digest("hex")
    .slice(0, 40);

export function applyQuestionEvent(store, event) {
  if (event.kind === "native_question") {
    const actor = store.get("employees", event.employeeId);
    if (
      !actor ||
      actor.archived ||
      actor.threadId !== event.threadId ||
      actor.bindingVersion !== event.bindingVersion
    )
      return;
    // Multiple business inputs in one native turn are ambiguous: keep the question
    // visible, but require the human to answer in Codex rather than guess a task.
    const routed = event.turnId
      ? store
          .list("events")
          .filter(
            (e) =>
              e.kind === "native_message" &&
              e.threadId === event.threadId &&
              e.bindingVersion === event.bindingVersion &&
              e.turnId === event.turnId &&
              e.at <= event.at,
          )
          .map((e) => store.get("requests", e.requestId))
          .filter((r) => r?.employeeId === actor.id)
      : [];
    const taskRefs = [...new Set(routed.map((r) => r.taskRef))];
    const task = taskRefs.length === 1 ? store.get("tasks", taskRefs[0]) : null;
    for (const q of event.questions) {
      const id = decisionId(event, q.questionItemId);
      store.insert("decisions", id, {
        id,
        taskRef: task?.id || null,
        ownerEmployeeId: task?.ownerEmployeeId || actor.id,
        fromEmployeeId: actor.id,
        ...q,
        source: "native_question",
        sourceThreadId: event.threadId,
        sourceTurnId: event.turnId,
        bindingVersion: event.bindingVersion,
        nativeTool: event.tool,
        state: "pending",
        revision: 1,
        createdAt: event.at,
      });
    }
  } else if (event.kind === "native_question_answer") {
    for (const answer of event.answers) {
      const id = decisionId(event, answer.questionItemId),
        d = store.get("decisions", id);
      if (!d || d.state === "resolved") continue;
      const fromGui = d.decidedBy === "human_gui" && d.responseOperationId && d.answer === answer.answer;
      d.answer = answer.answer;
      d.state = "resolved";
      d.revision++;
      d.decidedBy = fromGui ? "human_gui" : "human_native";
      d.decidedAt = event.at;
      store.put("decisions", id, d);
      store.audit("decision.resolved", id, d.decidedBy);
    }
  }
}
