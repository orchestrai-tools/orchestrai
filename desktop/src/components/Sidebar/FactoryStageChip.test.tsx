import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { daemon } from "@/daemon";
import { normalizeRunnerStatus } from "@/daemon/runner";
import type { DaemonEvent, TaskInfo, TaskPullRequest } from "@/protocol";

import { FactoryStageChip } from "./FactoryStageChip";

const task = (overrides: Partial<TaskInfo>): TaskInfo =>
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

function renderChip(forTask: TaskInfo, status: unknown) {
  vi.spyOn(daemon, "runnerStatus").mockResolvedValue(normalizeRunnerStatus("demo", status));
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <FactoryStageChip task={forTask} receded={false} />
    </QueryClientProvider>,
  );
}

type Internals = {
  applyEvent: (event: DaemonEvent) => void;
  setState: (patch: { taskPullRequests: Record<string, TaskPullRequest> }) => void;
};
const internals = daemon as unknown as Internals;

function pushPullRequest(value: TaskPullRequest) {
  act(() =>
    internals.applyEvent({
      data: { pull_request: value, task_id: "t1" },
      event: "task.pullRequest",
    }),
  );
}

const pullRequest = (patch: Partial<TaskPullRequest> = {}): TaskPullRequest => ({
  checks: null,
  number: 52,
  state: "open",
  title: "Ship it",
  url: "https://github.com/acme/widgets/pull/52",
  ...patch,
});

const delivered = {
  entries: [{ deliver: true, project: "demo", prNumber: 52, state: "delivered", taskId: "t1" }],
};

afterEach(() => {
  vi.restoreAllMocks();
  act(() => internals.setState({ taskPullRequests: {} }));
});

describe("FactoryStageChip", () => {
  it("marks a queued task and says why it waits on hover", async () => {
    renderChip(task({}), {
      entries: [{ deliver: true, project: "demo", state: "queued", taskId: "t1", title: "T" }],
      hold: { agent: "claude", kind: "quota", usedPct: 90 },
    });
    const chip = await screen.findByText("Queued");
    await waitFor(() => expect(chip).toHaveAttribute("title", "Queued — claude is near its quota"));
  });

  it("shows the stage and round of a running task", async () => {
    renderChip(
      task({
        status: "running",
        workflowRun: {
          maxRounds: 3,
          round: 2,
          stage: "review",
          workflowId: "review-loop",
          workflowName: "Review loop",
        },
      }),
      { entries: [{ deliver: true, project: "demo", state: "running", taskId: "t1", title: "T" }] },
    );
    expect(await screen.findByText("Reviewing · round 2/3")).toBeInTheDocument();
  });

  it("takes the chip over for a pull request, with state tone and a failing-check dot", async () => {
    const { container } = renderChip(task({ status: "waiting" }), delivered);
    pushPullRequest(
      pullRequest({
        checks: "failing",
        failedChecks: [
          { name: "build", state: "failing", url: "https://ci.example/build" },
          { name: "test", state: "failing", url: "https://ci.example/test" },
        ],
      }),
    );

    const chip = await screen.findByText("PR #52");
    expect(chip.closest("[data-factory-pr='open']")).not.toBeNull();
    expect(container.querySelector("[data-task-pr-checks='failing']")).not.toBeNull();
    expect(
      screen.getByTitle("PR #52 · Open · 2 checks failing — click to open on GitHub"),
    ).toBeInTheDocument();
  });

  it("tones draft, merged and closed pull requests", async () => {
    const { container } = renderChip(task({ status: "waiting" }), delivered);
    pushPullRequest(pullRequest({ state: "draft" }));

    const draft = (await screen.findByText("PR #52")).closest("[data-factory-pr]")!;
    expect(draft.getAttribute("data-factory-pr")).toBe("draft");
    expect(draft.getAttribute("class")).toContain("text-muted-foreground");

    pushPullRequest(pullRequest({ state: "merged" }));

    const merged = (await screen.findByText("PR #52")).closest("[data-factory-pr]")!;
    expect(merged.getAttribute("data-factory-pr")).toBe("merged");
    expect(merged.getAttribute("class")).toContain("text-violet-400");
    // Merged is settled: no live checks, so no dot.
    expect(container.querySelector("[data-task-pr-checks]")).toBeNull();

    pushPullRequest(pullRequest({ state: "closed" }));
    const closed = screen.getByText("PR #52").closest("[data-factory-pr]")!;
    expect(closed.getAttribute("data-factory-pr")).toBe("closed");
    expect(closed.getAttribute("class")).toContain("line-through");
  });
});
