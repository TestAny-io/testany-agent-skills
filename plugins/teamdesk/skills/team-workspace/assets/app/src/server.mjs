import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, createHash } from "node:crypto";
import { Store, requireValue, Problem, now } from "./db.mjs";
import { Team } from "./service.mjs";
import { employeeCapabilities } from './capabilities.mjs';
import { hookFingerprint } from "./fingerprint.mjs";
import { Bridge, skillRoot } from "./bridge.mjs";
import { NativeGateway } from "./native-gateway.mjs";
import { launchSharedDesktop } from "./shared-connection.mjs";
import { pluginVersion } from "./version.mjs";
import { WritingAssistant } from './writing-assistant.mjs';
import { startupEvidence } from './startup-evidence.mjs';
import { collaborationView } from './collaboration-view.mjs';
import {
  Observer,
  skills,
  trustStatus,
  codexHome,
  automationStatus,
} from "./native.mjs";
const publicRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../public",
);
export function createApp({ root, home = codexHome(), port = 4322, nativeConnection, writingSourceRoots } = {}) {
  const s = new Store(root),
    team = new Team(s),
    bridge = new Bridge(s),
    observer = new Observer(s, home),
    token = randomBytes(32).toString("hex");
  const gateway = nativeConnection === false ? null : new NativeGateway(s, nativeConnection ? { connection: nativeConnection } : {});
  const writing = new WritingAssistant(s, gateway?.connection, { home, sourceRoots:writingSourceRoots });
  const streams = new Set(), activeHttp = new Map();
  let notifyTimer = null, stopped = false;
  function changed() {
    if (stopped || notifyTimer) return;
    notifyTimer = setTimeout(() => {
      notifyTimer = null;
      try { observer.poll(); } catch (e) { console.error("Metadata:", e.message); }
      for (const response of streams) response.write("event: changed\ndata: {}\n\n");
    }, 120);
    notifyTimer.unref();
  }
  gateway?.on("change", changed);
  writing.on('change', changed);
  writing.on('error-observed', error => console.error('Writing assistant:', error.message));
  const hookDigest = hookFingerprint();
  let skillCache = null;
  function snapshot() {
    bridge.expire();
    observer.poll();
    const native = observer.scan(),
      events = s.list("events"),
      settings = team.settings(),
      connection = gateway?.connection.state;
    const employees = s
      .list("employees")
      .sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }))
      .map((e) => {
        const runtime = events
          .filter(
            (v) =>
              v.threadId === e.threadId &&
              v.bindingVersion === e.bindingVersion &&
              v.kind === "runtime",
          )
          .sort((a, b) => a.at.localeCompare(b.at))
          .at(-1);
        const evidence =
          e.lastHook &&
          e.lastHook.digest === hookDigest &&
          events.some(
            (v) =>
              v.threadId === e.threadId &&
              v.turnId === e.lastHook.turnId &&
              v.kind === "runtime" &&
              v.state === "task_complete" &&
              v.at >= e.lastHook.at,
          );
        const hookErrors = s
          .list("hooks")
          .filter(
            (h) =>
              h.employeeId === e.id &&
              h.bindingVersion === e.bindingVersion &&
              h.state === "failed" &&
              (!e.lastHook || h.at > e.lastHook.at),
          );
        return {
          ...e,
          group: s.get('departments', e.departmentId)?.name || e.group || '未分配',
          capabilities: employeeCapabilities(e).skills,
          modelSettings: gateway?.models.view(e) || null,
          runtime: gateway?.runtime.get(e.threadId)?.status === "active" ? "task_started" : runtime?.state || "not_observed",
          activeTurnId: gateway?.runtime.get(e.threadId)?.turnId || null,
          activeTaskRef: gateway?.runtime.get(e.threadId)?.taskRef || null,
          hookReady: !!evidence,
          lastHookError: hookErrors.at(-1)?.error || null,
        };
      });
    return {
      version: pluginVersion,
      at: now(),
      settings,
      employees,
      departments: s.list('departments'),
      resources: team.workspace.resources(),
      writing: s.list('writing_sessions').map(({id,updatedAt,state}) => ({id,updatedAt,state})),
      bindings: s.list("bindings"),
      tasks: s.list("tasks"),
      requests: s.list("requests"),
      records: s.list("records"),
      decisions: s.list("decisions"),
      operations: s.list("operations"),
      events: events.slice(-3000),
      hooks: s.list("hooks"),
      audit: s.list("audit").slice(-1000),
      health: {
        nativeAvailable: native.available,
        nativeError: native.error || null,
        adapter: native.adapter || null,
        hookTrust: gateway?.hooks.state || { recorded: false, verified: false, status: "unknown" },
        connection: connection || null,
        recovery: gateway?.recovery || null,
        startup: startupEvidence(s.root),
        gatewayError: gateway?.lastError || null,
        dataDirectory: s.root,
        skillRoot,
        expectedHookDigest: hookDigest,
        eventCount: events.length,
      },
    };
  }
  function send(res, code, value, type = "application/json; charset=utf-8") {
    res.writeHead(code, {
      "Content-Type": type,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      "Referrer-Policy": "no-referrer",
    });
    res.end(
      type.startsWith("application/json") ? JSON.stringify(value) : value,
    );
  }
  const server = http.createServer(async (req, res) => {
    try {
      const actualPort = server.address()?.port;
      requireValue(
        req.headers.host === "127.0.0.1:" + actualPort,
        "host",
        "仅允许本机 127.0.0.1 访问",
        403,
      );
      const expectedOrigin = "http://127.0.0.1:" + actualPort;
      requireValue(
        !req.headers.origin || req.headers.origin === expectedOrigin,
        "origin",
        "跨站请求已拒绝",
        403,
      );
      const url = new URL(req.url, expectedOrigin),
        parts = url.pathname
          .split("/")
          .filter(Boolean)
          .map((part) => {
            try {
              return decodeURIComponent(part);
            } catch {
              throw new Problem("path", "路径编码无效");
            }
          });
      if (req.method === "GET") {
        if (url.pathname === "/api/stream") {
          res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
          res.write("event: connected\ndata: {}\n\n");
          streams.add(res); req.on("close", () => streams.delete(res)); return;
        }
        if (url.pathname === "/api/bootstrap")
          return send(res, 200, { token, ...snapshot() });
        if (url.pathname === "/api/state") return send(res, 200, snapshot());
        if (url.pathname === "/api/collaboration")
          return send(res, 200, collaborationView(s, Object.fromEntries(url.searchParams)));
        if (url.pathname === '/api/model-catalog') {
          requireValue(gateway, 'native_disabled', '原生接入未启用', 409);
          return send(res, 200, { models: await gateway.models.catalog() });
        }
        if (parts[0] === 'api' && parts[1] === 'employees' && parts[3] === 'models' && parts.length === 4) {
          requireValue(gateway, 'native_disabled', '原生接入未启用', 409);
          return send(res, 200, await gateway.models.sync(parts[2]));
        }
        if (parts[0] === 'api' && parts[1] === 'writing' && parts.length === 3)
          return send(res, 200, writing.view(writing.get(parts[2])));
        if (parts[0] === 'api' && parts[1] === 'resources' && parts[2]) {
          if (parts[3] === 'history') return send(res, 200, { items: s.list('document_versions').filter(v => v.documentId === parts[2]).map(({content, ...v}) => v).reverse() });
          return send(res, 200, team.workspace.document(parts[2], { revision: url.searchParams.get('revision') }));
        }
        if (url.pathname === "/api/catalog") {
          if (gateway?.connection.state.online) return send(res, 200, await gateway.catalog());
          const c = observer.scan(true);
          return send(res, 200, {
            ...c,
            threads: c.threads.map(({ sourcePath, ...t }) => t),
          });
        }
        if (url.pathname === "/api/skills") {
          if (!skillCache || url.searchParams.has("refresh"))
            skillCache = skills(home);
          return send(res, 200, { skills: skillCache });
        }
        if (url.pathname === "/api/hooks/review") {
          requireValue(gateway, "native_disabled", "原生接入未启用", 409);
          return send(res, 200, await gateway.hooks.review());
        }
        if (url.pathname === "/api/export")
          return send(res, 200, {
            ...snapshot(),
            documents: s.list('documents'),
            documentVersions: s.list('document_versions'),
            writingSessions: s.list('writing_sessions').map(j => writing.view(j)),
            exportType: "teamdesk_metadata",
            exportedAt: now(),
          });
        if (parts[0] === "api" && parts[1] === "artifact") {
          const record = s.get("records", parts[2]),
            artifact = record?.artifacts?.[Number(parts[3])];
          requireValue(artifact, "not_found", "产物不存在", 404);
          const data = fs.readFileSync(artifact.path);
          requireValue(
            createHash("sha256").update(data).digest("hex") === artifact.sha256,
            "artifact_changed",
            "产物已变更，请负责人更新记录后再下载",
            409,
          );
          res.setHeader(
            "Content-Disposition",
            "attachment; filename*=UTF-8''" + encodeURIComponent(artifact.name),
          );
          return send(res, 200, data, "application/octet-stream");
        }
        const file = {
          "/": "index.html",
          "/index.html": "index.html",
          "/app.js": "app.js",
          "/employee-models.js": "employee-models.js",
          "/workspace-ui.js": "workspace-ui.js",
          "/writing-ui.js": "writing-ui.js",
          "/task-progress.js": "task-progress.js",
          "/collaboration.js": "collaboration.js",
          "/connection-ui.js": "connection-ui.js",
          "/delivery.js": "delivery.js",
          "/collaboration-ui.js": "collaboration-ui.js",
          "/styles.css": "styles.css",
        }[url.pathname];
        requireValue(file, "not_found", "页面不存在", 404);
        return send(
          res,
          200,
          fs.readFileSync(path.join(publicRoot, file)),
          file.endsWith(".html")
            ? "text/html; charset=utf-8"
            : file.endsWith(".js")
              ? "text/javascript; charset=utf-8"
              : "text/css; charset=utf-8",
        );
      }
      requireValue(req.method === "POST", "method", "仅支持 GET/POST", 405);
      requireValue(
        req.headers["x-teamdesk-token"] === token,
        "csrf",
        "页面会话已失效，请刷新后重试",
        403,
      );
      requireValue(
        (req.headers["content-type"] || "").startsWith("application/json"),
        "content_type",
        "需要 JSON 请求",
        415,
      );
      const chunks = [];
      let bytes = 0;
      for await (const c of req) {
        bytes += c.length;
        requireValue(bytes < 65536, "too_large", "请求过大", 413);
        chunks.push(c);
      }
      const raw = Buffer.concat(chunks).toString("utf8");
      let input;
      try {
        input = JSON.parse(raw);
      } catch {
        throw new Problem("json", "JSON 格式错误");
      }
      requireValue(
        input && typeof input === "object" && !Array.isArray(input),
        "json_object",
        "请求必须为 JSON 对象",
      );
      const key = req.headers["idempotency-key"];
      requireValue(
        typeof key === "string" && /^[a-zA-Z0-9-]{10,100}$/.test(key),
        "idempotency",
        "缺少请求去重编号",
      );
      const digest = createHash("sha256")
        .update(url.pathname + "\n" + raw)
        .digest("hex");
      const saved = s.get("meta", "http:" + key);
      if (saved) {
        requireValue(
          saved.digest === digest,
          "idempotency_reuse",
          "同一请求编号不可用于不同操作",
          409,
        );
        return send(res, 200, saved.result);
      }
      if (activeHttp.has(key)) {
        const active = activeHttp.get(key);
        requireValue(active.digest === digest, "idempotency_reuse", "同一请求编号不可用于不同操作", 409);
        return send(res, 200, await active.promise);
      }
      const asynchronous = async () => {
        requireValue(gateway, "native_disabled", "原生接入未启用", 409);
        let out;
        if (url.pathname === "/api/connection/reconnect") {
          if (gateway.connection.state.online) await gateway.connected();
          else await gateway.start();
          gateway.kick(); out = gateway.connection.state;
        } else if (url.pathname === "/api/connection/launch") {
          requireValue(input.confirmed === true, "launch_confirmation", "请确认以共享接入启动 Codex");
          out = launchSharedDesktop(s.root); await gateway.start();
        } else if (url.pathname === "/api/hooks/trust") {
          out = await gateway.hooks.trust(input); gateway.kick();
        } else if (parts[1] === "decisions" && parts[3] === "native-answer") out = await gateway.answerCallback(parts[2], input);
        else if (parts[1] === 'employees' && parts[3] === 'models' && parts.length === 4) out = await gateway.models.update(parts[2], input);
        else if (parts[1] === "operations" && parts[3] === "recover") out = await gateway.recover(parts[2], input);
        else if (parts[1] === 'writing' && parts[3] === 'sync') out = await writing.sync(parts[2]);
        else if (parts[1] === 'writing' && parts[3] === 'cancel') out = await writing.cancel(parts[2], input.revision);
        s.put("meta", "http:" + key, { digest, result: out, at: now() });
        changed(); return out;
      };
      if (["/api/connection/reconnect", "/api/connection/launch", "/api/hooks/trust"].includes(url.pathname) || (parts[1] === 'employees' && parts[3] === 'models' && parts.length === 4) || (parts[1] === 'writing' && ['sync','cancel'].includes(parts[3])) || (parts[1] === "decisions" && parts[3] === "native-answer") || (gateway && parts[1] === "operations" && parts[3] === "recover")) {
        const promise = asynchronous(); activeHttp.set(key, { digest, promise });
        try { return send(res, 200, await promise); } finally { activeHttp.delete(key); }
      }
      const result = s.tx(() => {
        let out;
        if (url.pathname === '/api/writing') out = writing.create(input);
        else if (parts[1] === 'writing' && parts[3] === 'continue') out = writing.followup(parts[2], input);
        else if (url.pathname === "/api/employees") {
          if (input.bindingMode === "existing") {
            const native = observer
              .scan(true)
              .threads.find((t) => t.id === input.threadId && !t.archived);
            requireValue(native, "native_missing", "所选 Codex 任务已不可用");
            Object.assign(input, {
              cwd: native.cwd,
              threadTitle: native.title,
            });
          }
          out = team.createEmployee(input);
        } else if (url.pathname === '/api/departments') out = team.workspace.saveDepartment(null, input);
        else if (parts[1] === 'departments' && parts[3] === 'edit') out = team.workspace.saveDepartment(parts[2], input);
        else if (parts[1] === 'departments' && parts[3] === 'archive') out = team.workspace.archiveDepartment(parts[2], input);
        else if (parts[1] === 'departments' && parts[3] === 'delete') out = team.deleteDepartment(parts[2], input);
        else if (url.pathname === '/api/resources') out = team.workspace.writeDocument(null, input);
        else if (parts[1] === 'resources' && parts[3] === 'edit') out = team.workspace.writeDocument(parts[2], input);
        else if (parts[1] === 'resources' && ['delete','restore','publish'].includes(parts[3])) out = team.workspace.transitionDocument(parts[2], input, parts[3]);
        else if (parts[1] === "employees" && parts[3] === "edit")
          out = team.editEmployee(parts[2], input);
        else if (parts[1] === 'employees' && parts[3] === 'department') out = team.changeEmployeeDepartment(parts[2], input);
        else if (parts[1] === "employees" && parts[3] === "archive")
          out = team.archiveEmployee(parts[2], input.archived);
        else if (parts[1] === "employees" && parts[3] === "bind") {
          const native = observer
            .scan(true)
            .threads.find((t) => t.id === input.threadId && !t.archived);
          requireValue(native, "native_missing", "所选原生任务不可用");
          out = team.bind(parts[2], {
            threadId: native.id,
            cwd: native.cwd,
            title: native.title,
          });
        } else if (parts[1] === "employees" && parts[3] === "probe") {
          team.active(parts[2]);
          out = { operationId: team.operation("onboard", parts[2]) };
        } else if (parts[1] === "employees" && parts[3] === "new-thread") {
          team.active(parts[2]);
          requireValue(input.confirmed === true, "binding_confirmation", "请确认新建会话并替换关联");
          requireValue(!s.list("operations").some((o) => o.employeeId === parts[2] && o.kind === "create_employee" && ["pending", "sending", "uncertain"].includes(o.state)), "creation_pending", "该员工已有创建请求，请先等待或核对结果", 409);
          out = { operationId: team.operation("create_employee", parts[2]) };
        } else if (url.pathname === "/api/inputs") out = team.submit(input);
        else if (parts[1] === "tasks" && parts[3] === "accept")
          out = team.acceptTask(parts[2], input);
        else if (parts[1] === "decisions" && parts[3] === "answer")
          out = gateway && s.get("decisions", parts[2])?.source === "native_question"
            ? gateway.answerQuestion(parts[2], input) : team.decisionAnswer(parts[2], input);
        else if (url.pathname === "/api/settings")
          out = team.updateSettings(input);
        else if (parts[1] === "operations" && parts[3] === "recover")
          out = bridge.recover(parts[2], input);
        else throw new Problem("not_found", "操作不存在", 404);
        s.put("meta", "http:" + key, { digest, result: out, at: now() });
        return out;
      });
      gateway?.kick(); changed();
      if (parts[1] === 'writing' && result.id) writing.kick(result.id);
      send(res, 200, result);
    } catch (e) {
      send(res, e.status || 500, {
        error: e.code || "internal",
        message: e.status ? e.message : "本地操作失败，请检查服务日志",
      });
      if (!e.status) console.error(e);
    }
  });
  const timer = setInterval(() => {
    try {
      const before = s.db.prepare("SELECT total_changes() AS n").get().n;
      observer.poll();
      const after = s.db.prepare("SELECT total_changes() AS n").get().n;
      const external = s.db.prepare("PRAGMA data_version").get().data_version;
      if (before !== after || external !== lastExternal) changed();
      lastExternal = external;
    } catch (e) {
      console.error("Metadata observer:", e.message);
    }
  }, 3000);
  let lastExternal = s.db.prepare("PRAGMA data_version").get().data_version;
  timer.unref();
  server.on("close", () => {
    stopped = true; clearTimeout(notifyTimer);
    clearInterval(timer);
    writing.close();
    gateway?.close();
    Promise.allSettled([...(gateway?.running.values() || []), ...writing.jobs.values(), ...writing.syncs.values()]).finally(() => s.close());
  });
  return {
    server,
    store: s,
    gateway,
    writing,
    close: (callback) => {
      for (const response of streams) response.end();
      streams.clear(); server.close(callback);
    },
    listen: () =>
      new Promise((resolve) =>
        server.listen(port, "127.0.0.1", () => { gateway?.start().catch((e) => console.error(e.message)); resolve(server.address()); }),
      ),
    snapshot,
  };
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const app = createApp({ port: Number(process.env.TEAMDESK_PORT || 4322) });
  app.server.on("error", (e) => {
    console.error(e.message);
    process.exit(1);
  });
  const address = await app.listen();
  console.log("TeamDesk http://127.0.0.1:" + address.port);
  for (const signal of ["SIGTERM", "SIGINT"])
    process.on(signal, () => app.close(() => setTimeout(() => process.exit(0), 100)));
}
