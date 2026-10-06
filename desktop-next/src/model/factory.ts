import type { RunnerEntry, RunnerWait, TaskInfo } from "@warpforge/protocol";
import { isChat } from "./chat";

export function isFactoryTask(task: Pick<TaskInfo, "tags">): boolean {
  return task.tags.some((tag) => tag === "runner" || tag.startsWith("workflow:"));
}

/**
 * An agent turn is in progress. A Factory task still waiting for a slot is not
 * one, nor is a chat waiting for its first message.
 */
export function agentTurnActive(
  task: Pick<TaskInfo, "status" | "tags" | "workflowRun"> & Partial<Pick<TaskInfo, "origin">>,
): boolean {
  if (task.status === "running") return true;
  if (task.status !== "queued" || isChat(task)) return false;
  return !(isFactoryTask(task) && !task.workflowRun);
}

export function canRunAgain(task: Pick<TaskInfo, "tags" | "status" | "workflowRun">): boolean {
  if (!isFactoryTask(task)) return false;
  return task.status === "interrupted" || task.status === "blocked" || task.workflowRun?.stage === "failed";
}

export function queuedOrder(entries: Pick<RunnerEntry, "state" | "taskId">[]): string[] {
  return entries.filter((entry) => entry.state === "queued").map((entry) => entry.taskId);
}

/** Why a Factory task, or the whole project, is not starting. */
export function waitLabel(wait: RunnerWait | null | undefined): string | null {
  if (!wait) return null;
  switch (wait.kind) {
    case "slots":
      return `Waiting for a free slot (${wait.inUse} of ${wait.limit})`;
    case "open_prs":
      return `Waiting until fewer pull requests are open (${wait.open} of ${wait.limit})`;
    case "daily":
      return `Daily limit reached (${wait.started} of ${wait.limit})`;
    case "quota":
      return `Waiting on ${wait.agent} quota`;
    case "disk":
      return `Waiting for disk space (${wait.freeGb} GB free, needs ${wait.minGb})`;
    case "checkout_busy":
      return wait.detail ? `Checkout is busy: ${wait.detail}` : "Checkout is busy";
    case "checkout_held":
      return wait.reason;
    case "workflow_invalid":
      return wait.error;
    case "other":
      return wait.detail;
  }
}

export function isSnoozed(task: TaskInfo, nowSec = Math.floor(Date.now() / 1000)): boolean {
  return (
    typeof task.snoozedAt === "number" &&
    task.snoozedAt > 0 &&
    typeof task.snoozedUntil === "number" &&
    task.snoozedUntil > nowSec
  );
}

/** Compact "comes back in" label for a snoozed card. */
export function snoozeWakeLabel(untilSec: number, nowSec: number): string {
  const seconds = Math.max(0, untilSec - nowSec);
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/** Worktree, block reason, and snooze, the facts that used to live in the row tooltip. */
export function cardFacts(task: TaskInfo, nowSec = Math.floor(Date.now() / 1000)): string[] {
  const facts: string[] = [];
  if (task.worktree) facts.push(task.worktree);
  if (task.blockedReason) facts.push(task.blockedReason);
  if (isSnoozed(task, nowSec) && typeof task.snoozedUntil === "number") {
    facts.push(`back in ${snoozeWakeLabel(task.snoozedUntil, nowSec)}`);
  }
  return facts;
}
