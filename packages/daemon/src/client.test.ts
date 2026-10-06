import { afterEach, describe, expect, it, vi } from "vitest";

import { DaemonClient } from "./index";

type Settable = { setState: (patch: { connection: string }) => void };

describe("request before the handshake", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("waits for the connection, then sends", async () => {
    vi.stubGlobal("window", globalThis);
    const client = new DaemonClient();
    (client as unknown as Settable).setState({ connection: "connecting" });
    let settled = false;
    const reply = client.request("worktree.list", { project: "demo" }).catch((error: Error) => {
      settled = true;
      return error.message;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    (client as unknown as Settable).setState({ connection: "connected" });
    // No socket in the test, so the resent request fails at the send step rather than the handshake.
    expect(await reply).toBe("not connected to daemon");
  });

  it("gives up when the daemon never answers", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", globalThis);
    const client = new DaemonClient();
    (client as unknown as Settable).setState({ connection: "connecting" });
    const reply = client.request("worktree.list").catch((error: Error) => error.message);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await reply).toBe("daemon handshake has not completed");
  });
});
