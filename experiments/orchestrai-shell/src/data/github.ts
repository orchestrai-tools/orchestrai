import type { AgentId } from "@/data/agents"
import { findTask } from "@/data/tasks"
import type { ProjectId } from "@/lib/projects"

export type PullState = "draft" | "open" | "merged" | "closed"
export type Checks = "passing" | "failing" | "pending" | "none"
export type Review = "approved" | "changes-requested" | "review-required" | "none"

export interface Reviewer {
  login: string
  state: "requested" | "approved" | "changes-requested" | "commented"
}

export interface PullRequest {
  project: ProjectId
  number: number
  title: string
  /** The login it was opened with. A task opens its pull request with your own gh session. */
  author: string
  /** The agent that wrote the change, when a task opened it. */
  agent?: AgentId
  task?: string
  state: PullState
  checks: Checks
  review: Review
  reviewers: Reviewer[]
  branch: string
  base: string
  labels: string[]
  additions: number
  deletions: number
  files: number
  comments: number
  /** Unresolved inline threads and standing change requests: what "Address review comments" carries. */
  unresolved: number
  updated: string
  /** Minutes since the last update, for sorting. */
  age: number
  body: string
  /** Moved since you last looked. Kept per device, never synced. */
  unseen?: boolean
}

export interface Issue {
  project: ProjectId
  number: number
  title: string
  author: string
  state: "open" | "closed"
  labels: string[]
  assignee?: string
  task?: string
  /** The column on the repository's Projects board, read and never written back. */
  column?: string
  comments: number
  updated: string
  age: number
  body: string
  /** A pull request whose body closes this issue. */
  closedBy?: number
}

/** Your GitHub login: what "you" means in filters, and who tasks open pull requests as. */
export const ME = "fgusmao"

const pr = (entry: Omit<PullRequest, "reviewers" | "unresolved" | "comments"> & Partial<Pick<PullRequest, "reviewers" | "unresolved" | "comments">>): PullRequest => ({ reviewers: [], unresolved: 0, comments: 0, ...entry })

const SHELL_TRUNCATION = `Backlog: ORC-18

## Summary
Shell and log tools return the last lines, stdout, stderr, the exit code and whether the run timed out. The full output goes to a temp file whose path is in the result. Edit tools refuse old text that is missing or matches twice, and answer with a preview and the nearest match.

## Verification
- [x] \`cargo test -p warpforge mcp::tools\`: 41 passed
- [x] A 50,000-line command returns 40 lines and a file path
- [ ] CI on the latest push (fix attempt 2 of 3)

## Review
2 rounds · no open findings · deferred: rename \`Clipped::whole\` (low)

Cost: $1.84, as reported by Goose.`

const RESUME_FLAKE = `Closes #210

## Summary
\`resume_replays_once\` waits for the replay to settle before it counts updates, instead of sleeping 200 ms.

## CI
Failed on all 3 fix attempts. The test passes 50 times in a row locally and fails about one CI run in three, which points at replay de-duplication racing the reconnect, not at this change. The task stopped at its cap and is asking in Inbox.`

const TERMINAL_DRAWER = `Backlog: ORC-08 · Fixes #203

## Summary
A bottom drawer for terminals: a 28 px tab strip, one tab per session with its status (starting, running, exited), a resizable panel above it, and ⌃\` to toggle it. The page above keeps its scroll position.

## Verification
- [x] Opens over every page; tabs show live status
- [x] Scroll position kept on open and close
- [x] \`bun run lint && bun run typecheck\`

## Review
3 rounds · no open findings

Cost: not reported (Codex does not report cost).`

