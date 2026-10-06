import type { AgentId } from "@/data/agents"
import type { ProjectId } from "@/lib/projects"

/** Kinds of tool call a permission profile decides on. */
export type ToolKind = "read" | "edit" | "execute" | "fetch" | "browser" | "mcp" | "push"
/** Always allow, always ask, or let the agent decide (Warp's three answers). */
export type Decision = "allow" | "ask" | "agent"

export const TOOL_KINDS: readonly { id: ToolKind; label: string; hint: string }[] = [
  { id: "read", label: "Read files", hint: "Read, search, and list inside the task's worktree" },
  { id: "edit", label: "Edit files", hint: "Write and patch files inside the worktree" },
  { id: "execute", label: "Run commands", hint: "Shell commands in the task's terminal" },
  { id: "fetch", label: "Reach the network", hint: "HTTP requests and package installs" },
  { id: "browser", label: "Use the browser", hint: "Pages other than this project's own services" },
  { id: "mcp", label: "MCP and plugin tools", hint: "Tools from MCP servers and WASM plugins" },
  { id: "push", label: "Push and publish", hint: "git push, gh pr merge, npm, cargo, and docker publish" },
]

export const DECISION_LABEL: Record<Decision, string> = { allow: "Always allow", ask: "Always ask", agent: "Agent decides" }

export interface PermissionProfile {
  id: string
  name: string
  description: string
  builtIn: boolean
  /** `AlwaysAllow` can be assigned on purpose but never becomes a default. */
  neverDefault?: boolean
  decisions: Record<ToolKind, Decision>
  /** Refused outright, even when the allowlist also matches. Checked first. */
  denylist: string[]
  /** Runs without asking. `*` matches anything. */
  allowlist: string[]
}

const BLAST_RADIUS = ["rm -rf /", "rm -rf ~", "git push --force", "git push -f", ":(){ :|:& };:", "curl * | sh", "sudo *"]
const ask = (overrides: Partial<Record<ToolKind, Decision>>): Record<ToolKind, Decision> => ({
  read: "allow",
  edit: "ask",
  execute: "ask",
  fetch: "ask",
  browser: "agent",
  mcp: "ask",
  push: "ask",
  ...overrides,
})

export const PROFILES: readonly PermissionProfile[] = [
  {
    id: "ask-writes",
    name: "Ask for writes",
    description: "Reads run; edits, commands, and the network ask first.",
    builtIn: true,
    decisions: ask({}),
    denylist: BLAST_RADIUS,
    allowlist: ["git status", "git diff *", "rg *", "cargo check *", "cargo test *", "bun run lint", "bun run typecheck"],
  },
  {
    id: "always-ask",
    name: "Always ask",
    description: "Every tool call waits for you, reads included.",
    builtIn: true,
    decisions: { read: "ask", edit: "ask", execute: "ask", fetch: "ask", browser: "ask", mcp: "ask", push: "ask" },
    denylist: BLAST_RADIUS,
    allowlist: [],
  },
  {
    id: "smart",
    name: "Smart approve",
    description: "The agent decides call by call; pushing still asks.",
    builtIn: true,
    decisions: ask({ edit: "agent", execute: "agent", fetch: "agent", mcp: "agent" }),
    denylist: BLAST_RADIUS,
    allowlist: ["git status", "git diff *", "rg *"],
  },
  {
    id: "always-allow",
    name: "Always allow",
    description: "Nothing asks. Only the denylist stops it. Never a default.",
    builtIn: true,
    neverDefault: true,
    decisions: { read: "allow", edit: "allow", execute: "allow", fetch: "allow", browser: "allow", mcp: "allow", push: "allow" },
    denylist: BLAST_RADIUS,
    allowlist: [],
  },
  {
    id: "release",
    name: "Release branch",
    description: "Like Ask for writes, but pushes the task's own branch and opens draft PRs.",
    builtIn: false,
    decisions: ask({ push: "agent" }),
    denylist: [...BLAST_RADIUS, "npm publish", "cargo publish", "gh pr merge *"],
    allowlist: ["git push * orc-*", "gh pr create --draft *", "gh pr checks *"],
  },
]

/** The profile each agent gets in this project unless a task picks another. */
export const AGENT_PROFILES: Record<AgentId, string> = {
  claude: "ask-writes",
  codex: "ask-writes",
  gemini: "always-ask",
  goose: "smart",
  opencode: "ask-writes",
}

export type Mode = "auto" | "approve" | "smart" | "chat"

export const MODES: readonly { id: Mode; label: string; description: string }[] = [
  { id: "approve", label: "Approve", description: "Asks before every call that edits, runs, or reaches the network." },
  { id: "smart", label: "Smart approve", description: "Read-only calls run; anything else asks. Unknown tools get a read-only check first." },
  { id: "auto", label: "Auto", description: "Runs what the profile allows without stopping. The denylist still refuses." },
  { id: "chat", label: "Chat", description: "No tools at all. The agent can only talk, so nothing changes." },
]

