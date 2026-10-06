import {
  buildTaskGroupIndex,
  isTaskGroupPinned,
  resolvePinnedTaskGroups,
  setTaskGroupPinned,
} from "@warpforge/core/taskGroups";
import type { TaskInfo } from "@warpforge/protocol";

/** The next saved pin list. Pinning a worker pins its lead, once. */
export function nextPinnedIds(
  tasks: TaskInfo[],
  pinned: readonly string[],
  taskId: string,
): string[] {
  const index = buildTaskGroupIndex(tasks);
  if (!index.rootByTaskId.has(taskId)) {
    return pinned.includes(taskId) ? pinned.filter((id) => id !== taskId) : [...pinned, taskId];
  }
  return setTaskGroupPinned(index, pinned, taskId, !isTaskGroupPinned(index, pinned, taskId));
}

export function taskIsPinned(
  tasks: TaskInfo[],
  pinned: readonly string[],
  taskId: string,
): boolean {
  const index = buildTaskGroupIndex(tasks);
  if (!index.rootByTaskId.has(taskId)) return pinned.includes(taskId);
  return isTaskGroupPinned(index, pinned, taskId);
}

/** One card per pinned lead, in the order the pins were saved. */
export function pinnedRoots(tasks: TaskInfo[], pinned: readonly string[]): TaskInfo[] {
  return resolvePinnedTaskGroups(buildTaskGroupIndex(tasks), [...pinned]).map(
    (group) => group.task,
  );
}
