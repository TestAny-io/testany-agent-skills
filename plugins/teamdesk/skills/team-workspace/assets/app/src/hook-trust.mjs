import fs from "node:fs";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { requireValue, now } from "./db.mjs";
import { pluginVersion } from "./version.mjs";

const ownHook = (key) => /^teamdesk@[A-Za-z0-9._-]+:hooks\/hooks\.json:stop:0:0$/.test(key || "");
const command = '/bin/sh "$PLUGIN_ROOT/skills/team-workspace/scripts/hook.sh"';
const reviewedFiles = [
  "hooks/hooks.json", "skills/team-workspace/scripts/hook.sh",
  "skills/team-workspace/scripts/hook.mjs",
  "skills/team-workspace/assets/app/src/hook-core.mjs",
  "skills/team-workspace/assets/app/src/service.mjs",
  "skills/team-workspace/assets/app/src/db.mjs",
  "skills/team-workspace/assets/app/src/metadata-history.mjs",
  "skills/team-workspace/assets/app/src/fingerprint.mjs",
  "skills/team-workspace/assets/app/src/capabilities.mjs",
  "skills/team-workspace/assets/app/src/workspace.mjs",
  "skills/team-workspace/assets/app/src/version.mjs",
  "skills/team-workspace/assets/app/public/collaboration.js",
  "skills/team-workspace/assets/app/vendor/js-yaml.mjs",
];

export class HookTrust {
  constructor(store, connection) {
    this.s = store; this.connection = connection; this.tickets = new Map();
    this.state = { recorded: false, verified: false, status: "unknown", hooks: [] };
  }
  cwds() { return [...new Set(this.s.list("employees").filter((e) => !e.archived && e.cwd).map((e) => e.cwd))]; }
  async refresh() {
    const generation=this.connection.client?.generation,requestVersion=this.refreshVersion=(this.refreshVersion||0)+1;
    this.state={...this.state,recorded:false,verified:false,status:'checking',error:null};
    let result;
    try {result = await this.connection.request("hooks/list", { cwds: this.cwds() });}
    catch(error){
      if(requestVersion===this.refreshVersion)this.state={...this.state,status:'unknown',error:error.message};
      throw error;
    }
    requireValue(this.connection.state.online && generation===this.connection.client?.generation && requestVersion===this.refreshVersion,
      'hook_connection_changed','连接或 hook 核验请求已变化，旧结果已忽略',409);
    const entries = result.data || [];
    const hooks = [...new Map(entries.flatMap((e) => e.hooks || []).filter((h) => ownHook(h.key)).map((h) => [h.key + h.currentHash, h])).values()];
    const hook = hooks.length === 1 ? hooks[0] : null;
    this.state = {
      recorded: !!hook && hook.enabled && ["trusted", "managed"].includes(hook.trustStatus),
      verified: true, status: hook?.trustStatus || "not_found", at: now(),
      hooks: hooks.map(({ key, currentHash, trustStatus, enabled, isManaged, sourcePath }) => ({ key, currentHash, trustStatus, enabled, isManaged, sourcePath })),
      error: entries.flatMap((e) => e.errors || []).map((e) => e.message).join("；") || null,
    };
    return { hook, state: this.state };
  }
  inspectFiles(hook) {
    requireValue(hook && hook.source === "plugin" && ownHook(hook.key) && hook.eventName === "stop" && hook.handlerType === "command" && hook.command === command,
      "hook_definition", "未找到当前 TeamDesk 的预期 hook 定义，请检查插件安装", 409);
    const pluginRoot = path.resolve(hook.sourcePath, "../../");
    const manifest = JSON.parse(fs.readFileSync(path.join(pluginRoot, ".codex-plugin/plugin.json"), "utf8"));
    requireValue(manifest.name === "teamdesk" && manifest.version === pluginVersion, "hook_version", `Codex 尚未载入 TeamDesk ${pluginVersion}，请刷新插件配置后重试`, 409);
    const files = reviewedFiles.map((relative) => {
      const absolute = path.join(pluginRoot, relative), real = fs.realpathSync(absolute);
      requireValue(real.startsWith(fs.realpathSync(pluginRoot) + path.sep), "hook_path", "hook 文件不在插件目录内", 409);
      return { path: relative, text: fs.readFileSync(real, "utf8") };
    });
    const digest = createHash("sha256").update(JSON.stringify(files)).digest("hex");
    return { files, digest, version: manifest.version, pluginRoot };
  }
  async review() {
    const { hook } = await this.refresh();
    const files = this.inspectFiles(hook);
    const ticket = randomUUID();
    this.tickets.set(ticket, { key: hook.key, hash: hook.currentHash, digest: files.digest, expires: Date.now() + 600000 });
    for (const [key, value] of this.tickets) if (value.expires < Date.now()) this.tickets.delete(key);
    return {
      ticket, key: hook.key, currentHash: hook.currentHash, command: hook.command,
      sourcePath: hook.sourcePath, trustStatus: hook.trustStatus, enabled: hook.enabled,
      isManaged: hook.isManaged, ...files,
      scope: "本机所有使用同一 TeamDesk 插件定义的员工。只为当前绑定员工采集摘要；不联网，不发送消息。",
    };
  }
  async trust(input) {
    requireValue(input.confirmed === true, "human_confirmation", "请审查显示的配置和脚本后，明确确认信任", 400);
    const ticket = this.tickets.get(input.ticket);
    requireValue(ticket && ticket.expires >= Date.now(), "review_expired", "审查已过期，请重新打开 hook 审查", 409);
    const { hook } = await this.refresh();
    const files = this.inspectFiles(hook);
    requireValue(hook.key === ticket.key && hook.currentHash === ticket.hash && files.digest === ticket.digest, "hook_changed", "hook 定义或脚本已变化，请重新审查", 409);
    requireValue(!hook.isManaged, "managed_hook", "此 hook 由管理策略控制，请联系管理员", 403);
    requireValue(hook.enabled, "hook_disabled", "此 hook 已被禁用，请在 Codex 中检查禁用原因", 409);
    this.tickets.delete(input.ticket);
    if (hook.trustStatus !== "trusted") {
      this.s.audit("hook.trust_requested", hook.key, "human_gui", { currentHash: hook.currentHash, filesDigest: files.digest });
      await this.connection.request("config/batchWrite", {
        edits: [{ keyPath: "hooks.state", value: { [hook.key]: { trusted_hash: hook.currentHash } }, mergeStrategy: "upsert" }],
        filePath: null, expectedVersion: null, reloadUserConfig: true,
      });
    }
    const checked = await this.refresh();
    requireValue(checked.hook?.currentHash === hook.currentHash && checked.state.recorded, "trust_not_confirmed", "尚未取得原生信任确认，请刷新核对，勿重复授权", 409);
    this.s.audit("hook.trust_verified", hook.key, "human_gui", { currentHash: hook.currentHash, filesDigest: files.digest });
    return checked.state;
  }
}
