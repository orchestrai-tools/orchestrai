import { describe, expect, it } from "vitest";
import { dreamCounts, dreamSummary } from "./dream";

describe("dream result", () => {
  it("reads the counts the sweep returns", () => {
    expect(dreamCounts({ inserted: 2, pending: 5 })).toEqual({ inserted: 2, pending: 5 });
    expect(dreamCounts(null)).toEqual({ inserted: 0, pending: 0 });
    expect(dreamSummary({ inserted: 2, pending: 5, taskId: "t1", project: "app" })).toContain("A task is checking");
    expect(dreamSummary({ inserted: 0, pending: 1, taskId: null, project: "app" })).toBe("0 new, 1 pending.");
  });
});
