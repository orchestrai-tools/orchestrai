import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TaskInfo } from "@/protocol";

import { MergeWorktreeDialog } from "./MergeWorktreeDialog";

const mergeWorktree = vi.fn<(taskId: string, remove: boolean) => Promise<string>>();

vi.mock("../../daemon", () => ({
  daemon: { mergeWorktree: (taskId: string, remove: boolean) => mergeWorktree(taskId, remove) },
}));

function task(): TaskInfo {
  return {
    id: "t_abc",
    project: "demo",
    prompt: "do the thing",
    agent: "claude",
    status: "waiting",
    tags: [],
    title: "Do the thing",
    createdAt: 0,
    updatedAt: 0,
    filesChanged: 1,
    blockedReason: null,
    worktree: "/repo/.warpforge/worktrees/t_abc",
    baseBranch: "main",
  };
}

function renderDialog(onOpenChange = vi.fn<() => void>()) {
  render(<MergeWorktreeDialog open onOpenChange={onOpenChange} task={task()} />);
  return { onOpenChange };
}

describe("MergeWorktreeDialog", () => {
  beforeEach(() => {
    mergeWorktree.mockReset();
  });

  it("merges into the base and removes the worktree by default", async () => {
    mergeWorktree.mockResolvedValue("Fast-forwarded main to warpforge/task/t_abc");
    const { onOpenChange } = renderDialog();
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    expect(screen.getByText("Merge into main?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Merge" }));

    await vi.waitFor(() => expect(mergeWorktree).toHaveBeenCalledWith("t_abc", true));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("passes the checkbox value through", async () => {
    mergeWorktree.mockResolvedValue("Merged");
    renderDialog();
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Merge" }));

    await vi.waitFor(() => expect(mergeWorktree).toHaveBeenCalledWith("t_abc", false));
  });

  it("keeps the dialog open and shows git's conflict reason", async () => {
    mergeWorktree.mockRejectedValue(
      new Error("Merge conflict. Update the task branch from main first.\nCONFLICT in f"),
    );
    const { onOpenChange } = renderDialog();
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    await user.click(screen.getByRole("button", { name: "Merge" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/Merge conflict/);
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
