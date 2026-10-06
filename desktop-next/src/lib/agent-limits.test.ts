import { describe, expect, it } from "vitest";
import type { AgentAccountLimits, AgentLimitWindow } from "@warpforge/protocol";
import {
  activeAccountForAgent,
  formatResetRelative,
  isSnapshotOutdated,
  lastUpdatedSentence,
  worstWindow,
} from "./agent-limits";

function window(id: string, usedPercent: number): AgentLimitWindow {
  return { id, label: id, usedPercent };
}

function account(
  partial: Partial<AgentAccountLimits> & Pick<AgentAccountLimits, "accountId" | "agentId">,
): AgentAccountLimits {
  return {
    label: partial.accountId,
    active: false,
    windows: [],
    exhausted: false,
    fetchedAt: 0,
    source: "api",
    ...partial,
  };
}

describe("agent limits", () => {
  it("picks the fullest window and the live account", () => {
    expect(worstWindow([window("session", 40), window("weekly", 100)])?.id).toBe("weekly");
    const accounts = [
      account({ accountId: "claude:old", agentId: "claude", active: true, exhausted: true }),
      account({ accountId: "claude:new", agentId: "claude", active: false }),
    ];
    expect(activeAccountForAgent(accounts, "claude", "claude:new")?.accountId).toBe("claude:new");
  });

  it("marks a snapshot that missed a refresh", () => {
    expect(isSnapshotOutdated(1_000, 1_000)).toBe(false);
    expect(isSnapshotOutdated(0, 1_501)).toBe(true);
    expect(lastUpdatedSentence(1_000, 1_000)).toBe("Last updated just now");
    expect(lastUpdatedSentence(1_000, 1_000 + 3 * 3600 + 12 * 60)).toBe("Last updated 3h 12m ago");
  });

  it("says when a window resets", () => {
    expect(formatResetRelative(1_000, 1_000)).toBe("resets now");
    expect(formatResetRelative(1_000 + 2 * 3600 + 14 * 60, 1_000)).toBe("resets in 2h 14m");
  });
});
