import type { AgentId } from "@/data/agents"
import type { Stage } from "@/data/tasks"
import type { ProjectId } from "@/lib/projects"

/** The shape the person picked; the cron is always stored expanded, so there is one code path for "when next". */
export type SchedulePreset = "hourly" | "every5" | "daily" | "weekdays" | "weekly" | "custom"

export type AutomationTrigger =
  | { kind: "schedule"; preset: SchedulePreset; cron: string; timezone: string }
  | { kind: "issue"; repo: string; filter: string }
  | { kind: "label"; repo: string; label: string }
  | { kind: "review"; repo: string; filter: string }

export type RunOutcome =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped_precheck"
  | "skipped_missed"
  | "skipped_running"
  | "skipped_quota"

export const OUTCOME: Record<RunOutcome, { label: string; hint: string }> = {
  pending: { label: "Pending", hint: "Waiting for the precheck before any work starts." },
  running: { label: "Running", hint: "Its task is running right now." },
  completed: { label: "Completed", hint: "The task finished its run." },
  failed: { label: "Failed", hint: "The task started but did not finish." },
  skipped_precheck: { label: "Skipped · precheck", hint: "The precheck did not authorize this run." },
  skipped_missed: { label: "Skipped · missed", hint: "Came due while OrchestrAI was closed, past the grace window." },
  skipped_running: { label: "Skipped · overlap", hint: "The previous run of this automation had not finished." },
  skipped_quota: { label: "Skipped · quota", hint: "The agent's account was out of quota, so no work started." },
}

export interface AutomationRun {
  /** Monotonic per automation, never reissued after history is pruned. */
  number: number
  by: "schedule" | "manual" | "event"
  /** What fired an event run, e.g. "issue #231". */
  cause?: string
  status: RunOutcome
  /** Local ISO time the run started. */
  at: string
  duration?: string
  task?: string
  /** The first lines of the task's closing message; the full transcript stays on the task. */
  output?: string
  error?: string
}

/** A trigger that creates a task. It never talks to a model itself; the task it starts does. */
export interface Automation {
  id: string
  project: ProjectId
  name: string
  trigger: AutomationTrigger
  /** The workflow each task runs, or "No workflow" for a single agent. */
  workflow: string
  goal: string
  params?: Record<string, string>
  agent: AgentId
  /** Pinned so a scheduled run never drifts onto another model. */
  model?: string
  stops: Stage[]
  /** `sh -c` in the project folder before a scheduled run; non-zero skips it. */
  precheck?: string
  graceMinutes: number
  /** Every run continues one task instead of creating a new one. */
  reuseTask: boolean
  worktree: boolean
  base: "head" | "origin" | { branch: string }
  openPr: boolean
  enabled: boolean
  pausedNote?: string
  lastPolled?: string
  created: string
  runs: AutomationRun[]
}

const NY = "America/New_York"
const ORC_REPO = "orchestrai-tools/orchestrai"

