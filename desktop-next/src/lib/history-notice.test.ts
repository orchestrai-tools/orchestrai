import { describe, expect, it } from "vitest";
import { historyPrunedMessage, historySweptMessage, taskLifecycle } from "./history-notice";

describe("history notices", () => {
  it("names what cleanup did", () => {
    expect(historyPrunedMessage(1)).toContain("1 stored message");
    expect(historySweptMessage({ settled: 2, expired: 0, kept: 1 })).toContain(
      "Settled 2 ignored tasks",
    );
    expect(historySweptMessage({ settled: 0, expired: 0, kept: 0 })).toBeNull();
    expect(taskLifecycle(14, 30, 90)).toBe(
      "Left alone, a finished task settles after 14 days, loses its chat after 30 days, and is deleted after 90 days.",
    );
    expect(taskLifecycle(0, 0, 0)).toContain("never settles on its own");
  });
});
