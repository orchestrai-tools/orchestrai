import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { WorkItem } from "@/components/backlog/types";
import { daemon } from "@/daemon";
import { normalizeRunnerStatus } from "@/daemon/runner";
import type { RunLocation, WorkflowMeta } from "@/protocol";

import { FactoryRunDialog } from "./FactoryRunDialog";

function item(id: string, number: string): WorkItem {
  return {
    createdAt: 1,
    id,
    number,
    priority: "none",
    project: "warpforge",
    source: "local",
    status: "todo",
    title: `Item ${number}`,
    updatedAt: 1,
  } as WorkItem;
}

function workflow(patch: Partial<WorkflowMeta>): WorkflowMeta {
  return { id: "review-loop", name: "Review loop", source: "builtin", valid: true, ...patch };
}

function setup(runLocation: RunLocation, workflows: WorkflowMeta[]) {
  vi.spyOn(daemon, "runnerStatus").mockResolvedValue(
    normalizeRunnerStatus("warpforge", {
      settings: { project: "warpforge", runLocation, workflow: "review-loop" },
    }),
  );
  vi.spyOn(daemon, "workflowList").mockResolvedValue(workflows);
}

function Harness({ items, onQueued }: { items: WorkItem[]; onQueued?: () => void }) {
  const [open, setOpen] = useState<WorkItem[] | null>(items);
  return (
    <FactoryRunDialog
      project="warpforge"
      items={open}
      onClose={() => setOpen(null)}
      onQueued={onQueued}
    />
  );
}

function renderDialog(items: WorkItem[], onQueued?: () => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <Harness items={items} onQueued={onQueued} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("FactoryRunDialog", () => {
  it("queues one item where it was asked to run", async () => {
    setup("worktree", [workflow({})]);
    const enqueue = vi
      .spyOn(daemon, "runnerEnqueue")
      .mockResolvedValue(normalizeRunnerStatus("warpforge", {}));
    renderDialog([item("b-1", "#1")]);
    expect(await screen.findByText("Run #1 in Factory")).toBeTruthy();
    expect(await screen.findByRole("radio", { name: "Project default (Worktree)" })).toBeChecked();

    await userEvent.click(screen.getByRole("radio", { name: "Project checkout" }));
    await userEvent.click(screen.getByRole("button", { name: "Queue" }));
    expect(enqueue).toHaveBeenCalledWith("warpforge", ["b-1"], "checkout");
  });

  it("applies one choice to every selected item", async () => {
    setup("checkout", [workflow({})]);
    const enqueue = vi
      .spyOn(daemon, "runnerEnqueue")
      .mockResolvedValue(normalizeRunnerStatus("warpforge", {}));
    renderDialog([item("b-1", "#1"), item("b-2", "#2")]);
    expect(await screen.findByText("Run 2 items in Factory")).toBeTruthy();

    await userEvent.click(screen.getByRole("radio", { name: "Worktree" }));
    await userEvent.click(screen.getByRole("button", { name: "Queue" }));
    expect(enqueue).toHaveBeenCalledWith("warpforge", ["b-1", "b-2"], "worktree");
  });

  it("reports a queue only when it succeeded, never on cancel", async () => {
    setup("worktree", [workflow({})]);
    const enqueue = vi
      .spyOn(daemon, "runnerEnqueue")
      .mockRejectedValueOnce(new Error("daemon offline"))
      .mockResolvedValue(normalizeRunnerStatus("warpforge", {}));
    const cancelled = vi.fn<() => void>();
    renderDialog([item("b-1", "#1")], cancelled);
    await userEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(enqueue).not.toHaveBeenCalled();
    expect(cancelled).not.toHaveBeenCalled();
    cleanup();

    const failed = vi.fn<() => void>();
    renderDialog([item("b-1", "#1")], failed);
    await userEvent.click(await screen.findByRole("button", { name: "Queue" }));
    await vi.waitFor(() => expect(enqueue).toHaveBeenCalledTimes(1));
    expect(failed).not.toHaveBeenCalled();
    cleanup();

    const queued = vi.fn<() => void>();
    renderDialog([item("b-1", "#1")], queued);
    await userEvent.click(await screen.findByRole("button", { name: "Queue" }));
    await vi.waitFor(() => expect(queued).toHaveBeenCalledTimes(1));
  });

  it("warns that a verifying workflow needs the checkout, and auto picks it", async () => {
    setup("auto", [workflow({ verifyRequired: true })]);
    renderDialog([item("b-1", "#1")]);
    expect(
      await screen.findByRole("radio", { name: "Project default (Auto: project checkout)" }),
    ).toBeChecked();
    expect(screen.queryByText(/needs Project checkout/)).toBeNull();

    await userEvent.click(screen.getByRole("radio", { name: "Worktree" }));
    expect(screen.getByText(/verifies in the browser, which needs Project checkout/)).toBeTruthy();
  });
});
