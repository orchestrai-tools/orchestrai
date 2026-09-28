import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { daemon } from "@/daemon";

import { WorktreesSurface } from "./WorktreesSurface";

const ROWS = [
  {
    branch: "warpforge/task/t_1",
    hasSetupLog: true,
    orphan: false,
    path: "/p/.warpforge/worktrees/t_1",
    sizeBytes: 3 * 1024 ** 3,
    taskId: "t_1",
    taskTitle: "Fix login",
  },
  {
    branch: "warpforge/task/old",
    hasSetupLog: false,
    orphan: true,
    path: "/p/.warpforge/worktrees/old",
    sizeBytes: 2048,
  },
];

function renderSurface() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <WorktreesSurface project="demo" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(daemon, "listWorktreeRows").mockResolvedValue(ROWS);
  vi.spyOn(daemon, "reclaimWorktree").mockResolvedValue(1024 ** 3);
  vi.spyOn(daemon, "removeOrphanWorktree").mockResolvedValue();
  vi.spyOn(daemon, "archiveTask").mockResolvedValue();
});

describe("WorktreesSurface", () => {
  it("lists branch, owner, orphan status and size", async () => {
    renderSurface();

    expect(await screen.findByText("warpforge/task/t_1")).toBeInTheDocument();
    expect(screen.getByText("Fix login")).toBeInTheDocument();
    expect(screen.getByText("3.0 GiB")).toBeInTheDocument();
    expect(screen.getByText("orphan")).toBeInTheDocument();
    expect(screen.getByText("2 KiB")).toBeInTheDocument();
  });

  it("asks before reclaiming and only then deletes", async () => {
    renderSurface();
    await screen.findByText("Fix login");

    fireEvent.click(screen.getAllByRole("button", { name: "Reclaim build artifacts" })[0]);
    expect(daemon.reclaimWorktree).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "Reclaim" }));

    await waitFor(() => expect(daemon.reclaimWorktree).toHaveBeenCalledWith("demo", ROWS[0].path));
  });

  it("removes an orphan directly and a task's worktree through its archive", async () => {
    renderSurface();
    await screen.findByText("Fix login");

    fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[1]);
    expect(daemon.removeOrphanWorktree).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "Remove", hidden: false }));
    await waitFor(() =>
      expect(daemon.removeOrphanWorktree).toHaveBeenCalledWith("demo", ROWS[1].path),
    );
  });

  it("archives the owning task when its worktree is removed", async () => {
    renderSurface();
    await screen.findByText("Fix login");

    fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[0]);
    fireEvent.click(await screen.findByRole("button", { name: "Remove" }));
    await waitFor(() => expect(daemon.archiveTask).toHaveBeenCalledWith("t_1", true));
    expect(daemon.removeOrphanWorktree).not.toHaveBeenCalled();
  });
});
