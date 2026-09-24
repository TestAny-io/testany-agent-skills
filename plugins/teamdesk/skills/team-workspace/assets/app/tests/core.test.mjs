import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Store } from "../src/db.mjs";
import { Team } from "../src/service.mjs";
import { stopHook } from "../src/hook-core.mjs";
import { Bridge } from "../src/bridge.mjs";
import { project, Observer, catalog } from "../src/native.mjs";
import { createApp } from "../src/server.mjs";
import { DatabaseSync } from "node:sqlite";
import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "teamdesk-")),
    s = new Store(root),
    team = new Team(s);
  return {
    root,
    s,
    team,
    employee(name = "A") {
      return team.createEmployee({
        name,
        role: "测试",
        group: "任意组",
        bindingMode: "existing",
        threadId: randomUUID(),
        cwd: root,
      });
    },
    close() {
      s.close();
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}
function request(f, e) {
  return f.team.submit({
    employeeId: e.id,
    mode: "fifo",
    instruction: "测试业务",
    acceptanceCriteria: "真实产物",
  });
}
function entry(e, r, extra = {}) {
  return {
    requestId: r.requestId,
    ownerEmployeeId: e.id,
    taskId: e.id + "-T01",
    title: "业务测试",
    category: "任意分类",
    stage: "自定义阶段",
    status: "completed",
    summary: "完成事实",
    artifactPaths: [],
    ...extra,
  };
}
function hook(e, entries, extra = {}) {
  return {
    hook_event_name: "Stop",
    session_id: e.threadId,
    turn_id: "turn-1",
    cwd: e.cwd,
    last_assistant_message:
      entries === null
        ? "正常回复"
        : "<teamdesk_worklog>" +
          JSON.stringify({ entries }) +
          "</teamdesk_worklog>",
    ...extra,
  };
}
test("32 active employees; 33rd rejected; archive/restore respects capacity", () => {
  const f = fixture();
  try {
    for (let i = 0; i < 32; i++) f.employee("E" + i);
    assert.throws(() => f.employee(), /32/);
    f.team.archiveEmployee("EMP-001", true);
    f.employee("replacement");
    assert.throws(() => f.team.archiveEmployee("EMP-001", false), /32/);
    assert.equal(f.s.list("employees").length, 33);
  } finally {
    f.close();
  }
});
test("owner metadata, hook idempotence and restart persistence", () => {
  const f = fixture();
  try {
    const e = f.employee(),
      r = request(f, e);
    fs.writeFileSync(path.join(f.root, "artifacts", "a.md"), "evidence");
    const msg = hook(e, [entry(e, r, { artifactPaths: ["a.md"] })]);
    assert.deepEqual(stopHook(f.s, msg), {});
    stopHook(f.s, msg);
    assert.equal(f.s.list("records").length, 1);
    const t = f.s.get("tasks", r.taskRef);
    assert.equal(t.status, "completed");
    assert.equal(t.category, "任意分类");
    assert.equal(t.acceptance, null);
    const second = new Store(f.root);
    assert.equal(second.get("tasks", t.id).businessId, t.businessId);
    second.close();
  } finally {
    f.close();
  }
});
test("hook asks once, fails missing continuation and ignores foreign thread/cwd", () => {
  const f = fixture();
  try {
    const e = f.employee();
    const r = request(f, e);
    f.team.inbox(e.threadId, r.requestId);
    assert.equal(stopHook(f.s, hook(e, null)).decision, "block");
    assert.match(
      stopHook(f.s, hook(e, null, { stop_hook_active: true })).systemMessage,
      /缺少/,
    );
    assert.deepEqual(stopHook(f.s, hook(e, null)), {});
    assert.deepEqual(
      stopHook(f.s, hook(e, null, { session_id: randomUUID() })),
      {},
    );
    assert.deepEqual(stopHook(f.s, hook(e, [], { cwd: "/" })), {});
    assert.match(
      stopHook(f.s, hook(e, [], { turn_id: "empty-summary" })).systemMessage,
      /不能用空摘要/,
    );
    assert.equal(f.team.employee(e.id).lastHook, null);
  } finally {
    f.close();
  }
});
test("FIFO remains pending and steer works during active business", () => {
  const f = fixture();
  try {
    const e = f.employee(),
      a = request(f, e),
      b = request(f, e);
    stopHook(
      f.s,
      hook(e, [
        entry(e, a, { status: "in_progress" }),
        entry(e, b, { status: "queued", taskId: "B" }),
      ]),
    );
    assert.equal(f.team.inbox(e.threadId, a.requestId).requests.length, 1);
    assert.equal(f.team.inbox(e.threadId, b.requestId).requests.length, 1);
    const steer = f.team.submit({
      employeeId: e.id,
      mode: "steer",
      taskRef: a.taskRef,
      instruction: "补充",
    });
    assert.equal(f.s.get("requests", steer.requestId).mode, "steer");
    assert.equal(f.s.list("tasks").length, 2);
  } finally {
    f.close();
  }
});
test("rebind disables old task; profile and records persist", () => {
  const f = fixture();
  try {
    const e = f.employee(),
      r = request(f, e);
    stopHook(f.s, hook(e, [entry(e, r)]));
    const newId = randomUUID();
    f.team.bind(e.id, { threadId: newId, cwd: f.root });
    assert.deepEqual(stopHook(f.s, hook(e, [], { turn_id: "old-turn" })), {});
    assert.equal(f.team.employee(e.id).bindingVersion, 2);
    assert.equal(f.s.list("records").length, 1);
    assert.throws(() => f.team.inbox(e.threadId), /未绑定/);
  } finally {
    f.close();
  }
});
test("contributors cannot update owner state, ID or human acceptance", () => {
  const f = fixture();
  try {
    const a = f.employee("owner"),
      b = f.employee("reviewer"),
      r = request(f, a);
    stopHook(f.s, hook(a, [entry(a, r, { status: "in_progress" })]));
    const peer = f.team.peerRequest(a.threadId, {
      employeeId: b.id,
      taskRef: r.taskRef,
      parentRequestId: r.requestId,
      instruction: "review",
    });
    stopHook(
      f.s,
      hook(b, [entry(a, { requestId: peer.id }, { status: "completed" })]),
    );
    assert.equal(f.s.get("tasks", r.taskRef).status, "in_progress");
    assert.equal(
      f.s.list("records").find((x) => x.employeeId === b.id).authority,
      "contributor_report",
    );
    assert.throws(
      () => f.team.applyWorklog(b, "forge", [entry(b, r)], "hash"),
      /不属于/,
    );
  } finally {
    f.close();
  }
});
test("invalid batched entries roll back all writes; artifact traversal rejected", () => {
  const f = fixture();
  try {
    const e = f.employee(),
      r = request(f, e);
    assert.throws(
      () =>
        f.team.applyWorklog(
          e,
          "bad",
          [entry(e, r), entry(e, r, { ownerEmployeeId: "wrong" })],
          "hash",
        ),
      /负责人/,
    );
    assert.equal(f.s.list("records").length, 0);
    const outside = path.join(os.tmpdir(), "td-outside-" + randomUUID());
    fs.writeFileSync(outside, "private");
    try {
      assert.throws(
        () =>
          f.team.applyWorklog(
            e,
            "bad2",
            [entry(e, r, { artifactPaths: [outside] })],
            "hash",
          ),
        /产物必须/,
      );
    } finally {
      fs.unlinkSync(outside);
    }
  } finally {
    f.close();
  }
});
test("business IDs are unique, including one hook batch", () => {
  const f = fixture();
  try {
    const e = f.employee(),
      a = request(f, e),
      b = request(f, e);
    assert.throws(
      () => f.team.applyWorklog(e, "dup", [entry(e, a), entry(e, b)], "hash"),
      /编号重复/,
    );
    assert.equal(f.s.list("records").length, 0);
  } finally {
    f.close();
  }
});
test("caught hook failure rolls back records and business updates but retains its diagnostic", () => {
  const f = fixture();
  try {
    const e = f.employee(),
      a = request(f, e),
      b = request(f, e);
    const decision = {
      id: "SAME-DECISION",
      title: "范围",
      question: "选哪种范围",
      options: ["A", "B"],
    };
    const result = stopHook(
      f.s,
      hook(e, [
        entry(e, a, { decision }),
        entry(e, b, { taskId: "B", decision }),
      ]),
    );
    assert.match(result.systemMessage, /其他任务/);
    assert.equal(f.s.list("records").length, 0);
    assert.equal(f.s.list("decisions").length, 0);
    assert.equal(f.s.get("tasks", a.taskRef).status, "unregistered");
    assert.equal(f.s.get("tasks", b.taskRef).revision, 0);
    assert.equal(f.s.get("requests", a.requestId).state, "saved");
    assert.equal(f.s.list("hooks")[0].state, "failed");
    assert.equal(f.team.employee(e.id).lastHook, null);
    assert.deepEqual(
      stopHook(
        f.s,
        hook(e, [entry(e, a), entry(e, b, { taskId: "B" })], {
          turn_id: "corrected",
        }),
      ),
      {},
    );
    assert.equal(f.s.list("records").length, 2);
  } finally {
    f.close();
  }
});
test("human acceptance is revision bound; rejected work steers owner", () => {
  const f = fixture();
  try {
    const e = f.employee(),
      r = request(f, e);
    stopHook(f.s, hook(e, [entry(e, r)]));
    const t = f.s.get("tasks", r.taskRef);
    assert.throws(
      () => f.team.acceptTask(t.id, { revision: 0, verdict: "accepted" }),
      /刷新/,
    );
    f.team.acceptTask(t.id, {
      revision: 1,
      verdict: "rejected",
      note: "补充测试",
    });
    assert.equal(f.s.get("tasks", t.id).status, "completed");
    assert.equal(
      f.s.list("requests").find((x) => x.source === "human_acceptance").mode,
      "steer",
    );
    assert.equal(f.s.get("tasks", t.id).acceptance.by, "human");
  } finally {
    f.close();
  }
});
test("decision resolution cannot overwrite business state and conflicts fail", () => {
  const f = fixture();
  try {
    const e = f.employee(),
      r = request(f, e);
    stopHook(
      f.s,
      hook(e, [
        entry(e, r, {
          status: "waiting_input",
          decision: {
            id: "D1",
            title: "范围",
            question: "选哪个",
            options: ["A", "B"],
          },
        }),
      ]),
    );
    f.team.decisionAnswer("D1", {
      revision: 1,
      action: "needs_info",
      answer: "先给证据",
    });
    assert.equal(f.s.get("tasks", r.taskRef).status, "waiting_input");
    assert.throws(
      () =>
        f.team.decisionAnswer("D1", {
          revision: 1,
          action: "resolve",
          answer: "A",
        }),
      /刷新/,
    );
    f.team.decisionAnswer("D1", {
      revision: 2,
      action: "resolve",
      answer: "A",
    });
    assert.equal(f.s.get("decisions", "D1").state, "resolved");
  } finally {
    f.close();
  }
});
test("native lease expires uncertain and cannot blind-retry creation", () => {
  const f = fixture();
  try {
    const bridgeId = randomUUID();
    f.team.updateSettings({ bridgeThreadId: bridgeId });
    f.team.createEmployee({ name: "new", role: "test", bindingMode: "new" });
    const bridge = new Bridge(f.s),
      op = bridge.next(bridgeId).operation;
    assert.equal(op.action, "create_thread");
    const saved = f.s.get("operations", op.id);
    saved.leaseUntil = "2000-01-01T00:00:00Z";
    f.s.put("operations", op.id, saved);
    bridge.next(bridgeId);
    assert.equal(f.s.get("operations", op.id).state, "uncertain");
    assert.throws(() => bridge.recover(op.id, { action: "retry" }), /不能盲目/);
    assert.throws(() => bridge.next(randomUUID()), /只有/);
  } finally {
    f.close();
  }
});
test("native projection excludes body/results and separates send from receipt", () => {
  const binding = { employeeId: "E", threadId: randomUUID(), version: 1 },
    req = "REQ-" + randomUUID(),
    task = "TASK-" + randomUUID(),
    header =
      "TEAMDESK_META " + JSON.stringify({ requestId: req, taskRef: task }),
    secret = "PRIVATE_BODY_MUST_NOT_LEAK";
  const send = {
    type: "event_msg",
    timestamp: "2026-01-01",
    payload: {
      type: "item_completed",
      item: {
        type: "McpToolCall",
        server: "codex_app",
        tool: "send_message_to_thread",
        arguments: { threadId: randomUUID(), prompt: header + "\n" + secret },
        status: "completed",
        result: { isError: false, content: secret },
      },
    },
  };
  const projected = project(send, binding);
  assert.equal(projected.requestId, req);
  assert.equal(projected.state, "accepted");
  assert.ok(!JSON.stringify(projected).includes(secret));
  const receive = {
    ...send,
    payload: {
      type: "item_completed",
      item: {
        type: "FunctionCallOutput",
        namespace: "codex_app",
        name: "send_message_to_thread",
        output:
          "<codex_delegation><source_thread_id>" +
          binding.threadId +
          "</source_thread_id><input>" +
          header +
          "\n" +
          secret +
          "</input></codex_delegation>",
      },
    },
  };
  assert.equal(project(receive, binding).kind, "native_message");
  assert.ok(!JSON.stringify(project(receive, binding)).includes(secret));
});
test("catalog fails closed on unsupported schema", () => {
  const f = fixture();
  try {
    const db = new DatabaseSync(path.join(f.root, "state_5.sqlite"));
    db.exec("CREATE TABLE threads (id TEXT)");
    db.close();
    assert.equal(catalog(f.root).available, false);
  } finally {
    f.close();
  }
});
test("read-only observer survives split Unicode and restart without duplicate events", () => {
  const f = fixture();
  try {
    const e = f.employee(),
      nativeFile = path.join(f.root, "rollout.jsonl"),
      db = new DatabaseSync(path.join(f.root, "state_5.sqlite"));
    db.exec(
      "CREATE TABLE threads (id TEXT,title TEXT,cwd TEXT,rollout_path TEXT,archived INTEGER,updated_at INTEGER)",
    );
    db.prepare("INSERT INTO threads VALUES (?,?,?,?,?,?)").run(
      e.threadId,
      "原生",
      f.root,
      nativeFile,
      0,
      Date.now() / 1000,
    );
    db.close();
    const row = JSON.stringify({
      type: "event_msg",
      timestamp: new Date(Date.now() + 10).toISOString(),
      payload: { type: "task_complete", turn_id: "turn-1", private: "不进入" },
    });
    fs.writeFileSync(nativeFile, row.slice(0, -2));
    new Observer(f.s, f.root).poll();
    assert.equal(f.s.list("events").length, 0);
    fs.appendFileSync(nativeFile, row.slice(-2) + "\n");
    new Observer(f.s, f.root).poll();
    new Observer(f.s, f.root).poll();
    assert.equal(f.s.list("events").length, 1);
    assert.ok(!JSON.stringify(f.s.list("events")).includes("不进入"));
  } finally {
    f.close();
  }
});
test("HTTP host/origin/CSRF, idempotency, persistence and static boundaries", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "teamdesk-http-")),
    app = createApp({ root, home: root, port: 0, nativeConnection: false }),
    address = await app.listen(),
    url = "http://127.0.0.1:" + address.port;
  try {
    const boot = await (await fetch(url + "/api/bootstrap")).json();
    const key = randomUUID(),
      payload = { name: "HTTP employee", role: "test", bindingMode: "new" },
      opts = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-TeamDesk-Token": boot.token,
          "Idempotency-Key": key,
        },
        body: JSON.stringify(payload),
      };
    assert.equal(
      (
        await fetch(url + "/api/employees", {
          ...opts,
          headers: { ...opts.headers, Origin: "https://evil.invalid" },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(url + "/api/employees", {
          ...opts,
          headers: { "Content-Type": "application/json" },
        })
      ).status,
      403,
    );
    assert.equal((await fetch(url + "/api/employees", opts)).status, 200);
    assert.equal((await fetch(url + "/api/employees", opts)).status, 200);
    assert.equal(
      (await (await fetch(url + "/api/state")).json()).employees.length,
      1,
    );
    assert.equal(
      (
        await fetch(url + "/api/employees", {
          ...opts,
          body: JSON.stringify({ ...payload, name: "Different" }),
        })
      ).status,
      409,
    );
    assert.equal((await fetch(url + "/src/db.mjs")).status, 404);
    assert.equal(
      await new Promise((resolve) => {
        http.get(
          url + "/api/state",
          { headers: { host: "evil.invalid" } },
          (r) => {
            r.resume();
            resolve(r.statusCode);
          },
        );
      }),
      403,
    );
  } finally {
    await new Promise((r) => app.server.close(r));
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("HTTP preserves multibyte business input split across network chunks", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "teamdesk-unicode-")),
    app = createApp({ root, home: root, port: 0, nativeConnection: false }),
    address = await app.listen(),
    url = "http://127.0.0.1:" + address.port;
  try {
    const boot = await (await fetch(url + "/api/bootstrap")).json(),
      name = "中文员工名字",
      bytes = Buffer.from(
        JSON.stringify({ name, role: "质量检查", bindingMode: "new" }),
      ),
      split = bytes.indexOf(Buffer.from("中")) + 1;
    const response = await new Promise((resolve, reject) => {
      const request = http.request(
        url + "/api/employees",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": bytes.length,
            "X-TeamDesk-Token": boot.token,
            "Idempotency-Key": randomUUID(),
          },
        },
        (res) => {
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () =>
            resolve({
              status: res.statusCode,
              json: JSON.parse(Buffer.concat(chunks)),
            }),
          );
          res.on("error", reject);
        },
      );
      request.on("error", reject);
      request.write(bytes.subarray(0, split));
      setTimeout(() => request.end(bytes.subarray(split)), 25);
    });
    assert.equal(response.status, 200);
    assert.equal(response.json.name, name);
    assert.equal(app.store.list("employees")[0].name, name);
  } finally {
    await new Promise((r) => app.server.close(r));
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("native CLI preserves multibyte handoff input across stdin chunks", async () => {
  const f = fixture();
  try {
    const a = f.employee("owner"),
      b = f.employee("reviewer"),
      r = request(f, a),
      instruction = "中文交接：核对证据来源",
      bytes = Buffer.from(
        JSON.stringify({ employeeId: b.id, taskRef: r.taskRef, parentRequestId: r.requestId, instruction }),
      ),
      split = bytes.indexOf(Buffer.from("中")) + 1;
    f.team.inbox(a.threadId, r.requestId);
    const result = await new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          fileURLToPath(new URL("../src/cli.mjs", import.meta.url)),
          "peer-request",
        ],
        {
          env: {
            ...process.env,
            TEAMDESK_HOME: f.root,
            CODEX_THREAD_ID: a.threadId,
          },
          stdio: ["pipe", "pipe", "pipe"],
        },
      );
      const output = [],
        errors = [];
      child.stdout.on("data", (chunk) => output.push(chunk));
      child.stderr.on("data", (chunk) => errors.push(chunk));
      child.on("error", reject);
      child.on("close", (code) =>
        code === 0
          ? resolve(JSON.parse(Buffer.concat(output)))
          : reject(Error(Buffer.concat(errors).toString())),
      );
      child.stdin.write(bytes.subarray(0, split));
      setTimeout(() => child.stdin.end(bytes.subarray(split)), 80);
    });
    assert.equal(result.instruction, instruction);
    assert.equal(result.targetThreadId, b.threadId);
    assert.equal(f.s.get("requests", result.id).instruction, instruction);
  } finally {
    f.close();
  }
});

