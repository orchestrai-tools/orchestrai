import { describe, expect, it } from "vitest";
import { agentUpdateCount, lspUpdateCount } from "./agent-updates";
import { toolUpdateCounts } from "./tool-updates";

describe("update counts", () => {
  it("counts only language servers that are installed and behind", () => {
    expect(
      lspUpdateCount([
        { installed: true, status: "behind" },
        { installed: false, status: "behind" },
        { installed: true, status: "current" },
      ]),
    ).toBe(1);
    expect(lspUpdateCount(undefined)).toBe(0);
  });

  it("adds agents and language servers into one total", () => {
    const counts = toolUpdateCounts({
      agents: [{ status: "behind" }, { status: "current" }] as never,
      servers: [{ installed: true, status: "behind" }] as never,
    });
    expect(counts).toEqual({ agents: 1, servers: 1, total: 2 });
  });

  it("treats nothing detected yet as no updates", () => {
    expect(toolUpdateCounts({ agents: null, servers: null }).total).toBe(0);
    expect(agentUpdateCount(undefined)).toBe(0);
  });
});
