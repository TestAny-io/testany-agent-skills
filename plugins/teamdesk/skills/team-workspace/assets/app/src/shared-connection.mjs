import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { EventEmitter } from "node:events";
import { AppServerClient } from "./app-server-client.mjs";
import { Problem, requireValue, now } from "./db.mjs";

export function requireSupportedCodexVersion(version) {
  // Compare the numeric release line. Keep alpha/beta/rc builds on the same
  // baseline eligible, including the 0.155.0-alpha build used by this Desktop.
  const match = typeof version === "string" && version.trim().match(/^codex-cli (0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/);
  requireValue(match, "unrecognized_codex_version", "无法识别 Codex CLI 版本，最低要求 0.155.0（含该版本的预发布构建）：" + version, 409);
  const major = BigInt(match[1]), minor = BigInt(match[2]);
  requireValue(major > 0n || minor >= 155n, "unsupported_codex", "Codex CLI 版本过低，最低要求 0.155.0（含该版本的预发布构建），当前：" + version, 409);
}

export function processTable() {
  return execFileSync("/bin/ps", ["-axo", "pid=,ppid=,command="], { encoding: "utf8" })
    .split("\n").flatMap((line) => {
      const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/);
      return match ? [{ pid: +match[1], ppid: +match[2], command: match[3] }] : [];
    });
}
export function discoverSharedServer(rows = processTable()) {
  const desktop = rows.filter((r) => /^\/.*\.app\/Contents\/MacOS\/(ChatGPT|Codex)$/.test(r.command));
  const matches = [];
  for (const row of rows) {
    const endpoint = row.command.match(/(?:^|\s)--listen\s+(ws:\/\/127\.0\.0\.1:\d+)(?:\s|$)/)?.[1];
    const binary = row.command.match(/^(\/.*\.app\/Contents\/Resources\/codex)\s/)?.[1];
    if (!endpoint || !binary || !/\sapp-server(?:\s|$)/.test(row.command)) continue;
    let parent = rows.find((r) => r.pid === row.ppid);
    let owner;
    for (let depth = 0; parent && depth < 3; depth++) {
      owner = desktop.find((d) => d.pid === parent.pid);
      if (owner) break;
      parent = rows.find((r) => r.pid === parent.ppid);
    }
    if (owner && binary.startsWith(owner.command.split("/Contents/")[0] + "/Contents/"))
      matches.push({ url: endpoint, pid: row.pid, adapterPid: row.ppid, desktopPid: owner.pid, desktop: owner.command, binary });
  }
  requireValue(matches.length === 1, "shared_connection_missing", matches.length
    ? "发现多个共享 Codex 实例，请关闭多余实例后重新连接"
    : "当前 Codex 未启用共享接入。请先退出 Codex，再在这里点击「以共享接入启动 Codex」", 409);
  return matches[0];
}

export class SharedConnection extends EventEmitter {
  constructor({ discover = discoverSharedServer, clientFactory = (url) => new AppServerClient(url), verify = true } = {}) {
    super();
    this.discover = discover; this.clientFactory = clientFactory; this.verify = verify;
    this.state = { kind: "shared_app_server", online: false, state: "disconnected", error: null };
    this.stopped = false;
    this.epoch = 0;
  }
  async connect() {
    if (this.connecting) return this.connecting;
    if (this.state.online && this.client?.ready) return this.state;
    this.stopped = false;
    this.connecting = this.open().finally(() => { this.connecting = null; });
    return this.connecting;
  }
  async open() {
    clearTimeout(this.retry); this.retry = null;
    const epoch = ++this.epoch;
    const valid = () => !this.stopped && epoch === this.epoch;
    const check = () => requireValue(valid(), "connection_changed", "连接已变化，丢弃旧握手结果", 409);
    const stage = (name) => {
      check();
      const at = now(), stages = this.state.stages || [];
      if (stages.length) stages.at(-1).finishedAt = at;
      this.state = { ...this.state, stage: name, stages: [...stages, { name, startedAt: at }], checkedAt: at };
      this.emit("change");
    };
    this.state = { ...this.state, online: false, state: "connecting", error: null, errorCode: null, stages: [], nextRetryAt: null };
    this.emit("change");
    let client;
    try {
      stage("discover");
      const info = this.discover();
      let version = "test";
      stage("desktop");
      if (this.verify) {
        version = execFileSync(info.binary, ["--version"], { encoding: "utf8", timeout: 5000 }).trim();
        requireSupportedCodexVersion(version);
        const sockets = execFileSync("/usr/sbin/lsof", ["-nP", "-a", "-p", String(info.adapterPid), "-iTCP", "-sTCP:ESTABLISHED"], { encoding: "utf8", timeout: 5000 });
        requireValue(sockets.includes("->" + info.url.replace("ws://", "")), "desktop_not_connected", "未能核验桌面与共享服务的连接", 409);
      }
      client = this.clientFactory(info.url);
      this.client = client;
      client.on("message", (message) => {
        if (valid() && this.client === client) this.emit("message", message, client.generation);
      });
      client.on("disconnect", () => {
        if (!valid() || this.client !== client) return;
        this.epoch++; this.client = null;
        this.state = { ...this.state, online: false, state: "disconnected", error: "与 Codex 的连接已断开；待确认的操作不会自动重发" };
        this.emit("disconnect", client.generation); this.emit("change");
        this.scheduleReconnect();
      });
      stage("handshake");
      await client.connect();
      check();
      stage("identity");
      const diagnostics = await client.request("server/diagnostics");
      check();
      requireValue(diagnostics.process?.id === info.pid, "instance_mismatch", "共享 App Server 进程身份不匹配", 409);
      this.state.stages.at(-1).finishedAt = now();
      this.state = { ...this.state, kind: "shared_app_server", online: true, state: "connected", stage: "verified", generation: client.generation, pid: info.pid, desktopPid: info.desktopPid, version, connectedAt: now(), error: null };
      this.retryCount = 0;
      this.emit("connected"); this.emit("change");
      return this.state;
    } catch (error) {
      if (!valid()) { client?.close(); return this.state; }
      this.client = null; client?.close();
      const stages = this.state.stages || [];
      if (stages.length) Object.assign(stages.at(-1), { finishedAt: now(), error: error.message });
      this.state = { ...this.state, online: false, state: "disconnected", error: error.message, errorCode: error.code || "connection_failed", stages };
      this.emit("change"); this.scheduleReconnect();
      return this.state;
    }
  }
  scheduleReconnect() {
    if (this.stopped || this.retry) return;
    const delay = Math.min(30000, 1000 * 2 ** Math.min(this.retryCount || 0, 5));
    this.retryCount = (this.retryCount || 0) + 1;
    this.state = { ...this.state, retryCount: this.retryCount, nextRetryAt: new Date(Date.now() + delay).toISOString() };
    this.retry = setTimeout(() => { this.retry = null; this.connect(); }, delay);
    this.retry.unref();
  }
  request(method, params, timeout) {
    requireValue(this.state.online && this.client?.ready, "codex_offline", "Codex 连接尚未就绪", 409);
    return this.client.request(method, params, timeout);
  }
  respond(id, result, generation) {
    requireValue(this.state.online && this.client?.generation === generation, "stale_callback", "原生请求连接已变化，请在 Codex 中处理或等待重新同步", 409);
    this.client.respond(id, result);
  }
  close() {
    this.stopped = true; this.epoch++; clearTimeout(this.retry); this.retry = null;
    const client = this.client; this.client = null; client?.close();
    this.state = { ...this.state, online: false, state: "disconnected", nextRetryAt: null };
  }
}

