import { describe, expect, it } from "vitest";
import { listedAgents, matchesAgent, showOrigin } from "./session-filter";

describe("session filter", () => {
  it("keeps sessions started here apart from ones already on disk", () => {
    expect(showOrigin("all", "here")).toBe(true);
    expect(showOrigin("all", "outside")).toBe(true);
    expect(showOrigin("here", "outside")).toBe(false);
    expect(showOrigin("outside", "here")).toBe(false);
  });

  it("lists each agent once and matches the one that is selected", () => {
    expect(listedAgents(["claude", "pi", "claude", ""])).toEqual(["claude", "pi"]);
    expect(matchesAgent("goose", "")).toBe(true);
    expect(matchesAgent("goose", "goose")).toBe(true);
    expect(matchesAgent("goose", "pi")).toBe(false);
  });
});
