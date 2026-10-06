import type { AgentId } from "@/data/agents"
import type { ProjectId } from "@/lib/projects"

/** `task` holds a task's lessons until its pull request merges; only then are they project memory. */
export type MemoryScope = "global" | "project" | "task"
export type MemoryKind = "fact" | "decision" | "preference" | "gotcha" | "note"
export type MemoryRelation = "related" | "supports" | "contradicts" | "supersedes"

export type MemorySource =
  | { kind: "merged"; pr: number; task?: string }
  | { kind: "held"; pr: number; task: string }
  | { kind: "you"; note?: string }

export interface MemoryEntry {
  id: string
  scope: MemoryScope
  /** Unset for global memory. */
  project?: ProjectId
  kind: MemoryKind
  content: string
  tags: string[]
  source: MemorySource
  written: string
  edited?: string
  /** Bumped by every search hit and every injection; dreaming reads it as decay. */
  lastUsed: string
  /** How many runs received it in their opening context. */
  injected: number
  lastInjected?: string
  pinned?: boolean
  /** Rank against the next run's goal, 0–1. */
  score: number
  links?: { to: string; relation: MemoryRelation }[]
}

export type ProposalType = "duplicate" | "contradiction" | "stale" | "merge" | "superseded_by" | "delete"

/** A dreaming pass flags memories; a person decides. Only duplicate, stale, and delete change anything when approved. */
export interface DreamProposal {
  id: number
  type: ProposalType
  targets: string[]
  reason: string
  status: "pending" | "applied" | "rejected"
  created: string
  /** Who found it: the heuristic pass, or an agent that checked the claim against the code. */
  by: "heuristic" | AgentId
}

export const MEMORY_SETTINGS = {
  search: "hybrid" as "hybrid" | "fts",
  embeddingModel: "all-MiniLM-L6-v2, 384 dimensions, on this Mac",
  budget: 1200,
  floor: 0.35,
  dreaming: { schedule: "Nightly at 03:00", agent: "goose" as AgentId, lastRun: "Today 03:00", found: 3 },
}

/** The next run each project's slice is ranked for. */
export const NEXT_RUN: Partial<Record<ProjectId, { task: string; title: string }>> = {
  orchestrai: { task: "orc-02", title: "Upstream sync policy" },
}

