import { ISSUES, ME } from "@/data/github"
import { LOCAL_ITEMS } from "@/data/backlog-local"
import type { ProjectId } from "@/lib/projects"

export type ItemSource = "local" | "github" | "linear"
export type ItemStatus = "todo" | "in_progress" | "waiting" | "done" | "cancelled"
export type Priority = "urgent" | "high" | "medium" | "low" | "none"
export type Size = "S" | "M" | "L"

/** One piece of work someone wants done, from whichever tracker holds it. Not a task: a task is a run. */
export interface WorkItem {
  id: string
  project: ProjectId
  /** As the source numbers it: ORC-15, #218, WEB-142. */
  number: string
  title: string
  body: string
  source: ItemSource
  status: ItemStatus
  /** The tracker's own word for the status (a board column, a Linear state). Shown, never written back. */
  remoteStatus?: string
  /** Ours, whatever the source: no tracker sync writes over it. */
  priority: Priority
  /** S is a day or two, M about a week, L more than a week. */
  size?: Size
  assignee?: string
  labels: string[]
  task?: string
  created: string
  updated: string
  /** Minutes since the last change, for sorting. */
  age: number
  url?: string
}

/** Board columns are named by whoever built the board, so they match by substring; an unknown one leaves open work at To do. */
function fromColumn(column?: string): ItemStatus {
  const name = column?.toLowerCase() ?? ""
  if (name.includes("progress")) return "in_progress"
  if (name.includes("review")) return "waiting"
  return "todo"
}

const ISSUE_PRIORITY: Record<string, Priority> = {
  "orchestrai#210": "urgent",
  "orchestrai#218": "high",
  "orchestrai#203": "high",
  "orchestrai#209": "medium",
  "orchestrai#220": "medium",
  "orchestrai#207": "medium",
  "orchestrai#205": "low",
  "payments#139": "urgent",
  "payments#137": "high",
  "payments#136": "medium",
}

const REPO: Record<ProjectId, string> = {
  orchestrai: "orchestrai-tools/orchestrai",
  warpforge: "warpforgehq/warpforge",
  "acme-web": "acme/web",
  handbook: "acme/handbook",
  payments: "acme/payments-api",
}

/** Open GitHub issues as the import adopts them: one listing, deduplicated on the issue number. */
const IMPORTED: WorkItem[] = ISSUES.filter((issue) => issue.state === "open").map((issue) => ({
  id: `gh-${issue.project}-${issue.number}`,
  project: issue.project,
  number: `#${issue.number}`,
  title: issue.title,
  body: issue.body,
  source: "github",
  status: fromColumn(issue.column),
  remoteStatus: issue.column ?? "Open",
  priority: ISSUE_PRIORITY[`${issue.project}#${issue.number}`] ?? "none",
  assignee: issue.assignee,
  labels: issue.labels,
  task: issue.task,
  created: issue.age > 10000 ? "3 weeks ago" : issue.age > 2000 ? "Last week" : "This week",
  updated: issue.updated,
  age: issue.age,
  url: `https://github.com/${REPO[issue.project]}/issues/${issue.number}`,
}))

