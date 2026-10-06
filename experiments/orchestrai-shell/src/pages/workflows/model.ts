import { automationsFor } from "@/data/automations"
import { tasksFor } from "@/data/tasks"
import { BUILTIN_WORKFLOWS, type Workflow } from "@/data/workflows"
import { PROJECT_WORKFLOWS } from "@/data/workflows-project"
import type { ProjectId } from "@/lib/projects"

export const fileKey = (project: ProjectId, workflow: Workflow) => `${project}:${workflow.id}`

/**
 * The project's files (minus ones deleted here, plus ones made here), then
 * the built-ins no file overrides, the way the daemon lists them.
 */
export function listWorkflows(project: ProjectId, added: readonly Workflow[], removed: readonly string[]): Workflow[] {
  const files = [
    ...PROJECT_WORKFLOWS.filter((workflow) => workflow.projects?.includes(project) && !removed.includes(fileKey(project, workflow))),
    ...added.filter((workflow) => workflow.projects?.includes(project)),
  ]
  const hidden = new Set(files.map((workflow) => workflow.id))
  return [...files, ...BUILTIN_WORKFLOWS.filter((workflow) => !hidden.has(workflow.id))]
}

/** Board tasks plus tasks automations started that have left the board. A skipped run started no task. */
export function runsOf(workflow: Workflow, project: ProjectId) {
  const tasks = tasksFor(project).filter((task) => task.workflow === workflow.name)
  const automated = automationsFor(project)
    .filter((automation) => automation.workflow === workflow.name)
    .flatMap((automation) => automation.runs.map((run) => ({ automation, run })))
    .filter(({ run }) => run.task && !tasks.some((task) => task.id === run.task))
  return { tasks, automated, count: tasks.length + automated.length }
}

export function uniqueId(base: string, taken: readonly Workflow[]): string {
  const ids = new Set(taken.map((workflow) => workflow.id))
  if (!ids.has(base)) return base
  let index = 2
  while (ids.has(`${base}-${index}`)) index++
  return `${base}-${index}`
}

export function automationsRunning(workflow: Workflow, project: ProjectId) {
  return automationsFor(project).filter((automation) => automation.workflow === workflow.name)
}
