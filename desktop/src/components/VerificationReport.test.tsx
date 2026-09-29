import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { daemon } from "@/daemon";

import type { WorkflowVerification } from "../protocol";
import { VerificationReport } from "./VerificationReport";

const failed: WorkflowVerification = {
  attempt: 2,
  checklist: [
    { evidence: ["shot-1.png"], status: "pass", step: "Open the settings page" },
    { note: "the name reverts on reload", status: "fail", step: "Rename the project" },
  ],
  evidence: [{ mimeType: "image/png", name: "shot-1.png", path: "/e/t_1/shot-1.png" }],
  summary: "Renaming does not persist.",
  taskId: "t_v",
  verdict: "fail",
};

function renderReport(verification: WorkflowVerification) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <VerificationReport parentId="t_1" verification={verification} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("VerificationReport", () => {
  it("shows the verdict, each step and its screenshots from the daemon", async () => {
    const evidence = vi
      .spyOn(daemon, "workflowEvidence")
      .mockResolvedValue({ contentType: "image/png", dataBase64: "AAEC" });
    renderReport(failed);

    expect(screen.getByText("FAIL")).toBeInTheDocument();
    expect(screen.getByText("attempt 2")).toBeInTheDocument();
    expect(screen.getByText("Renaming does not persist.")).toBeInTheDocument();
    expect(screen.getByText(/the name reverts on reload/)).toBeInTheDocument();

    const image = await screen.findByRole("img", { name: "shot-1.png" });
    expect(image).toHaveAttribute("src", "data:image/png;base64,AAEC");
    expect(evidence).toHaveBeenCalledWith("t_1", "shot-1.png");

    await userEvent.click(screen.getByRole("button", { name: /shot-1.png/ }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("says a screenshot is unavailable instead of showing a broken image", async () => {
    vi.spyOn(daemon, "workflowEvidence").mockRejectedValue(new Error("gone"));
    renderReport(failed);
    expect(await screen.findByText("shot-1.png unavailable")).toBeInTheDocument();
  });

  it("labels a stage that has not reported yet", () => {
    renderReport({ ...failed, checklist: [], evidence: [], summary: "", verdict: null });
    expect(screen.getByText("testing")).toBeInTheDocument();
  });
});
