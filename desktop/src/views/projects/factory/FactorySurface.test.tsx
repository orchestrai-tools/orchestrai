import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { daemon } from "@/daemon";
import { normalizeRunnerStatus } from "@/daemon/runner";
import { upsertItemRun } from "@/hooks/useRunner";
import type { ItemRun, RunnerEntry, RunnerStatus } from "@/protocol";

import { FactorySurface } from "./FactorySurface";

function entry(patch: Partial<RunnerEntry>): RunnerEntry {
  return {
    enqueuedAt: 1,
    itemId: "b-1",
    number: 1,
    position: 0,
    priority: "none",
    project: "warpforge",
    state: "queued",
    title: "One",
    updatedAt: 1,
    ...patch,
  };
}

function run(patch: Partial<ItemRun>): ItemRun {
  return {
    agent: "claude",
    dispatchedAt: 100,
    enqueuedAt: 90,
    fixRounds: 0,
    id: "r1",
    itemId: "b-9",
    itemNumber: 9,
    itemTitle: "Shipped",
    outcome: "merged",
    project: "warpforge",
    rounds: 2,
    workflow: "review-loop",
    ...patch,
  };
}

const status: RunnerStatus = normalizeRunnerStatus("warpforge", {
  dispatchedToday: 1,
  entries: [
    entry({ itemId: "b-2", number: 2, title: "Second", waitingReason: "claude is out of quota" }),
    entry({ itemId: "b-3", number: 3, position: 1, title: "Third" }),
    entry({
      itemId: "b-4",
      number: 4,
      prNumber: 12,
      prUrl: "https://github.com/o/r/pull/12",
      state: "delivered",
      taskId: "t-4",
      title: "In review",
    }),
  ],
  hold: "1 draft pull request(s) wait for review (limit 1)",
  settings: { maxOpenPrs: 1, project: "warpforge", running: true },
});

function renderSurface(onOpenTask = vi.fn<(taskId: string) => void>()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <FactorySurface project="warpforge" agents={[]} tasks={[]} onOpenTask={onOpenTask} />
    </QueryClientProvider>,
  );
  return onOpenTask;
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(daemon, "runnerStatus").mockResolvedValue(status);
  vi.spyOn(daemon, "runnerRuns").mockResolvedValue([
    run({}),
    run({ costUsd: 1.5, id: "r2", itemTitle: "Empty", outcome: "no_changes" }),
  ]);
});