function matches(command: string, pattern: string): boolean {
  const source = pattern
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*")
  return new RegExp(source).test(command)
}

const PUSHES = /^(git push|gh pr merge|npm publish|cargo publish|docker push)\b/

/** How a profile treats one command. The denylist is checked before the allowlist. */
export function evaluate(profile: PermissionProfile, command: string): { verdict: "deny" | "allow" | "ask" | "agent"; reason: string } {
  const cmd = command.trim()
  const denied = profile.denylist.find((pattern) => matches(cmd, pattern))
  if (denied) {
    const alsoAllowed = profile.allowlist.find((pattern) => matches(cmd, pattern))
    const note = alsoAllowed ? ` The allowlist entry “${alsoAllowed}” matches too, but the denylist is checked first.` : ""
    return { verdict: "deny", reason: `Refused: matches the denylist entry “${denied}”.${note}` }
  }
  const allowed = profile.allowlist.find((pattern) => matches(cmd, pattern))
  if (allowed) return { verdict: "allow", reason: `Runs without asking: matches the allowlist entry “${allowed}”.` }
  const kind: ToolKind = PUSHES.test(cmd) ? "push" : "execute"
  const decision = profile.decisions[kind]
  const label = TOOL_KINDS.find((entry) => entry.id === kind)?.label.toLowerCase()
  if (decision === "allow") return { verdict: "allow", reason: `Runs without asking: ${label} is set to Always allow.` }
  if (decision === "ask") return { verdict: "ask", reason: `Asks you first: ${label} is set to Always ask.` }
  return { verdict: "agent", reason: `The agent decides: ${label} is set to Agent decides, so it asks only when it judges the call risky.` }
}

export interface InstructionFile {
  path: string
  scope: "Global" | "Ancestor" | "Project" | "Folder"
  used: boolean
  note: string
  size: string
}

/** What a task in the project root receives, in the order it is applied. `WARP.md` wins over `AGENTS.md` in one folder. */
export function instructionsFor(project: ProjectId, path: string): InstructionFile[] {
  const global: InstructionFile = { path: "~/.agents/AGENTS.md", scope: "Global", used: true, note: "Given to every task in every project.", size: "1.4 KB" }
  if (project !== "orchestrai") {
    return [global, { path: `${path}/AGENTS.md`, scope: "Project", used: true, note: "The project's rules.", size: "3.2 KB" }]
  }
  return [
    global,
    { path: "~/projects/AGENTS.md", scope: "Ancestor", used: true, note: "Folders above the project apply too.", size: "0.6 KB" },
    { path: `${path}/WARP.md`, scope: "Project", used: true, note: "Wins over AGENTS.md in the same folder.", size: "12.1 KB" },
    { path: `${path}/AGENTS.md`, scope: "Project", used: false, note: "Not given: WARP.md is in the same folder.", size: "0.6 KB" },
    { path: `${path}/desktop/WARP.md`, scope: "Folder", used: true, note: "Added when the task works under desktop/.", size: "2.8 KB" },
  ]
}

export type SkillScope = "home" | "project" | "bundled"

export interface Skill {
  name: string
  description: string
  /** Whose skills folder it was found in. */
  source: "Claude" | "Codex" | "Cursor" | "Gemini" | "OrchestrAI"
  scope: SkillScope
  path: string
  enabled: boolean
}

export const SKILLS: readonly Skill[] = [
  { name: "changeset", description: "Write the customer-facing changeset every commit carries.", source: "Claude", scope: "project", path: ".claude/skills/changeset/SKILL.md", enabled: true },
  { name: "adr-check", description: "Read docs/adr before changing a subsystem it covers.", source: "OrchestrAI", scope: "project", path: ".warpforge/skills/adr-check/SKILL.md", enabled: true },
  { name: "acp-harness-fit", description: "Score a reviewed repo against the ACP desktop harness.", source: "Cursor", scope: "project", path: ".cursor/rules/acp-harness-fit.mdc", enabled: true },
  { name: "code-quality", description: "Checks to run before you push or open a pull request.", source: "Cursor", scope: "home", path: "~/.cursor/skills/code-quality/SKILL.md", enabled: true },
  { name: "tackle-gh-comments", description: "Work through every review comment on a pull request.", source: "Cursor", scope: "home", path: "~/.cursor/skills/tackle-gh-comments/SKILL.md", enabled: true },
  { name: "commit-message-writer", description: "Write Conventional Commits messages from a diff.", source: "Claude", scope: "home", path: "~/.claude/skills/commit-message-writer/SKILL.md", enabled: true },
  { name: "engineering-standards", description: "The minimal-complexity bar for code that is written or reviewed.", source: "Codex", scope: "home", path: "~/.codex/skills/engineering-standards/SKILL.md", enabled: true },
  { name: "release-notes", description: "Draft release notes from merged pull requests.", source: "Gemini", scope: "home", path: "~/.gemini/skills/release-notes/SKILL.md", enabled: false },
  { name: "agent-browser", description: "Drive the in-app browser: snapshot, click, type, screenshot.", source: "OrchestrAI", scope: "bundled", path: "OrchestrAI.app/skills/agent-browser", enabled: true },
  { name: "markdown-docs", description: "Write and restructure long markdown docs and wikis.", source: "OrchestrAI", scope: "bundled", path: "OrchestrAI.app/skills/markdown-docs", enabled: true },
]

