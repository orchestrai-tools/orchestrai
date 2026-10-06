import { buildAttentionQueue } from "@warpforge/core/attentionRail";
import { isSettledTask } from "@warpforge/core/taskShelf";
import type { SessionUpdate, TaskInfo, TaskPullRequest } from "@warpforge/protocol";

import { pendingPrFeedback, prFeedbackSummary } from "../../lib/pr-feedback";
import { isSnoozed } from "../../model/factory";

export type InboxKind = "permission" | "question" | "decision" | "pull" | "blocked";

export const KIND_LABEL: Record<InboxKind, string> = {
  permission: "Permission",
  question: "Question",
  decision: "Decision",
  pull: "Pull request",
  blocked: "Blocked",
};

export const KINDS: readonly InboxKind[] = [
  "permission",
  "question",
  "decision",
  "pull",
  "blocked",
];

export interface InboxEntry {
  task: TaskInfo;
  kind: InboxKind;
  /** Why it waits, in the words the attention queue uses. */
  reason: string;
}

function kindOf(task: TaskInfo, permission: boolean, feedback: boolean): InboxKind {
  if (permission) return "permission";
  const waiting = task.workflowRun?.waiting;
  if (waiting?.kind === "question") return "question";
  if (waiting?.kind === "limit") return "decision";
  if (waiting?.kind === "paused" || task.status === "blocked" || task.status === "interrupted")
    return "blocked";
  return feedback ? "pull" : "blocked";
}

/** What waits on a person, most urgent first: the same queue as `waitingTasks`, with the reason and kind kept. */
export function inboxEntries(
  tasks: TaskInfo[],
  pulls: Record<string, TaskPullRequest>,
  handled: Record<string, readonly string[]>,
  updates: Record<string, SessionUpdate[]>,
): InboxEntry[] {
  const feedback = new Map<string, string>();
  for (const task of tasks) {
    const pending = pendingPrFeedback(pulls[task.id], handled[task.id] ?? []);
    if (pending) feedback.set(task.id, prFeedbackSummary(pending));
  }
  return buildAttentionQueue(tasks, updates, feedback)
    .filter((item) => !isSnoozed(item.task) && !isSettledTask(item.task))
    .map((item) => ({
      task: item.task,
      reason: item.reason,
      kind: kindOf(item.task, Boolean(item.permission), feedback.has(item.task.id)),
    }));
}
