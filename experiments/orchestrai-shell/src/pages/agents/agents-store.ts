import { create } from "zustand"

import { AGENTS, type Agent, type AgentId } from "@/data/agents"
import { AGENT_SETUP, type AgentDefaults } from "@/data/agent-setup"
import { ACCOUNTS, type AgentAccount } from "@/data/usage"

/** An install or update runs the package manager, then an ACP handshake proves the agent starts. */
export type InstallPhase = "installing" | "verifying" | "done"

interface AgentsStore {
  agents: Agent[]
  enabled: Record<AgentId, boolean>
  defaults: Record<AgentId, AgentDefaults>
  /** The global permission profile every agent inherits unless it sets its own. */
  profile: string
  gitTextAgent: AgentId
  autoName: boolean
  installs: Record<string, InstallPhase>
  /** Registry agents installed here that the mock has no full record for. */
  extras: string[]
  reloaded: AgentId[]
  accounts: AgentAccount[]
  lastSwitch: { agent: AgentId; label: string } | null
  setEnabled: (id: AgentId, on: boolean) => void
  saveDefaults: (id: AgentId, defaults: AgentDefaults, writesGitText: boolean) => void
  saveGlobal: (profile: string, gitTextAgent: AgentId, autoName: boolean) => void
  install: (id: string, version: string) => void
  signIn: (id: AgentId) => void
  uninstall: (id: AgentId) => void
  reloadModels: (id: AgentId) => void
  activateAccount: (id: string) => void
  importAccount: (agent: AgentId, label: string) => void
  removeAccount: (id: string) => void
}

const byAgent = <T,>(pick: (agent: Agent) => T) =>
  Object.fromEntries(AGENTS.map((agent) => [agent.id, pick(agent)])) as Record<AgentId, T>

const slugify = (label: string) => label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "account"

export const useAgentsStore = create<AgentsStore>()((set, get) => ({
  agents: AGENTS.map((agent) => ({ ...agent })),
  enabled: byAgent((agent) => agent.status !== "missing"),
  defaults: byAgent((agent) => ({ ...AGENT_SETUP[agent.id].defaults })),
  profile: "Ask for writes",
  gitTextAgent: "claude",
  autoName: true,
  installs: {},
  extras: [],
  reloaded: [],
  accounts: ACCOUNTS.map((account) => ({ ...account })),
  lastSwitch: null,

  setEnabled: (id, on) => set(({ enabled }) => ({ enabled: { ...enabled, [id]: on } })),
  saveDefaults: (id, defaults, writesGitText) =>
    set(({ defaults: all, gitTextAgent }) => ({
      defaults: { ...all, [id]: defaults },
      gitTextAgent: writesGitText ? id : gitTextAgent === id ? "claude" : gitTextAgent,
    })),
  saveGlobal: (profile, gitTextAgent, autoName) => set({ profile, gitTextAgent, autoName }),

  install: (id, version) => {
    set(({ installs }) => ({ installs: { ...installs, [id]: "installing" } }))
    window.setTimeout(() => set(({ installs }) => ({ installs: { ...installs, [id]: "verifying" } })), 1600)
    window.setTimeout(
      () =>
        set(({ installs, agents, extras, enabled }) => {
          const known = agents.some((agent) => agent.id === id)
          return {
            installs: { ...installs, [id]: "done" },
            agents: agents.map((agent) =>
              agent.id === id
                ? { ...agent, version, status: agent.status === "missing" ? "ready" : agent.status, model: agent.model || AGENT_SETUP[agent.id].models[0] }
                : agent
            ),
            extras: known || extras.includes(id) ? extras : [...extras, id],
            enabled: known ? { ...enabled, [id]: true } : enabled,
          }
        }),
      3200
    )
  },
  signIn: (id) => set(({ agents }) => ({ agents: agents.map((agent) => (agent.id === id ? { ...agent, status: "ready" } : agent)) })),
  uninstall: (id) =>
    set(({ agents, enabled, installs }) => {
      const rest = Object.fromEntries(Object.entries(installs).filter(([key]) => key !== id))
      return {
        agents: agents.map((agent) => (agent.id === id ? { ...agent, status: "missing", version: "" } : agent)),
        enabled: { ...enabled, [id]: false },
        installs: rest,
      }
    }),
  reloadModels: (id) => set(({ reloaded }) => ({ reloaded: reloaded.includes(id) ? reloaded : [...reloaded, id] })),

  activateAccount: (id) => {
    const target = get().accounts.find((account) => account.id === id)
    if (!target) return
    set(({ accounts }) => ({
      accounts: accounts.map((account) => (account.agent === target.agent ? { ...account, active: account.id === id } : account)),
      lastSwitch: { agent: target.agent, label: target.label },
    }))
  },
  importAccount: (agent, label) =>
    set(({ accounts }) => {
      const base = slugify(label)
      const taken = new Set(accounts.map((account) => account.id))
      let slug = base
      for (let n = 2; taken.has(`${agent}:${slug}`); n++) slug = `${base}-${n}`
      const imported: AgentAccount = {
        id: `${agent}:${slug}`,
        agent,
        label: label.trim(),
        email: `felipe+${slug}@orchestrai.tools`,
        plan: agent === "claude" ? "Pro" : "Plus",
        active: false,
        updated: "Just now",
        windows:
          agent === "claude"
            ? [
                { id: "five_hour", label: "Session", usedPercent: 0, resets: "resets in 5h" },
                { id: "seven_day", label: "Weekly", usedPercent: 3, resets: "resets in 7d" },
              ]
            : [
                { id: "primary", label: "Session", usedPercent: 0, resets: "resets in 5h" },
                { id: "secondary", label: "Weekly", usedPercent: 2, resets: "resets in 7d" },
              ],
      }
      return { accounts: [...accounts, imported] }
    }),
  removeAccount: (id) => set(({ accounts }) => ({ accounts: accounts.filter((account) => account.id !== id || account.active) })),
}))

export function useAgent(id: AgentId): Agent {
  return useAgentsStore((state) => state.agents.find((agent) => agent.id === id) ?? state.agents[0])
}
