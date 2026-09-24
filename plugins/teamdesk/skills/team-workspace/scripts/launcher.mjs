import fs from "node:fs";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dataHome } from "../assets/app/src/db.mjs";
import { pluginVersion } from "../assets/app/src/version.mjs";
const root = dataHome(),
  file = path.join(root, "runtime.json"),
  serverPath = fileURLToPath(
    new URL("../assets/app/src/server.mjs", import.meta.url),
  ),
  command = process.argv[2] || "start";
fs.mkdirSync(root, { recursive: true, mode: 0o700 });
// Serialize competing launchers before reading runtime.json or spawning a server.
if (command === "start") {
  const lock = path.join(root, "service-start.lock");
  let owned = false;
  for (let n = 0; n < 120 && !owned; n++) {
    try { fs.writeFileSync(lock, String(process.pid), { flag: "wx", mode: 0o600 }); owned = true; }
    catch (error) {
      if (error.code !== "EEXIST") throw error;
      let pid; try { pid = Number(fs.readFileSync(lock, "utf8")); } catch {}
      if (Number.isInteger(pid) && pid > 1) {
        try { process.kill(pid, 0); }
        catch (e) { if (e.code === "ESRCH") { try { if (fs.readFileSync(lock, "utf8") === String(pid)) fs.unlinkSync(lock); } catch {} } }
      }
      if (!owned) await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  if (!owned) throw Error("另一个 TeamDesk 启动操作尚未完成，请稍后重试。");
  process.once("exit", () => { try { if (fs.readFileSync(lock, "utf8") === String(process.pid)) fs.unlinkSync(lock); } catch {} });
}
let old;
try {
  old = JSON.parse(fs.readFileSync(file, "utf8"));
} catch {}
function alive(info) {
  try {
    return (
      info &&
      Number.isInteger(info.pid) &&
      info.pid > 1 &&
      typeof info.serverPath === "string" &&
      execFileSync("/bin/ps", ["-p", String(info.pid), "-o", "command="], {
        encoding: "utf8",
      }).trim() === (info.nodePath || process.execPath) + " " + info.serverPath
    );
  } catch {
    return false;
  }
}
if (command === "status") {
  console.log(
    alive(old)
      ? JSON.stringify({ ...old, running: true }, null, 2)
      : "TeamDesk 服务未运行",
  );
  process.exit(0);
}
if (command === "stop") {
  if (alive(old)) {
    process.kill(old.pid, "SIGTERM");
    console.log("已发送本地服务停止请求；员工在 Codex 中继续工作。");
  } else console.log("TeamDesk 服务未运行");
  process.exit(0);
}
if (command !== "start") throw Error("用法：launch.sh start|status|stop");
if (alive(old)) {
  if (path.resolve(old.serverPath) !== path.resolve(serverPath)) throw Error("正在运行旧安装目录的 TeamDesk。请先运行 launch.sh stop，再从当前版本 start。数据会保留。");
  const response = await fetch(old.url + "/api/bootstrap", { signal: AbortSignal.timeout(2500), redirect: "error" });
  const health = await response.json();
  if (!response.ok || health.health?.dataDirectory !== path.resolve(root) || health.version !== pluginVersion) throw Error("TeamDesk 进程存在，但服务身份或版本尚未核验；请检查 server.log。");
  console.log("TeamDesk 已运行：" + old.url);
  process.exit(0);
}
const port = Number(process.env.TEAMDESK_PORT || 4322),
  url = "http://127.0.0.1:" + port;
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw Error("端口须为 1024–65535");
try {
  await fetch(url + "/api/bootstrap", { signal: AbortSignal.timeout(800) });
  throw Error("目标端口已有服务，请用 TEAMDESK_PORT 指定其他端口");
} catch (e) {
  if (!["TypeError", "TimeoutError"].includes(e.name)) throw e;
}
const fd = fs.openSync(path.join(root, "server.log"), "a", 0o600);
const child = spawn(process.execPath, [serverPath], {
  detached: true,
  stdio: ["ignore", fd, fd],
  env: { ...process.env, TEAMDESK_HOME: root, TEAMDESK_PORT: String(port) },
});
child.unref();
fs.closeSync(fd);
let childFailure;
child.on("error", e => { childFailure = e.message; });
child.on("exit", (code, signal) => { childFailure = "本地服务提前退出（" + (signal || code) + "）"; });
for (let i = 0; i < 40; i++) {
  if (childFailure) throw Error(childFailure + "，请检查 " + path.join(root, "server.log"));
  await new Promise((r) => setTimeout(r, 150));
  try {
    const r = await fetch(url + "/api/bootstrap", {
      signal: AbortSignal.timeout(700),
    });
    const j = await r.json();
    if (!r.ok || j.health?.dataDirectory !== path.resolve(root) || j.version !== pluginVersion)
      throw Error("服务目录不匹配");
    const info = {
      pid: child.pid,
      url,
      serverPath,
      nodePath: process.execPath,
      version: pluginVersion,
      startedAt: new Date().toISOString(),
    };
    fs.writeFileSync(file, JSON.stringify(info, null, 2), { mode: 0o600 });
    console.log("TeamDesk 已启动：" + url);
    process.exit(0);
  } catch {}
}
// A child we started but could not verify must not linger as an invisible server.
if (alive({pid:child.pid,serverPath,nodePath:process.execPath})) process.kill(child.pid,"SIGTERM");
throw Error("启动失败，请检查 " + path.join(root, "server.log"));
