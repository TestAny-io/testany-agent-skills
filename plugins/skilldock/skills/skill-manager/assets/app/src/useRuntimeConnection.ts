import { useEffect, useState } from "react";

type Restart = { id: string; status: "preparing" | "restarting" | "ready" | "failed"; message?: string; restored?: boolean };
type Connection = { status: Restart["status"] | "offline"; message?: string } | null;

export function useRuntimeConnection(enabled: boolean) {
  const [connection, setConnection] = useState<Connection>(null);
  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let instanceId: string | undefined;
    let timer: number;
    let reloading = false;
    let disconnected = false;
    const poll = async () => {
      try {
        const response = await fetch("/api/health", {
          cache: "no-store", credentials: "same-origin", signal: AbortSignal.timeout(3000),
        });
        if (!response.ok) throw new Error("Unavailable");
        const health = await response.json() as { app?: string; instanceId?: string; restart?: Restart };
        if (health.app !== "skilldock" || typeof health.instanceId !== "string") throw new Error("Invalid health response");
        if (stopped) return;
        if (instanceId ? instanceId !== health.instanceId : disconnected) {
          // Fetch new assets and a fresh session. Never replay a previous POST.
          reloading = true;
          window.location.reload();
          return;
        }
        instanceId = health.instanceId;
        disconnected = false;
        const restart = health.restart;
        setConnection(restart && restart.status !== "ready" ? { status: restart.status, message: restart.message } : null);
      } catch {
        disconnected = true;
        if (!stopped) setConnection(previous => previous?.status === "preparing" || previous?.status === "restarting" ? { status: "restarting" } : { status: "offline" });
      } finally {
        if (!stopped && !reloading) timer = window.setTimeout(() => void poll(), 1500);
      }
    };
    void poll();
    return () => { stopped = true; window.clearTimeout(timer); };
  }, [enabled]);
  return { connection, paused: !!connection && connection.status !== "failed" && connection.status !== "ready" };
}
