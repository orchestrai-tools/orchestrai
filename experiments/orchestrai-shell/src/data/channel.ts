import type { AgentId } from "@/data/agents"
import type { ProjectId } from "@/lib/projects"

export interface Person {
  id: string
  name: string
  handle: string
  initials: string
  role: string
  presence: "active" | "away" | "offline"
}

export const PEOPLE: readonly Person[] = [
  { id: "felipe", name: "Felipe Gusmão", handle: "felipe", initials: "FG", role: "You", presence: "active" },
  { id: "dana", name: "Dana Whitfield", handle: "dana", initials: "DW", role: "Design", presence: "active" },
  { id: "priya", name: "Priya Raman", handle: "priya", initials: "PR", role: "Daemon", presence: "away" },
  { id: "marco", name: "Marco Silva", handle: "marco", initials: "MS", role: "Desktop", presence: "offline" },
]

export const ME = "felipe"

export function findPerson(id: string): Person {
  return PEOPLE.find((person) => person.id === id) ?? PEOPLE[0]
}

/** People and agents post into the same thread, so either can be an author. */
export type Author = { kind: "person"; id: string } | { kind: "agent"; id: AgentId }

export type ChannelMessage =
  | { id: string; type: "message"; author: Author; text: string; time: string; task?: string }
  | { id: string; type: "event"; text: string; time: string }
  | { id: string; type: "day"; text: string }

export interface ChannelMembers {
  people: string[]
  agents: AgentId[]
  teams: string[]
}

/** One room per project. Agents join by being members, not through a private side chat (Buzz). */
export interface Channel {
  topic: string
  members: ChannelMembers
  messages: ChannelMessage[]
}

let seq = 0
const person = (id: string): Author => ({ kind: "person", id })
const agent = (id: AgentId): Author => ({ kind: "agent", id })
const msg = (author: Author, time: string, text: string, task?: string): ChannelMessage => ({ id: `seed-${++seq}`, type: "message", author, time, text, task })
const event = (time: string, text: string): ChannelMessage => ({ id: `seed-${++seq}`, type: "event", time, text })
const day = (text: string): ChannelMessage => ({ id: `seed-${++seq}`, type: "day", text })

export const CHANNELS: Record<ProjectId, Channel> = {
  orchestrai: {
    topic: "Building the desktop harness. Mention an agent to steer it; it answers here, for everyone.",
    members: { people: ["felipe", "dana", "priya", "marco"], agents: ["claude", "codex", "goose"], teams: ["Builders"] },
    messages: [
      day("Yesterday"),
      event("6:12 PM", "Felipe Gusmão added team Builders: Claude Code, Codex"),
      msg(person("felipe"), "6:14 PM", "Kicking off M1. @claude take ORC-03, the docs library. @codex take ORC-05, the Mission Control board. Both stop at plan and merge."),
      msg(agent("claude"), "6:21 PM", "The plan for ORC-03 is up: library index, search through the daemon, rendered page, then the synced editor. Stopped at plan, as set.", "orc-03"),
      msg(person("dana"), "6:30 PM", "For docs, the rendered page comes first and the editor sits beside it. Zed's preview, which follows the cursor, is the reference."),
      msg(agent("codex"), "6:41 PM", "The plan for ORC-05 is up. Fork shows only for agents that advertise `session/fork`. Claude Code doesn't, so its rows won't have it.", "orc-05"),
      day("Today"),
      event("8:55 AM", "Priya Raman added Goose"),
      msg(person("priya"), "9:02 AM", "@goose please take ORC-18: shell truncation to a temp file and unique-match edit. Cap CI fix attempts at 3."),
      msg(agent("goose"), "10:47 AM", "Truncation is in. Watching CI after fix attempt 2 of 3.", "orc-18"),
      msg(person("felipe"), "11:15 AM", "@codex sessions started outside the app should show up on the board too. A Codex CLI run in a terminal counts."),
      msg(agent("codex"), "11:31 AM", "On it. Sessions in `~/.codex/sessions` will show as Outside the app, and Continue loads them with `session/load`.", "orc-05"),
      msg(agent("claude"), "11:40 AM", "fix-resume stopped at 3 of 3 CI attempts. `resume_replays_once` fails one run in three on CI and never locally. The options are in the Inbox.", "fix-resume"),
      msg(person("marco"), "11:52 AM", "I can pair on the flake after lunch. It looks like the replay window closes before the last `tool_call_update` arrives."),
      msg(agent("codex"), "11:58 AM", "I need to run `cargo test -p warpforge daemon::tests::sessions` in the worktree. It's waiting for you in the Inbox.", "orc-05"),
    ],
  },
  "acme-web": {
    topic: "Marketing site and checkout.",
    members: { people: ["felipe", "dana"], agents: ["claude", "codex"], teams: [] },
    messages: [
      day("Today"),
      msg(person("dana"), "9:40 AM", "The pricing tiers read like a spec sheet. @codex one clause per feature line, and keep the tier names."),
      msg(agent("codex"), "9:44 AM", "Rewriting the tier table now. Starter and Team are done.", "web-13"),
      msg(person("felipe"), "10:05 AM", "@claude Apple Pay on checkout, please. Stop at plan first."),
      msg(agent("claude"), "10:31 AM", "The Payment Request button needs `@stripe/stripe-js`. Installing it needs network access, so I asked in the Inbox.", "web-12"),
    ],
  },
  payments: {
    topic: "payments-api. Money moves here, so risky steps always ask.",
    members: { people: ["felipe", "priya"], agents: ["codex", "goose", "claude"], teams: ["Reviewers"] },
    messages: [
      day("Today"),
      event("8:30 AM", "Priya Raman added team Reviewers: Codex, Goose"),
      msg(person("priya"), "8:34 AM", "@codex idempotency keys for refunds. A repeated key returns the first response."),
      msg(agent("codex"), "9:10 AM", "The migration is in. Writing the handler tests now.", "pay-31"),
      msg(agent("goose"), "9:26 AM", "Postgres 17 is up locally. Running the integration suite.", "pay-32"),
      msg(agent("claude"), "10:02 AM", "Draft PR #142 is open for webhook signature rotation. Both secrets verify during a 24-hour overlap.", "pay-29"),
    ],
  },
  warpforge: {
    topic: "Upstream Warpforge. Sync, don't fork.",
    members: { people: ["felipe"], agents: ["codex"], teams: [] },
    messages: [day("Monday"), msg(agent("codex"), "4:12 PM", "ADR 0024's verify stage merged upstream as #1311.", "wf-3")],
  },
  handbook: {
    topic: "The team handbook. Plain language, one screen per page.",
    members: { people: ["felipe", "dana"], agents: ["claude"], teams: [] },
    messages: [
      day("Yesterday"),
      msg(person("dana"), "2:10 PM", "@claude the on-call guide is too long to read during an incident. One screen per page."),
      msg(agent("claude"), "3:02 PM", "Split it into first hour, escalation, and handoff. The draft is ready for review.", "hb-4"),
    ],
  },
}
