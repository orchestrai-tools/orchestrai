import { findTask, type Task } from "@/data/tasks"

export type StepState = "done" | "running" | "pending" | "failed"

export type TranscriptEntry =
  | { kind: "user"; text: string; time: string }
  | { kind: "agent"; markdown: string; time: string }
  | { kind: "tool"; tool: "edit" | "shell" | "read" | "search" | "browser"; title: string; detail: string; status: "ok" | "failed" | "waiting"; time: string }

/** What changed, where, with which permission, and whether it can be undone. */
export interface Receipt {
  time: string
  action: string
  target: string
  permission: string
  undo: boolean
}

/** A stopped run says what it was about to do, what it was unsure about, and what lets it continue. */
export interface Handoff {
  aboutTo: string
  unsure: string
  options: string[]
}

export interface TaskDetail {
  plan: string
  steps: { label: string; state: StepState }[]
  transcript: TranscriptEntry[]
  receipts: Receipt[]
  checks: { name: string; status: "passing" | "failing" | "pending"; duration: string }[]
  context: { path: string; kind: "instructions" | "skill" | "memory"; used: boolean; note?: string }[]
  files: { path: string; status: "M" | "A" | "D" | "R"; additions: number; deletions: number }[]
  handoff?: Handoff
}

const DOCS_PLAN = `## Goal
A docs library where every \`.md\` page has a rendered view and a markdown editor, kept in sync.

## Steps
1. Library index: folders per project and global, virtualized list.
2. Full-text search through the daemon's SQLite index.
3. Rendered page (GFM, Mermaid, task lists that toggle).
4. CodeMirror markdown editor beside the page; the preview follows the active block.
5. Save through the daemon with path confinement (ADR 0017).

## Done when
- 2,000 files open in under a second.
- Search answers in under 200 ms.
- Typing in a 5,000-line page drops no frames.

## Out of scope
WYSIWYG blocks and collaborative editing.`

const DETAILS: Record<string, Partial<TaskDetail>> = {
  "orc-03": {
    plan: DOCS_PLAN,
    steps: [
      { label: "Read ADR 0017 and the search index", state: "done" },
      { label: "Library index and virtualized list", state: "done" },
      { label: "Search through the daemon", state: "done" },
      { label: "Rendered page", state: "done" },
      { label: "Editor synced to the active block", state: "running" },
      { label: "Save round-trip and tests", state: "pending" },
    ],
    transcript: [
      { kind: "user", text: "Build ORC-03. Keep the editor and the rendered page in sync like Zed's preview.", time: "9:02" },
      { kind: "agent", markdown: "I'll follow the plan on the left. The library reads through `search.rs`, so the window never parses the whole folder.", time: "9:03" },
      { kind: "tool", tool: "read", title: "Read docs/adr/0017-path-confinement.md", detail: "212 lines", status: "ok", time: "9:03" },
      { kind: "tool", tool: "edit", title: "Edit desktop/src/views/docs/Library.tsx", detail: "+184 −0", status: "ok", time: "9:21" },
      { kind: "tool", tool: "shell", title: "bun run typecheck", detail: "exit 0 · 14.2s", status: "ok", time: "9:31" },
      { kind: "agent", markdown: "The rendered page works. **Next:** map the editor cursor to a block id so the preview scrolls with it.\n\n- Blocks get ids from the parse, not from line numbers.\n- Only the edited page re-parses.", time: "9:40" },
      { kind: "tool", tool: "edit", title: "Edit desktop/src/views/docs/SyncedPreview.tsx", detail: "+96 −12", status: "ok", time: "9:44" },
    ],
    receipts: [
      { time: "9:44", action: "Edited", target: "SyncedPreview.tsx (+96 −12)", permission: "Profile: ask for writes · approved once", undo: true },
      { time: "9:31", action: "Ran", target: "bun run typecheck", permission: "Read-only · ran on its own", undo: false },
      { time: "9:21", action: "Created", target: "Library.tsx (+184)", permission: "Profile: ask for writes · approved once", undo: true },
      { time: "9:03", action: "Read", target: "docs/adr/0017-path-confinement.md", permission: "Read-only · ran on its own", undo: false },
    ],
    files: [
      { path: "desktop/src/views/docs/Library.tsx", status: "A", additions: 184, deletions: 0 },
      { path: "desktop/src/views/docs/SyncedPreview.tsx", status: "R", additions: 96, deletions: 12 },
      { path: "desktop/src/views/docs/useBlockMap.ts", status: "A", additions: 71, deletions: 0 },
      { path: "src/daemon/search.rs", status: "M", additions: 58, deletions: 21 },
      { path: "desktop/src/components/Markdown.tsx", status: "M", additions: 33, deletions: 18 },
      { path: "desktop/src/protocol/docs.ts", status: "A", additions: 44, deletions: 0 },
    ],
  },
  "orc-05": {
    steps: [
      { label: "List sessions from every ACP agent", state: "done" },
      { label: "Continue with session/load", state: "done" },
      { label: "Fork when the agent advertises it", state: "running" },
      { label: "Resume recovery tests", state: "pending" },
    ],
    transcript: [
      { kind: "agent", markdown: "Fork is wired for agents that advertise `session/fork`. The button stays hidden for the rest.", time: "10:12" },
      { kind: "tool", tool: "shell", title: "cargo test -p warpforge daemon::tests::sessions", detail: "Waiting for your approval", status: "waiting", time: "10:14" },
    ],
  },
  "orc-10": {
    handoff: {
      aboutTo: "Write the profile resolver so a denylist entry refuses a command even when a project allowlist matches it.",
      unsure: "The ticket says the denylist wins, but `.warpforge/workspace.yaml` in two projects allowlists `rm -rf build/`, which the global denylist blocks. Should the project be able to override it?",
      options: ["Denylist always wins", "Project allowlist can override", "Ask per command"],
    },
  },
  "fix-resume": {
    handoff: {
      aboutTo: "Push a fourth fix for `resume_replays_once` and watch CI again.",
      unsure: "The test passes locally 50 times in a row and fails on CI about one run in three. It looks like a timing race in replay de-duplication, not the change itself.",
      options: ["Give it 2 more attempts", "Mark the test flaky and open the PR", "Hand it to me"],
    },
  },
}