export const MEMORIES: readonly MemoryEntry[] = [
  { id: "m-h1", scope: "task", project: "orchestrai", kind: "gotcha", content: "xterm.js needs `fit()` after the drawer finishes opening, not on mount. On mount the panel is 0 px tall and the terminal sizes itself to one row.", tags: ["terminal", "xterm"], source: { kind: "held", pr: 214, task: "orc-08" }, written: "35m ago", lastUsed: "35m ago", injected: 0, score: 0.1 },
  { id: "m-h2", scope: "task", project: "orchestrai", kind: "gotcha", content: "`resume_replays_once` fails about one CI run in three and never locally. It is a timing race in replay de-duplication, not the change under test.", tags: ["tests", "flaky", "ci"], source: { kind: "held", pr: 215, task: "fix-resume" }, written: "1h ago", lastUsed: "1h ago", injected: 0, score: 0.2, links: [{ to: "m-p7", relation: "related" }] },
  { id: "m-h3", scope: "task", project: "orchestrai", kind: "decision", content: "Shell output over 400 lines goes to a temp file. The model sees the last 80 lines and the path; the person sees all of it.", tags: ["shell", "tools"], source: { kind: "held", pr: 216, task: "orc-18" }, written: "12m ago", lastUsed: "12m ago", injected: 0, score: 0.1 },

  { id: "m-p1", scope: "project", project: "orchestrai", kind: "gotcha", pinned: true, content: "The daemon actor is single-threaded: never block it. Every handler is awaited inline on one loop, so a blocking SQLite read, a `git` call, or a `gh` call freezes every project at once (ADR 0002). Spawn the work off the loop and send the result back as a command.", tags: ["daemon", "actor", "adr-0002"], source: { kind: "you", note: "From ADR 0002" }, written: "Jul 8", edited: "Aug 30", lastUsed: "42m ago", injected: 48, lastInjected: "orc-03 · 42m ago", score: 0.64, links: [{ to: "m-p2", relation: "related" }] },
  { id: "m-p2", scope: "project", project: "orchestrai", kind: "decision", pinned: true, content: "Files stay under 500 lines. Split a module into a directory (`foo.rs` → `foo/mod.rs` plus topic files) before adding to a file at the cap. `src/daemon/actor.rs` reached 10,504 lines one match arm at a time.", tags: ["code-shape", "rust"], source: { kind: "you" }, written: "Jul 8", lastUsed: "42m ago", injected: 52, lastInjected: "orc-03 · 42m ago", score: 0.4 },
  { id: "m-p3", scope: "project", project: "orchestrai", kind: "decision", content: "The data directory is `~/.orchestrai`. `~/.warpforge` is read once on first launch, migrated, and never written again.", tags: ["paths", "migration"], source: { kind: "merged", pr: 208, task: "orc-01" }, written: "Yesterday 16:42", lastUsed: "Yesterday 16:42", injected: 3, lastInjected: "orc-05 · 1h ago", score: 0.33, links: [{ to: "m-p9", relation: "contradicts" }] },
  { id: "m-p4", scope: "project", project: "orchestrai", kind: "decision", content: "Keep the `warpforge-protocol` crate name until upstream renames it. The wire must stay compatible with warpforgehq/warpforge, so a sync stays a merge and not a port.", tags: ["upstream", "protocol"], source: { kind: "merged", pr: 208, task: "orc-01" }, written: "Yesterday 16:42", lastUsed: "Yesterday 16:42", injected: 2, lastInjected: "orc-05 · 1h ago", score: 0.91, links: [{ to: "m-p6", relation: "related" }] },
  { id: "m-p5", scope: "project", project: "orchestrai", kind: "gotcha", content: "Renaming the binary breaks `cargo install --path .` for anyone with the old name on PATH. The README install line and the Homebrew formula change in the same PR.", tags: ["release", "install"], source: { kind: "merged", pr: 208, task: "orc-01" }, written: "Yesterday 16:42", lastUsed: "Yesterday 16:42", injected: 1, lastInjected: "orc-05 · 1h ago", score: 0.12 },
  { id: "m-p6", scope: "project", project: "orchestrai", kind: "decision", content: "Sync upstream with a merge commit, never a rebase or a force-push. Reviewers keep the history they already read; the squash at merge flattens it.", tags: ["upstream", "git"], source: { kind: "you" }, written: "Sep 2", lastUsed: "3h ago", injected: 6, lastInjected: "orc-01 · Yesterday", score: 0.78 },
  { id: "m-p8", scope: "project", project: "orchestrai", kind: "fact", content: "A workflow stage's output is its closing message: the text after its last tool call. A JSON block quoted earlier in the turn is never read as the verdict.", tags: ["workflows", "adr-0001"], source: { kind: "merged", pr: 201 }, written: "Aug 30", lastUsed: "2d ago", injected: 11, lastInjected: "orc-10 · 25m ago", score: 0.22 },
  { id: "m-p7", scope: "project", project: "orchestrai", kind: "gotcha", content: "`cargo test` kills every listener in the project's port range (4000 and up). It once killed an agent mid-stage, which is why a lost agent now pauses a workflow instead of failing it (ADR 0003).", tags: ["tests", "ports", "adr-0003"], source: { kind: "merged", pr: 196 }, written: "Aug 15", lastUsed: "Today 02:41", injected: 23, lastInjected: "orc-18 · 51m ago", score: 0.31 },
  { id: "m-p10", scope: "project", project: "orchestrai", kind: "fact", content: "CI runs clippy with -D warnings, so run `cargo clippy --locked --all-targets -- -D warnings` before pushing.", tags: ["ci", "rust"], source: { kind: "merged", pr: 190 }, written: "Aug 9", lastUsed: "Today 02:30", injected: 19, lastInjected: "clip-38 · Today 02:30", score: 0.17 },
  { id: "m-p9", scope: "project", project: "orchestrai", kind: "fact", content: "The data directory is `~/.warpforge`; the project registry is `~/.warpforge/projects.json`.", tags: ["paths"], source: { kind: "you", note: "Imported from CLAUDE.md" }, written: "Jun 3", lastUsed: "41 days ago", injected: 30, lastInjected: "Aug 21", score: 0.08 },

  { id: "m-g1", scope: "global", kind: "preference", content: "Commits stay small, one logical change each, and every commit carries a changeset written for users, not maintainers.", tags: ["git", "changesets"], source: { kind: "you" }, written: "Jun 1", lastUsed: "42m ago", injected: 214, lastInjected: "orc-03 · 42m ago", score: 0.29 },
  { id: "m-g2", scope: "global", kind: "fact", content: "Run `cargo clippy --locked --all-targets -- -D warnings` before pushing; CI rejects on it.", tags: ["ci", "rust"], source: { kind: "you" }, written: "Jun 1", lastUsed: "Today 02:30", injected: 180, lastInjected: "clip-38 · Today 02:30", score: 0.18, links: [{ to: "m-p10", relation: "supports" }] },
  { id: "m-g3", scope: "global", kind: "preference", content: "TypeScript: double quotes, no semicolons, 2-space indent, function components, files under 400 lines.", tags: ["typescript", "style"], source: { kind: "you" }, written: "Jun 1", lastUsed: "Today 11:20", injected: 96, lastInjected: "web-13 · Just now", score: 0.05 },
  { id: "m-g4", scope: "global", kind: "gotcha", content: "Desktop builds need Bun 1.1: `bun install --frozen-lockfile` fails on 1.0.", tags: ["bun", "desktop"], source: { kind: "you" }, written: "May 12", lastUsed: "41 days ago", injected: 40, lastInjected: "Aug 21", score: 0.04 },

  { id: "m-w1", scope: "project", project: "acme-web", kind: "gotcha", pinned: true, content: "The home hero reserves its height with `aspect-ratio`. Never lazy-load the LCP image; that was the layout-shift regression fixed in #87.", tags: ["performance", "cls"], source: { kind: "merged", pr: 87, task: "web-09" }, written: "2d ago", lastUsed: "Just now", injected: 4, lastInjected: "web-13 · Just now", score: 0.7 },
  { id: "m-y1", scope: "project", project: "payments", kind: "decision", pinned: true, content: "Money is an integer in minor units, never a float. Rounding happens once, at display, with banker's rounding.", tags: ["money", "refunds"], source: { kind: "you" }, written: "Apr 2", lastUsed: "Just now", injected: 77, lastInjected: "pay-31 · Just now", score: 0.8 },
  { id: "m-f1", scope: "project", project: "warpforge", kind: "gotcha", content: "Verify refuses a task in its own worktree: dev services run from the project checkout, so they would test code that is not the change (ADR 0024).", tags: ["workflows", "verify", "adr-0024"], source: { kind: "merged", pr: 1311, task: "wf-3" }, written: "Mon", lastUsed: "Mon", injected: 1, score: 0.6 },
  { id: "m-k1", scope: "project", project: "handbook", kind: "preference", content: "Commands in pages are copy-pasteable: no `$` prompts, one command per block, and placeholders in `<angle-brackets>`.", tags: ["style", "commands"], source: { kind: "you" }, written: "Mar 18", lastUsed: "Yesterday", injected: 12, lastInjected: "hb-4 · Yesterday", score: 0.6 },
]

