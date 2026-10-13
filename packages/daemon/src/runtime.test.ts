import type { DaemonEvent } from "@warpforge/protocol";
import { describe, expect, it, vi } from "vitest";

import { DaemonClient } from "./index";
import { MAX_PORTFORWARD_LOGS, MAX_SERVICE_LOGS } from "./types";

type EventClient = { applyEvent: (event: DaemonEvent) => void; resetRuntimeLogs: () => void };

function event(client: DaemonClient, source: "service" | "forward", seq: number, line: string) {
  (client as unknown as EventClient).applyEvent(
    source === "service"
      ? { event: "service.log", data: { project: "demo", service: "web", seq, line } }
      : { event: "portforward.log", data: { project: "demo", name: "web", seq, line } },
  );
}

function load(client: DaemonClient, source: "service" | "forward") {
  return source === "service"
    ? client.fetchServiceLogs("demo", "web")
    : client.fetchPortForwardLogs("demo", "web");
}

function logs(client: DaemonClient, source: "service" | "forward") {
  const state = client.getState();
  return (source === "service" ? state.serviceLogs : state.portforwardLogs)["demo/web"] ?? [];
}

describe("fetchServiceLogs", () => {
  it("numbers each line from nextSeq and keeps its capture time", async () => {
    const client = new DaemonClient();
    vi.spyOn(client, "request").mockResolvedValue({
      at: [100, 200],
      lines: ["a", "b"],
      nextSeq: 42,
    });
    const entries = await client.fetchServiceLogs("demo", "web");
    expect(entries).toEqual([
      { at: 100, line: "a", seq: 40 },
      { at: 200, line: "b", seq: 41 },
    ]);
    expect(client.getState().serviceLogs["demo/web"]).toEqual(entries);
  });
});

describe.each(["service", "forward"] as const)("%s log refresh races", (source) => {
  it("retains newer live lines and deduplicates the snapshot by sequence", async () => {
    const client = new DaemonClient();
    let finish: (value: unknown) => void = () => {};
    vi.spyOn(client, "request").mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const fetching = load(client, source);
    event(client, source, 2, "duplicate live line");
    event(client, source, 3, "new live line");
    finish({ lines: ["snapshot 1", "snapshot 2"], at: [100, 200], nextSeq: 3 });
    await fetching;
    expect(logs(client, source).map(({ seq, line }) => [seq, line])).toEqual([
      [1, "snapshot 1"],
      [2, "snapshot 2"],
      [3, "new live line"],
    ]);
    expect(logs(client, source)[1]?.at).toBe(200);
  });

  it("does not let an older refresh overwrite the latest snapshot", async () => {
    const client = new DaemonClient();
    const finishes: Array<(value: unknown) => void> = [];
    vi.spyOn(client, "request").mockImplementation(
      () =>
        new Promise((resolve) => {
          finishes.push(resolve);
        }),
    );
    const older = load(client, source);
    const newer = load(client, source);
    finishes[1]!({ lines: ["latest"], nextSeq: 2 });
    await newer;
    finishes[0]!({ lines: ["stale"], nextSeq: 2 });
    await older;
    expect(logs(client, source).map(({ line }) => line)).toEqual(["latest"]);
  });

  it("invalidates old snapshots when the daemon disconnects and sequences restart", async () => {
    const client = new DaemonClient();
    const finishes: Array<(value: unknown) => void> = [];
    vi.spyOn(client, "request").mockImplementation(
      () =>
        new Promise((resolve) => {
          finishes.push(resolve);
        }),
    );
    event(client, source, 500, "previous daemon");
    const old = load(client, source);
    (client as unknown as EventClient).resetRuntimeLogs();
    expect(logs(client, source)).toEqual([]);
    const fresh = load(client, source);
    finishes[1]!({ lines: ["restarted daemon"], nextSeq: 2 });
    await fresh;
    finishes[0]!({ lines: ["old delayed snapshot"], nextSeq: 501 });
    await old;
    expect(logs(client, source).map(({ line }) => line)).toEqual(["restarted daemon"]);
  });

  it("bounds retained history after merging live output", async () => {
    const client = new DaemonClient();
    const limit = source === "service" ? MAX_SERVICE_LOGS : MAX_PORTFORWARD_LOGS;
    vi.spyOn(client, "request").mockResolvedValue({
      lines: Array.from({ length: limit + 1 }, (_, i) => `${i}`),
      nextSeq: limit + 2,
    });
    event(client, source, limit + 2, "live");
    await load(client, source);
    expect(logs(client, source)).toHaveLength(limit);
    expect(logs(client, source).at(-1)?.line).toBe("live");
  });
});