const DEFAULT_CHECKS: TaskDetail["checks"] = [
  { name: "cargo fmt --check", status: "passing", duration: "8s" },
  { name: "cargo clippy -D warnings", status: "passing", duration: "1m 52s" },
  { name: "desktop lint + typecheck", status: "passing", duration: "41s" },
  { name: "cargo test", status: "pending", duration: "—" },
]

const DEFAULT_CONTEXT: TaskDetail["context"] = [
  { path: "WARP.md", kind: "instructions", used: true, note: "Wins over AGENTS.md in the same folder" },
  { path: "AGENTS.md", kind: "instructions", used: false, note: "Shadowed by WARP.md" },
  { path: "~/.agents/AGENTS.md", kind: "instructions", used: true, note: "Global" },
  { path: "skills/code-quality", kind: "skill", used: true },
  { path: "skills/engineering-standards", kind: "skill", used: true },
  { path: "Project memory · 4 entries", kind: "memory", used: true, note: "Ranked slice, 1,200 tokens" },
]

function checksFor(task: Task): TaskDetail["checks"] {
  if (task.pr?.checks === "failing") {
    return DEFAULT_CHECKS.map((check) =>
      check.name === "cargo test" ? { ...check, status: "failing", duration: "6m 03s" } : check
    )
  }
  if (task.pr?.checks === "passing") return DEFAULT_CHECKS.map((check) => ({ ...check, status: "passing", duration: check.duration === "—" ? "5m 40s" : check.duration }))
  return DEFAULT_CHECKS
}

/** Full detail for a task; tasks without hand-written detail get a plausible default. */
export function taskDetail(id: string | undefined): (TaskDetail & { task: Task }) | undefined {
  const task = findTask(id)
  if (!task) return undefined
  const detail = DETAILS[task.id] ?? {}
  return {
    task,
    plan: detail.plan ?? `## Goal\n${task.title}.\n\n## Approach\n${task.summary}.\n\n## Done when\nChecks pass and the change is reviewed.`,
    steps: detail.steps ?? [
      { label: "Requirements", state: "done" },
      { label: "Plan", state: task.stage === "requirements" ? "pending" : "done" },
      { label: "Implement", state: task.status === "running" ? "running" : task.status === "queued" ? "pending" : "done" },
      { label: "Verify", state: task.status === "failed" ? "failed" : task.stage === "verify" ? "running" : "pending" },
    ],
    transcript: detail.transcript ?? [
      { kind: "user", text: task.title, time: "8:40" },
      { kind: "agent", markdown: `Starting with the plan. ${task.summary}.`, time: "8:41" },
    ],
    receipts: detail.receipts ?? [
      { time: "8:52", action: "Edited", target: `${task.changes.files} files`, permission: "Profile: ask for writes", undo: true },
    ],
    checks: detail.checks ?? checksFor(task),
    context: detail.context ?? DEFAULT_CONTEXT,
    files: detail.files ?? [],
    handoff: detail.handoff,
  }
}
