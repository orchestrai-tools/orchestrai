import { beforeEach, describe, expect, it, vi } from "vitest";

const daemon = vi.hoisted(() => ({
  request: vi.fn(),
  linkWorkItemTask: vi.fn(),
  listBacklog: vi.fn(),
  runnerEnqueue: vi.fn(),
}));
vi.mock("@warpforge/daemon", () => ({ daemon }));

import { startNewTask, type NewTaskInput } from "./submit";

const base: NewTaskInput = {
  project: "demo",
  prompt: "Fix the board",
  agent: "claude",
  models: [],
  picks: {},
  mode: "single",
  tags: "",
  worktree: false,
  base: "",
  shareServices: false,
  advisor: null,
  workflow: "",
  deliver: true,
  location: "default",
  batch: [],
  scope: { all: false, total: 0, search: "", status: "todo", source: "all" },
  workItemId: null,
};

describe("startNewTask with a backlog item", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    daemon.request.mockResolvedValue({ taskId: "t1" });
    daemon.linkWorkItemTask.mockResolvedValue(undefined);
  });

  it("links the new task to the item", async () => {
    const result = await startNewTask({ ...base, workItemId: "item-3" });
    expect(daemon.request).toHaveBeenCalledWith(
      "task.create",
      expect.objectContaining({ backlog_item_id: "item-3" }),
    );
    expect(daemon.linkWorkItemTask).toHaveBeenCalledWith("item-3", "t1");
    expect(result).toEqual({ kind: "task", taskId: "t1" });
  });

  it("links nothing without an item", async () => {
    await startNewTask(base);
    expect(daemon.linkWorkItemTask).not.toHaveBeenCalled();
  });

  it("leaves a delivering Factory task to the runner's own link", async () => {
    await startNewTask({ ...base, mode: "factory", workflow: "review", workItemId: "item-3" });
    expect(daemon.linkWorkItemTask).not.toHaveBeenCalled();
  });

  it("still reports the task when the link fails", async () => {
    daemon.linkWorkItemTask.mockRejectedValueOnce(new Error("gone"));
    const result = await startNewTask({ ...base, workItemId: "item-3" });
    expect(result).toEqual({ kind: "task", taskId: "t1", linkError: "gone" });
  });
});