test("steer completion closes received original work while preserving new inputs", () => {
  const f = fixture();
  try {
    const e = f.employee(),
      r = request(f, e);
    f.team.inbox(e.threadId, r.requestId);
    stopHook(f.s, hook(e, [entry(e, r, { status: "waiting_input" })]));
    const steer = f.team.submit({
      employeeId: e.id,
      mode: "steer",
      taskRef: r.taskRef,
      instruction: "继续",
    });
    f.team.inbox(e.threadId, steer.requestId);
    const newer = f.team.submit({
      employeeId: e.id,
      mode: "steer",
      taskRef: r.taskRef,
      instruction: "尚未读取的新补充",
    });
    stopHook(f.s, hook(e, [entry(e, steer)], { turn_id: "turn-2" }));
    assert.equal(f.s.get("requests", r.requestId).state, "recorded");
    assert.equal(f.s.get("requests", newer.requestId).state, "saved");
  } finally {
    f.close();
  }
});
test("archived binding cannot be restored over another employee", () => {
  const f = fixture();
  try {
    const a = f.employee("A");
    f.team.archiveEmployee(a.id, true);
    const b = f.team.createEmployee({
      name: "B",
      role: "测试",
      bindingMode: "existing",
      threadId: a.threadId,
      cwd: f.root,
    });
    assert.throws(() => f.team.archiveEmployee(a.id, false), /已被/);
    assert.equal(f.team.actor(a.threadId).id, b.id);
  } finally {
    f.close();
  }
});
test("catalog uses display names and never falls back to prompt-backed title", () => {
  const f = fixture();
  try {
    const db = new DatabaseSync(path.join(f.root, "state_5.sqlite"));
    db.exec(
      "CREATE TABLE threads (id TEXT,name TEXT,title TEXT,cwd TEXT,rollout_path TEXT,archived INTEGER,updated_at INTEGER)",
    );
    db.prepare("INSERT INTO threads VALUES (?,?,?,?,?,?,?)").run(
      randomUUID(),
      "员工名称",
      "PRIVATE_FIRST_INPUT",
      f.root,
      "unused",
      0,
      Date.now() / 1000,
    );
    db.prepare("INSERT INTO threads VALUES (?,?,?,?,?,?,?)").run(
      randomUUID(),
      null,
      "SECRET_FALLBACK",
      f.root,
      "unused",
      0,
      Date.now() / 1000,
    );
    db.close();
    const result = catalog(f.root);
    assert.ok(result.available);
    assert.ok(result.threads.some((t) => t.title === "员工名称"));
    assert.ok(!JSON.stringify(result).includes("PRIVATE_FIRST_INPUT"));
    assert.ok(!JSON.stringify(result).includes("SECRET_FALLBACK"));
  } finally {
    f.close();
  }
});