const PULLS: PullRequest[] = [
  pr({ project: "orchestrai", number: 216, title: "Shell truncation and unique-match edit", author: ME, task: "orc-18", state: "draft", checks: "pending", review: "none", branch: "orc-18-tool-hygiene", base: "main", labels: ["daemon"], additions: 203, deletions: 41, files: 6, comments: 2, updated: "1m ago", age: 1, body: SHELL_TRUNCATION, unseen: true }),
  pr({ project: "orchestrai", number: 214, title: "Sinew bottom terminal drawer", author: ME, task: "orc-08", state: "draft", checks: "passing", review: "none", branch: "orc-08-terminal-drawer", base: "main", labels: ["terminal"], additions: 488, deletions: 120, files: 11, comments: 1, updated: "35m ago", age: 35, body: TERMINAL_DRAWER }),
  pr({ project: "orchestrai", number: 215, title: "Fix flaky resume recovery test", author: ME, task: "fix-resume", state: "draft", checks: "failing", review: "none", branch: "fix-resume-flake", base: "main", labels: ["flaky-test", "ci"], additions: 37, deletions: 12, files: 3, comments: 4, updated: "1h ago", age: 60, body: RESUME_FLAKE }),
  pr({ project: "orchestrai", number: 217, title: "Bump tauri from 2.8.4 to 2.9.0 in /desktop/src-tauri", author: "dependabot[bot]", state: "open", checks: "passing", review: "review-required", reviewers: [{ login: ME, state: "requested" }], branch: "dependabot/cargo/desktop/src-tauri/tauri-2.9.0", base: "main", labels: ["dependencies", "rust"], additions: 12, deletions: 12, files: 2, updated: "3h ago", age: 180, body: "Bumps [tauri](https://github.com/tauri-apps/tauri) from 2.8.4 to 2.9.0.\n\n**Release notes:** window `set_traffic_light_position` on macOS, fixes a webview focus loss after `hide()`.\n\nDependabot will resolve any conflicts with this PR as long as you don't alter it yourself.", unseen: true }),
  pr({ project: "orchestrai", number: 213, title: "Desktop: hide the inspector below 1100 px instead of overlapping", author: "mkim", state: "open", checks: "passing", review: "changes-requested", reviewers: [{ login: ME, state: "changes-requested" }, { login: "rsilva", state: "approved" }], branch: "inspector-narrow", base: "main", labels: ["desktop", "ux"], additions: 64, deletions: 18, files: 4, comments: 6, unresolved: 2, updated: "Yesterday", age: 1500, body: "As the window narrows, the inspector now hides first (Apple's split-view rule) instead of sliding over the work.\n\n- Remembers that it was open, and comes back above 1100 px\n- ⌥⌘I still opens it as an overlay\n\nScreenshots in the thread." }),
  pr({ project: "orchestrai", number: 208, title: "Rename to Orchestrai and give it its own data directory", author: ME, task: "orc-01", state: "merged", checks: "passing", review: "approved", reviewers: [{ login: "rsilva", state: "approved" }], branch: "orc-01-rename", base: "main", labels: ["rename"], additions: 412, deletions: 397, files: 38, comments: 3, updated: "Yesterday", age: 1600, body: "Backlog: ORC-01 · Closes #202\n\nProduct name Orchestrai, bundle id `tools.orchestrai.desktop`, data directory `~/.orchestrai`. Project-level `.warpforge/workspace.yaml` still loads." }),
  pr({ project: "orchestrai", number: 211, title: "TUI: try vt100 0.16 for wide-character rendering", author: "mkim", state: "closed", checks: "failing", review: "none", branch: "vt100-016", base: "main", labels: ["tui"], additions: 9, deletions: 9, files: 2, comments: 2, updated: "Mon", age: 4300, body: "Closing: 0.16 changes `Screen::cell` and the TerminalPane needs a rewrite first." }),
  pr({ project: "orchestrai", number: 204, title: "Sync ADR 0024: verify stage in workflows", author: ME, state: "merged", checks: "passing", review: "approved", reviewers: [{ login: "mkim", state: "approved" }], branch: "sync-adr-0024", base: "main", labels: ["upstream"], additions: 88, deletions: 12, files: 4, updated: "Last week", age: 9000, body: "Brings warpforgehq/warpforge#1311 over: a `verify` stage that checks the running app in the browser." }),

  pr({ project: "acme-web", number: 88, title: "Pricing: tier table copy from marketing", author: "lchen", state: "open", checks: "pending", review: "review-required", reviewers: [{ login: ME, state: "requested" }], branch: "pricing-tier-copy", base: "main", labels: ["copy"], additions: 41, deletions: 37, files: 3, updated: "2h ago", age: 120, body: "Copy from the October pricing doc. The Team tier loses the word \"unlimited\"." }),
  pr({ project: "acme-web", number: 86, title: "Upgrade Next.js to 15.4", author: "rsilva", state: "open", checks: "failing", review: "none", branch: "next-15-4", base: "main", labels: ["dependencies"], additions: 120, deletions: 96, files: 9, comments: 1, updated: "Yesterday", age: 1400, body: "`next build` fails on the image loader config; looking." }),
  pr({ project: "acme-web", number: 87, title: "Fix CLS on the home hero", author: ME, task: "web-09", state: "merged", checks: "passing", review: "approved", reviewers: [{ login: "lchen", state: "approved" }], branch: "hero-cls", base: "main", labels: ["performance"], additions: 21, deletions: 30, files: 3, updated: "2d ago", age: 2900, body: "Linear: WEB-131\n\nReserves the hero image's box with `aspect-ratio`, so the headline no longer jumps. CLS 0.21 → 0.01 on the lab run." }),

  pr({ project: "payments", number: 142, title: "Webhook signature rotation", author: ME, task: "pay-29", state: "draft", checks: "passing", review: "none", branch: "webhook-rotation", base: "develop", labels: ["security", "webhooks"], additions: 198, deletions: 64, files: 6, comments: 1, updated: "1h ago", age: 70, body: "Closes #137\n\nTwo active signing secrets per endpoint during a rotation window; receivers verify against either. The old secret expires after 24 hours." }),
  pr({ project: "payments", number: 141, title: "Postgres 17: connection pool settings", author: "dkaur", state: "open", checks: "passing", review: "approved", reviewers: [{ login: ME, state: "approved" }], branch: "pg17-pool", base: "develop", labels: ["infra"], additions: 18, deletions: 6, files: 2, updated: "5h ago", age: 300, body: "Raises `max_conns` to 40 and turns on `pgbouncer` transaction pooling for the read replica." }),
  pr({ project: "payments", number: 140, title: "Prepare for Postgres 17", author: ME, state: "merged", checks: "passing", review: "approved", branch: "pg17-prep", base: "develop", labels: ["infra"], additions: 44, deletions: 31, files: 5, updated: "2d ago", age: 3000, body: "Drops the `pg_stat_statements` 1.9 pin and the `ltree` extension we no longer use." }),

  pr({ project: "warpforge", number: 1318, title: "Worktree seed: clonefile build directories", author: "wfmaint", state: "open", checks: "pending", review: "review-required", branch: "worktree-seed", base: "main", labels: ["worktrees"], additions: 233, deletions: 14, files: 7, comments: 4, updated: "4h ago", age: 240, body: "`seed:` entries are copied with `cp -c` (APFS clonefile), so a new worktree starts with a built `target/` in seconds." }),
  pr({ project: "warpforge", number: 1311, title: "Verify stage in workflow pipelines (ADR 0024)", author: ME, task: "wf-3", state: "merged", checks: "passing", review: "approved", branch: "sync-adr-0024", base: "main", labels: ["workflows"], additions: 88, deletions: 12, files: 4, updated: "Mon", age: 4400, body: "A `verify` stage that checks the running app in the browser before review." }),

  pr({ project: "handbook", number: 29, title: "Add the laptop setup page", author: "lchen", state: "open", checks: "none", review: "review-required", reviewers: [{ login: ME, state: "requested" }], branch: "laptop-setup", base: "main", labels: ["onboarding"], additions: 96, deletions: 0, files: 2, updated: "Yesterday", age: 1300, body: "Covers Homebrew, the VPN profile, and the first `bun install`." }),
]

/** Pull requests a task opened report the task's own state and checks, so the two never disagree. */
function linked(entry: PullRequest): PullRequest {
  const task = findTask(entry.task)
  if (!task?.pr) return entry
  return { ...entry, agent: task.agent, state: task.pr.state, checks: task.pr.checks }
}

export function pullsFor(project: ProjectId): PullRequest[] {
  return PULLS.filter((entry) => entry.project === project).map(linked)
}

export { ISSUES, issuesFor } from "@/data/github-issues"
