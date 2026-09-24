import path from "node:path";
import { Team } from "./service.mjs";
import { now } from "./db.mjs";
export function stopHook(store, input, digest = "development") {
  return store.tx(() => handleStop(store, input, digest));
}
function handleStop(store, input, digest) {
  if (
    input.hook_event_name !== "Stop" ||
    typeof input.session_id !== "string" ||
    typeof input.turn_id !== "string"
  )
    return {};
  const team = new Team(store);
  if (!team.settings().enabled) return {};
  let actor;
  try {
    actor = team.actor(input.session_id);
  } catch {
    return {};
  }
  if (path.resolve(input.cwd || "/") !== actor.cwd) return {};
  const key = input.session_id + ":" + input.turn_id,
    existing = store.get("hooks", key);
  if (["saved", "failed"].includes(existing?.state)) return {};
  const observation = {
    ...existing,
    id: key,
    employeeId: actor.id,
    threadId: actor.threadId,
    bindingVersion: actor.bindingVersion,
    turnId: input.turn_id,
    digest,
    at: now(),
    state: "observed",
  };
  const message =
    typeof input.last_assistant_message === "string"
      ? input.last_assistant_message
      : "";
  const match = message.match(
    /<teamdesk_worklog>\s*([\s\S]*?)\s*<\/teamdesk_worklog>/,
  );
  const pending = store
    .list("requests")
    .filter(
      (r) =>
        r.employeeId === actor.id && r.receivedAt &&
        !["recorded", "cancelled"].includes(r.state),
    );
  if (
    !match &&
    pending.length &&
    !input.stop_hook_active &&
    !existing?.requestedAt
  ) {
    observation.state = "summary_requested";
    observation.requestedAt = now();
    store.put("hooks", key, observation);
    return {
      decision: "block",
      reason:
        '请按 TeamDesk 资料入口使用 query resource SYS-worklog 查阅记账格式，只记录本轮实际处理的 requestId。验收通过通知使用 entries:[{requestId,summary}] 记录收到，不改交付。业务工作使用标准 entry；不要领取尚未送入本轮的排队输入。此 hook 只请求一次补充。',
    };
  }
  try {
    if (!match && pending.length)
      throw Object.assign(Error("本轮缺少工作摘要；请在原生任务补记"), {
        code: "missing_summary",
      });
    if (match && match[1].length > 60000) throw Error("工作摘要过长");
    const entries = match ? JSON.parse(match[1]).entries : [];
    if (pending.length && Array.isArray(entries) && entries.length === 0)
      throw Object.assign(Error("仍有未处理输入，不能用空摘要跳过记账"), {
        code: "missing_summary",
      });
    const ids = team.applyWorklog(actor, input.turn_id, entries, digest);
    observation.state = "saved";
    observation.recordIds = ids;
    store.put("hooks", key, observation);
    const current = team.actor(input.session_id);
    current.lastHook = {
      turnId: input.turn_id,
      at: now(),
      digest,
      bindingVersion: current.bindingVersion,
    };
    current.onboarding = "hook_observed";
    store.put("employees", current.id, current);
    return {};
  } catch (e) {
    observation.state = "failed";
    observation.error = {
      code: e.code || "invalid_summary",
      message: String(e.message).slice(0, 300),
    };
    store.put("hooks", key, observation);
    return {
      systemMessage:
        "TeamDesk 记账未完成：" +
        observation.error.message +
        "。请按员工协议修复后，在下一轮补记；业务任务未被自动标记成功。",
    };
  }
}
