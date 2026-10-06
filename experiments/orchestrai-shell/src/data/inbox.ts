import type { AgentId } from "@/data/agents"
import type { ProjectId } from "@/lib/projects"

export type Risk = "low" | "medium" | "high"

/** Everything that needs a person, from every agent, in one place (Antigravity's inbox). */
export interface InboxItem {
  id: string
  project: ProjectId
  task: string
  agent: AgentId
  kind: "permission" | "question" | "ci" | "review"
  title: string
  detail: string
  /** The exact command or change being asked about. */
  subject?: string
  risk: Risk
  /** For questions: the choices the agent offers. */
  options?: string[]
  time: string
}

export const INBOX: readonly InboxItem[] = [
  { id: "in-1", project: "orchestrai", task: "orc-05", agent: "codex", kind: "permission", title: "Run the session resume tests", detail: "Runs the daemon's integration tests in the task worktree. No network, no writes outside the worktree.", subject: "cargo test -p warpforge daemon::tests::sessions", risk: "medium", time: "2m" },
  { id: "in-2", project: "orchestrai", task: "orc-10", agent: "gemini", kind: "question", title: "Should a project allowlist override the global denylist?", detail: "Two projects allowlist `rm -rf build/`, which the global denylist blocks. The ticket says the denylist wins.", risk: "low", options: ["Denylist always wins", "Project allowlist can override", "Ask per command"], time: "18m" },
  { id: "in-3", project: "orchestrai", task: "fix-resume", agent: "claude", kind: "ci", title: "CI failed 3 of 3 attempts", detail: "`resume_replays_once` fails about one run in three on CI and never locally. The run stopped instead of opening the PR.", risk: "low", options: ["Give it 2 more attempts", "Mark flaky and open the PR", "Hand it to me"], time: "1h" },
  { id: "in-4", project: "orchestrai", task: "orc-08", agent: "codex", kind: "review", title: "Review draft PR #214", detail: "Sinew bottom terminal drawer · 11 files · checks passing. The run stopped at merge, as set.", risk: "low", time: "35m" },
  { id: "in-5", project: "acme-web", task: "web-12", agent: "claude", kind: "permission", title: "Install @stripe/stripe-js", detail: "Needs network access to the npm registry and writes package.json and the lockfile.", subject: "npm install @stripe/stripe-js@^5", risk: "high", time: "4m" },
]

export function inboxFor(project: ProjectId): InboxItem[] {
  return INBOX.filter((item) => item.project === project)
}

export const KIND_LABEL: Record<InboxItem["kind"], string> = {
  permission: "Permission",
  question: "Question",
  ci: "CI stopped",
  review: "Review",
}
