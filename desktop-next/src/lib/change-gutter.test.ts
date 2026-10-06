import { describe, expect, it } from "vitest";
import { computeGutterChanges } from "./change-gutter";

describe("computeGutterChanges", () => {
  it("marks a modified line, an added line, and a deleted line", () => {
    const modified = computeGutterChanges("a\nb\nc", "a\nx\nc");
    expect(modified.blocks).toEqual([expect.objectContaining({ from: 2, type: "modified" })]);
    expect(modified.deleted).toEqual([]);

    const added = computeGutterChanges("a\nc", "a\nb\nc");
    expect(added.blocks[0]).toEqual(expect.objectContaining({ from: 2, type: "added" }));

    const deleted = computeGutterChanges("a\nb\nc", "a\nc");
    expect(deleted.deleted[0]).toEqual(expect.objectContaining({ line: 2 }));
    expect(deleted.deleted[0]?.oldText).toContain("b");
  });
});
