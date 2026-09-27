import { beforeEach, describe, expect, it, vi } from "vitest";

import { DaemonRpcError } from "@/daemon/rpcError";

const { request, toastError } = vi.hoisted(() => ({
  request: vi.fn<(method: string, params: unknown) => Promise<unknown>>(),
  toastError: vi.fn<(message: string, options?: { description?: string }) => void>(),
}));
vi.mock("@/daemon", () => ({ daemon: { request } }));
vi.mock("sonner", () => ({ toast: { error: toastError } }));

import { saveFile } from "./saveFile";

describe("saveFile", () => {
  beforeEach(() => {
    request.mockReset();
    toastError.mockReset();
  });

  it("sends the buffer and stays quiet when the save lands", async () => {
    request.mockResolvedValue(null);
    saveFile({ content: "x", path: "a.txt", task_id: "t1" });
    await vi.waitFor(() => expect(request).toHaveBeenCalled());
    expect(request).toHaveBeenCalledWith("file.save", {
      content: "x",
      path: "a.txt",
      task_id: "t1",
    });
    await Promise.resolve();
    expect(toastError).not.toHaveBeenCalled();
  });

  it("shows the daemon's reason when it refuses the save", async () => {
    request.mockRejectedValue(
      new DaemonRpcError("internal", "refusing path outside the root: ../x"),
    );
    saveFile({ content: "x", path: "../x", task_id: "t1" });
    await vi.waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("Could not save ../x", {
        description: "refusing path outside the root: ../x",
      }),
    );
  });
});
