import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { daemon } from "@/daemon";
import { normalizeRunnerStatus } from "@/daemon/runner";
import type { RunnerEntry, RunnerWait, TaskInfo } from "@/protocol";

import { FactoryStrip } from "./FactoryStrip";

const task = (overrides: Partial<TaskInfo> = {}): TaskInfo =>
  ({
    agent: "claude",
    createdAt: 0,
    filesChanged: 0,
    id: "t1",
    project: "demo",
    prompt: "",
    status: "queued",
    tags: ["runner", "workflow:review-loop"],
    updatedAt: 0,
    ...overrides,
  }) as TaskInfo;

const entry = (overrides: Partial<RunnerEntry> = {}): RunnerEntry => ({
  deliver: true,
  enqueuedAt: 0,
  number: 3,
  position: 0,
  priority: "none",
  project: "demo",
  state: "queued",
  taskId: "t1",
  title: "Fix it",
  updatedAt: 0,
  ...overrides,
});

function renderStrip(forTask: TaskInfo, entries: RunnerEntry[], hold: RunnerWait | null = null) {
  vi.spyOn(daemon, "runnerStatus").mockResolvedValue(
    normalizeRunnerStatus("demo", { entries, hold }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <FactoryStrip task={forTask} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.spyOn(daemon, "request").mockResolvedValue({});
});

afterEach(() => vi.restoreAllMocks());

describe("FactoryStrip", () => {
  it("says why a queued task waits, and starts or removes it", async () => {
    const user = userEvent.setup();
    renderStrip(task(), [entry()], { kind: "open_prs", limit: 3, open: 3 });
    expect(
      await screen.findByText("3 draft PRs are open — merge or close one"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Start now" }));
    expect(daemon.request).toHaveBeenCalledWith("runner.startNow", {
      project: "demo",
      task_id: "t1",
    });
    await user.click(screen.getByRole("button", { name: "Remove from queue" }));
    expect(daemon.request).toHaveBeenCalledWith("runner.dequeue", {
      project: "demo",
      task_id: "t1",
    });
  });

  it("shows a task's own reason when nothing holds the project", async () => {
    renderStrip(task(), [entry({ wait: { cause: "dirty", kind: "checkout_busy" } })]);
    expect(
      await screen.findByText("your project folder has uncommitted changes"),
    ).toBeInTheDocument();
  });

  it("shows the draft PR once it is open", async () => {
    renderStrip(task({ status: "waiting" }), [
      entry({ prNumber: 41, prUrl: "https://github.com/o/r/pull/41", state: "delivered" }),
    ]);
    expect(await screen.findByText("PR #41")).toBeInTheDocument();
    expect(screen.getByText("Ready for review")).toBeInTheDocument();
  });

  it("offers Run again after a stopped run", async () => {
    const user = userEvent.setup();
    const retry = vi
      .spyOn(daemon, "runnerRetry")
      .mockResolvedValue({ created: [], skipped: [], status: normalizeRunnerStatus("demo", {}) });
    renderStrip(task({ status: "interrupted" }), []);
    await user.click(await screen.findByRole("button", { name: "Run again" }));
    await waitFor(() => expect(retry).toHaveBeenCalledWith("demo", "t1"));
  });
});
