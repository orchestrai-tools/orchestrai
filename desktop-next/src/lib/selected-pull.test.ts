import { describe, expect, it } from "vitest";
import { pullSizeLabel } from "./selected-pull";

describe("pullSizeLabel", () => {
  it("counts files and the diff size", () => {
    expect(pullSizeLabel({ additions: 12, deletions: 3, changedFiles: 1 })).toBe("1 file · +12 −3");
    expect(pullSizeLabel({})).toBe("0 files · +0 −0");
  });
});
