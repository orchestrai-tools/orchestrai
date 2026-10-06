import type { TaskInfo } from "@warpforge/protocol";

/**
 * Finished turns with nothing to look at: the agent parked the task in
 * `waiting`, no diff came out of it, and the user has not replied. These are
 * what "Settle finished turns" bulk-settles in one click. Snoozed rows keep
 * their wake countdown, and anything already settled is left alone.
 */
export function settleableTasks(tasks: TaskInfo[], nowSec: number): TaskInfo[] {
  return tasks.filter((task) => {
    const snoozed =
      typeof task.snoozedAt === "number" &&
      typeof task.snoozedUntil === "number" &&
      task.snoozedUntil > nowSec;
    return task.status === "waiting" && task.filesChanged === 0 && task.settledOverride !== true && !snoozed;
  });
}

/** A task the agent completed, or one the user marked handled. */
export function isSettledTask(task: TaskInfo): boolean {
  return task.status === "done" || task.settledOverride === true;
}
