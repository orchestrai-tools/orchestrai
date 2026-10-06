import type { BacklogItem, TaskInfo } from "@warpforge/protocol";

const COLUMN: Record<string, string> = {
  todo: "To do",
  in_progress: "In progress",
  waiting: "Waiting",
  done: "Done",
  cancelled: "Cancelled",
};

/** GitHub's own state for the issue, read from the importer's remote status. */
export function issueClosed(issue: Pick<BacklogItem, "remoteStatus" | "status">): boolean {
  if (issue.remoteStatus) return /^closed/i.test(issue.remoteStatus);
  return issue.status === "done" || issue.status === "cancelled";
}

/** Where the issue sits in the project backlog. */
export function issueColumn(status: string): string {
  return COLUMN[status] ?? status;
}

/** The task working on an issue: one the backlog links, or one just started here. */
export function issueTask(
  issue: Pick<BacklogItem, "id" | "taskId">,
  tasks: readonly TaskInfo[],
  started: Record<string, string>,
): { id: string; task: TaskInfo | null } | null {
  const id = issue.taskId || started[issue.id];
  if (!id) return null;
  return { id, task: tasks.find((task) => task.id === id) ?? null };
}
