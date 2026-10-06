import { describe, expect, it } from "vitest";
import type { TaskInfo } from "@warpforge/protocol";
import {
  queuePaletteActions,
  taskPaletteActions,
  useArchiveWorktree,
  useDeleteTask,
} from "./task-palette";

function task(patch: Partial<TaskInfo> = {}): TaskInfo {
  return {
    id: "task-1",
    project: "app",
    prompt: "Fix the bug",
    agent: "claude",
    status: "waiting",
    tags: [],
    title: "Fix the bug",
    createdAt: 0,
    updatedAt: 0,
    filesChanged: 0,
    blockedReason: null,
    ...patch,
  };
}

describe("task palette actions", () => {
  it("lists remind, pin, archive, and delete for an open task", () => {
    const labels = taskPaletteActions(task(), false).map((action) => action.label);
    expect(labels).toContain("Remind later · 1 hour");
    expect(labels).toContain("Pin to Home");
    expect(labels).toContain("Archive task");
    expect(labels).toContain("Delete task…");
    expect(
      taskPaletteActions(task(), true).some((action) => action.label === "Unpin from Home"),
    ).toBe(true);
  });

  it("asks before removing a worktree", () => {
    const archive = taskPaletteActions(task({ worktree: "feat/shell" }), false).find(
      (action) => action.id === "archive-worktree",
    );
    archive?.run();
    expect(useArchiveWorktree.getState().taskId).toBe("task-1");
    useArchiveWorktree.getState().clear();
  });

  it("asks before deleting", () => {
    const del = taskPaletteActions(task(), false).find((action) => action.id === "delete");
    del?.run();
    expect(useDeleteTask.getState().taskId).toBe("task-1");
    useDeleteTask.getState().clear();
  });

  it("offers queue controls only while the task is waiting", () => {
    const labels = queuePaletteActions(task({ tags: ["runner"] }), ["other", "task-1"]).map(
      (action) => action.label,
    );
    expect(labels).toEqual(["Start now", "Move up", "Remove from queue"]);
    expect(queuePaletteActions(task(), [])).toEqual([]);
  });
});
