// HLD 3.7 (G-01): SkillDock did not start because an Agent still holds a SkillDock older than
// 0.10.3. With the user's agreement, the launcher updates it through that Agent's own command
// line, checks again and starts (native entry only).
import { useState } from "react";
import { ServiceMessage, t } from "./i18n";
import { LibraryButton as Button } from "./LibraryUI";
import { gateUpdate } from "./transport";

type Agent = "codex" | "claude";
const NAME: Record<Agent, string> = { codex: "Codex", claude: "Claude" };

/** The Agents a native start failure names for the gate's one-click update. */
export function gateAgents(message: string): Agent[] {
  if (!message.startsWith("SKILLDOCK_ERROR:")) return [];
  try {
    const value = JSON.parse(message.slice("SKILLDOCK_ERROR:".length));
    return value?.code === "MIGRATION_BLOCKED" && Array.isArray(value.agents) ? value.agents.filter((agent: unknown): agent is Agent => agent === "codex" || agent === "claude") : [];
  } catch { return []; }
}

export function GateUpdate({ agents, onDone }: { agents: Agent[]; onDone: () => void }) {
  const [asking, setAsking] = useState<Agent>();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  async function confirm(agent: Agent) {
    setRunning(true); setError("");
    try { await gateUpdate(agent); setAsking(undefined); onDone(); }
    catch (failure) { setError((failure as Error).message); }
    finally { setRunning(false); }
  }
  return (
    <div className="gate-update">
      {agents.map(agent => asking === agent ? (
        <div key={agent} className="gate-confirm" role="group">
          <p>{t("将通过 {v0} 的命令行更新其中的 SkillDock，然后重新检查并启动。只改动 SkillDock 本身。", { v0: NAME[agent] })}</p>
          <Button variant="primary" busy={running} onClick={() => void confirm(agent)}>{t("确认更新")}</Button>
          <button className="text-button" disabled={running} onClick={() => setAsking(undefined)}>{t("取消")}</button>
        </div>
      ) : <Button key={agent} disabled={running || !!asking} onClick={() => setAsking(agent)}>{t("一键更新 {v0} 中的 SkillDock", { v0: NAME[agent] })}</Button>)}
      {error && <div className="field-error" role="alert"><ServiceMessage value={error} error /></div>}
    </div>
  );
}
