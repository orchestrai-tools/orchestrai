import { describe, expect, it } from "vitest";
import { demoAccountLimits, demoAgentSpend } from "@warpforge/daemon/demo-accounts";
import { usageSummary } from "./session-usage";

describe("session usage", () => {
  it("names the active login, the quota left, and today's estimate", () => {
    expect(usageSummary(demoAccountLimits(), demoAgentSpend())).toEqual({
      accounts: ["Work · 73% left"],
      today: "$1.23",
    });
  });

  it("omits the estimate when no harness reports spend", () => {
    expect(
      usageSummary(
        [],
        [{ agentId: "pi", todayUsd: null, totalUsd: null, tasks: 0, reported: false }],
      ),
    ).toEqual({
      accounts: [],
      today: null,
    });
  });
});
