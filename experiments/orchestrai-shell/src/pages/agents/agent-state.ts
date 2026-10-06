import type { Agent } from "@/data/agents"
import { AGENT_SETUP, isBehind } from "@/data/agent-setup"
import type { InstallPhase } from "@/pages/agents/agents-store"

/** What the detection and the last start attempt say about an agent, plus a running install. */
export type AgentState = "ready" | "sign-in" | "missing" | "update" | "installing" | "verifying"

export const AGENT_STATE: Record<AgentState, { label: string; dot: string }> = {
  ready: { label: "Ready", dot: "bg-emerald-500" },
  "sign-in": { label: "Needs sign-in", dot: "bg-amber-500" },
  missing: { label: "Not installed", dot: "border border-muted-foreground/60" },
  update: { label: "Update available", dot: "bg-sky-500" },
  installing: { label: "Installing…", dot: "animate-pulse bg-amber-500" },
  verifying: { label: "Checking it starts…", dot: "animate-pulse bg-amber-500" },
}

export function agentState(agent: Agent, phase: InstallPhase | undefined): AgentState {
  if (phase === "installing" || phase === "verifying") return phase
  if (agent.status === "missing") return "missing"
  if (agent.status === "sign-in") return "sign-in"
  if (isBehind(agent.version, AGENT_SETUP[agent.id].latest)) return "update"
  return "ready"
}

export function supports(agent: Agent): string {
  const verbs = [agent.canContinue && "Continue", agent.canFork && "Fork"].filter(Boolean)
  return verbs.length ? verbs.join(", ") : "Neither continue nor fork"
}
