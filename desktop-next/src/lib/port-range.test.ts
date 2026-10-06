import { describe, expect, it } from "vitest";
import { folderNameFromPath, normalizePortRange, portRangeInputError } from "./port-range";

describe("portRangeInputError", () => {
  it("accepts a range and a single port", () => {
    expect(portRangeInputError("4200-4299")).toBeNull();
    expect(normalizePortRange("4200 - 4299")).toBe("4200-4299");
    expect(normalizePortRange("4200")).toBe("4200");
  });

  it("rejects an end before the start", () => {
    expect(portRangeInputError("4300-4200")).toMatch(/end/);
  });
});

describe("folderNameFromPath", () => {
  it("uses the last segment", () => {
    expect(folderNameFromPath("/Users/dev/projects/orchestrai")).toBe("orchestrai");
  });
});