const LINEAR: WorkItem[] = [
  { id: "lin-web-142", project: "acme-web", number: "WEB-142", title: "Apple Pay at checkout", body: "Offer Apple Pay above the card form in Safari when the visitor has a card in Wallet. US only at launch.", source: "linear", status: "in_progress", remoteStatus: "In Progress", priority: "high", size: "M", assignee: ME, labels: ["checkout"], task: "web-12", created: "Last week", updated: "4m ago", age: 4, url: "https://linear.app/acme/issue/WEB-142" },
  { id: "lin-web-139", project: "acme-web", number: "WEB-139", title: "Pricing page copy refresh", body: "Marketing's October copy for the tier table and the FAQ.", source: "linear", status: "in_progress", remoteStatus: "In Progress", priority: "medium", size: "S", assignee: ME, labels: ["copy"], task: "web-13", created: "Last week", updated: "Just now", age: 0, url: "https://linear.app/acme/issue/WEB-139" },
  { id: "lin-web-147", project: "acme-web", number: "WEB-147", title: "Cookie banner: respect the Global Privacy Control signal", body: "When `navigator.globalPrivacyControl` is true, treat it as an opt-out and do not show the banner.", source: "linear", status: "todo", remoteStatus: "Todo", priority: "urgent", size: "S", assignee: "lchen", labels: ["privacy"], created: "This week", updated: "1h ago", age: 60, url: "https://linear.app/acme/issue/WEB-147" },
  { id: "lin-web-145", project: "acme-web", number: "WEB-145", title: "Gift cards at checkout", body: "Redeem a gift card code before the payment method. Partial balances leave the rest to the card.", source: "linear", status: "todo", remoteStatus: "Todo", priority: "high", size: "L", labels: ["checkout"], created: "Last week", updated: "Yesterday", age: 1400, url: "https://linear.app/acme/issue/WEB-145" },
  { id: "lin-web-150", project: "acme-web", number: "WEB-150", title: "Search: tolerate one typo per word", body: "", source: "linear", status: "todo", remoteStatus: "Backlog", priority: "low", labels: ["search"], created: "2 weeks ago", updated: "3d ago", age: 4300, url: "https://linear.app/acme/issue/WEB-150" },
  { id: "lin-web-131", project: "acme-web", number: "WEB-131", title: "Fix CLS on the home hero", body: "Lab CLS 0.21 on the home page; the headline jumps when the hero image loads.", source: "linear", status: "done", remoteStatus: "Done", priority: "high", size: "S", assignee: ME, labels: ["performance"], task: "web-09", created: "2 weeks ago", updated: "2d ago", age: 2900, url: "https://linear.app/acme/issue/WEB-131" },
]

export const WORK_ITEMS: readonly WorkItem[] = [...LOCAL_ITEMS, ...IMPORTED, ...LINEAR]

export function workItemsFor(project: ProjectId): WorkItem[] {
  return WORK_ITEMS.filter((item) => item.project === project)
}

/** A task started here gets an id the board can show, from the item's own number. */
export function taskIdFor(item: Pick<WorkItem, "number" | "source">) {
  return item.source === "github" ? `gh-${item.number.slice(1)}` : item.number.toLowerCase()
}

/** Which trackers each project can reach: Linear only through a team it was pointed at. */
export const SOURCES: Record<ProjectId, { github: boolean; linearTeam?: string }> = {
  orchestrai: { github: true },
  warpforge: { github: true },
  "acme-web": { github: true, linearTeam: "Acme Web (WEB)" },
  handbook: { github: true },
  payments: { github: true },
}

export type FactoryState = "queued" | "running" | "delivering" | "delivered"

/** A Factory task for one backlog item: a workflow run that commits and opens a draft pull request. */
export interface FactoryEntry {
  item: string
  task: string
  state: FactoryState
  pr?: number
  /** Why this queued task, and only this one, is not starting yet. */
  wait?: string
}

export interface FactorySettings {
  maxConcurrent: number
  maxOpenPrs: number
  maxPerDay: number
  minFreeGb: number
  headroomPct: number
  location: "auto" | "worktree" | "checkout"
  workflow: string
  agent: string
}

export const FACTORY_DEFAULTS: FactorySettings = { maxConcurrent: 1, maxOpenPrs: 3, maxPerDay: 10, minFreeGb: 10, headroomPct: 80, location: "auto", workflow: "Plan → Implement → Review", agent: "codex" }

export const FACTORY: Partial<Record<ProjectId, { entries: FactoryEntry[]; startedToday: number }>> = {
  orchestrai: {
    startedToday: 4,
    entries: [
      { item: "orc-18", task: "orc-18", state: "delivered", pr: 216 },
      { item: "gh-orchestrai-210", task: "fix-resume", state: "delivered", pr: 215 },
      { item: "orc-08", task: "orc-08", state: "delivered", pr: 214 },
      { item: "orc-23", task: "orc-23", state: "queued" },
      { item: "orc-09", task: "orc-09", state: "queued", wait: "Gemini CLI is signed out; the next item whose agents are ready goes first" },
    ],
  },
}
