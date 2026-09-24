import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { Store } from "../src/db.mjs";
import { Team } from "../src/service.mjs";
import { project, Observer } from "../src/native.mjs";
import { applyQuestionEvent } from "../src/native-questions.mjs";

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "teamdesk-questions-"));
  const s = new Store(root),
    team = new Team(s);
  const employee = () =>
    team.createEmployee({
      name: "员工",
      role: "任意岗位",
      bindingMode: "existing",
      threadId: randomUUID(),
      cwd: root,
    });
  const e = employee(),
    b = s.list("bindings")[0];
  const request = () =>
    team.submit({
      employeeId: e.id,
      mode: "fifo",
      instruction: "真实业务目标",
    });
  const at = new Date(Date.now() + 1000).toISOString();
  const ask = (call = "call_test") => ({
    timestamp: at,
    type: "response_item",
    payload: {
      type: "function_call",
      name: "request_user_input_async",
      call_id: call,
      internal_chat_message_metadata_passthrough: { turn_id: "turn-live" },
      arguments: JSON.stringify({
        questions: [
          { title: "请确认评审渠道", options: ["已有渠道", "需要安排"] },
        ],
        private: "NOT_QUESTION_DATA",
      }),
    },
  });
  const routed = (r, actor = e) => ({
    id: randomUUID(),
    employeeId: actor.id,
    threadId: actor.threadId,
    bindingVersion: actor.bindingVersion,
    turnId: "turn-live",
    at,
    kind: "native_message",
    state: "received",
    requestId: r.requestId,
    taskRef: r.taskRef,
  });
  return {
    root,
    s,
    team,
    e,
    b,
    employee,
    request,
    ask,
    routed,
    at,
    close() {
      s.close();
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

test("native question projects only structured fields, not ordinary prose or extra arguments", () => {
  const f = fixture();
  try {
    const event = project(f.ask(), f.b);
    assert.equal(event.kind, "native_question");
    assert.equal(event.turnId, "turn-live");
    assert.equal(event.questions[0].question, "请确认评审渠道");
    assert.ok(!JSON.stringify(event).includes("NOT_QUESTION_DATA"));
    assert.equal(
      project(
        {
          ...f.ask(),
          payload: {
            type: "message",
            role: "assistant",
            content: [{ text: "请确认评审渠道" }],
          },
        },
        f.b,
      ),
      null,
    );
    assert.equal(
      project(
        { ...f.ask(), payload: { ...f.ask().payload, arguments: "not json" } },
        f.b,
      ),
      null,
    );
    assert.equal(project(f.ask(), { ...f.b, employeeId: null }), null);
  } finally {
    f.close();
  }
});

test("question is visible before Stop; GUI reply returns to the asking collaborator without owner state changes", () => {
  const f = fixture();
  try {
    const r = f.request(),
      collaborator = f.employee();
    f.team.inbox(f.e.threadId, r.requestId);
    const handoff = f.team.peerRequest(f.e.threadId, {
      employeeId: collaborator.id,
      taskRef: r.taskRef,
      parentRequestId: r.requestId,
      instruction: "独立审查",
    });
    const binding = f.s
      .list("bindings")
      .find((b) => b.employeeId === collaborator.id);
    f.s.insert("events", "receipt", {
      ...f.routed({ requestId: handoff.id, taskRef: r.taskRef }, collaborator),
      id: "receipt",
    });
    const question = project(f.ask(), binding);
    applyQuestionEvent(f.s, question);
    const d = f.s.list("decisions")[0];
    assert.equal(d.taskRef, r.taskRef);
    assert.equal(d.ownerEmployeeId, f.e.id);
    assert.equal(d.fromEmployeeId, collaborator.id);
    assert.equal(f.s.list("hooks").length, 0);
    assert.equal(f.team.query(collaborator.threadId, 'decisions', r.taskRef).items[0].id, d.id);
    f.team.applyWorklog(
      f.e,
      "turn-owner",
      [
        {
          requestId: r.requestId,
          ownerEmployeeId: f.e.id,
          taskId: "BUSINESS-QUESTION-1",
          title: "待确认的业务",
          category: "验证",
          status: "waiting_input",
          summary: "负责人补充问题背景",
          decision: {
            id: d.id,
            title: "确认渠道",
            question: d.question,
            options: d.options,
          },
        },
      ],
      "test-digest",
    );
    assert.equal(f.s.get("decisions", d.id).fromEmployeeId, collaborator.id);
    f.team.decisionAnswer(d.id, {
      revision: 2,
      action: "resolve",
      answer: "请采用已有渠道",
    });
    const replied = f.s.get("decisions", d.id),
      input = f.s.get("requests", replied.responseRequestId);
    assert.equal(input.employeeId, collaborator.id);
    assert.equal(input.ownerEmployeeId, f.e.id);
    assert.equal(input.mode, "steer");
    assert.equal(input.taskRef, r.taskRef);
    assert.ok(input.instruction.includes(d.question));
    assert.equal(f.s.get("tasks", r.taskRef).status, "waiting_input");
    applyQuestionEvent(f.s, question);
    assert.equal(f.s.list("decisions").length, 1);
    assert.equal(f.s.get("decisions", d.id).state, "resolved");
  } finally {
    f.close();
  }
});

test("native human question reply resolves once without creating another delivery", () => {
  const f = fixture();
  try {
    const r = f.request();
    f.s.insert("events", "receipt", f.routed(r));
    applyQuestionEvent(f.s, project(f.ask(), f.b));
    const d = f.s.list("decisions")[0],
      count = f.s.list("operations").length;
    const row = {
      type: "event_msg",
      timestamp: f.at,
      payload: {
        type: "item_completed",
        item: {
          type: "UserMessage",
          content: [
            {
              type: "text",
              text:
                "<send_user_message_question_reply>\n" +
                JSON.stringify([
                  {
                    questionItemId: d.questionItemId,
                    question: "DISCARDED_COPY",
                    answer: "渠道已确定",
                  },
                ]) +
                "\n</send_user_message_question_reply>",
            },
          ],
        },
      },
    };
    const answer = project(row, f.b);
    assert.ok(!JSON.stringify(answer).includes("DISCARDED_COPY"));
    applyQuestionEvent(f.s, answer);
    applyQuestionEvent(f.s, answer);
    assert.equal(f.s.get("decisions", d.id).answer, "渠道已确定");
    assert.equal(f.s.get("decisions", d.id).decidedBy, "human_native");
    assert.equal(f.s.get("decisions", d.id).revision, 2);
    assert.equal(f.s.list("operations").length, count);
    assert.equal(
      project(
        {
          ...row,
          payload: {
            ...row.payload,
            item: { ...row.payload.item, type: "AgentMessage" },
          },
        },
        f.b,
      ),
      null,
    );
  } finally {
    f.close();
  }
});

test("ambiguous business context stays visible and cannot send a reply to a guessed task", () => {
  const f = fixture();
  try {
    for (const r of [f.request(), f.request()]) {
      const event = f.routed(r);
      f.s.insert("events", event.id, event);
    }
    applyQuestionEvent(f.s, project(f.ask(), f.b));
    const d = f.s.list("decisions")[0];
    assert.equal(d.taskRef, null);
    assert.throws(
      () =>
        f.team.decisionAnswer(d.id, {
          revision: 1,
          action: "resolve",
          answer: "选择 A",
        }),
      /关联不唯一/,
    );
    assert.equal(f.s.get("decisions", d.id).state, "pending");
    const originalCount = f.s.list("decisions").length;
    f.team.bind(f.e.id, {
      threadId: randomUUID(),
      cwd: f.root,
      title: "新绑定",
    });
    applyQuestionEvent(f.s, project(f.ask("old_binding_question"), f.b));
    assert.equal(f.s.list("decisions").length, originalCount);
  } finally {
    f.close();
  }
});

test("observer upgrade backfills an in-flight native question and restart is idempotent", () => {
  const f = fixture();
  try {
    const r = f.request(),
      nativeFile = path.join(f.root, "rollout.jsonl");
    f.s.insert("events", "receipt", f.routed(r));
    const db = new DatabaseSync(path.join(f.root, "state_5.sqlite"));
    db.exec(
      "CREATE TABLE threads (id TEXT,name TEXT,cwd TEXT,rollout_path TEXT,archived INTEGER,updated_at INTEGER)",
    );
    db.prepare("INSERT INTO threads VALUES (?,?,?,?,?,?)").run(
      f.e.threadId,
      "原生任务",
      f.root,
      nativeFile,
      0,
      Date.now() / 1000,
    );
    db.close();
    fs.writeFileSync(nativeFile, JSON.stringify(f.ask()) + "\n");
    f.s.put("meta", "cursor:" + f.b.id, {
      offset: fs.statSync(nativeFile).size,
      ino: fs.statSync(nativeFile).ino,
    });
    new Observer(f.s, f.root).poll();
    new Observer(f.s, f.root).poll();
    assert.equal(f.s.list("decisions").length, 1);
    assert.equal(f.s.list("decisions")[0].taskRef, r.taskRef);
    assert.equal(
      f.s.list("events").filter((e) => e.kind === "native_question").length,
      1,
    );
    assert.equal(f.s.list("hooks").length, 0);
  } finally {
    f.close();
  }
});

test("collaborator selection excludes the owner and does not auto-dispatch to collaborators", () => {
  const f = fixture();
  try {
    const other = f.employee();
    const r = f.team.submit({
      employeeId: f.e.id,
      mode: "fifo",
      instruction: "协作业务",
      participants: [f.e.id, other.id, other.id],
    });
    assert.deepEqual(f.s.get("tasks", r.taskRef).participants, [other.id]);
    assert.equal(f.s.list("requests").length, 1);
    assert.equal(f.s.get("requests", r.requestId).employeeId, f.e.id);
  } finally {
    f.close();
  }
});
