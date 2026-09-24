import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { now } from "./db.mjs";
import { projectQuestion, applyQuestionEvent } from "./native-questions.mjs";
import { skillCapability } from './capabilities.mjs';
export const codexHome = () =>
  process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
export function catalog(home = codexHome()) {
  let db;
  try {
    const file = fs
      .readdirSync(home)
      .filter((f) => /^state_\d+\.sqlite$/.test(f))
      .sort((a, b) => Number(b.match(/\d+/)[0]) - Number(a.match(/\d+/)[0]))[0];
    if (!file) throw Error("未找到本地 Codex 索引");
    db = new DatabaseSync(path.join(home, file), { readOnly: true });
    const columns = db
      .prepare("PRAGMA table_info(threads)")
      .all()
      .map((c) => c.name);
    if (
      !["id", "cwd", "rollout_path", "archived", "updated_at"].every((c) =>
        columns.includes(c),
      )
    )
      throw Error("Codex 索引格式已改变");
    return {
      available: true,
      adapter: file,
      threads: db
        .prepare(
          "SELECT id," +
            (columns.includes("name") ? "name" : "NULL AS name") +
            ",cwd,rollout_path,archived,updated_at FROM threads ORDER BY updated_at DESC LIMIT 2000",
        )
        .all()
        .map((r) => ({
          id: r.id,
          title:
            r.name?.trim().slice(0, 160) || "未命名任务 · " + r.id.slice(0, 12),
          cwd: r.cwd,
          sourcePath: r.rollout_path,
          archived: !!r.archived,
          updatedAt: new Date(r.updated_at * 1000).toISOString(),
        })),
    };
  } catch (e) {
    return { available: false, error: e.message, threads: [] };
  } finally {
    db?.close();
  }
}
export function skills(home = codexHome()) {
  const found = [],
    seen = new Set();
  function walk(dir, depth, source) {
    if (depth < 0) return;
    let real;
    try {
      real = fs.realpathSync(dir);
      if (seen.has(real)) return;
      seen.add(real);
      if (!fs.statSync(real).isDirectory()) return;
    } catch {
      return;
    }
    const skill = path.join(dir, "SKILL.md");
    if (fs.existsSync(skill)) {
      const capability = skillCapability(skill);
      found.push({ id: source + ":" + capability.name, source, ...capability });
      return;
    }
    for (const ent of fs.readdirSync(dir, { withFileTypes: true }))
      if (
        ![
          ".git",
          "node_modules",
          "assets",
          "references",
          "tests",
          "scripts",
        ].includes(ent.name) &&
        (ent.isDirectory() || ent.isSymbolicLink())
      )
        walk(path.join(dir, ent.name), depth - 1, source);
  }
  walk(path.join(home, "skills"), 3, "local");
  const cache = path.join(home, "plugins/cache");
  if (fs.existsSync(cache))
    for (const market of fs.readdirSync(cache))
      try {
        for (const plugin of fs.readdirSync(path.join(cache, market)))
          walk(path.join(cache, market, plugin), 5, market + "/" + plugin);
      } catch {}
  return found;
}
export function trustStatus(home = codexHome()) {
  try {
    const config = fs.readFileSync(path.join(home, "config.toml"), "utf8");
    return {
      recorded: config
        .split(/(?=^\[)/m)
        .some(
          (b) =>
            b.startsWith("[hooks.state.") &&
            b.includes("teamdesk@") &&
            /trusted_hash\s*=\s*["']sha256:/.test(b) &&
            !/enabled\s*=\s*false/.test(b),
        ),
    };
  } catch {
    return { recorded: false };
  }
}
function routing(prompt) {
  if (typeof prompt !== "string") return {};
  const first = prompt.split("\n", 1)[0];
  if (!first.startsWith("TEAMDESK_META ") || first.length > 600) return {};
  try {
    const r = JSON.parse(first.slice(14));
    return {
      requestId: /^REQ-[a-f0-9-]+$/.test(r.requestId) ? r.requestId : undefined,
      taskRef: /^TASK-[a-f0-9-]+$/.test(r.taskRef) ? r.taskRef : undefined,
    };
  } catch {
    return {};
  }
}
export function project(row, binding) {
  const p = row.payload;
  if (!p) return null;
  const base = {
    employeeId: binding.employeeId,
    threadId: binding.threadId,
    bindingVersion: binding.version,
    at: row.timestamp,
    turnId: p.turn_id || null,
    source: "native_trace",
  };
  const question = projectQuestion(row, base);
  if (question) return question;
  if (row.type !== "event_msg") return null;
  if (["task_started", "task_complete", "turn_aborted"].includes(p.type))
    return { ...base, kind: "runtime", state: p.type };
  const item = p.item;
  if (p.type !== "item_completed" || !item) return null;
  if (item.type === "McpToolCall" && item.server === "codex_app") {
    const args = item.arguments || {};
    return {
      ...base,
      kind: "native_tool",
      tool: item.tool,
      targetThreadId: args.threadId || null,
      state:
        item.status === "failed" || item.error || item.result?.isError === true
          ? "failed"
          : item.status === "completed" && item.result?.isError === false
            ? "accepted"
            : "unknown",
      ...routing(args.prompt),
    };
  }
  if (
    item.type === "FunctionCallOutput" &&
    item.namespace === "codex_app" &&
    item.name === "send_message_to_thread"
  ) {
    const env =
      typeof item.output === "string" &&
      item.output.match(
        /^<codex_delegation>\s*<source_thread_id>([a-f0-9-]{36})<\/source_thread_id>\s*<input>([\s\S]*)<\/input>\s*<\/codex_delegation>\s*$/i,
      );
    if (env)
      return {
        ...base,
        kind: "native_message",
        state: "received",
        sourceThreadId: env[1],
        ...routing(env[2]),
      };
  }
  return null;
}
export class Observer {
  constructor(store, home = codexHome()) {
    this.s = store;
    this.home = home;
    this.lastScan = 0;
    this.current = { available: false, threads: [] };
  }
  scan(force = false) {
    if (!force && Date.now() - this.lastScan < 4000) return this.current;
    this.lastScan = Date.now();
    this.current = catalog(this.home);
    return this.current;
  }
  poll() {
    const c = this.scan();
    if (!c.available) return;
    const bindings = this.s.list("bindings");
    const bridge = this.s.get("meta", "settings")?.bridgeThreadId;
    if (bridge)
      bindings.push({
        id: "bridge",
        threadId: bridge,
        employeeId: null,
        version: 1,
        boundAt: this.s.get("meta", "bridge")?.registeredAt || now(),
        active: true,
      });
    for (const b of bindings) {
      const t = c.threads.find((t) => t.id === b.threadId);
      if (!t?.sourcePath) continue;
      let fd;
      try {
        const st = fs.statSync(t.sourcePath),
          key = "cursor-v2:" + b.id,
          old = this.s.get("meta", key);
        const cur =
          old?.ino === st.ino && old.offset <= st.size
            ? old
            : { offset: 0, ino: st.ino, skipping: false };
        fd = fs.openSync(t.sourcePath, "r");
        for (let pass = 0; pass < 2 && cur.offset < st.size; pass++) {
          const buf = Buffer.alloc(Math.min(1024 * 1024, st.size - cur.offset));
          const n = fs.readSync(fd, buf, 0, buf.length, cur.offset),
            chunk = buf.subarray(0, n),
            last = chunk.lastIndexOf(10);
          if (last < 0) {
            if (n === 1024 * 1024) {
              cur.offset += n;
              cur.skipping = true;
            }
            break;
          }
          let byte = cur.offset;
          const lines = chunk.subarray(0, last).toString("utf8").split("\n");
          for (let i = 0; i < lines.length; i++) {
            const str = lines[i],
              pos = byte;
            byte += Buffer.byteLength(str) + 1;
            if (cur.skipping && i === 0) {
              cur.skipping = false;
              continue;
            }
            let row;
            try {
              row = JSON.parse(str);
            } catch {
              continue;
            }
            if (
              !row.timestamp ||
              row.timestamp < b.boundAt ||
              (!b.active && row.timestamp > b.unboundAt)
            )
              continue;
            const event = project(row, b);
            if (!event) continue;
            event.id = b.id + ":" + st.ino + ":" + pos;
            this.s.tx(() => {
              this.s.insert("events", event.id, event);
              applyQuestionEvent(this.s, event);
            });
            if (event.kind === "native_message" && event.requestId) {
              const req = this.s.get("requests", event.requestId);
              if (req?.employeeId === b.employeeId && (!req.nativeReceivedAt || req.receiptRecovered)) {
                req.nativeReceivedAt = event.at; req.receiptRecovered = false;
                req.receivedAt ||= event.at;
                req.nativeTurnId ||= event.turnId;
                if (!["recorded", "cancelled", "in_progress"].includes(req.state)) req.state = "received";
                this.s.put("requests", req.id, req);
              }
            }
          }
          cur.offset += last + 1;
        }
        this.s.put("meta", key, cur);
      } catch (e) {
        this.s.put("meta", "observerError", {
          at: now(),
          code: "source_unavailable",
          message: "部分原生任务事件暂不可读",
        });
      } finally {
        if (fd !== undefined) fs.closeSync(fd);
      }
    }
  }
}

export function automationStatus(id, home = codexHome()) {
  if (!id) return "NOT_CONFIGURED";
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(id)) return "UNAVAILABLE";
  try {
    const text = fs.readFileSync(
      path.join(home, "automations", id, "automation.toml"),
      "utf8",
    );
    const status = text.match(/^status\s*=\s*"([^"]+)"\s*$/m)?.[1];
    return ["ACTIVE", "PAUSED"].includes(status) ? status : "UNAVAILABLE";
  } catch {
    return "UNAVAILABLE";
  }
}
