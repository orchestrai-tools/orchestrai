/** The checkout a git call runs in: a task's worktree, or the project's own checkout when no task is open. */
export type RepoTarget = { task_id: string } | { project: string };

export function repoTarget(taskId: string, project: string): RepoTarget {
  return taskId ? { task_id: taskId } : { project };
}

/** One string per checkout, for effect dependencies and the title bar's git activity. */
export function targetKey(target: RepoTarget): string {
  return "task_id" in target ? target.task_id : `project:${target.project}`;
}

export function targetTaskId(target: RepoTarget): string {
  return "task_id" in target ? target.task_id : "";
}
