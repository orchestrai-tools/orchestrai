import { create } from "zustand"

import { AGENTS, findAgent, TEAMS, type AgentId, type Team } from "@/data/agents"
import { CHANNELS, findPerson, ME, type Channel, type ChannelMessage } from "@/data/channel"
import { tasksFor, type RunStatus } from "@/data/tasks"
import { findProject, type ProjectId } from "@/lib/projects"
import { useAgentsStore } from "@/pages/agents/agents-store"

interface ChannelStore {
  /** Named groups of agents, added to a channel all at once. */
  teams: Team[]
  channels: Record<ProjectId, Channel>
  /** Agents writing a reply right now, per channel. */
  typing: Partial<Record<ProjectId, AgentId[]>>
  send: (project: ProjectId, text: string) => void
  addTeam: (project: ProjectId, name: string) => void
  addAgent: (project: ProjectId, agent: AgentId) => void
  removeAgent: (project: ProjectId, agent: AgentId) => void
  removeTeam: (project: ProjectId, name: string) => void
  createTeam: (team: Team) => void
  deleteTeam: (name: string) => void
}

export const teamHandle = (team: Team) => team.name.toLowerCase().replace(/\s+/g, "-")

let counter = 0
const nextId = () => `live-${++counter}`
const now = () => new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
const me = () => findPerson(ME).name
const names = (agents: AgentId[]) => agents.map((id) => findAgent(id).name).join(", ")
const eventOf = (text: string): ChannelMessage => ({ id: nextId(), type: "event", text, time: now() })

/** Agents named in a message, directly or through a team handle. */
function mentionedAgents(text: string, teams: Team[]): AgentId[] {
  const found = new Set<AgentId>()
  for (const [, raw] of text.matchAll(/@([a-z0-9-]+)/gi)) {
    const handle = raw.toLowerCase()
    const agent = AGENTS.find((entry) => entry.id === handle)
    if (agent) found.add(agent.id)
    teams.find((team) => teamHandle(team) === handle)?.members.forEach((id) => found.add(id))
  }
  return [...found]
}

const PRIORITY: RunStatus[] = ["needs-you", "running", "stopped", "failed", "review"]

/** A reply grounded in the agent's own open task in this project. */
function replyFor(agent: AgentId, project: ProjectId): { text: string; task?: string } {
  const open = tasksFor(project).filter((task) => task.agent === agent && PRIORITY.includes(task.status))
  const task = open.sort((a, b) => PRIORITY.indexOf(a.status) - PRIORITY.indexOf(b.status))[0]
  if (!task) return { text: "Noted. I have nothing open in this project, so I'll start a task for it and stop at plan for you to check." }
  const where = /^[A-Z][a-z]/.test(task.summary) ? task.summary.charAt(0).toLowerCase() + task.summary.slice(1) : task.summary
  return { text: `Noted, and folded into ${task.id}. Where it stands: ${where}.`, task: task.id }
}

export const useChannelStore = create<ChannelStore>()((set, get) => {
  const patch = (project: ProjectId, change: (channel: Channel) => Partial<Channel>) =>
    set(({ channels }) => ({ channels: { ...channels, [project]: { ...channels[project], ...change(channels[project]) } } }))
  const post = (project: ProjectId, message: ChannelMessage) => patch(project, ({ messages }) => ({ messages: [...messages, message] }))
  const setTyping = (project: ProjectId, change: (current: AgentId[]) => AgentId[]) =>
    set(({ typing }) => ({ typing: { ...typing, [project]: change(typing[project] ?? []) } }))

  return {
    teams: TEAMS.map((team) => ({ ...team, members: [...team.members] })),
    channels: Object.fromEntries(
      Object.entries(CHANNELS).map(([id, channel]) => [id, { ...channel, members: { ...channel.members }, messages: [...channel.messages] }])
    ) as Record<ProjectId, Channel>,
    typing: {},

    send: (project, text) => {
      post(project, { id: nextId(), type: "message", author: { kind: "person", id: ME }, text, time: now() })
      const channel = get().channels[project]
      const agents = useAgentsStore.getState().agents
      const replying: AgentId[] = []
      for (const id of mentionedAgents(text, get().teams)) {
        const agent = agents.find((entry) => entry.id === id) ?? findAgent(id)
        if (!channel.members.agents.includes(id)) post(project, eventOf(`${agent.name} is not in #${findProject(project).name}. Add it under Members to steer it here.`))
        else if (agent.status === "missing") post(project, eventOf(`${agent.name} is not installed, so it cannot reply. Install it on the Agents page.`))
        else if (agent.status === "sign-in") post(project, eventOf(`${agent.name} needs sign-in before it can reply. Sign in on the Agents page.`))
        else replying.push(id)
      }
      if (replying.length === 0) return
      setTyping(project, (current) => [...new Set([...current, ...replying])])
      replying.forEach((id, index) => {
        window.setTimeout(() => {
          const reply = replyFor(id, project)
          post(project, { id: nextId(), type: "message", author: { kind: "agent", id }, text: reply.text, task: reply.task, time: now() })
          setTyping(project, (current) => current.filter((entry) => entry !== id))
        }, 1400 + index * 1100)
      })
    },

    addTeam: (project, name) => {
      const team = get().teams.find((entry) => entry.name === name)
      if (!team || get().channels[project].members.teams.includes(name)) return
      patch(project, ({ members, messages }) => ({
        members: { ...members, teams: [...members.teams, name], agents: [...new Set([...members.agents, ...team.members])] },
        messages: [...messages, eventOf(`${me()} added team ${name}: ${names(team.members)}`)],
      }))
    },
    addAgent: (project, agent) => {
      if (get().channels[project].members.agents.includes(agent)) return
      patch(project, ({ members, messages }) => ({
        members: { ...members, agents: [...members.agents, agent] },
        messages: [...messages, eventOf(`${me()} added ${findAgent(agent).name}`)],
      }))
    },
    removeAgent: (project, agent) =>
      patch(project, ({ members, messages }) => ({
        members: { ...members, agents: members.agents.filter((id) => id !== agent) },
        messages: [...messages, eventOf(`${me()} removed ${findAgent(agent).name}`)],
      })),
    removeTeam: (project, name) =>
      patch(project, ({ members, messages }) => ({
        members: { ...members, teams: members.teams.filter((team) => team !== name) },
        messages: [...messages, eventOf(`${me()} removed team ${name}. Its agents stay in the channel.`)],
      })),
    createTeam: (team) => set(({ teams }) => ({ teams: [...teams, team] })),
    deleteTeam: (name) =>
      set(({ teams, channels }) => ({
        teams: teams.filter((team) => team.name !== name),
        channels: Object.fromEntries(
          Object.entries(channels).map(([id, channel]) => [
            id,
            { ...channel, members: { ...channel.members, teams: channel.members.teams.filter((team) => team !== name) } },
          ])
        ) as Record<ProjectId, Channel>,
      })),
  }
})
