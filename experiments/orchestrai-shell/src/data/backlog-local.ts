import type { ItemStatus, Priority, Size, WorkItem } from "@/data/backlog"
import { ME } from "@/data/github"
import type { ProjectId } from "@/lib/projects"

interface Ticket {
  status?: ItemStatus
  priority?: Priority
  task?: string
  assignee?: string | null
  updated?: string
  age?: number
  labels?: string[]
}

/** A ticket from docs/product/BACKLOG.md, kept as a local item in the YAML backlog under .warpforge/backlog. */
function orc(number: string, title: string, size: Size, milestone: string, body: string, ticket: Ticket = {}): WorkItem {
  const { status = "todo", priority = "none", task, assignee = ME, updated = "Last week", age = 9000, labels = [] } = ticket
  return {
    id: number.toLowerCase(),
    project: "orchestrai",
    number,
    title,
    body,
    source: "local",
    status,
    priority,
    size,
    assignee: assignee ?? undefined,
    labels: [milestone, ...labels],
    task,
    created: "Sep 28",
    updated,
    age,
  }
}

const done = (when: string) => `\n\n**Done when:** ${when}`

export const LOCAL_ITEMS: WorkItem[] = [
  orc("ORC-16", "Shep task ending: stop points, CI, draft pull request", "M", "M3", "**Why:** a finished task should meet CI and a pull request on its own (DECISIONS.md, Shep).\n\n**Scope:**\n- A task can stop for the person at requirements, plan, or merge.\n- After the last stop: push, watch CI, let the agent fix failures up to a set number of times, then open a draft pull request.\n- The fix loop stops and asks when the cap is reached." + done("a task with a failing test pushes, sees CI fail, fixes it on the second attempt, and opens a draft pull request; a task that fails three times stops and asks instead."), { priority: "urgent", updated: "2h ago", age: 120, labels: ["factory"] }),
  orc("ORC-15", "GitHub page: issues and pull requests", "M", "M3", "**Why:** DECISIONS.md, Tasks, automations, workflows, and a GitHub page.\n\n**Scope:** one page per project with open issues and pull requests, filters, and actions: start a task from an issue, open a task's pull request, see check status." + done("starting a task from an issue links the two both ways, and the page updates within a minute of a change on GitHub."), { priority: "high", updated: "3h ago", age: 180, labels: ["github"] }),
  orc("ORC-18", "Daemon tool hygiene: shell truncation and unique-match edit", "S", "M3", "**Scope:**\n- Shell and log tools return the last lines, stdout, stderr, the exit code, and whether it timed out. The full output goes to a temp file whose path is in the result.\n- Any edit tool refuses when the old text is missing or appears more than once, and returns a preview and the nearest match." + done("a command with 50,000 lines of output returns a short result with a file path, and an ambiguous edit writes nothing."), { status: "waiting", priority: "high", task: "orc-18", updated: "1m ago", age: 1 }),
  orc("ORC-03", "Docs library: rendered page and markdown editor", "L", "M1", "**Why:** the person lives in markdown. The primary screen must view and edit `.md` well.\n\n**Scope:**\n- A library view: folders of `.md` files per project and global, virtualized list, full-text search.\n- A rendered view and a CodeMirror editor, side by side or toggled.\n- Saves go through the daemon (ADR 0017 path confinement)." + done("2,000 files open in under a second, search answers in under 200 ms, typing in a 5,000-line page drops no frames."), { status: "in_progress", priority: "high", task: "orc-03", updated: "Just now", age: 0 }),
  orc("ORC-05", "Mission Control session board with continue and fork", "L", "M1", "**Scope:**\n- The board lists sessions from every enabled ACP agent, including ones this app did not start.\n- Continue uses `session/load`; Fork uses `session/fork` when the agent advertises it. Otherwise the button is hidden, not faked." + done("a Codex session started outside the app shows on the board, continues with its history, and a fork makes a second tile."), { status: "in_progress", priority: "high", task: "orc-05", updated: "2m ago", age: 2 }),
  orc("ORC-10", "Permission profiles and modes", "M", "M2", "**Scope:**\n- Named profiles: always allow, always ask, or let the agent decide, per tool kind.\n- The denylist is checked before the allowlist. `AlwaysAllow` is never the default.\n- Modes per task: Auto, Approve, Smart approve, Chat." + done("a command on the denylist is refused even when the allowlist matches it."), { status: "in_progress", priority: "high", task: "orc-10", updated: "18m ago", age: 18, labels: ["security"] }),
  orc("ORC-08", "Sinew bottom terminal drawer", "M", "M2", "**Scope:** a bottom panel with a short tab strip (about 28 px), one tab per session, status on each tab (starting, running, exited), resizable height, a shortcut to toggle it." + done("the drawer opens over any view, tabs show live status, and the page above keeps its scroll position."), { status: "waiting", priority: "medium", task: "orc-08", updated: "35m ago", age: 35 }),
  orc("ORC-02", "Upstream sync policy", "S", "M0", "**Scope:**\n- Add an `upstream` remote for `warpforgehq/warpforge`.\n- Write down the cadence and who resolves conflicts.\n- List the paths that are ours and win on conflict." + done("docs/product/README.md explains how to merge upstream, and one upstream merge has been done with it."), { status: "in_progress", priority: "medium", task: "orc-02", updated: "3h ago", age: 180 }),
  orc("ORC-13", "Task, workflow, and automation, with recipe steps", "L", "M3", "A task is one run. A workflow is a reusable recipe. An automation is a trigger that creates a task. Workflow steps take the Goose recipe shape: parameters, retries, a shell success check, an `on_failure` step." + done("a workflow with a failing shell check retries, then runs its `on_failure` step."), { priority: "high", updated: "Yesterday", age: 1500, labels: ["workflows"] }),
  orc("ORC-17", "Project memory written only after a merge", "M", "M3", "When a task's pull request merges, write its lessons as project memory; inject a short ranked slice on the next run. Memory from unmerged tasks is not written." + done("a merged task's memory appears in the next prompt within budget; an abandoned run leaves memory unchanged."), { priority: "medium", updated: "Yesterday", age: 1550 }),
  orc("ORC-14", "Fan-out, idle wait, and subagents that cannot nest", "M", "M3", "A parent starts several children and waits until each reports, with a spawn timeout and an idle watchdog. A child cannot start its own child." + done("a hung child is reported by the watchdog, and a child's spawn is refused with a clear error."), { priority: "medium" }),
  orc("ORC-07", "Warp process model for terminals", "L", "M2", "`openpty`, `SIGCHLD` for child exit, one queued write controller, command as a block with exit status and cwd from shell hooks." + done("a killed child is reported within one second, and an agent write never interleaves with a person's keystrokes."), { priority: "high", labels: ["terminal"] }),
  orc("ORC-11", "One action list: palette, control socket, loopback MCP", "L", "M2", "One typed list of app actions drives the palette, keybindings, a local control socket and the loopback MCP. Dangerous actions ask for confirmation." + done("an agent in a panel calls an MCP tool that opens a terminal, and the same action is in the palette."), { priority: "high" }),
  orc("ORC-09", "Skills catalog and instruction files", "M", "M2", "One skills catalog across agent directories. `WARP.md` wins over `AGENTS.md` in the same folder; `~/.agents/AGENTS.md` is global." + done("a task's context view lists the exact files it received."), { priority: "medium" }),
  orc("ORC-06", "Port command_center plans, approvals, and scoped memory panes", "M", "M1", "A markdown plan pane beside the chat, an approvals pane across tasks, and memory by scope." + done("approving from the pane unblocks the agent, and closing the window does not lose the pending approval."), { priority: "medium" }),
  orc("ORC-04", "Transcripts and plans open as markdown pages", "M", "M1", "Any task's transcript, plan and review opens as a page in the library: read-only for transcripts, editable for plans." + done("one click opens a finished task's plan and transcript, and search finds text inside transcripts."), { priority: "medium" }),
  orc("ORC-12", "SSH with one ControlMaster", "M", "M2", "One master connection per host, extra channels on that socket, teardown only of sessions this app opened." + done("three terminals to one host open one TCP connection."), { priority: "low" }),
  orc("ORC-19", "Phone remote over Sinew's relay", "L", "M4", "6-digit pairing, ECDH, AES-256-GCM; a relay that only sees ciphertext; a phone PWA for the board, transcripts, prompts and approvals." + done("a phone on cellular pairs, approves a permission, and the relay log shows only ciphertext."), { priority: "medium", labels: ["remote"] }),
  orc("ORC-20", "WASM plugin host for agent tools", "L", "M4", "A Rust host loads `.wasm` modules in a sandbox; plugins reach the system only through the host API, with grants per plugin." + done("a sample plugin adds one tool, and reading outside its grant fails."), { priority: "low" }),
  orc("ORC-21", "Browser profiles from Chrome", "M", "M4", "Import Chrome cookies into a named profile on macOS. The agent and hand-opened tabs share the Default profile." + done("the preview opens a site you are signed into in Chrome without a new login."), { priority: "low" }),
  orc("ORC-22", "Helmor first run", "M", "M5", "Fixed 1300 × 810 window. Steps: intro, sign in agents, connect GitHub, skills, add a repo, with a mock of the workspace beside them." + done("a fresh data directory opens into the flow and lands in the workspace with the repo added."), { priority: "medium", labels: ["onboarding"] }),
  orc("ORC-23", "Landing screen", "S", "M5", "A first screen before onboarding: wordmark, one line, a field of shapes that drift and move away from the pointer. Respects reduced motion." + done("60 fps on a laptop, and a still version with reduced motion on."), { priority: "low", labels: ["onboarding"] }),
  orc("ORC-24", "Many-harness panel grid and the QuickRun command bar", "L", "M5", "A grid of live agents and shells, broadcast to selected panels, and the `$` command bar at the bottom of the sidebar, scoped to the selected worktree." + done("four agents run in one grid and a broadcast reaches all four."), { priority: "medium" }),
  orc("ORC-25", "Agents page, teams, and channels", "L", "M5", "An Agents page, teams you add to a channel at once, and channels where people and agents read the same thread." + done("adding a team to a channel makes every member answer a mention by name."), { priority: "low" }),
  orc("ORC-26", "Canvas home", "L", "M5", "A free-placement board of widgets, each with its own position and layer, saved per user." + done("widgets can be placed, resized and layered, and the layout survives a restart."), { priority: "low" }),
  orc("SPIKE-04", "Jujutsu beside Git", "M", "Spike", "What a `jj` driver needs for status, commit, worktrees (`jj workspace`) and checkpoints, and which paths call Git directly today. **Output:** a verdict and an estimate.", { assignee: null }),
  orc("SPIKE-02", "Remote agent over SSH", "S", "Spike", "Can a remote ACP agent stay up on a host while the app reaches it through `ssh -N -L`? **Output:** a verdict and a list of daemon changes.", { assignee: null }),
  orc("SPIKE-01", "Berd: port the whole UI, or only the canvas home", "S", "Spike", "What porting Berd's UI costs against only its home canvas. **Output:** a verdict that unblocks ORC-26.", { assignee: null }),
  orc("SPIKE-03", "Voice conversation", "S", "Spike", "On-device speech versus OpenAI speech versus Realtime, and cost per hour. **Output:** a verdict and a first provider.", { assignee: null }),
  orc("SPIKE-05", "Native-CLI wrapper", "S", "Spike", "Which CLIs cannot be hosted over ACP, and whether a PTY daemon that survives the window is needed for them.", { assignee: null }),
  orc("SPIKE-06", "Optional direct model loop", "S", "Spike", "Is a first-party loop worth having beside ACP workers, and is Sinew's `run_turn` the base? **Output:** go or no-go.", { assignee: null }),
  orc("ORC-01", "Rename to Orchestrai and give it its own data directory", "M", "M0", "Product name Orchestrai, bundle id under `tools.orchestrai`, data directory `~/.orchestrai`." + done("the installed Warpforge and this build run side by side, each with its own daemon."), { status: "done", priority: "high", task: "orc-01", updated: "Yesterday", age: 1600 }),
  orc("SPIKE-07", "Zed as the base", "S", "Spike", "**Verdict:** no. `AcpConnection` lives in the window and kills the agent on drop. The Warpforge fork stays the base.", { status: "done", updated: "Yesterday", age: 1700 }),
]

