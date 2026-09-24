import fs from "node:fs";
import { createHash } from "node:crypto";
export function hookFingerprint() {
  const hash = createHash("sha256");
  const manifest = JSON.parse(
    fs.readFileSync(
      new URL("../../../../../.codex-plugin/plugin.json", import.meta.url),
      "utf8",
    ),
  );
  hash.update("plugin-version:" + manifest.version + "\n");
  for (const name of ["db.mjs", "metadata-history.mjs", "service.mjs", "workspace.mjs", "version.mjs", "hook-core.mjs", "capabilities.mjs", "../public/collaboration.js", "../vendor/js-yaml.mjs"])
    hash
      .update(name + "\n")
      .update(fs.readFileSync(new URL("./" + name, import.meta.url)));
  return hash.digest("hex");
}