test("32 concurrent hook processes serialize writes without loss or duplicate IDs", async () => {
  const { execFile } = await import("node:child_process"),
    { promisify } = await import("node:util"),
    run = promisify(execFile),
    f = fixture();
  try {
    const jobs = [];
    for (let i = 0; i < 32; i++) {
      const e = f.employee("Parallel-" + i),
        r = request(f, e);
      jobs.push({ root: f.root, payload: hook(e, [entry(e, r)]) });
    }
    const dbUrl = new URL("../src/db.mjs", import.meta.url).href,
      hookUrl = new URL("../src/hook-core.mjs", import.meta.url).href;
    const script =
      "import {Store} from " +
      JSON.stringify(dbUrl) +
      "; import {stopHook} from " +
      JSON.stringify(hookUrl) +
      ';const j=JSON.parse(process.argv[1]);const s=new Store(j.root);const result=stopHook(s,j.payload,"fixture");s.close();if(result.systemMessage)throw Error(result.systemMessage);';
    await Promise.all(
      jobs.map((j) =>
        run(process.execPath, [
          "--input-type=module",
          "-e",
          script,
          JSON.stringify(j),
        ]),
      ),
    );
    assert.equal(f.s.list("records").length, 32);
    assert.equal(new Set(f.s.list("records").map((r) => r.id)).size, 32);
    assert.equal(
      f.s.list("tasks").filter((t) => t.status === "completed").length,
      32,
    );
  } finally {
    f.close();
  }
});

test("artifact download handles encoded record IDs and detects changed evidence", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "teamdesk-artifact-")),
    app = createApp({ root, home: root, port: 0, nativeConnection: false }),
    a = await app.listen(),
    team = new Team(app.store);
  try {
    const e = team.createEmployee({
        name: "Artifact",
        role: "test",
        bindingMode: "existing",
        threadId: randomUUID(),
        cwd: root,
      }),
      r = team.submit({
        employeeId: e.id,
        mode: "fifo",
        instruction: "artifact",
      });
    const file = path.join(root, "artifacts", "证据.md");
    fs.writeFileSync(file, "original");
    stopHook(app.store, hook(e, [entry(e, r, { artifactPaths: ["证据.md"] })]));
    const record = app.store.list("records")[0],
      url =
        "http://127.0.0.1:" +
        a.port +
        "/api/artifact/" +
        encodeURIComponent(record.id) +
        "/0";
    const response = await fetch(url);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "original");
    assert.match(response.headers.get("content-disposition"), /attachment/);
    fs.writeFileSync(file, "modified");
    assert.equal((await fetch(url)).status, 409);
  } finally {
    await new Promise((r) => app.server.close(r));
    fs.rmSync(root, { recursive: true, force: true });
  }
});
