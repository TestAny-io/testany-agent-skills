import fs from "node:fs";

// The plugin manifest is the authority for every runtime version reference.
export const pluginVersion = JSON.parse(
  fs.readFileSync(new URL("../../../../../.codex-plugin/plugin.json", import.meta.url), "utf8"),
).version;