/** Human-triggered first connection; never kills or replaces a running desktop. */
export function launchSharedDesktop(root) {
  requireValue(!processTable().some((r) => /^\/.*\.app\/Contents\/MacOS\/(ChatGPT|Codex)$/.test(r.command)), "desktop_running", "请先正常退出 Codex。现有任务的执行由 Codex 管理，TeamDesk 不会强制结束它们。", 409);
  const app = [process.env.TEAMDESK_CODEX_APP, "/Applications/ChatGPT.app", "/Applications/Codex.app"].filter(Boolean).find((p) => p.endsWith('.app') && fs.existsSync(path.join(p, "Contents/Resources/codex")));
  requireValue(app, "desktop_missing", "未找到本机 Codex Desktop", 409);
  const name = fs.existsSync(path.join(app, "Contents/MacOS/ChatGPT")) ? "ChatGPT" : "Codex";
  const runtime = path.join(root, "shared-runtime");
  fs.mkdirSync(runtime, { recursive: true, mode: 0o700 });
  const source = fileURLToPath(new URL("../../../scripts/shared-adapter.mjs", import.meta.url));
  fs.copyFileSync(source, path.join(runtime, "adapter.mjs"));
  fs.writeFileSync(path.join(runtime, "config.json"), JSON.stringify({ binary: path.join(app, "Contents/Resources/codex"), desktop: path.join(app, "Contents/MacOS", name) }), { mode: 0o600 });
  const quote = (s) => "'" + s.replaceAll("'", "'\\''") + "'";
  const wrapper = path.join(runtime, "codex-adapter");
  fs.writeFileSync(wrapper, `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(path.join(runtime, "adapter.mjs"))} "$@"\n`, { mode: 0o700 });
  const launcher=process.env.TEAMDESK_DESKTOP_LAUNCHER || path.join(os.homedir(),'Applications/TeamDesk.app/Contents/Resources/launch-codex');
  if (fs.existsSync(launcher)) {
    let result;
    try {result=JSON.parse(execFileSync(launcher,[app,wrapper],{encoding:'utf8',timeout:30000,stdio:['ignore','pipe','pipe']}));}
    catch(error) {
      let reason;try {reason=JSON.parse(String(error.stdout)).error;}catch{}
      throw new Problem('desktop_launch_failed',reason || 'macOS 启动 Codex 未完成；详情请查看 launcher.log。',409);
    }
    requireValue(result.started===true && Number.isInteger(result.pid) && result.pid>1,'desktop_launch_failed','未收到 macOS 的 Codex 启动回执。',409);
    return {...result,at:now()};
  }
  // Retain the existing direct launch for installations without the optional icon.
  // The one-click app always supplies its LaunchServices helper above.
  const fd = fs.openSync(path.join(runtime, "desktop.log"), "a", 0o600);
  const child = spawn(path.join(app, "Contents/MacOS", name), [], {
    env: { ...process.env, CODEX_CLI_PATH: wrapper, CODEX_APP_SERVER_FORCE_CLI: "1" },
    detached: true, stdio: ["ignore", fd, fd],
  });
  child.unref(); fs.closeSync(fd);
  return { started: true, pid: child.pid, at: now() };
}