export const PROPOSALS: readonly DreamProposal[] = [
  { id: 41, type: "superseded_by", targets: ["m-p9", "m-p3"], reason: "Says ~/.warpforge; the decision merged in #208 moved the data directory to ~/.orchestrai. Checked against src/registry.rs.", status: "pending", created: "Today 03:00", by: "goose" },
  { id: 40, type: "duplicate", targets: ["m-g2", "m-p10"], reason: "duplicate content", status: "pending", created: "Today 03:00", by: "heuristic" },
  { id: 39, type: "stale", targets: ["m-g4"], reason: "stale 30d: not used in 41 days, and desktop/package.json now pins Bun 1.2", status: "pending", created: "Today 03:00", by: "heuristic" },
  { id: 36, type: "merge", targets: ["m-p4", "m-p6"], reason: "Both are about upstream syncs; one memory would be shorter.", status: "rejected", created: "Yesterday 03:00", by: "goose" },
]

/** A project's view: its own entries, its tasks' held lessons, and every global entry. */
export function memoriesFor(project: ProjectId): MemoryEntry[] {
  return MEMORIES.filter((entry) => entry.scope === "global" || entry.project === project)
}

export function findMemory(id: string | undefined): MemoryEntry | undefined {
  return MEMORIES.find((entry) => entry.id === id)
}

/** Roughly four characters a token, as the slice budget counts them. */
export function tokensOf(entry: Pick<MemoryEntry, "content">): number {
  return Math.ceil(entry.content.length / 4)
}

/** A proposal shows where every memory it names is visible, so no project sees half of one. */
export function proposalsFor(project: ProjectId): DreamProposal[] {
  const ids = new Set(memoriesFor(project).map((entry) => entry.id))
  return PROPOSALS.filter((proposal) => proposal.targets.every((id) => ids.has(id)))
}
