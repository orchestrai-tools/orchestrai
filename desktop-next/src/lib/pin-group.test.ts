import { expect, test } from "vitest";
import type { TaskInfo } from "@warpforge/protocol";
import { nextPinnedIds, pinnedRoots, taskIsPinned } from "./pin-group";

function task(id: string, parentTaskId: string | null = null): TaskInfo {
  return {
    id,
    project: "demo",
    prompt: id,
    agent: "claude",
    status: "running",
    tags: [],
    title: id,
    createdAt: 0,
    updatedAt: 0,
    filesChanged: 0,
    blockedReason: null,
    parentTaskId,
  };
}

test("pinning a worker pins the lead once", () => {
  const tasks = [task("lead"), task("worker", "lead")];
  const pinned = nextPinnedIds(tasks, [], "worker");
  expect(pinned).toEqual(["lead"]);
  expect(taskIsPinned(tasks, pinned, "worker")).toBe(true);
  expect(pinnedRoots(tasks, pinned).map((item) => item.id)).toEqual(["lead"]);
  expect(nextPinnedIds(tasks, pinned, "worker")).toEqual([]);
});