const local = (project: ProjectId, id: string, number: string, title: string, body: string, rest: Partial<WorkItem> = {}): WorkItem => ({
  id,
  project,
  number,
  title,
  body,
  source: "local",
  status: "todo",
  priority: "none",
  assignee: ME,
  labels: [],
  created: "This week",
  updated: "2d ago",
  age: 2900,
  ...rest,
})

LOCAL_ITEMS.push(
  local("acme-web", "web-local-3", "#3", "Try View Transitions on the pricing page", "Cross-fade the tier cards when the billing period switches. Investigate only.", { size: "S", priority: "low" }),
  local("payments", "pay-local-7", "#7", "Runbook: rotate the Stripe restricted key", "Steps, the order to roll the services, and how to check nothing still uses the old key.", { size: "S", priority: "medium" }),
  local("payments", "pay-local-8", "#8", "Load test refunds at 50 requests per second", "With idempotency keys on, retries included. Report p99 and duplicate count.", { size: "M", priority: "high", updated: "1h ago", age: 60 }),
  local("warpforge", "wf-local-2", "#2", "Read the 0.22 changelog before the next sync", "", { size: "S" }),
  local("handbook", "hb-local-5", "#5", "Incident review template", "One page: timeline, impact, what we change. No blame section.", { size: "S", priority: "medium" }),
)
