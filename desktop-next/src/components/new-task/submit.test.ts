import { beforeEach, describe, expect, it, vi } from "vitest";

const daemon = vi.hoisted(() => ({
  request: vi.fn(),
  generateText: vi.fn(),
  setTaskTitle: vi.fn(),
  linkWorkItemTask: vi.fn(),
  listBacklog: vi.fn(),
  runnerEnqueue: vi.fn(),
}));
vi.mock("@warpforge/daemon", () => ({ daemon }));

import { useShell } from "../../lib/shell-store";
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
    useShell.setState({ autoNameTasks: false, textGenAgentId: "" });
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

  it("runs configured automatic naming after the task is created", async () => {
    useShell.setState({ autoNameTasks: true, textGenAgentId: "codex", textGenModel: "" });
    daemon.generateText.mockResolvedValue("A short title");
    await startNewTask(base);
    await vi.waitFor(() => expect(daemon.setTaskTitle).toHaveBeenCalledWith("t1", "A short title"));
  });

  it("links nothing without an item", async () => {
    await startNewTask(base);
    expect(daemon.linkWorkItemTask).not.toHaveBeenCalled();
  });

  it("delivers project references and uploaded documents with the initial prompt", async () => {
    const attachments = [
      { type: "file" as const, path: "app.ts", range: { start: 2, end: 4 } },
      {
        type: "document" as const,
        name: "brief.md",
        mimeType: "text/markdown",
        text: "Build a todo app",
      },
    ];
    await startNewTask({ ...base, attachments });
    expect(daemon.request).toHaveBeenCalledWith(
      "task.create",
      expect.objectContaining({ attachments }),
    );
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
