import type { AgentId } from "@/data/agents"

/** One quota window a provider reports for an account: the session, the week, or one model family. */
export interface LimitWindow {
  id: "five_hour" | "seven_day" | "seven_day_opus" | "primary" | "secondary"
  label: string
  usedPercent: number
  /** When it resets, as a person reads it. */
  resets: string
}

/** One login for an agent. Credentials stay in the vault; this is only what the switcher shows. */
export interface AgentAccount {
  id: string
  agent: AgentId
  label: string
  email?: string
  plan?: string
  /** New sessions for the agent use the active account. */
  active: boolean
  windows: LimitWindow[]
  updated: string
  /** The last poll was throttled or old, so these are the last good numbers. */
  outdated?: boolean
}

export const ACCOUNTS: readonly AgentAccount[] = [
  {
    id: "claude:work", agent: "claude", label: "work", email: "felipe@orchestrai.tools", plan: "Max 20x", active: true, updated: "1m ago",
    windows: [
      { id: "five_hour", label: "Session", usedPercent: 62, resets: "resets in 1h 48m" },
      { id: "seven_day", label: "Weekly", usedPercent: 41, resets: "resets Mon 09:00" },
      { id: "seven_day_opus", label: "Weekly (Opus)", usedPercent: 70, resets: "resets Mon 09:00" },
    ],
  },
  {
    id: "claude:personal", agent: "claude", label: "personal", email: "felipe.home@fastmail.com", plan: "Pro", active: false, updated: "3h ago", outdated: true,
    windows: [
      { id: "five_hour", label: "Session", usedPercent: 0, resets: "not used yet" },
      { id: "seven_day", label: "Weekly", usedPercent: 12, resets: "resets Sun 22:00" },
    ],
  },
  {
    id: "codex:chatgpt-pro", agent: "codex", label: "ChatGPT Pro", email: "felipe@orchestrai.tools", plan: "Pro", active: true, updated: "1m ago",
    windows: [
      { id: "primary", label: "Session", usedPercent: 18, resets: "resets in 3h 02m" },
      { id: "secondary", label: "Weekly", usedPercent: 55, resets: "resets Thu 14:00" },
    ],
  },
  {
    id: "codex:side", agent: "codex", label: "side", email: "fg.builds@gmail.com", plan: "Plus", active: false, updated: "4m ago",
    windows: [
      { id: "primary", label: "Session", usedPercent: 100, resets: "resets at 16:58" },
      { id: "secondary", label: "Weekly", usedPercent: 64, resets: "resets Tue 08:00" },
    ],
  },
]

/** API-equivalent spend per agent, summed from the cost each session reports. */
export interface AgentSpend {
  agent: AgentId
  /** Null when unknown, never a misleading zero. */
  todayUsd: number | null
  totalUsd: number | null
  tasks: number
  /** False when the agent never reports cost at all. */
  reported: boolean
}

export const SPEND: readonly AgentSpend[] = [
  { agent: "claude", todayUsd: 41.2, totalUsd: 1318.44, tasks: 41, reported: true },
  { agent: "codex", todayUsd: 12.75, totalUsd: 406.1, tasks: 27, reported: true },
  { agent: "goose", todayUsd: 3.08, totalUsd: 77.9, tasks: 9, reported: true },
  { agent: "gemini", todayUsd: null, totalUsd: null, tasks: 2, reported: false },
]

export const SPEND_NOTE = "Estimated at API rates, not what you were billed."
export const SWITCH_NOTE = "Open sessions resume on the new account with your next message."

export function percentLeft(usedPercent: number): number {
  return Math.max(0, Math.min(100, Math.round(100 - usedPercent)))
}

/** A full window refuses new runs on the account until it resets. Model-scoped weeks only cap that model. */
export function exhaustedWindow(account: AgentAccount): LimitWindow | undefined {
  return account.windows.find((window) => window.usedPercent >= 100 && window.id !== "seven_day_opus")
}

export function formatUsd(value: number | null | undefined): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null
  const digits = value >= 1000 ? 0 : 2
  return value.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits })
}
