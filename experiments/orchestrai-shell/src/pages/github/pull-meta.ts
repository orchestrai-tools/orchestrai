import { findAgent } from "@/data/agents"
import type { Checks, PullRequest, PullState, Review } from "@/data/github"
import { taskDetail } from "@/data/task-detail"
import { findTask } from "@/data/tasks"
import type { ProjectId } from "@/lib/projects"

export const CHECK_DOT: Record<Checks, string> = {
  passing: "bg-emerald-500",
  failing: "bg-red-500",
  pending: "bg-amber-500",
  none: "border border-muted-foreground/50",
}

export const CHECK_LABEL: Record<Checks, string> = { passing: "Passing", failing: "Failing", pending: "Running", none: "No checks" }
export const REVIEW_LABEL: Record<Review, string> = { approved: "Approved", "changes-requested": "Changes requested", "review-required": "Review required", none: "No review yet" }
export const STATE_LABEL: Record<PullState, string> = { draft: "Draft", open: "Open", merged: "Merged", closed: "Closed" }

export function pullUrl(pull: Pick<PullRequest, "number">, repo: string) {
  return `https://github.com/${repo}/pull/${pull.number}`
}

/** Who to name for a pull request: the agent that wrote it, or the person who opened it. */
export function authorLabel(pull: PullRequest) {
  if (pull.agent) return findAgent(pull.agent).name
  return pull.author.replace("[bot]", "")
}

const CHECK_NAMES: Record<ProjectId, string[]> = {
  orchestrai: ["cargo fmt --check", "cargo clippy -D warnings", "desktop lint + typecheck", "cargo test"],
  warpforge: ["cargo fmt --check", "cargo clippy -D warnings", "desktop lint + typecheck", "cargo test"],
  "acme-web": ["build", "lint", "e2e · playwright", "lighthouse"],
  payments: ["go test ./...", "golangci-lint", "migrations · pg17"],
  handbook: [],
}

export interface CheckRun {
  name: string
  status: "passing" | "failing" | "pending"
  duration: string
}

const ORDER = { failing: 0, pending: 1, passing: 2 } as const

/** Every check on the head commit, failures first, then the running ones: the order a reviewer triages them. */
export function checkRuns(pull: PullRequest): CheckRun[] {
  const detail = pull.task ? taskDetail(pull.task) : undefined
  const runs: CheckRun[] = detail
    ? detail.checks
    : pull.checks === "none"
      ? []
      : CHECK_NAMES[pull.project].map((name, index, names) => {
          const last = index === names.length - 1
          const status = last && pull.checks !== "passing" ? (pull.checks === "failing" ? "failing" : "pending") : "passing"
          return { name, status, duration: status === "pending" ? "—" : `${1 + ((index * 37 + pull.number) % 5)}m ${(pull.number * 13 + index * 7) % 60}s` }
        })
  return [...runs].sort((a, b) => ORDER[a.status] - ORDER[b.status])
}

export interface Attempt {
  n: number
  result: "failed" | "running" | "passed"
  detail: string
}

/**
 * The fix loop after a task's last stop: push, watch CI, let the agent fix a
 * failure, up to the cap. At the cap it stops and asks instead of opening the PR.
 */
export function attemptsFor(pull: PullRequest): { used: number; cap: number; history: Attempt[] } | undefined {
  const task = findTask(pull.task)
  if (!task?.attempts) return undefined
  const failing = checkRuns(pull).find((run) => run.status === "failing")?.name ?? "cargo test"
  const { used, cap } = task.attempts
  const history = Array.from({ length: used }, (_, index): Attempt => {
    const n = index + 1
    if (n < used) return { n, result: "failed", detail: `${failing} failed; the agent pushed a fix` }
    if (pull.checks === "pending") return { n, result: "running", detail: "Pushed; checks are running" }
    if (pull.checks === "failing") return { n, result: "failed", detail: `${failing} failed again` }
    return { n, result: "passed", detail: "Checks passed" }
  })
  return { used, cap, history }
}

/** People who can be asked for a review in each repository. */
export const REVIEWERS: Record<ProjectId, string[]> = {
  orchestrai: ["mkim", "rsilva", "jpark"],
  warpforge: ["wfmaint"],
  "acme-web": ["lchen", "rsilva"],
  payments: ["dkaur"],
  handbook: ["lchen"],
}

/** Changed files of a task's pull request, split the way a reviewer reads them: prose first, then code. */
export function changedFiles(pull: PullRequest) {
  const files = pull.task ? taskDetail(pull.task)?.files ?? [] : []
  const prose = (path: string) => /\.(md|mdx|txt)$/.test(path) || path.startsWith("docs/")
  return {
    documentation: files.filter((entry) => prose(entry.path)),
    implementation: files.filter((entry) => !prose(entry.path)),
  }
}
