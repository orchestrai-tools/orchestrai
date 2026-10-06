export type AgentId = "claude" | "codex" | "gemini" | "goose" | "opencode"

/** An ACP worker the daemon can spawn. Continue and fork exist only when the agent advertises them. */
export interface Agent {
  id: AgentId
  name: string
  vendor: string
  /** How the daemon reaches it. */
  command: string
  status: "ready" | "sign-in" | "missing"
  version: string
  model: string
  /** ACP `session/load`. */
  canContinue: boolean
  /** ACP `session/fork`. */
  canFork: boolean
  permissionProfile: string
}

export const AGENTS: readonly Agent[] = [
  { id: "claude", name: "Claude Code", vendor: "Anthropic", command: "claude-agent-acp --acp", status: "ready", version: "2.4.1", model: "claude-sonnet-5.5", canContinue: true, canFork: false, permissionProfile: "Ask for writes" },
  { id: "codex", name: "Codex", vendor: "OpenAI", command: "codex-acp", status: "ready", version: "0.48.0", model: "gpt-5.6", canContinue: true, canFork: true, permissionProfile: "Ask for writes" },
  { id: "gemini", name: "Gemini CLI", vendor: "Google", command: "gemini --experimental-acp", status: "sign-in", version: "1.9.0", model: "gemini-3.1-pro", canContinue: false, canFork: false, permissionProfile: "Always ask" },
  { id: "goose", name: "Goose", vendor: "Block", command: "goose acp", status: "ready", version: "1.31.0", model: "claude-opus-5.5", canContinue: true, canFork: false, permissionProfile: "Smart approve" },
  { id: "opencode", name: "OpenCode", vendor: "SST", command: "opencode acp", status: "missing", version: "", model: "", canContinue: true, canFork: true, permissionProfile: "Ask for writes" },
]

export function findAgent(id: AgentId): Agent {
  return AGENTS.find((agent) => agent.id === id) ?? AGENTS[0]
}

/** A named group of agents you add to a channel at once (Buzz). */
export interface Team {
  name: string
  members: AgentId[]
  purpose: string
}

export const TEAMS: readonly Team[] = [
  { name: "Builders", members: ["claude", "codex"], purpose: "Implement and fix" },
  { name: "Reviewers", members: ["codex", "goose"], purpose: "Review diffs and plans" },
]
