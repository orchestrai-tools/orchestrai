import { describe, expect, it } from "vitest";
import type { Automation } from "@warpforge/protocol";
import { filterAutomations } from "./automation-filter";

function row(patch: Partial<Automation>): Automation {
  return {
    id: "a",
    project: "app",
    name: "Nightly",
    prompt: "Check the build",
    agent: "claude",
    trigger: { preset: "daily", cron: "0 9 * * *" },
    timezone: "UTC",
    enabled: true,
    missedRunGraceMinutes: 720,
    reuseSession: true,
    worktree: false,
    createdAt: 0,
    updatedAt: 0,
    ...patch,
  };
}

describe("filterAutomations", () => {
  it("keeps a row that matches the search, the switch, and the last run", () => {
    const rows = [
      row({ id: "ok", lastStatus: "completed" }),
      row({ id: "off", name: "Other", enabled: false, lastStatus: "failed" }),
    ];
    expect(filterAutomations(rows, { search: "build", enabled: "on", last: "completed" }).map((item) => item.id)).toEqual([
      "ok",
    ]);
  });
});
