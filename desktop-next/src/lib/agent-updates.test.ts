import { describe, expect, it } from "vitest";
import { agentUpdateCount } from "./agent-updates";

describe("agentUpdateCount", () => {
  it("counts only agents that are behind", () => {
    expect(agentUpdateCount([{ status: "behind" }, { status: "current" }, { status: "behind" }])).toBe(2);
    expect(agentUpdateCount(undefined)).toBe(0);
  });
});
