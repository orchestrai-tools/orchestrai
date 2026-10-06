import { findAgent } from "@/data/agents"
import type { AgentSession, SessionOrigin, SessionStatus } from "@/data/sessions"

export const ORIGIN_LABEL: Record<SessionOrigin, string> = {
  app: "Started here",
  terminal: "Outside the app",
  "acp-client": "Outside the app",
  automation: "Automation",
  fork: "Fork",
}

/** A live session has a process attached: it is mid-turn or waiting on a person. */
export const isLive = (status: SessionStatus) => status === "running" || status === "needs-you"

export const isOutside = (origin: SessionOrigin) => origin === "terminal" || origin === "acp-client"

/** Continue is ACP `session/load`: offered only when the agent advertises it and nothing is attached. */
export function canContinue(session: AgentSession): boolean {
  return findAgent(session.agent).canContinue && !isLive(session.status) && session.status !== "queued"
}

/** Fork is ACP `session/fork`, offered only where the agent advertises it. */
export function canFork(session: AgentSession): boolean {
  return findAgent(session.agent).canFork && session.status !== "queued"
}

export function usageText(session: AgentSession): string {
  const parts: string[] = []
  if (session.context) parts.push(`Context ${Math.round((session.context.used / session.context.size) * 100)}%`)
  if (session.costUsd !== undefined) parts.push(`$${session.costUsd.toFixed(2)}`)
  return parts.join(" · ")
}
