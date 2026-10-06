import type { AgentId } from "@/data/agents"
import type { ProjectId } from "@/lib/projects"

/** Reported by the agent's ACP session, never guessed from terminal output. */
export type RunStatus = "running" | "needs-you" | "review" | "queued" | "done" | "stopped" | "failed"
/** Autonomy is a dial per task (suggest, draft, execute). */
export type Autonomy = "suggest" | "draft" | "execute"
export type Stage = "requirements" | "plan" | "implement" | "review" | "verify" | "merge"

/** One run of work: a goal, its own worktree, and a visible status. */
export interface Task {
  id: string
  project: ProjectId
  title: string
  /** The one line a board card shows. */
  summary: string
  status: RunStatus
  agent: AgentId
  workflow: string
  stage: Stage
  /** Where the run stops for a person (Shep): requirements, plan, or merge. */
  stopPoints: Stage[]
  branch: string
  worktree: string
  autonomy: Autonomy
  updated: string
  elapsed: string
  changes: { files: number; additions: number; deletions: number }
  pr?: { number: number; state: "draft" | "open" | "merged"; checks: "passing" | "failing" | "pending" }
  /** CI fix attempts, when the run is past the last stop. */
  attempts?: { used: number; cap: number }
}

const t = (task: Omit<Task, "worktree"> & { worktree?: string }): Task => ({
  ...task,
  worktree: task.worktree ?? `.warpforge/worktrees/${task.branch}`,
})

