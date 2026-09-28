import { afterEach, describe, expect, it, vi } from "vitest";

import { daemon, DaemonRpcError } from "@/daemon";

import { answerPermission } from "./answerPermission";

const { toastError } = vi.hoisted(() => ({
  toastError: vi.fn<(message: string, options?: { description: string }) => void>(),
}));
vi.mock("sonner", () => ({ toast: { error: toastError } }));

describe("answerPermission", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    toastError.mockReset();
  });

  it("sends the answer", async () => {
    const request = vi.spyOn(daemon, "request").mockResolvedValue(null);

    expect(await answerPermission("t_1", "req-1", "allow")).toBe(true);
    expect(request).toHaveBeenCalledWith("session.permission", {
      outcome: "allow",
      request_id: "req-1",
      task_id: "t_1",
    });
  });

  it("counts a request that already resolved as answered", async () => {
    vi.spyOn(daemon, "request").mockRejectedValue(
      new DaemonRpcError("permission_already_resolved", 'already resolved as "deny"'),
    );

    expect(await answerPermission("t_1", "req-1", "allow")).toBe(true);
    expect(toastError).not.toHaveBeenCalled();
  });

  it("reports any other failure so the prompt can be answered again", async () => {
    vi.spyOn(daemon, "request").mockRejectedValue(new Error("daemon disconnected"));

    expect(await answerPermission("t_1", "req-1", "allow")).toBe(false);
    expect(toastError).toHaveBeenCalledWith("Could not answer the permission request", {
      description: "daemon disconnected",
    });
  });
});
