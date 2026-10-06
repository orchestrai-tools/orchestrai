import { describe, expect, it } from "vitest";
import { formatUsd } from "@warpforge/core/spend";

describe("formatUsd", () => {
  it("keeps cents under one thousand", () => {
    expect(formatUsd(1.23)).toBe("$1.23");
    expect(formatUsd(12.34)).toBe("$12.34");
  });

  it("drops cents from one thousand up", () => {
    expect(formatUsd(1234.56)).toBe("$1,235");
    expect(formatUsd(null)).toBeNull();
  });
});
