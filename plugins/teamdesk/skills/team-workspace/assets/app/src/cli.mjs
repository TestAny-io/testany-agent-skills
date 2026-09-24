#!/usr/bin/env node
import { Store, requireValue } from "./db.mjs";
import { Team } from "./service.mjs";
import { Bridge, skillRoot } from "./bridge.mjs";
const store = new Store(),
  team = new Team(store),
  bridge = new Bridge(store),
  thread = process.env.CODEX_THREAD_ID;
const [command, argument, ...rest] = process.argv.slice(2);
async function input() {
  const chunks = [];
  let bytes = 0;
  for await (const c of process.stdin) {
    bytes += c.length;
    if (bytes > 65536) throw Error("输入过大");
    chunks.push(c);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}
try {
  let result;
  switch (command) {
    case "paths":
      result = { data: store.root, skillRoot };
      break;
    case "inbox":
      requireValue(thread, "native_only", "请在现有 Codex 员工任务中运行");
      result = team.inbox(thread, argument);
      break;
    case "peer-request":
      result = team.peerRequest(thread, await input());
      break;
    case "query": {
      const id = rest[0] && !rest[0].startsWith('--') ? rest.shift() : undefined;
      const options = {};
      for (let i = 0; i < rest.length; i += 2) {
        requireValue(['--search', '--limit', '--offset', '--revision'].includes(rest[i]) && rest[i + 1] !== undefined, 'query_option', '查询参数无效');
        options[rest[i].slice(2)] = rest[i + 1];
      }
      result = team.query(thread, argument, id, options);
      break;
    }
    case "connection-register":
    case "connection-next":
    case "connection-ack":
    case "connection-automation":
      throw Error("TeamDesk 已使用 App Server 按需接入；旧版定时领取命令已停用，不要创建或恢复 heartbeat。");
    default:
      throw Error(
        "用法：cli.mjs paths | inbox <requestId|--identity> | query <me|departments|department|employees|employee|resources|resource|task|records|decisions> [id] [--search text] [--limit n] [--offset n] [--revision n] | peer-request < request.json",
      );
  }
  console.log(JSON.stringify(result, null, 2));
} catch (e) {
  console.error(
    JSON.stringify({ error: e.code || "error", message: e.message }),
  );
  process.exitCode = 1;
} finally {
  store.close();
}
