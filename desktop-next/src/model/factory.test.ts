import { describe, expect, it } from "vitest";
import { agentTurnActive, cardFacts, snoozeWakeLabel, waitLabel } from "./factory";

describe("waitLabel", () => {
  it("explains a slot wait and a held checkout", () => {
    expect(waitLabel({ kind: "slots", inUse: 2, limit: 2 })).toBe("Waiting for a free slot (2 of 2)");
    expect(waitLabel({ kind: "checkout_held", reason: "Commit or discard the edits" })).toBe(
      "Commit or discard the edits",
    );
    expect(waitLabel(null)).toBeNull();
  });
});

describe("agentTurnActive", () => {
  it("treats a queued Factory task as not started", () => {
    expect(agentTurnActive({ status: "queued", tags: ["runner"], workflowRun: null })).toBe(false);
    expect(agentTurnActive({ status: "running", tags: ["runner"], workflowRun: null })).toBe(true);
    expect(agentTurnActive({ status: "queued", tags: [], workflowRun: null })).toBe(true);
    expect(
      agentTurnActive({ origin: "chat", status: "queued", tags: [], workflowRun: null }),
    ).toBe(false);
  });
});

describe("cardFacts", () => {
  it("names a worktree, a block, and when a snooze ends", () => {
    expect(snoozeWakeLabel(600, 0)).toBe("10m");
    expect(
      cardFacts(
        {
          worktree: "feat/shell",
          blockedReason: "Needs a decision",
          snoozedAt: 1,
          snoozedUntil: 3600,
        } as never,
        0,
      ),
    ).toEqual(["feat/shell", "Needs a decision", "back in 1h"]);
  });
});