export const AUTOMATIONS: readonly Automation[] = [
  {
    id: "nightly-clippy",
    project: "orchestrai",
    name: "Nightly clippy sweep",
    trigger: { kind: "schedule", preset: "weekdays", cron: "30 2 * * MON-FRI", timezone: NY },
    workflow: "Clippy sweep",
    goal: "Sweep the workspace for clippy warnings that landed on main since the last run.",
    params: { crate: "--workspace" },
    agent: "codex",
    model: "gpt-5.6",
    stops: ["merge"],
    precheck: `git fetch --quiet && test -n "$(git log -1 --since=24.hours origin/main)"`,
    graceMinutes: 720,
    reuseTask: false,
    worktree: true,
    base: "origin",
    openPr: true,
    enabled: true,
    created: "Aug 14",
    runs: [
      { number: 38, by: "schedule", status: "completed", at: "2026-10-01T02:30", duration: "41m", task: "clip-38", output: "Fixed 14 warnings in src/daemon/actor/ and src/mcp/. Clippy is clean. Draft PR #217 opened." },
      { number: 37, by: "schedule", status: "completed", at: "2026-09-30T02:30", duration: "22m", task: "clip-37", output: "Fixed 3 warnings (needless_borrow ×2, redundant_clone). Draft PR #212, merged Wednesday." },
      { number: 36, by: "schedule", status: "skipped_precheck", at: "2026-09-29T02:30", error: "precheck exited with 1: no commits on origin/main in the last 24 hours" },
      { number: 35, by: "schedule", status: "completed", at: "2026-09-28T02:30", duration: "1h 05m", task: "clip-35", output: "Fixed 9 warnings. 2 need a design call (large_enum_variant on Command); filed as one backlog item." },
      { number: 34, by: "schedule", status: "skipped_missed", at: "2026-09-25T02:30", error: "Came due while OrchestrAI was closed, past the 12-hour grace window." },
    ],
  },
  {
    id: "triage-issues",
    project: "orchestrai",
    name: "Triage new issues",
    trigger: { kind: "issue", repo: ORC_REPO, filter: "Opened by a person, not a bot" },
    workflow: "Triage an issue",
    goal: "Triage issue #{{issue.number}}: {{issue.title}}",
    params: { issue: "{{issue.number}}" },
    agent: "codex",
    model: "gpt-5.6",
    stops: [],
    graceMinutes: 720,
    reuseTask: false,
    worktree: false,
    base: "head",
    openPr: false,
    enabled: true,
    lastPolled: "1m ago",
    created: "Sep 18",
    runs: [
      { number: 112, by: "event", cause: "issue #231", status: "completed", at: "2026-10-01T15:42", duration: "3m", task: "tri-231", output: "#231 “Drawer loses scrollback on resize” → area terminal, severity medium, labels bug and terminal. Next: fix. Not a duplicate." },
      { number: 111, by: "event", cause: "issue #230", status: "completed", at: "2026-10-01T11:08", duration: "2m", task: "tri-230", output: "#230 “Support jj workspaces” → area vcs, severity low. Next: needs-info; asked which jj version." },
      { number: 110, by: "event", cause: "issue #229", status: "failed", at: "2026-09-30T18:20", duration: "6m", task: "tri-229", error: "The reply did not match the schema after 2 retries. Labeled needs-triage for a person." },
      { number: 109, by: "event", cause: "issue #228", status: "completed", at: "2026-09-30T09:51", duration: "2m", task: "tri-228", output: "#228 is a duplicate of #201. Commented with the link and closed it." },
    ],
  },
  {
    id: "agent-ready",
    project: "orchestrai",
    name: "Fix issues labeled agent-ready",
    trigger: { kind: "label", repo: ORC_REPO, label: "agent-ready" },
    workflow: "Implement → Verify",
    goal: "Fix #{{issue.number}}: {{issue.title}}\n\n{{issue.body}}",
    agent: "claude",
    model: "claude-sonnet-5.5",
    stops: ["merge"],
    graceMinutes: 720,
    reuseTask: false,
    worktree: true,
    base: "origin",
    openPr: true,
    enabled: true,
    lastPolled: "1m ago",
    created: "Sep 2",
    runs: [
      { number: 8, by: "event", cause: "#224 labeled agent-ready", status: "running", at: "2026-10-01T15:05", task: "orc-18", output: "Watching CI after fix attempt 2 of 3." },
      { number: 7, by: "event", cause: "#219 labeled agent-ready", status: "failed", at: "2026-10-01T13:16", duration: "1h 40m", task: "fix-resume", error: "CI failed 3 of 3 fix attempts. The task stopped and is asking you." },
      { number: 6, by: "event", cause: "#205 labeled agent-ready", status: "completed", at: "2026-09-28T10:12", duration: "2h 02m", task: "orc-205", output: "Draft PR #209 opened; merged Tuesday." },
    ],
  },
  {
    id: "pr-digest",
    project: "orchestrai",
    name: "Morning PR digest",
    trigger: { kind: "schedule", preset: "weekdays", cron: "0 9 * * MON-FRI", timezone: NY },
    workflow: "No workflow",
    goal: "Summarize every open pull request: checks, reviews, and what needs me. One line each, worst first.",
    agent: "claude",
    model: "claude-sonnet-5.5",
    stops: [],
    precheck: `test "$(gh pr list --json number -q length)" -gt 0`,
    graceMinutes: 120,
    reuseTask: true,
    worktree: false,
    base: "head",
    openPr: false,
    enabled: true,
    created: "Jul 30",
    runs: [
      { number: 61, by: "schedule", status: "completed", at: "2026-10-01T09:00", duration: "4m", task: "pr-digest", output: "4 open. #215 resume flake: CI red 3 of 3. #214 drawer: green, waiting on you. #216 tool hygiene: CI running. #213 docs: approved." },
      { number: 60, by: "schedule", status: "completed", at: "2026-09-30T09:00", duration: "3m", task: "pr-digest", output: "3 open. #214 drawer: needs review. #213 docs: one remark open. #212 clippy sweep: approved." },
      { number: 59, by: "manual", status: "completed", at: "2026-09-29T14:12", duration: "3m", task: "pr-digest", output: "2 open. #213 docs: waiting on CI. #212 clippy sweep: approved." },
      { number: 58, by: "schedule", status: "completed", at: "2026-09-29T09:00", duration: "2m", task: "pr-digest", output: "2 open. #212 clippy sweep: needs review. #211 rename: merged." },
    ],
  },
  {
    id: "weekly-deps",
    project: "orchestrai",
    name: "Weekly dependency check",
    trigger: { kind: "schedule", preset: "weekly", cron: "0 7 * * MON", timezone: NY },
    workflow: "Implement → Verify",
    goal: "Bump patch and minor versions of Rust and desktop dependencies. Skip anything that needs a code change.",
    agent: "goose",
    model: "claude-opus-5.5",
    stops: ["merge"],
    graceMinutes: 720,
    reuseTask: false,
    worktree: true,
    base: "origin",
    openPr: true,
    enabled: true,
    created: "Jun 9",
    runs: [
      { number: 12, by: "schedule", status: "skipped_quota", at: "2026-09-28T07:00", error: "Goose's Anthropic account was at 100% of its weekly window (resets Thu 18:00)." },
      { number: 11, by: "schedule", status: "completed", at: "2026-09-21T07:00", duration: "1h 12m", task: "deps-11", output: "Bumped tokio 1.47 → 1.48 and ratatui 0.29.0 → 0.29.1. cargo test green. Draft PR #203, merged." },
      { number: 10, by: "schedule", status: "completed", at: "2026-09-14T07:00", duration: "48m", task: "deps-10", output: "Nothing to bump; cargo outdated and bun outdated are clean." },
    ],
  },
  {
    id: "review-remarks",
    project: "orchestrai",
    name: "Address review remarks",
    trigger: { kind: "review", repo: ORC_REPO, filter: "Changes requested on a pull request labeled agent" },
    workflow: "Implement → Review",
    goal: "Address the review remarks on #{{pr.number}}. Push back, with a reason, on any you disagree with.",
    agent: "codex",
    model: "gpt-5.6",
    stops: ["plan"],
    graceMinutes: 720,
    reuseTask: false,
    worktree: true,
    base: { branch: "{{pr.head}}" },
    openPr: false,
    enabled: false,
    pausedNote: "Paused Monday by you",
    created: "Sep 20",
    runs: [
      { number: 4, by: "event", cause: "PR #207: 3 remarks from @mkim", status: "completed", at: "2026-09-25T16:30", duration: "38m", task: "rev-207", output: "Addressed 2 remarks. Pushed back on 1: renaming the protocol crate would break the wire with upstream." },
      { number: 3, by: "event", cause: "PR #204: 1 remark from @mkim", status: "completed", at: "2026-09-22T11:02", duration: "21m", task: "rev-204", output: "Renamed the flag and updated the docs." },
    ],
  },
  {
    id: "web-triage",
    project: "acme-web",
    name: "Triage new issues",
    trigger: { kind: "issue", repo: "acme/web", filter: "Opened by a person, not a bot" },
    workflow: "Triage an issue",
    goal: "Triage issue #{{issue.number}}: {{issue.title}}",
    params: { issue: "{{issue.number}}" },
    agent: "claude",
    stops: [],
    graceMinutes: 720,
    reuseTask: false,
    worktree: false,
    base: "head",
    openPr: false,
    enabled: true,
    lastPolled: "2m ago",
    created: "Sep 19",
    runs: [
      { number: 45, by: "event", cause: "issue #312", status: "completed", at: "2026-10-01T14:20", duration: "2m", task: "tri-312", output: "#312 “Apple Pay button missing on Safari 18” → area checkout, severity high. Next: fix; linked to web-12." },
      { number: 44, by: "event", cause: "issue #311", status: "completed", at: "2026-09-30T10:03", duration: "2m", task: "tri-311", output: "#311 “Typo on pricing” → area marketing, severity low. Next: fix." },
    ],
  },
  {
    id: "web-lighthouse",
    project: "acme-web",
    name: "Nightly Lighthouse budget",
    trigger: { kind: "schedule", preset: "daily", cron: "0 3 * * *", timezone: "America/Los_Angeles" },
    workflow: "No workflow",
    goal: "Run Lighthouse on /, /pricing, and /cart against staging. File a backlog item for any page over its budget.",
    agent: "codex",
    stops: [],
    precheck: "curl -fsS https://staging.acme.dev/healthz",
    graceMinutes: 360,
    reuseTask: true,
    worktree: false,
    base: "head",
    openPr: false,
    enabled: true,
    created: "Aug 2",
    runs: [
      { number: 90, by: "schedule", status: "completed", at: "2026-10-01T06:00", duration: "6m", task: "lighthouse", output: "LCP 2.9 s on /pricing is over the 2.5 s budget. Filed web-14 with the trace." },
      { number: 89, by: "schedule", status: "completed", at: "2026-09-30T06:00", duration: "5m", task: "lighthouse", output: "All three pages within budget. CLS on / is 0.02." },
    ],
  },
  {
    id: "pay-integration",
    project: "payments",
    name: "Nightly integration suite",
    trigger: { kind: "schedule", preset: "daily", cron: "0 1 * * *", timezone: "UTC" },
    workflow: "No workflow",
    goal: "Run pnpm test:integration against a fresh Postgres. If anything fails, find the cause and say whether it is the code or the fixture.",
    agent: "goose",
    stops: [],
    graceMinutes: 720,
    reuseTask: false,
    worktree: true,
    base: { branch: "develop" },
    openPr: false,
    enabled: true,
    created: "Jul 11",
    runs: [
      { number: 77, by: "schedule", status: "completed", at: "2026-09-30T21:00", duration: "18m", task: "int-77", output: "All 412 integration tests green against Postgres 17.0." },
      { number: 76, by: "schedule", status: "failed", at: "2026-09-29T21:00", duration: "4m", task: "int-76", error: "Postgres did not start: port 5432 was held by the pg17 task's services." },
    ],
  },
  {
    id: "hb-stale",
    project: "handbook",
    name: "Stale page sweep",
    trigger: { kind: "schedule", preset: "weekly", cron: "0 16 * * FRI", timezone: "Europe/Lisbon" },
    workflow: "Draft → Review",
    goal: "Refresh pages nobody has edited in 180 days: check each command still works and each link still resolves.",
    agent: "claude",
    stops: ["merge"],
    precheck: "find docs -name '*.md' -mtime +180 | grep -q .",
    graceMinutes: 720,
    reuseTask: false,
    worktree: true,
    base: "origin",
    openPr: true,
    enabled: true,
    created: "May 5",
    runs: [
      { number: 9, by: "schedule", status: "skipped_precheck", at: "2026-09-25T11:00", error: "precheck exited with 1: no page is older than 180 days" },
      { number: 8, by: "schedule", status: "completed", at: "2026-09-18T11:00", duration: "52m", task: "stale-8", output: "Refreshed 3 pages. Draft PR #41, merged." },
    ],
  },
  {
    id: "wf-upstream",
    project: "warpforge",
    name: "Upstream sync check",
    trigger: { kind: "schedule", preset: "daily", cron: "0 8 * * *", timezone: NY },
    workflow: "No workflow",
    goal: "List warpforgehq/warpforge commits our fork has not merged. Flag any that touch src/daemon/workflow or the protocol crate.",
    agent: "codex",
    stops: [],
    graceMinutes: 720,
    reuseTask: true,
    worktree: false,
    base: "head",
    openPr: false,
    enabled: true,
    created: "Aug 21",
    runs: [
      { number: 30, by: "schedule", status: "completed", at: "2026-10-01T08:00", duration: "2m", task: "upstream", output: "3 upstream commits not in the fork. 1 touches workflow/verify.rs (ADR 0024 follow-up); worth a sync task." },
    ],
  },
]

export function automationsFor(project: ProjectId): Automation[] {
  return AUTOMATIONS.filter((automation) => automation.project === project)
}
