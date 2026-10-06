export type ProjectId = "a" | "b" | "c" | "d" | "e"

export interface Project {
  id: ProjectId
  name: string
  initial: string
  /** Background of the project's badge. */
  color: string
  branch: string
  /** Agents working in the project right now. */
  running: number
  openPrs: number
  tasks: number
  updated: string
}

export const PROJECTS: readonly Project[] = [
  { id: "a", name: "Project A", initial: "A", color: "bg-sky-500", branch: "main", running: 2, openPrs: 4, tasks: 12, updated: "2m ago" },
  { id: "b", name: "Project B", initial: "B", color: "bg-violet-500", branch: "feat/onboarding", running: 0, openPrs: 1, tasks: 5, updated: "1h ago" },
  { id: "c", name: "Project C", initial: "C", color: "bg-emerald-500", branch: "fix/ci-cache", running: 1, openPrs: 2, tasks: 8, updated: "18m ago" },
  { id: "d", name: "Project D", initial: "D", color: "bg-amber-500", branch: "release/2.4", running: 0, openPrs: 0, tasks: 3, updated: "Yesterday" },
  { id: "e", name: "Project E", initial: "E", color: "bg-rose-500", branch: "main", running: 3, openPrs: 6, tasks: 21, updated: "Just now" },
]

export const PROJECT_IDS: readonly ProjectId[] = PROJECTS.map((project) => project.id)

export function findProject(id: ProjectId): Project {
  return PROJECTS.find((project) => project.id === id) ?? PROJECTS[0]
}