describe("FactorySurface", () => {
  it("shows the hold, the queue in order, the item in review and past runs", async () => {
    const onOpenTask = renderSurface();
    expect(await screen.findByText("Running")).toBeTruthy();
    expect(screen.getByText(/wait for review/)).toBeTruthy();
    expect(screen.getByText("Waiting: claude is out of quota")).toBeTruthy();
    expect(screen.getByText("Draft PR in review")).toBeTruthy();
    expect(await screen.findByText("Merged")).toBeTruthy();
    expect(screen.getByText("not reported")).toBeTruthy();
    expect(screen.getByText("$1.50")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Open pipeline" }));
    expect(onOpenTask).toHaveBeenCalledWith("t-4");
  });

  it("pauses, reorders and removes through the daemon", async () => {
    const update = vi.spyOn(daemon, "runnerUpdateSettings").mockResolvedValue(status);
    const reorder = vi.spyOn(daemon, "runnerReorder").mockResolvedValue(status);
    const dequeue = vi.spyOn(daemon, "runnerDequeue").mockResolvedValue(status);
    renderSurface();
    await userEvent.click(await screen.findByRole("button", { name: "Pause" }));
    expect(update).toHaveBeenCalledWith("warpforge", { running: false });

    expect(screen.getByRole("button", { name: "Move #2 up" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Move #2 down" }));
    expect(reorder).toHaveBeenCalledWith("warpforge", ["b-3", "b-2"]);

    await userEvent.click(screen.getByRole("button", { name: "Remove #3 from the queue" }));
    expect(dequeue).toHaveBeenCalledWith("warpforge", "b-3");
  });

  it("stops running items after asking, and shows a checkout it had to leave", async () => {
    const leftBehind = normalizeRunnerStatus("warpforge", {
      checkout: {
        branch: "warpforge/task/t-5",
        heldReason: "The Factory left the checkout on warpforge/task/t-5 because it has changes",
        itemId: "b-5",
        itemNumber: 5,
        project: "warpforge",
        state: "held",
        taskId: "t-5",
        updatedAt: 1,
      },
      entries: [entry({ itemId: "b-6", number: 6, state: "running", taskId: "t-6" })],
      hold: "The Factory left the checkout on warpforge/task/t-5 because it has changes",
      settings: { project: "warpforge", runLocation: "checkout", running: true },
    });
    vi.spyOn(daemon, "runnerStatus").mockResolvedValue(leftBehind);
    const stop = vi.spyOn(daemon, "runnerStop").mockResolvedValue(leftBehind);
    renderSurface();
    expect((await screen.findByRole("alert")).textContent).toContain("left the checkout");
    expect(screen.getByText(/project checkout$/)).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(stop).not.toHaveBeenCalled();
    await userEvent.click(await screen.findByRole("button", { name: "Stop" }));
    expect(stop).toHaveBeenCalledWith("warpforge");
  });

  it("saves auto as the run location and keeps the concurrency editable", async () => {
    vi.spyOn(daemon, "workflowList").mockResolvedValue([]);
    const update = vi.spyOn(daemon, "runnerUpdateSettings").mockResolvedValue(status);
    renderSurface();
    await userEvent.click(await screen.findByRole("button", { name: "Settings" }));
    await userEvent.click(screen.getByRole("radio", { name: /^Auto/ }));
    expect(screen.getByText(/One item at a time in the checkout/)).toBeTruthy();
    const runsAtOnce = screen.getByRole("spinbutton", { name: "Runs at once" });
    expect(runsAtOnce).not.toBeDisabled();
    fireEvent.change(runsAtOnce, { target: { value: "2" } });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(update).toHaveBeenCalledWith(
      "warpforge",
      expect.objectContaining({ maxConcurrent: 2, runLocation: "auto" }),
    );
  });

  it("changes where a queued item runs and shows where a running one runs", async () => {
    const mixed = normalizeRunnerStatus("warpforge", {
      entries: [
        entry({ itemId: "b-2", number: 2, runLocation: "checkout", title: "Queued" }),
        entry({
          itemId: "b-3",
          number: 3,
          resolvedLocation: "worktree",
          state: "running",
          taskId: "t-3",
          title: "Running",
        }),
      ],
      settings: { project: "warpforge", running: true },
    });
    vi.spyOn(daemon, "runnerStatus").mockResolvedValue(mixed);
    const move = vi.spyOn(daemon, "runnerSetEntryLocation").mockResolvedValue(mixed);
    renderSurface();
    const select = await screen.findByRole("combobox", { name: "Run location for #2" });
    expect((select as HTMLSelectElement).value).toBe("checkout");
    expect(screen.getByRole("option", { name: "Default (Worktree)" })).toBeTruthy();
    expect(screen.getByText("Worktree", { selector: "span" })).toBeTruthy();

    await userEvent.selectOptions(select, "default");
    expect(move).toHaveBeenCalledWith("warpforge", "b-2", "default");
  });

  it("keeps the newest runs first when one is updated or added", () => {
    const runs = upsertItemRun(
      [run({ dispatchedAt: 100 })],
      run({ dispatchedAt: 100, outcome: "rejected" }),
    );
    expect(runs).toHaveLength(1);
    expect(runs[0]!.outcome).toBe("rejected");
    const added = upsertItemRun(runs, run({ dispatchedAt: 200, id: "r3" }));
    expect(added.map((r) => r.id)).toEqual(["r3", "r1"]);
  });
});
