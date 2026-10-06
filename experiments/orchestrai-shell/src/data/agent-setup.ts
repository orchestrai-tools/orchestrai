import type { AgentId } from "@/data/agents"

/** What a new session with the agent starts with. Null inherits: the agent's own default, or the global profile. */
export interface AgentDefaults {
  model: string | null
  effort: string | null
  mode: string | null
  profile: string | null
}

/** How the daemon installs, updates, and configures one ACP agent. */
export interface AgentSetup {
  install: { via: "npm" | "Homebrew"; pkg: string; command: string }
  /** The registry's newest version, when it is ahead of the installed one. */
  latest?: string
  /** Model choices cached from the agent's last ACP probe. */
  models: string[]
  efforts: string[]
  /** Session modes the agent advertises over ACP. */
  modes: string[]
  defaults: AgentDefaults
  /** The agent keeps its own login; this is how to give it one. */
  signIn: string
}

const npm = (pkg: string) => ({ via: "npm" as const, pkg, command: `npm install -g ${pkg}@latest --include=optional` })

export const AGENT_SETUP: Record<AgentId, AgentSetup> = {
  claude: {
    install: npm("@agentclientprotocol/claude-agent-acp"),
    models: ["claude-sonnet-5.5", "claude-opus-5.5", "claude-haiku-5"],
    efforts: ["Low", "Medium", "High"],
    modes: ["Default", "Plan", "Accept edits"],
    defaults: { model: null, effort: "High", mode: null, profile: null },
    signIn: "Run claude in a terminal and log in.",
  },
  codex: {
    install: npm("@agentclientprotocol/codex-acp"),
    latest: "0.49.2",
    models: ["gpt-5.6", "gpt-5.6-codex", "gpt-5.6-mini"],
    efforts: ["Low", "Medium", "High"],
    modes: ["Read only", "Auto", "Full access"],
    defaults: { model: null, effort: null, mode: "Auto", profile: null },
    signIn: "Run codex login in a terminal.",
  },
  gemini: {
    install: { via: "Homebrew", pkg: "gemini-cli", command: "brew upgrade gemini-cli" },
    models: ["gemini-3.1-pro", "gemini-3.1-flash"],
    efforts: [],
    modes: ["Default", "Auto edit"],
    defaults: { model: null, effort: null, mode: null, profile: "Always ask" },
    signIn: "Run gemini in a terminal and choose Login with Google.",
  },
  goose: {
    install: { via: "Homebrew", pkg: "block-goose-cli", command: "brew upgrade block-goose-cli" },
    models: ["claude-opus-5.5", "claude-sonnet-5.5", "gpt-5.6", "gemini-3.1-pro"],
    efforts: [],
    modes: ["Auto", "Approve", "Smart approve", "Chat"],
    defaults: { model: "claude-opus-5.5", effort: null, mode: "Smart approve", profile: "Smart approve" },
    signIn: "Run goose configure in a terminal and pick a provider.",
  },
  opencode: {
    install: npm("opencode-ai"),
    latest: "0.15.2",
    models: ["claude-sonnet-5.5", "gpt-5.6", "kimi-k3"],
    efforts: [],
    modes: ["Build", "Plan"],
    defaults: { model: null, effort: null, mode: null, profile: null },
    signIn: "Run opencode auth login in a terminal.",
  },
}

/** Orchestrai's own permission profiles. The denylist is checked first in every one of them. */
export const PERMISSION_PROFILES: readonly { id: string; hint: string }[] = [
  { id: "Always ask", hint: "Asks before every tool call, reads included." },
  { id: "Ask for writes", hint: "Reads run on their own. Edits, commands, and network access ask first." },
  { id: "Smart approve", hint: "The agent decides per tool kind. Anything on the denylist is still refused." },
  { id: "Always allow", hint: "Runs every tool without asking. Never the default; the denylist still refuses." },
]

export const DENYLIST_RULES = 7

/** Agents in the ACP Registry, as Zed reads it. Warpforge already knows how to install each of them. */
export interface RegistryAgent {
  id: string
  name: string
  publisher: string
  summary: string
  version: string
  command: string
  install: string
}

export const REGISTRY: readonly RegistryAgent[] = [
  { id: "opencode", name: "OpenCode", publisher: "SST", version: "0.15.2", summary: "Open-source coding agent with many model providers.", command: "opencode acp", install: npm("opencode-ai").command },
  { id: "qwen", name: "Qwen Code", publisher: "Alibaba", version: "0.9.1", summary: "Qwen3-Coder in a Gemini CLI fork.", command: "qwen --acp", install: npm("@qwen-code/qwen-code").command },
  { id: "junie", name: "Junie", publisher: "JetBrains", version: "1.4.0", summary: "JetBrains' coding agent, outside the IDE.", command: "junie --acp true", install: npm("@jetbrains/junie-cli").command },
  { id: "cursor", name: "Cursor", publisher: "Community adapter", version: "0.6.2", summary: "Cursor's agent CLI through an ACP adapter.", command: "cursor-agent-acp", install: npm("@blowmage/cursor-agent-acp").command },
  { id: "pi", name: "Pi", publisher: "Earendil", version: "0.3.8", summary: "A small coding agent. Needs Node 22.19 or newer.", command: "pi-acp", install: "npm install -g pi-acp@latest @earendil-works/pi-coding-agent@latest --include=optional" },
  { id: "grok", name: "Grok Build", publisher: "xAI", version: "0.2.4", summary: "xAI's coding agent over stdio.", command: "grok agent stdio", install: npm("@xai-official/grok").command },
]

/** Dotted numeric versions, enough to say whether the installed one is behind. */
export function isBehind(installed: string, latest: string | undefined): boolean {
  if (!installed || !latest) return false
  const a = installed.split(".").map(Number)
  const b = latest.split(".").map(Number)
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const diff = (a[index] ?? 0) - (b[index] ?? 0)
    if (diff !== 0) return diff < 0
  }
  return false
}
