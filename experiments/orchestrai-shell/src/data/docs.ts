import type { ProjectId } from "@/lib/projects"

/** The two big piles of markdown: the agents' work, and the wiki. */
export type DocFolder = "Plans" | "Transcripts" | "Wiki" | "Decisions"

export interface Doc {
  id: string
  project: ProjectId | "global"
  folder: DocFolder
  title: string
  path: string
  updated: string
  /** The task that wrote it, for plans and transcripts. */
  task?: string
  markdown: string
}

const ARCHITECTURE = `# Architecture

The daemon owns everything that must outlive the window: ACP sessions, worktrees, services, and the search index. The desktop app is a client over WebSocket JSON-RPC.

| Part | Owns |
| --- | --- |
| Daemon | ACP sessions, resume (\`session/load\`), worktrees, services, ports, memory index |
| Desktop | Rendering, input, layout |
| Workers | Claude Code, Codex, Gemini CLI, Goose, OpenCode over ACP |

## Why the window is only a client
Closing it must not kill an agent halfway through a change. Resume replays the transcript once, and a recovery test guards it.

## Ports
Each project gets a 100-port range starting at 4000. \`\${svc.port}\` interpolates into environment variables.

- [ ] Document the remote relay
- [x] Document worktree isolation`

const RELEASING = `# Releasing

Every commit carries a changeset. The **Version release** workflow owns versions and the changelog.

1. Run \`bun run changeset\` with the change.
2. Write it for users: the outcome, not the RPC.
3. Merge. The workflow opens the version PR.

> Never hand-edit \`CHANGELOG.md\`.`

const PHILOSOPHY = `# Design philosophy (short)

Keep every feature, show few of them. The person's work takes the screen. Everything else is quiet until it is needed, and one place reaches all of it.

## The rules this shell follows
- **The work takes the screen.** Rendered markdown first; the editor sits beside it.
- **One place reaches everything.** ⌘K, with every action and its shortcut.
- **Stable layout.** Sidebar, work, inspector, drawer. Collapsible, never floating.
- **Status lives at the edge.** A dot on a tab; only what needs you comes to the center.
- **Agent work is a board.** One card per task, one inbox for every approval.
- **A stop is a handoff.** What it was about to do, what it was unsure about, the one action that continues.`

export const DOCS: readonly Doc[] = [
  { id: "plan-orc-03", project: "orchestrai", folder: "Plans", title: "ORC-03 Docs library", path: "plans/orc-03-docs-library.md", updated: "Just now", task: "orc-03", markdown: "" },
  { id: "plan-orc-05", project: "orchestrai", folder: "Plans", title: "ORC-05 Session board", path: "plans/orc-05-session-board.md", updated: "1h ago", task: "orc-05", markdown: "" },
  { id: "tr-orc-08", project: "orchestrai", folder: "Transcripts", title: "ORC-08 Terminal drawer", path: "transcripts/orc-08.md", updated: "35m ago", task: "orc-08", markdown: "# ORC-08 transcript\n\n**You:** Build the Sinew drawer.\n\n**Codex:** The strip is 28 px with one tab per session and a status on each tab.\n\n```\n$ bun run test drawer\n✓ 12 passed\n```" },
  { id: "tr-orc-01", project: "orchestrai", folder: "Transcripts", title: "ORC-01 Rename", path: "transcripts/orc-01.md", updated: "Yesterday", task: "orc-01", markdown: "# ORC-01 transcript\n\nRenamed user-facing strings; the data directory is now `~/.orchestrai`." },
  { id: "wiki-arch", project: "orchestrai", folder: "Wiki", title: "Architecture", path: "wiki/architecture.md", updated: "2d ago", markdown: ARCHITECTURE },
  { id: "wiki-release", project: "orchestrai", folder: "Wiki", title: "Releasing", path: "wiki/releasing.md", updated: "Last week", markdown: RELEASING },
  { id: "dec-philosophy", project: "global", folder: "Decisions", title: "Design philosophy", path: "docs/design/DESIGN-PHILOSOPHY.md", updated: "Today", markdown: PHILOSOPHY },
  { id: "dec-harness", project: "global", folder: "Decisions", title: "Desktop harness decisions", path: "docs/product/DECISIONS.md", updated: "Sep 30", markdown: "# Desktop harness decisions\n\nFork Warpforge. ACP workers stay the model loop. Markdown, viewed and edited, is the primary UI." },
  { id: "wiki-oncall", project: "handbook", folder: "Wiki", title: "On-call guide", path: "on-call.md", updated: "Yesterday", markdown: "# On-call guide\n\n1. Acknowledge within 5 minutes.\n2. Post in #incidents.\n3. Write the timeline as you go." },
  { id: "wiki-web", project: "acme-web", folder: "Wiki", title: "Frontend conventions", path: "docs/conventions.md", updated: "3d ago", markdown: "# Frontend conventions\n\n- Server components by default.\n- Every page has a loading state." },
  { id: "wiki-pay", project: "payments", folder: "Wiki", title: "Refund flow", path: "docs/refunds.md", updated: "4d ago", markdown: "# Refund flow\n\nRefunds are idempotent by `Idempotency-Key`. Retries within 24 hours return the first result." },
]

export const DOC_FOLDERS: readonly DocFolder[] = ["Plans", "Transcripts", "Wiki", "Decisions"]

export function docsFor(project: ProjectId): Doc[] {
  return DOCS.filter((doc) => doc.project === project || doc.project === "global")
}

export function findDoc(id: string | undefined): Doc | undefined {
  return DOCS.find((doc) => doc.id === id)
}
