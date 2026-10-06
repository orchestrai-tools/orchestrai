import { create } from "zustand"

import { findAgent } from "@/data/agents"
import { ask, note, say, SESSIONS, think, type AgentSession, type SessionLine } from "@/data/sessions"
import { PROJECT_IDS, type ProjectId } from "@/lib/projects"
import { isLive } from "@/pages/sessions/session-meta"

/** TradingView-style presets: one panel, two columns, or a 2×2 grid. */
export type GridLayout = "1" | "2" | "4"

export interface BroadcastResult {
  sent: number
  queued: number
  skipped: string[]
}

interface SessionsStore {
  sessions: AgentSession[]
  /** Sessions shown in the grid, per project, in slot order. */
  pinned: Record<ProjectId, string[]>
  hidden: string[]
  layout: GridLayout
  setLayout: (layout: GridLayout) => void
  pin: (project: ProjectId, id: string) => void
  /** Puts a session in the slot right after another, so a fork sits beside its original. */
  pinAfter: (project: ProjectId, id: string, afterId: string) => void
  unpin: (project: ProjectId, ids: string[]) => void
  hide: (id: string) => void
  unhideAll: (project: ProjectId) => void
  continueSession: (id: string) => void
  fork: (id: string) => string | undefined
  stop: (id: string) => void
  broadcast: (ids: string[], text: string) => BroadcastResult
  /** Streams one more line into each running session of the project. */
  tick: (project: ProjectId) => void
}

function initialPins(sessions: readonly AgentSession[]): Record<ProjectId, string[]> {
  return Object.fromEntries(
    PROJECT_IDS.map((project) => {
      const own = sessions.filter((session) => session.project === project)
      const ordered = [...own.filter((session) => isLive(session.status)), ...own.filter((session) => !isLive(session.status))]
      return [project, ordered.slice(0, 4).map((session) => session.id)]
    })
  ) as Record<ProjectId, string[]>
}

const newId = () => Math.random().toString(16).slice(2, 10).padEnd(8, "0")

const settle = (lines: SessionLine[]): SessionLine[] =>
  lines.map((line) => (line.kind === "tool" && line.state === "running" ? { ...line, state: "ok" } : line))

/** The activity label follows the latest update, the way the real session reports thinking, tools, and writing. */
function activityFor(line: SessionLine): string | undefined {
  if (line.kind === "thought") return "Thinking"
  if (line.kind === "agent") return "Writing a reply"
  if (line.kind === "tool") return line.text.split(" · ")[0]
  return undefined
}

export const useSessionsStore = create<SessionsStore>()((set, get) => {
  const patch = (id: string, change: (session: AgentSession) => Partial<AgentSession>) =>
    set(({ sessions }) => ({ sessions: sessions.map((session) => (session.id === id ? { ...session, ...change(session) } : session)) }))

  return {
    sessions: SESSIONS.map((session) => ({ ...session })),
    pinned: initialPins(SESSIONS),
    hidden: [],
    layout: "4",

    setLayout: (layout) => set({ layout }),
    pin: (project, id) =>
      set((state) =>
        state.pinned[project].includes(id) ? state : { pinned: { ...state.pinned, [project]: [...state.pinned[project], id] } }
      ),
    pinAfter: (project, id, afterId) =>
      set(({ pinned }) => {
        const rest = pinned[project].filter((entry) => entry !== id)
        const at = rest.indexOf(afterId)
        return { pinned: { ...pinned, [project]: at === -1 ? [...rest, id] : [...rest.slice(0, at + 1), id, ...rest.slice(at + 1)] } }
      }),
    unpin: (project, ids) => set(({ pinned }) => ({ pinned: { ...pinned, [project]: pinned[project].filter((id) => !ids.includes(id)) } })),
    hide: (id) =>
      set(({ hidden, pinned }) => ({
        hidden: [...hidden, id],
        pinned: Object.fromEntries(Object.entries(pinned).map(([project, ids]) => [project, ids.filter((entry) => entry !== id)])) as Record<ProjectId, string[]>,
      })),
    unhideAll: (project) =>
      set(({ hidden, sessions }) => ({ hidden: hidden.filter((id) => sessions.find((session) => session.id === id)?.project !== project) })),

    continueSession: (id) =>
      patch(id, (session) => ({
        status: "running",
        activity: "Loading its history with session/load",
        updated: "Just now",
        transcript: [...session.transcript, note(`Continued here. ${session.turns === null ? "Its history" : `${session.turns} turns`} loaded with session/load.`)],
        upcoming: [say("Picked up where this left off. Ready for the next step."), ...(session.upcoming ?? [])],
      })),

    fork: (id) => {
      const source = get().sessions.find((session) => session.id === id)
      if (!source || !findAgent(source.agent).canFork) return undefined
      const forkId = newId()
      const copy: AgentSession = {
        ...source,
        id: forkId,
        origin: "fork",
        source: `Fork of ${source.id} at turn ${source.turns ?? "latest"}`,
        status: "idle",
        activity: undefined,
        updated: "Just now",
        task: undefined,
        forkedFrom: source.id,
        transcript: [note(`Forked from ${source.title}. Later turns here do not change the original.`), ...settle(source.transcript.slice(-3))],
        upcoming: undefined,
      }
      set(({ sessions }) => ({ sessions: [copy, ...sessions] }))
      return forkId
    },

    stop: (id) =>
      patch(id, (session) => ({
        status: "stopped",
        activity: "Turn cancelled",
        updated: "Just now",
        transcript: [...settle(session.transcript), note("You stopped the turn (session/cancel). Continue picks it up again.")],
        upcoming: [],
      })),

    broadcast: (ids, text) => {
      const result: BroadcastResult = { sent: 0, queued: 0, skipped: [] }
      const sessions = get().sessions.map((session) => {
        if (!ids.includes(session.id)) return session
        const agent = findAgent(session.agent)
        if (isLive(session.status)) {
          result.queued += 1
          return { ...session, transcript: [...session.transcript, note(`Queued behind the running turn: “${text}”`)] }
        }
        if (!agent.canContinue) {
          result.skipped.push(agent.name)
          return session
        }
        result.sent += 1
        return {
          ...session,
          status: "running" as const,
          activity: "Thinking",
          updated: "Just now",
          transcript: [...session.transcript, note("Resumed with session/load"), ask(text)],
          upcoming: [think("Reading the new message against the work so far."), say("On it. I'll report back here when this step is done.")],
        }
      })
      set({ sessions })
      return result
    },

    tick: (project) =>
      set((state) => {
        let changed = false
        const sessions = state.sessions.map((session) => {
          if (session.project !== project || session.status !== "running" || !session.upcoming?.length) return session
          changed = true
          const [line, ...rest] = session.upcoming
          const ended = rest.length === 0 && line.kind === "agent"
          return {
            ...session,
            status: ended ? ("done" as const) : session.status,
            transcript: [...settle(session.transcript), line, ...(ended ? [note("Turn ended · end_turn")] : [])],
            upcoming: rest,
            activity: ended ? undefined : (activityFor(line) ?? session.activity),
            updated: "Just now",
            turns: line.kind === "agent" && session.turns !== null ? session.turns + 1 : session.turns,
          }
        })
        return changed ? { sessions } : state
      }),
  }
})
