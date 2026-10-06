import { buildAttentionQueue } from "@warpforge/core/attentionRail";
import { isSettledTask } from "@warpforge/core/taskShelf";
import type { SessionUpdate, TaskInfo, TaskPullRequest, TaskStatus } from "@warpforge/protocol";

import { pendingPrFeedback, prFeedbackSummary } from "../lib/pr-feedback";
import { isChat } from "./chat";
import { isSnoozed } from "./factory";

export type ColumnId = "needs-you" | "running" | "review" | "done";

export const COLUMNS: { id: ColumnId; title: string }[] = [
  { id: "needs-you", title: "Needs you" },
  { id: "running", title: "Active" },
  { id: "review", title: "In review" },
  { id: "done", title: "Done" },
];

/** Tasks the PR assistant or an advisor owns, and quick chats, are not board rows. */
export function visibleTasks(tasks: TaskInfo[], project?: string | null): TaskInfo[] {
  return tasks.filter(
    (task) =>
      task.origin !== "pr-review" &&
      task.origin !== "advisor" &&
      !isChat(task) &&
      (project == null || task.project === project),
  );
}

export function columnOf(
  task: TaskInfo,
  hasPullRequest = false,
  needsYou = needsPerson(task),
): ColumnId {
  if (isSettledTask(task)) return "done";
  if (needsYou) return "needs-you";
  if (task.workflowRun?.stage === "review" || hasPullRequest) return "review";
  return "running";
}

/**
 * A person has to act: a permission, a question, a block, a lost session, or a model mismatch.
 * A snooze holds that until it wakes; a task marked settled has left the queue.
 * A chat yields after every reply, so only a permission it is waiting on counts.
 */
export function needsPerson(task: TaskInfo): boolean {
  if (isChat(task)) return task.pendingPermission === true;
  return !isSnoozed(task) && !isSettledTask(task) && buildAttentionQueue([task], {}).length > 0;
}

function feedbackFor(
  tasks: TaskInfo[],
  pulls: Record<string, TaskPullRequest>,
  handled: Record<string, readonly string[]>,
): Map<string, string> {
  const feedback = new Map<string, string>();
  for (const task of tasks) {
    const reason = pendingPrFeedback(pulls[task.id], handled[task.id] ?? []);
    if (reason) feedback.set(task.id, prFeedbackSummary(reason));
  }
  return feedback;
}

export function statusLabel(status: TaskStatus): string {
  return status.replace("_", " ");
}

export function groupByColumn(
  tasks: TaskInfo[],
  pulls: Record<string, TaskPullRequest> = {},
  handled: Record<string, readonly string[]> = {},
  updates: Record<string, SessionUpdate[]> = {},
): Record<ColumnId, TaskInfo[]> {
  const needing = new Set(
    buildAttentionQueue(tasks, updates, feedbackFor(tasks, pulls, handled))
      .map((item) => item.task)
      .filter((task) => !isSnoozed(task))
      .map((task) => task.id),
  );
  const grouped: Record<ColumnId, TaskInfo[]> = {
    "needs-you": [],
    running: [],
    review: [],
    done: [],
  };
  for (const task of tasks) {
    grouped[columnOf(task, task.id in pulls, needing.has(task.id))].push(task);
  }
  return grouped;
}

export function waitingTasks(
  tasks: TaskInfo[],
  pulls: Record<string, TaskPullRequest> = {},
  handled: Record<string, readonly string[]> = {},
  updates: Record<string, SessionUpdate[]> = {},
): TaskInfo[] {
  return buildAttentionQueue(tasks, updates, feedbackFor(tasks, pulls, handled))
    .map((item) => item.task)
    .filter((task) => !isSnoozed(task) && !isSettledTask(task));
}
