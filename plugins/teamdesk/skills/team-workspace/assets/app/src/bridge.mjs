import path from "node:path";
import { fileURLToPath } from "node:url";
import { Team } from "./service.mjs";
import { now, uid, requireValue, line } from "./db.mjs";
import { catalog } from "./native.mjs";
export const skillRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
export const protocolPath = path.join(skillRoot, "references/worker.md");
export class Bridge {
  constructor(store) {
    this.s = store;
    this.team = new Team(store);
  }
  authorize(thread) {
    requireValue(
      thread && this.team.settings().bridgeThreadId === thread,
      "bridge_actor",
      "只有已指定的原生接入任务可执行接入操作",
      403,
    );
  }
  register(thread, automationId) {
    this.authorize(thread);
    const old = this.s.get("meta", "bridge") || {};
    this.s.put("meta", "bridge", {
      ...old,
      threadId: thread,
      registeredAt: old.threadId === thread ? old.registeredAt || now() : now(),
      lastSeen: now(),
      automationId: automationId
        ? line(automationId, "原生自动化编号")
        : old.threadId === thread
          ? old.automationId || null
          : null,
    });
    return { registered: true };
  }
  expire() {
    return this.s.tx(() => {
      for (const op of this.s.list("operations"))
        if (op.state === "leased" && Date.parse(op.leaseUntil) < Date.now()) {
          op.state = "uncertain";
          op.error = "原生执行未回执，请核对后恢复，避免重复执行";
          this.s.put("operations", op.id, op);
        }
    });
  }
  next(thread) {
    this.authorize(thread);
    return this.s.tx(() => {
      this.register(thread);
      if (!this.team.settings().enabled)
        return { paused: true, operation: null };
      this.expire();
      const op = this.s
        .list("operations")
        .filter((o) => o.state === "pending")
        .sort((a, b) => a.sequence - b.sequence)
        .find((o) => {
          const e = this.s.get("employees", o.employeeId);
          return (
            e && !e.archived && (o.kind === "create_employee" || !!e.threadId)
          );
        });
      if (!op) return { operation: null };
      const e = this.team.active(op.employeeId);
      op.state = "leased";
      op.leaseToken = uid("LEASE");
      op.leaseUntil = new Date(Date.now() + 600000).toISOString();
      op.attempts++;
      op.bindingVersion = e.bindingVersion;
      this.s.put("operations", op.id, op);
      const request = op.requestId
        ? this.s.get("requests", op.requestId)
        : null;
      const header = request
        ? "TEAMDESK_META " +
          JSON.stringify({ requestId: request.id, taskRef: request.taskRef }) +
          "\n"
        : "";
      const prompt =
        header +
        "这是用户在 TeamDesk 中提交的" +
        (op.kind === "create_employee"
          ? "新建员工请求。"
          : op.kind === "onboard"
            ? "员工接入检查。"
            : "业务输入。") +
        "\n先读取员工协议 " +
        protocolPath +
        (op.kind === "create_employee"
          ? "。此首次创建尚未绑定，先回复身份初始化确认，不运行 inbox；绑定后会收到单独探测。"
          : "。使用该目录中的 CLI inbox 获取当前员工身份、业务输入、技能及共享规则。") +
        "\n员工 " +
        e.id +
        "（" +
        e.name +
        "），岗位 " +
        e.role +
        "。" +
        (op.kind === "create_employee"
          ? "\n仅完成身份初始化，回复已创建；绑定后会单独探测 hook。"
          : op.kind === "onboard"
            ? "\n读取 inbox 并确认当前绑定；没有业务请求时仅回复接入确认。不要创建示例业务。"
            : "\n本次模式 " +
              request.mode +
              "；请求 " +
              request.id +
              "；业务引用 " +
              request.taskRef +
              "。按员工协议处理，不因正在执行其他业务而丢弃输入。");
      return {
        operation: {
          ...op,
          employee: e,
          request,
          prompt,
          action:
            op.kind === "create_employee"
              ? "create_thread"
              : "send_message_to_thread",
        },
        instructions:
          "在原生 Codex 使用 codex-app-tools 执行 action；操作前展示发送对象/意图，成功后使用 ack 回执。禁止由 CLI、HTTP 服务或网页调用原生工具。一次只领取一个操作；业务 FIFO 排序仍由员工负责。",
      };
    });
  }
  ack(thread, input) {
    this.authorize(thread);
    return this.s.tx(() => {
      const op = this.s.get("operations", input.operationId);
      requireValue(op, "not_found", "操作不存在", 404);
      if (op.state === "done" && op.leaseToken === input.leaseToken) return op;
      requireValue(
        op.state === "leased" && op.leaseToken === input.leaseToken,
        "lease",
        "操作租约无效或已失效",
        409,
      );
      const e = this.team.active(op.employeeId);
      requireValue(
        e.bindingVersion === op.bindingVersion,
        "binding_changed",
        "员工已换绑，旧回执不能提交",
        409,
      );
      requireValue(
        ["accepted", "failed", "uncertain"].includes(input.outcome),
        "outcome",
        "原生回执状态无效",
      );
      if (input.outcome === "accepted") {
        if (op.kind === "create_employee") {
          const native = catalog().threads.find((t) => t.id === input.threadId);
          requireValue(
            native,
            "native_pending",
            "原生新任务尚未进入本地索引，请稍后回执，不要重建",
            409,
          );
          this.team.bind(e.id, {
            threadId: native.id,
            cwd: native.cwd,
            title: native.title,
          });
        }
        op.state = "done";
        op.completedAt = now();
        if (op.requestId) {
          const r = this.s.get("requests", op.requestId);
          r.nativeAcceptedAt = now();
          if (r.state === "saved") r.state = "native_accepted";
          this.s.put("requests", r.id, r);
        }
      } else {
        op.state = input.outcome;
        op.error = line(input.error || "原生操作未确认", "错误", 500);
      }
      this.s.put("operations", op.id, op);
      this.s.audit("native." + op.state, op.id, "connection:" + thread);
      return op;
    });
  }
  recover(id, input) {
    return this.s.tx(() => {
      const op = this.s.get("operations", id);
      requireValue(
        op && ["failed", "uncertain"].includes(op.state),
        "recovery_state",
        "当前操作无需恢复",
        409,
      );
      if (input.action === "cancel") {
        op.state = "cancelled";
        this.s.put("operations", id, op);
        return op;
      }
      requireValue(input.action === "retry", "action", "恢复操作无效");
      requireValue(
        op.kind !== "create_employee" || op.state === "failed",
        "creation_uncertain",
        "创建结果不确定，请在员工详情中绑定已创建的原生任务，不能盲目重建",
        409,
      );
      op.state = "pending";
      op.error = null;
      this.s.put("operations", id, op);
      this.s.audit("native.retry", id);
      return op;
    });
  }
}
