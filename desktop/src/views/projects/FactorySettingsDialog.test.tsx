import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { daemon } from "@/daemon";
import { normalizeRunnerStatus } from "@/daemon/runner";

import { FactorySettingsDialog } from "./FactorySettingsDialog";

afterEach(() => vi.restoreAllMocks());

describe("FactorySettingsDialog", () => {
  it("saves the project's limits and defaults", async () => {
    vi.spyOn(daemon, "runnerStatus").mockResolvedValue(normalizeRunnerStatus("demo", {}));
    vi.spyOn(daemon, "workflowList").mockResolvedValue([]);
    const save = vi
      .spyOn(daemon, "runnerUpdateSettings")
      .mockResolvedValue(normalizeRunnerStatus("demo", {}));
    const onClose = vi.fn<() => void>();
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <FactorySettingsDialog project="demo" agents={[]} onClose={onClose} />
      </QueryClientProvider>,
    );

    const slots = await screen.findByRole("spinbutton", { name: "Tasks at the same time" });
    fireEvent.change(slots, { target: { value: "2" } });
    await user.selectOptions(screen.getByLabelText("Default place to run"), "worktree");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(
        "demo",
        expect.objectContaining({ maxConcurrent: 2, runLocation: "worktree" }),
      ),
    );
    expect(onClose).toHaveBeenCalled();
  });
});
