// Desktop stdio <-> loopback WebSocket adapter. No agent work is scheduled here.
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync, execFileSync } from "node:child_process";
const root = path.dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(fs.readFileSync(path.join(root, "config.json"), "utf8"));
const args = process.argv.slice(2), index = args.indexOf("app-server");
let parent = "";
try { parent = execFileSync("/bin/ps", ["-p", String(process.ppid), "-o", "command="], { encoding: "utf8" }).trim(); } catch {}
const isServer = index >= 0 && !args.slice(index + 1).some((a) => ["proxy", "daemon", "generate-ts", "generate-json-schema", "help", "--help", "-h"].includes(a));
if (!isServer || parent !== cfg.desktop) {
  const result = spawnSync(cfg.binary, args, { stdio: "inherit" });
  process.exit(result.status ?? 1);
}
const probe = net.createServer();
await new Promise((resolve, reject) => { probe.once("error", reject); probe.listen(0, "127.0.0.1", resolve); });
const port = probe.address().port;
await new Promise((resolve) => probe.close(resolve));
const url = "ws://127.0.0.1:" + port;
const state = { adapterPid: process.pid, desktopPid: process.ppid, url, startedAt: new Date().toISOString(), state: "starting" };
const save = () => fs.writeFileSync(path.join(root, "state.json"), JSON.stringify(state), { mode: 0o600 });
const nativeArgs = args.filter((a, i) => a !== "--stdio" && a !== "--listen" && args[i - 1] !== "--listen");
nativeArgs.push("--listen", url);
const env = { ...process.env };
delete env.CODEX_CLI_PATH; delete env.CODEX_APP_SERVER_FORCE_CLI;
const fd = fs.openSync(path.join(root, "app-server.log"), "a", 0o600);
const child = spawn(cfg.binary, nativeArgs, { env, stdio: ["ignore", "ignore", fd] });
fs.closeSync(fd); state.appServerPid = child.pid; save();
let ws, stopping = false;
function stop(reason) {
  if (stopping) return; stopping = true;
  state.state = "stopping"; state.reason = reason; save();
  ws?.close(); child.kill("SIGTERM");
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on("SIGTERM", () => stop("desktop_shutdown"));
process.on("SIGINT", () => stop("interrupt"));
child.on("error", (e) => { state.error = e.message; save(); process.exit(1); });
child.on("exit", (code) => { state.state = "stopped"; save(); process.exit(code ?? 0); });
try {
  for (let attempt = 0; attempt < 60 && !ws; attempt++) {
    try {
      ws = await new Promise((resolve, reject) => {
        const socket = new WebSocket(url);
        const timer = setTimeout(() => { socket.close(); reject(Error("timeout")); }, 1000);
        socket.addEventListener("open", () => { clearTimeout(timer); resolve(socket); }, { once: true });
        socket.addEventListener("error", () => { clearTimeout(timer); reject(Error("not ready")); }, { once: true });
      });
    } catch { await new Promise((r) => setTimeout(r, 200)); }
  }
  if (!ws) throw Error("共享服务未启动");
  state.state = "connected"; save();
  ws.addEventListener("message", ({ data }) => {
    const line = String(data);
    try {
      const message = JSON.parse(line);
      if (message.result?.userAgent && !state.desktopInitializedAt) { state.desktopInitializedAt = new Date().toISOString(); save(); }
    } catch {}
    process.stdout.write(line + "\n");
  });
  ws.addEventListener("close", () => stop("server_disconnected"));
  const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  input.on("line", (line) => { if (line.trim()) ws.send(line); });
  input.on("close", () => stop("desktop_closed"));
} catch (error) { state.error = error.message; save(); stop("connection_failed"); }