export const TASKS: readonly Task[] = [
  t({ id: "orc-03", project: "orchestrai", title: "Docs library: rendered page and markdown editor", summary: "Editor pane synced to the rendered page; 9 of 14 steps done", status: "running", agent: "claude", workflow: "Plan → Implement → Review", stage: "implement", stopPoints: ["plan", "merge"], branch: "orc-03-docs-library", autonomy: "draft", updated: "Just now", elapsed: "42m", changes: { files: 14, additions: 612, deletions: 88 } }),
  t({ id: "orc-05", project: "orchestrai", title: "Mission Control board with continue and fork", summary: "Wants to run the session resume tests", status: "needs-you", agent: "codex", workflow: "Plan → Implement → Review", stage: "implement", stopPoints: ["plan", "merge"], branch: "orc-05-session-board", autonomy: "draft", updated: "2m ago", elapsed: "1h 08m", changes: { files: 9, additions: 341, deletions: 52 } }),
  t({ id: "orc-10", project: "orchestrai", title: "Permission profiles and modes", summary: "Stopped: is the denylist checked before a project allowlist?", status: "stopped", agent: "gemini", workflow: "Plan → Implement → Review", stage: "plan", stopPoints: ["requirements", "plan", "merge"], branch: "orc-10-permission-profiles", autonomy: "suggest", updated: "18m ago", elapsed: "25m", changes: { files: 2, additions: 64, deletions: 0 } }),
  t({ id: "orc-08", project: "orchestrai", title: "Sinew bottom terminal drawer", summary: "Draft PR #214 open; checks passing", status: "review", agent: "codex", workflow: "Plan → Implement → Review", stage: "merge", stopPoints: ["merge"], branch: "orc-08-terminal-drawer", autonomy: "execute", updated: "35m ago", elapsed: "2h 14m", changes: { files: 11, additions: 488, deletions: 120 }, pr: { number: 214, state: "draft", checks: "passing" } }),
  t({ id: "orc-18", project: "orchestrai", title: "Shell truncation and unique-match edit", summary: "Watching CI after fix attempt 2 of 3", status: "running", agent: "goose", workflow: "Implement → Verify", stage: "verify", stopPoints: ["merge"], branch: "orc-18-tool-hygiene", autonomy: "execute", updated: "1m ago", elapsed: "51m", changes: { files: 6, additions: 203, deletions: 41 }, pr: { number: 216, state: "draft", checks: "pending" }, attempts: { used: 2, cap: 3 } }),
  t({ id: "fix-resume", project: "orchestrai", title: "Fix flaky resume recovery test", summary: "CI failed 3 of 3 attempts; stopped and asking", status: "failed", agent: "claude", workflow: "Implement → Verify", stage: "verify", stopPoints: ["merge"], branch: "fix-resume-flake", autonomy: "execute", updated: "1h ago", elapsed: "1h 40m", changes: { files: 3, additions: 37, deletions: 12 }, pr: { number: 215, state: "draft", checks: "failing" }, attempts: { used: 3, cap: 3 } }),
  t({ id: "orc-02", project: "orchestrai", title: "Upstream sync policy", summary: "Waiting for a free worker", status: "queued", agent: "codex", workflow: "Plan → Implement → Review", stage: "requirements", stopPoints: ["plan"], branch: "orc-02-upstream-sync", autonomy: "draft", updated: "3h ago", elapsed: "—", changes: { files: 0, additions: 0, deletions: 0 } }),
  t({ id: "orc-01", project: "orchestrai", title: "Rename to Orchestrai and give it its own data directory", summary: "Merged as #208; memory written", status: "done", agent: "claude", workflow: "Plan → Implement → Review", stage: "merge", stopPoints: ["plan", "merge"], branch: "orc-01-rename", autonomy: "draft", updated: "Yesterday", elapsed: "3h 02m", changes: { files: 38, additions: 412, deletions: 397 }, pr: { number: 208, state: "merged", checks: "passing" } }),

  t({ id: "web-12", project: "acme-web", title: "Checkout: Apple Pay button", summary: "Wants network access to install @stripe/stripe-js", status: "needs-you", agent: "claude", workflow: "Plan → Implement → Review", stage: "implement", stopPoints: ["plan", "merge"], branch: "checkout-apple-pay", autonomy: "draft", updated: "4m ago", elapsed: "22m", changes: { files: 5, additions: 140, deletions: 8 } }),
  t({ id: "web-13", project: "acme-web", title: "Pricing page copy refresh", summary: "Rewriting the tier table; 3 of 5 sections", status: "running", agent: "codex", workflow: "Implement → Verify", stage: "implement", stopPoints: ["merge"], branch: "pricing-copy", autonomy: "execute", updated: "Just now", elapsed: "15m", changes: { files: 2, additions: 66, deletions: 49 } }),
  t({ id: "web-09", project: "acme-web", title: "Fix CLS on the home hero", summary: "Merged as #87", status: "done", agent: "goose", workflow: "Implement → Verify", stage: "merge", stopPoints: ["merge"], branch: "hero-cls", autonomy: "execute", updated: "2d ago", elapsed: "48m", changes: { files: 3, additions: 21, deletions: 30 }, pr: { number: 87, state: "merged", checks: "passing" } }),

  t({ id: "pay-31", project: "payments", title: "Idempotency keys for refunds", summary: "Writing migration and handler tests", status: "running", agent: "codex", workflow: "Plan → Implement → Review", stage: "implement", stopPoints: ["plan", "merge"], branch: "refund-idempotency", autonomy: "draft", updated: "Just now", elapsed: "37m", changes: { files: 7, additions: 255, deletions: 19 } }),
  t({ id: "pay-32", project: "payments", title: "Upgrade to Postgres 17", summary: "Running the integration suite", status: "running", agent: "goose", workflow: "Implement → Verify", stage: "verify", stopPoints: ["merge"], branch: "pg17", autonomy: "execute", updated: "3m ago", elapsed: "1h 12m", changes: { files: 4, additions: 30, deletions: 22 }, attempts: { used: 1, cap: 3 } }),
  t({ id: "pay-29", project: "payments", title: "Webhook signature rotation", summary: "Draft PR #142; waiting on review", status: "review", agent: "claude", workflow: "Plan → Implement → Review", stage: "merge", stopPoints: ["merge"], branch: "webhook-rotation", autonomy: "draft", updated: "1h ago", elapsed: "2h 30m", changes: { files: 6, additions: 198, deletions: 64 }, pr: { number: 142, state: "draft", checks: "passing" } }),

  t({ id: "wf-3", project: "warpforge", title: "Sync ADR 0024 verify stage", summary: "Merged upstream as #1311", status: "done", agent: "codex", workflow: "Implement → Verify", stage: "merge", stopPoints: ["merge"], branch: "sync-adr-0024", autonomy: "execute", updated: "Mon", elapsed: "54m", changes: { files: 4, additions: 88, deletions: 12 }, pr: { number: 1311, state: "merged", checks: "passing" } }),
  t({ id: "hb-4", project: "handbook", title: "Rewrite the on-call guide", summary: "Draft ready for review", status: "review", agent: "claude", workflow: "Draft → Review", stage: "review", stopPoints: ["merge"], branch: "on-call-guide", autonomy: "draft", updated: "Yesterday", elapsed: "40m", changes: { files: 3, additions: 220, deletions: 140 } }),
]

export function tasksFor(project: ProjectId): Task[] {
  return TASKS.filter((task) => task.project === project)
}

export function findTask(id: string | undefined): Task | undefined {
  return TASKS.find((task) => task.id === id)
}

/** Board columns, in the order a person acts on them: what needs you first. */
export const BOARD_COLUMNS: readonly { id: string; title: string; statuses: RunStatus[] }[] = [
  { id: "attention", title: "Needs you", statuses: ["needs-you", "stopped", "failed"] },
  { id: "running", title: "Running", statuses: ["running", "queued"] },
  { id: "review", title: "In review", statuses: ["review"] },
  { id: "done", title: "Done", statuses: ["done"] },
]
