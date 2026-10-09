// Version-2 requests (API-SDX-001 36c §5–6): which side a write belongs to, and when the
// multi-agent snapshot may be asked for.
import type { ActionRequest, Agent, Snapshot } from "../shared/contracts";

/** The multi-agent snapshot only from a service with API version 2 or later. */
export function stateUrl(mode: string, apiVersion: number | undefined) {
  return `/api/state?mode=${mode}${(apiVersion ?? 1) >= 2 ? "&multiAgent=1" : ""}`;
}

/**
 * The side a write acts on: the request's own `agent`, else the object it names (a shared
 * object acts on its Codex side), else Codex (global and multi-target actions).
 */
export function requestAgent(request: Omit<ActionRequest, "mode">, snapshot: Pick<Snapshot, "skills" | "plugins" | "marketplaces"> | null): Agent {
  if (request.agent) return request.agent;
  const id = request.id ?? request.target?.id;
  const object = id && snapshot ? [...snapshot.skills, ...snapshot.plugins, ...snapshot.marketplaces].find(item => item.id === id) : undefined;
  const agents = object?.agents ?? ["codex"];
  return agents.includes("codex") ? "codex" : agents[0];
}

/** 36c 7.1: a write to a single Claude object carries the revision the page showed. */
export function requestRevision(request: Omit<ActionRequest, "mode">, snapshot: Pick<Snapshot, "skills" | "plugins" | "marketplaces"> | null): string | undefined {
  if (request.expectedRevision !== undefined || !snapshot) return request.expectedRevision;
  const id = request.id ?? request.target?.id;
  const object = id ? [...snapshot.skills, ...snapshot.plugins, ...snapshot.marketplaces].find(item => item.id === id) : undefined;
  return object && !(object.agents ?? ["codex"]).includes("codex") ? object.revision : undefined;
}