export interface McpServer {
  name: string
  transport: "built-in" | "stdio" | "http"
  target: string
  tools: number
  enabled: boolean
}

export const PROJECT_MCP: Record<ProjectId, McpServer[]> = {
  orchestrai: [
    { name: "context7", transport: "stdio", target: "npx -y @upstash/context7-mcp", tools: 2, enabled: true },
    { name: "linear", transport: "http", target: "https://mcp.linear.app/mcp", tools: 23, enabled: true },
  ],
  warpforge: [],
  "acme-web": [{ name: "figma", transport: "http", target: "http://127.0.0.1:3845/mcp", tools: 6, enabled: true }],
  handbook: [],
  payments: [
    { name: "postgres-dev", transport: "stdio", target: "npx -y @modelcontextprotocol/server-postgres postgres://readonly@localhost:15432/payments_dev", tools: 1, enabled: true },
    { name: "linear", transport: "http", target: "https://mcp.linear.app/mcp", tools: 23, enabled: false },
  ],
}

export const PROJECT_LINKS: Record<ProjectId, { remotes: { name: string; url: string; note: string }[]; tracker: string; prBase: string }> = {
  orchestrai: {
    remotes: [
      { name: "origin2", url: "git@github.com:orchestrai-tools/orchestrai.git", note: "Default for push, pull requests, and CI" },
      { name: "origin", url: "Corporate mirror", note: "VPN required. Used only when you name it" },
    ],
    tracker: "Linear · ORC (OrchestrAI)",
    prBase: "main",
  },
  warpforge: {
    remotes: [{ name: "origin", url: "git@github.com:warpforgehq/warpforge.git", note: "Upstream. Read-only for you" }],
    tracker: "GitHub Issues · warpforgehq/warpforge",
    prBase: "main",
  },
  "acme-web": { remotes: [{ name: "origin", url: "git@github.com:acme/web.git", note: "Default" }], tracker: "Linear · WEB (Web)", prBase: "main" },
  handbook: { remotes: [{ name: "origin", url: "git@github.com:acme/handbook.git", note: "Default" }], tracker: "GitHub Issues · acme/handbook", prBase: "main" },
  payments: { remotes: [{ name: "origin", url: "git@github.com:acme/payments-api.git", note: "Default" }], tracker: "Linear · PAY (Payments)", prBase: "develop" },
}

export type Channel = "desktop" | "sound" | "phone"

export const NOTIFY_EVENTS: readonly { id: string; label: string; hint: string; defaults: Channel[] }[] = [
  { id: "approval", label: "An agent needs approval", hint: "A tool call is waiting in the Inbox.", defaults: ["desktop", "sound", "phone"] },
  { id: "question", label: "An agent asks a question", hint: "A stop point or a stage question.", defaults: ["desktop", "phone"] },
  { id: "ci", label: "CI fails after the last fix attempt", hint: "The fix loop stopped and is asking.", defaults: ["desktop", "phone"] },
  { id: "review", label: "A pull request gets a review", hint: "Comments or a change request on a task's PR.", defaults: ["desktop"] },
  { id: "done", label: "A task finishes", hint: "Merged, or ready for you to merge.", defaults: ["desktop"] },
  { id: "crash", label: "A service crashes", hint: "A dev service exits on its own.", defaults: ["desktop"] },
  { id: "factory", label: "The Factory pauses", hint: "A limit holds back new tasks.", defaults: [] },
]

export const STORAGE: Record<ProjectId, { label: string; size: string; detail: string }[]> = {
  orchestrai: [
    { label: "Transcripts", size: "412 MB", detail: "1,284 sessions, 41 tasks" },
    { label: "Worktrees", size: "2.1 GB", detail: "5 under .warpforge/worktrees" },
    { label: "Project memory", size: "3.4 MB", detail: "38 entries" },
    { label: "Backlog", size: "1.2 MB", detail: "214 items, SQLite" },
  ],
  warpforge: [{ label: "Transcripts", size: "36 MB", detail: "88 sessions" }, { label: "Worktrees", size: "0 B", detail: "None" }],
  "acme-web": [
    { label: "Transcripts", size: "98 MB", detail: "302 sessions" },
    { label: "Worktrees", size: "1.4 GB", detail: "1 with node_modules" },
    { label: "Project memory", size: "0.9 MB", detail: "12 entries" },
  ],
  handbook: [{ label: "Transcripts", size: "21 MB", detail: "64 sessions" }],
  payments: [
    { label: "Transcripts", size: "187 MB", detail: "530 sessions" },
    { label: "Worktrees", size: "3.6 GB", detail: "1 with a cargo target dir" },
    { label: "Project memory", size: "1.7 MB", detail: "22 entries" },
  ],
}
