import type { ProjectId } from "@/lib/projects"

/** A git worktree inside a project. Each task codes in its own; `main` is the project checkout. */
export interface Worktree {
  id: string
  project: ProjectId
  branch: string
  path: string
  /** The task that owns it, if any. */
  task?: string
  dirty: number
  ahead: number
  behind: number
}

export const WORKTREES: readonly Worktree[] = [
  { id: "orchestrai-main", project: "orchestrai", branch: "main", path: "~/projects/orchestrai", dirty: 0, ahead: 0, behind: 2 },
  { id: "orchestrai-orc-03", project: "orchestrai", branch: "orc-03-docs-library", path: ".warpforge/worktrees/orc-03-docs-library", task: "orc-03", dirty: 6, ahead: 4, behind: 0 },
  { id: "orchestrai-orc-05", project: "orchestrai", branch: "orc-05-session-board", path: ".warpforge/worktrees/orc-05-session-board", task: "orc-05", dirty: 3, ahead: 2, behind: 1 },
  { id: "orchestrai-orc-08", project: "orchestrai", branch: "orc-08-terminal-drawer", path: ".warpforge/worktrees/orc-08-terminal-drawer", task: "orc-08", dirty: 0, ahead: 7, behind: 0 },
  { id: "orchestrai-orc-18", project: "orchestrai", branch: "orc-18-tool-hygiene", path: ".warpforge/worktrees/orc-18-tool-hygiene", task: "orc-18", dirty: 1, ahead: 3, behind: 0 },
  { id: "acme-web-main", project: "acme-web", branch: "main", path: "~/projects/acme-web", dirty: 0, ahead: 0, behind: 0 },
  { id: "acme-web-pay", project: "acme-web", branch: "checkout-apple-pay", path: ".warpforge/worktrees/checkout-apple-pay", task: "web-12", dirty: 2, ahead: 1, behind: 0 },
  { id: "payments-main", project: "payments", branch: "develop", path: "~/projects/payments-api", dirty: 0, ahead: 0, behind: 0 },
  { id: "payments-refund", project: "payments", branch: "refund-idempotency", path: ".warpforge/worktrees/refund-idempotency", task: "pay-31", dirty: 4, ahead: 2, behind: 0 },
  { id: "warpforge-main", project: "warpforge", branch: "main", path: "~/projects/warpforge", dirty: 0, ahead: 0, behind: 0 },
  { id: "handbook-main", project: "handbook", branch: "main", path: "~/docs/handbook", dirty: 1, ahead: 0, behind: 0 },
]

export function worktreesFor(project: ProjectId): Worktree[] {
  return WORKTREES.filter((worktree) => worktree.project === project)
}
