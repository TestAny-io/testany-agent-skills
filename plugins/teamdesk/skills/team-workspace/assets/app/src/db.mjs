import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { initializeHistory, baselineHistory, captureMetadata, reconcileHistory, historyTables } from './metadata-history.mjs';
export const now = () => new Date().toISOString();
export const uid = (prefix) => prefix + "-" + randomUUID();
export const dataHome = () =>
  process.env.TEAMDESK_HOME ||
  path.join(os.homedir(), "Library/Application Support/TestAny/TeamDesk");
export class Problem extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
export const requireValue = (ok, code, message, status) => {
  if (!ok) throw new Problem(code, message, status);
};
export function line(value, label, max = 160, optional = false) {
  if (optional && (value === undefined || value === null || value === ""))
    return "";
  requireValue(
    typeof value === "string" &&
      value.trim().length > 0 &&
      value.length <= max &&
      !/[\r\n\x00]/.test(value),
    "invalid_field",
    label + "格式不正确",
  );
  return value.trim();
}
export function body(value, label, max = 12000, optional = false) {
  if (optional && !value) return "";
  requireValue(
    typeof value === "string" &&
      value.trim().length > 0 &&
      value.length <= max &&
      !/\x00/.test(value),
    "invalid_field",
    label + "不能为空或超过长度限制",
  );
  return value.trim();
}
export function identifier(value, label = "编号") {
  return line(value, label, 100).match(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/)
    ? value
    : (() => {
        throw new Problem("invalid_id", label + "只支持字母、数字及 . _ : -");
      })();
}
const tables = [
  "meta",
  "employees",
  "runtime",
  "departments",
  "documents",
  "document_versions",
  "writing_sessions",
  "bindings",
  "requests",
  "tasks",
  "records",
  "decisions",
  "operations",
  "events",
  "hooks",
  "audit",
];
export class Store {
  constructor(root = dataHome()) {
    this.root = path.resolve(root);
    fs.mkdirSync(this.root, { recursive: true, mode: 0o700 });
    fs.mkdirSync(path.join(this.root, "artifacts"), {
      recursive: true,
      mode: 0o700,
    });
    this.file = path.join(this.root, "teamdesk.sqlite");
    this.db = new DatabaseSync(this.file);
    fs.chmodSync(this.file, 0o600);
    this.db.exec(
      "PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;",
    );
    for (const t of tables)
      this.db.exec(
        "CREATE TABLE IF NOT EXISTS " +
          t +
          " (id TEXT PRIMARY KEY,data TEXT NOT NULL,updated_at TEXT NOT NULL)",
      );
    this.tx(() => {
      if (!this.get("meta", "schema"))
        this.put("meta", "schema", { version: 1 });
      requireValue(
        this.get("meta", "schema").version === 1,
        "schema_mismatch",
        "数据版本不兼容，请使用匹配版本",
        503,
      );
      if (!this.get("meta", "settings"))
        this.put("meta", "settings", {
          teamName: "AI 团队",
          enabled: true,
          rules:
            "新业务按 FIFO；当前任务补充使用 steer。需求分歧交人类产品经理。员工直接协作，记录来源与证据。",
          bridgeThreadId: null,
          bridgeAutomationId: null,
        });
    });
    initializeHistory(this.db);
    baselineHistory(this);
    this.historyEnabled = true;
    this.reconcileHistory();
  }
  reconcileHistory(){reconcileHistory(this);}
  check(table) {
    if (!tables.includes(table)) throw Error("Unknown table");
  }
  get(table, id) {
    this.check(table);
    const r = this.db
      .prepare("SELECT data FROM " + table + " WHERE id=?")
      .get(id);
    return r ? JSON.parse(r.data) : null;
  }
  list(table) {
    this.check(table);
    return this.db
      .prepare("SELECT data FROM " + table + " ORDER BY updated_at,id")
      .all()
      .map((r) => JSON.parse(r.data));
  }
  put(table, id, value) {
    this.check(table);
    if (this.historyEnabled && !this.inTx && (historyTables.includes(table) || table === 'meta' && id === 'settings')) return this.tx(() => this.put(table,id,value));
    this.db
      .prepare(
        "INSERT INTO " +
          table +
          " (id,data,updated_at) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at",
      )
      .run(id, JSON.stringify(value), now());
    if (this.historyEnabled) captureMetadata(this.db,table,id,value);
    return value;
  }
  insert(table, id, value) {
    this.check(table);
    if (this.historyEnabled && !this.inTx && (historyTables.includes(table) || table === 'meta' && id === 'settings')) return this.tx(() => this.insert(table,id,value));
    const inserted = (
      this.db
        .prepare(
          "INSERT OR IGNORE INTO " +
            table +
            " (id,data,updated_at) VALUES (?,?,?)",
        )
      .run(id, JSON.stringify(value), now()).changes > 0
    );
    if (this.historyEnabled && inserted) captureMetadata(this.db,table,id,value);
    return inserted;
  }
  remove(table, id) {
    this.check(table);
    if (this.historyEnabled && !this.inTx && historyTables.includes(table)) return this.tx(() => this.remove(table,id));
    const previous=this.get(table,id);
    this.db.prepare("DELETE FROM " + table + " WHERE id=?").run(id);
    if (this.historyEnabled && previous) captureMetadata(this.db,table,id,null);
  }
  tx(fn) {
    if (this.inTx) {
      const savepoint =
        "nested_" + (this.savepointId = (this.savepointId || 0) + 1);
      this.db.exec("SAVEPOINT " + savepoint);
      try {
        const result = fn();
        this.db.exec("RELEASE " + savepoint);
        return result;
      } catch (e) {
        this.db.exec("ROLLBACK TO " + savepoint);
        this.db.exec("RELEASE " + savepoint);
        throw e;
      }
    }
    this.db.exec("BEGIN IMMEDIATE");
    this.inTx = true;
    const historyStart = this.historyEnabled ? (this.db.prepare('SELECT MAX(seq) AS seq FROM collaboration_history').get().seq || 0) : null;
    try {
      const result = fn();
      if (historyStart !== null) {
        const end=this.db.prepare('SELECT MAX(seq) AS seq FROM collaboration_history').get().seq || 0;
        if(end>historyStart)this.db.prepare('UPDATE collaboration_history SET commit_seq=? WHERE seq>?').run(end,historyStart);
      }
      this.db.exec("COMMIT");
      return result;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    } finally {
      this.inTx = false;
    }
  }
  audit(action, subject, actor = "human", detail = {}) {
    const id = uid("AUD");
    this.insert("audit", id, {
      id,
      action,
      subject,
      actor,
      at: now(),
      ...detail,
    });
  }
  close() {
    this.db.close();
  }
}
