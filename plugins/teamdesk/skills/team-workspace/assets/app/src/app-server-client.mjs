import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { pluginVersion } from "./version.mjs";

export class RpcError extends Error {
  constructor(message, { sent = false, rpcError = null } = {}) {
    super(message);
    this.sent = sent;
    this.rpcError = rpcError;
  }
}

/** A separate client of the desktop's server, never a second agent runtime. */
export class AppServerClient extends EventEmitter {
  constructor(url, { WebSocketClass = WebSocket, timeout = 15000 } = {}) {
    super();
    this.url = url;
    this.WebSocketClass = WebSocketClass;
    this.timeout = timeout;
    this.generation = randomUUID();
    this.pending = new Map();
    this.sequence = 0;
  }
  async connect() {
    const ws = (this.ws = new this.WebSocketClass(this.url));
    ws.addEventListener("message", ({ data }) => {
      let message;
      try { message = JSON.parse(String(data)); } catch { return; }
      if (message.method) this.emit("message", message);
      else {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        clearTimeout(pending.timer);
        if (message.error)
          pending.reject(new RpcError(message.error.message, { sent: true, rpcError: message.error }));
        else pending.resolve(message.result);
      }
    });
    ws.addEventListener("close", () => {
      this.ready = false;
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(new RpcError("Codex 连接已断开，已发送操作的结果需要核对", { sent: true }));
      }
      this.pending.clear();
      this.emit("disconnect");
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { ws.close(); reject(new RpcError("连接 Codex 超时")); }, this.timeout);
      ws.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
      ws.addEventListener("error", () => { clearTimeout(timer); reject(new RpcError("无法连接 Codex")); }, { once: true });
    });
    const initialized = await this.request("initialize", {
      clientInfo: { name: "teamdesk", title: "TeamDesk", version: pluginVersion },
      capabilities: { experimentalApi: true },
    });
    ws.send(JSON.stringify({ method: "initialized", params: {} }));
    this.initialization = initialized;
    this.ready = true;
    return this;
  }
  request(method, params = {}, timeout = this.timeout) {
    if (this.ws?.readyState !== 1) return Promise.reject(new RpcError("Codex 当前未连接"));
    const id = `teamdesk-${this.generation}-${++this.sequence}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new RpcError(`${method} 未返回回执，需要核对结果`, { sent: true }));
      }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      try { this.ws.send(JSON.stringify({ id, method, params })); }
      catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(new RpcError(error.message));
      }
    });
  }
  respond(id, result) {
    if (!this.ready || this.ws?.readyState !== 1) throw new RpcError("Codex 当前未连接");
    this.ws.send(JSON.stringify({ id, result }));
  }
  close() { this.ready = false; this.ws?.close(); }
}

export const textInput = (text) => [{ type: "text", text, text_elements: [] }];
