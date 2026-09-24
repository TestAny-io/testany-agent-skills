import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
const root = fileURLToPath(new URL("../", import.meta.url));
let count = 0;
function check(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) check(file);
    else if (/\.(?:mjs|js)$/.test(file)) {
      execFileSync(process.execPath, ["--check", file], { stdio: "inherit" });
      count++;
    }
  }
}
check(root);
console.log(`Syntax checked: ${count} JavaScript files`);
