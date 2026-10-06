export type ProjectId = "orchestrai" | "warpforge" | "acme-web" | "handbook" | "payments"

/** A project is a repository on disk, and the namespace everything else lives under. */
export interface Project {
  id: ProjectId
  name: string
  initial: string
  /** Background of the project's badge. */
  color: string
  repo: string
  path: string
  branch: string
  /** Agents working in the project right now, as reported by their sessions. */
  running: number
  /** Approvals and questions waiting for a person. */
  needsYou: number
  updated: string
}

export const PROJECTS: readonly Project[] = [
  { id: "orchestrai", name: "orchestrai", initial: "O", color: "bg-neutral-900 dark:bg-neutral-100 dark:text-neutral-900", repo: "orchestrai-tools/orchestrai", path: "~/projects/orchestrai", branch: "main", running: 3, needsYou: 2, updated: "Just now" },
  { id: "warpforge", name: "warpforge", initial: "W", color: "bg-orange-600", repo: "warpforgehq/warpforge", path: "~/projects/warpforge", branch: "main", running: 0, needsYou: 0, updated: "2h ago" },
  { id: "acme-web", name: "acme-web", initial: "A", color: "bg-sky-600", repo: "acme/web", path: "~/projects/acme-web", branch: "main", running: 1, needsYou: 1, updated: "12m ago" },
  { id: "handbook", name: "handbook", initial: "H", color: "bg-emerald-600", repo: "acme/handbook", path: "~/docs/handbook", branch: "main", running: 0, needsYou: 0, updated: "Yesterday" },
  { id: "payments", name: "payments-api", initial: "P", color: "bg-violet-600", repo: "acme/payments-api", path: "~/projects/payments-api", branch: "develop", running: 2, needsYou: 0, updated: "4m ago" },
]

export const PROJECT_IDS: readonly ProjectId[] = PROJECTS.map((project) => project.id)

export function findProject(id: ProjectId): Project {
  return PROJECTS.find((project) => project.id === id) ?? PROJECTS[0]
}
