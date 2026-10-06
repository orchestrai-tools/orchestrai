import { useMemo } from "react"
import { create } from "zustand"

import type { AgentId } from "@/data/agents"
import { issuesFor, pullsFor, type Issue, type PullRequest } from "@/data/github"
import { findTask } from "@/data/tasks"
import type { ProjectId } from "@/lib/projects"

/** A task started from an issue or a backlog item here. It links both ways: the source names the task, the task names its source. */
export interface StartedTask {
  id: string
  title: string
  agent: AgentId
  workflow: string
  /** What the task's pull request will say, so merging it closes the source. */
  closes: string
}

export type GithubTab = "pulls" | "issues"

interface GithubStore {
  pullPatch: Record<string, Partial<PullRequest>>
  created: PullRequest[]
  /** Keyed by source: `issue:<project>#<number>` or `item:<id>`. */
  started: Record<string, StartedTask>
  tab: Record<string, GithubTab>
  selectedPull: Record<string, number | undefined>
  selectedIssue: Record<string, number | undefined>
  patchPull: (project: ProjectId, number: number, patch: Partial<PullRequest>) => void
  addPull: (pull: PullRequest) => void
  startTask: (source: string, task: StartedTask) => void
  setTab: (key: string, tab: GithubTab) => void
  selectPull: (key: string, number?: number) => void
  selectIssue: (key: string, number?: number) => void
}

export const useGithubStore = create<GithubStore>()((set) => ({
  pullPatch: {},
  created: [],
  started: {},
  tab: {},
  selectedPull: {},
  selectedIssue: {},
  patchPull: (project, number, patch) =>
    set((store) => {
      const key = `${project}#${number}`
      return { pullPatch: { ...store.pullPatch, [key]: { ...store.pullPatch[key], ...patch } } }
    }),
  addPull: (pull) => set((store) => ({ created: [pull, ...store.created] })),
  startTask: (source, task) => set((store) => ({ started: { ...store.started, [source]: task } })),
  setTab: (key, tab) => set((store) => ({ tab: { ...store.tab, [key]: tab } })),
  selectPull: (key, number) => set((store) => ({ selectedPull: { ...store.selectedPull, [key]: number } })),
  selectIssue: (key, number) => set((store) => ({ selectedIssue: { ...store.selectedIssue, [key]: number } })),
}))

export const issueSource = (project: ProjectId, number: number) => `issue:${project}#${number}`

/** The task working on an issue: one that came with it, or one started from it here. */
export function useIssueTask(issue: Issue) {
  const started = useGithubStore((store) => store.started[issueSource(issue.project, issue.number)])
  return { task: findTask(issue.task), started }
}

/** The project's pull requests as GitHub would answer now: the data, plus what was done here. */
export function usePulls(project: ProjectId): PullRequest[] {
  const created = useGithubStore((store) => store.created)
  const patches = useGithubStore((store) => store.pullPatch)
  return useMemo(
    () =>
      [...created.filter((entry) => entry.project === project), ...pullsFor(project)].map((entry) => ({
        ...entry,
        ...patches[`${project}#${entry.number}`],
      })),
    [created, patches, project]
  )
}

/** The next number GitHub would hand out: issues and pull requests share one sequence. */
export function nextNumber(project: ProjectId) {
  const { created } = useGithubStore.getState()
  const numbers = [...pullsFor(project), ...created.filter((entry) => entry.project === project), ...issuesFor(project)].map((entry) => entry.number)
  return Math.max(0, ...numbers) + 1
}
