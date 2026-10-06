import type { Issue } from "@/data/github"
import type { ProjectId } from "@/lib/projects"

const i = (entry: Omit<Issue, "state" | "comments"> & Partial<Pick<Issue, "state" | "comments">>): Issue => ({ state: "open", comments: 0, ...entry })

export const ISSUES: readonly Issue[] = [
  i({ project: "orchestrai", number: 220, title: "Pull requests page: show CI fix attempts on task pull requests", author: "fgusmao", labels: ["enhancement", "github"], assignee: "fgusmao", column: "Ready", comments: 1, updated: "20m ago", age: 20, body: "A task past its last stop pushes, watches CI and fixes failures up to a cap. The pull request row should say **fix 2 of 3**, and say plainly when the cap was hit and the task stopped to ask." }),
  i({ project: "orchestrai", number: 218, title: "Session board: Fork is hidden for Codex sessions started outside the app", author: "mkim", labels: ["bug", "sessions"], column: "Triage", comments: 3, updated: "2h ago", age: 120, body: "Codex advertises `session/fork`, but a session started in a terminal shows only **Continue** on its tile.\n\n**Steps**\n1. `codex` in a terminal, send one prompt, quit\n2. Open the session board\n3. The tile has Continue and no Fork\n\nExpected: Fork, since the agent supports it." }),
  i({ project: "orchestrai", number: 219, title: "Upstream: cherry-pick the Warpforge 0.22 worktree fixes", author: "fgusmao", labels: ["upstream", "chore"], column: "Backlog", updated: "3h ago", age: 180, body: "0.22 fixes the merge-back after a restart (ADR 0015 amendment) and the orphaned worktree on delete. Take both before the next upstream merge." }),
  i({ project: "orchestrai", number: 210, title: "resume_replays_once flakes on CI", author: "rsilva", labels: ["bug", "flaky-test", "ci"], assignee: "fgusmao", task: "fix-resume", column: "In progress", comments: 5, updated: "1h ago", age: 60, closedBy: 215, body: "`daemon::tests::sessions::resume_replays_once` fails about one run in three on the macOS runner and has never failed locally.\n\n```\nassertion `left == right` failed: replayed 2 updates, expected 1\n```" }),
  i({ project: "orchestrai", number: 203, title: "Terminal drawer: scrollback is lost after the drawer closes", author: "rsilva", labels: ["bug", "terminal"], column: "In review", comments: 2, updated: "35m ago", age: 35, closedBy: 214, body: "Close the drawer, open it again: the shell is still running, but the scrollback is empty." }),
  i({ project: "orchestrai", number: 209, title: "Changes: Discard should name the files it drops", author: "mkim", labels: ["enhancement", "ux"], column: "Ready", comments: 2, updated: "Yesterday", age: 1450, body: "The rollback button asks for a second click but never says which files go. The confirmation should list them." }),
  i({ project: "orchestrai", number: 207, title: "Factory: say why a queued task is waiting", author: "fgusmao", labels: ["enhancement", "factory"], column: "Backlog", updated: "2d ago", age: 2900, body: "A queued Factory task shows *Queued* and nothing else. The daemon already knows the hold (slots, open PRs, quota, disk); show it." }),
  i({ project: "orchestrai", number: 206, title: "Jujutsu: show jj status beside git", author: "jpark", labels: ["investigation", "vcs"], column: "Backlog", comments: 7, updated: "Last week", age: 9500, body: "Probe `jj --version`; when a repo is colocated, show the jj change id next to the branch. Investigation only, no driver yet." }),
  i({ project: "orchestrai", number: 205, title: "Docs search ignores text inside code fences", author: "mkim", labels: ["bug", "docs"], column: "Triage", comments: 1, updated: "Mon", age: 4500, body: "Searching for `prepare_cached` finds nothing, though three pages have it in a Rust fence." }),
  i({ project: "orchestrai", number: 201, title: "Drive a running task from my phone", author: "lchen", labels: ["enhancement", "remote"], column: "Backlog", comments: 9, updated: "2 weeks ago", age: 20000, body: "Approve a permission or answer a stopped task from my phone when I am away from the desk. Off the office network too." }),
  i({ project: "orchestrai", number: 202, title: "About window still says Warpforge", author: "jpark", state: "closed", labels: ["bug"], closedBy: 208, updated: "Yesterday", age: 1600, body: "Help → About shows the Warpforge name and icon." }),

  i({ project: "acme-web", number: 90, title: "Hero image is blurry on retina displays", author: "lchen", labels: ["bug", "design"], column: "Triage", comments: 2, updated: "6h ago", age: 360, body: "The hero serves the 1x image at 2x DPR since the CLS fix." }),

  i({ project: "payments", number: 139, title: "Refund retries create duplicate refunds", author: "dkaur", labels: ["bug", "refunds"], assignee: "fgusmao", task: "pay-31", column: "In progress", comments: 4, updated: "Just now", age: 0, body: "A client timeout followed by a retry refunds the charge twice. Seen 3 times this week on ch_3Pq9…" }),
  i({ project: "payments", number: 137, title: "Rotate webhook signing secrets without downtime", author: "dkaur", labels: ["security", "webhooks"], task: "pay-29", column: "In review", closedBy: 142, comments: 2, updated: "1h ago", age: 70, body: "Receivers need to accept the old and the new secret for a window." }),
  i({ project: "payments", number: 136, title: "Upgrade to Postgres 17", author: "fgusmao", labels: ["infra"], task: "pay-32", column: "In progress", updated: "3m ago", age: 3, body: "RDS supports 17.2 now. Run the integration suite against it first." }),
  i({ project: "payments", number: 133, title: "Payout report rounds EUR amounts twice", author: "dkaur", labels: ["bug", "reports"], column: "Ready", comments: 1, updated: "3d ago", age: 4400, body: "Amounts are rounded per line and again on the total." }),

  i({ project: "warpforge", number: 1320, title: "Inbox: show Merged instead of Closed", author: "wfmaint", labels: ["inbox"], column: "Ready", comments: 3, updated: "Yesterday", age: 1300, body: "`mergedAt` travels now; the rail can stop saying Closed for both." }),

  i({ project: "handbook", number: 27, title: "On-call guide is out of date", author: "lchen", labels: ["docs"], task: "hb-4", column: "In review", comments: 1, updated: "Yesterday", age: 1500, body: "Escalation timings changed in September." }),
]

export function issuesFor(project: ProjectId): Issue[] {
  return ISSUES.filter((entry) => entry.project === project)
}
