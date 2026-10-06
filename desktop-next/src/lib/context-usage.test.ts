import { describe, expect, it } from "vitest";
import { compactTokenCount, contextPercent, latestContextUsage } from "./context-usage";
import type { SessionUpdate } from "@warpforge/protocol";

describe("context usage", () => {
  it("keeps the newest usage update", () => {
    const updates = [
      { kind: "usage", used: 1_000, size: 10_000 },
      { kind: "agent_text", text: "working" },
      { kind: "usage", used: 53_000, size: 200_000 },
    ] as SessionUpdate[];
    expect(latestContextUsage(updates)).toMatchObject({ used: 53_000, size: 200_000 });
    expect(latestContextUsage([])).toBeUndefined();
  });

  it("fills the ring from used over size", () => {
    expect(contextPercent(53_000, 200_000)).toBe(27);
    expect(contextPercent(190_000, 200_000)).toBe(95);
    expect(compactTokenCount(53_000)).toBe("53K");
    expect(compactTokenCount(1_200_000)).toBe("1.2M");
  });
});
