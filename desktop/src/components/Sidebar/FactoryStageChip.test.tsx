import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { daemon } from "@/daemon";
import { normalizeRunnerStatus } from "@/daemon/runner";
import type { TaskInfo } from "@/protocol";

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
  render(
    <QueryClientProvider client={new QueryClient()}>
      <FactoryStageChip task={forTask} receded={false} />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.restoreAllMocks());

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
});
