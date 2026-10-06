import { describe, expect, it } from "vitest";
import { runDuration } from "./automation-run";

describe("runDuration", () => {
  it("reports a short run in seconds and a longer one in minutes", () => {
    expect(runDuration({ startedAt: 100, finishedAt: 130 })).toBe("30s");
    expect(runDuration({ startedAt: 100, finishedAt: 190 })).toBe("1m 30s");
  });

  it("says a run is still going when it has not finished", () => {
    expect(runDuration({ startedAt: 100, finishedAt: null })).toBe("still running");
  });
});