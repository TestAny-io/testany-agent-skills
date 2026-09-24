import fs from "node:fs";
import path from "node:path";
import { hookFingerprint } from "../assets/app/src/fingerprint.mjs";
import { Store, dataHome } from "../assets/app/src/db.mjs";
import { stopHook } from "../assets/app/src/hook-core.mjs";
let size = 0,
  chunks = [];
for await (const chunk of process.stdin) {
  size += chunk.length;
  if (size > 2 * 1024 * 1024) process.exit(1);
  chunks.push(chunk);
}
if (!fs.existsSync(path.join(dataHome(), "teamdesk.sqlite"))) {
  console.log("{}");
  process.exit(0);
}
const digest = hookFingerprint();
const store = new Store();
try {
  console.log(
    JSON.stringify(stopHook(store, JSON.parse(Buffer.concat(chunks)), digest)),
  );
} finally {
  store.close();
}
