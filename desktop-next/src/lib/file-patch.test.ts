import { describe, expect, it } from "vitest";
import { formatFileDiff, toUnifiedPatch } from "./file-patch";

describe("formatFileDiff", () => {
  it("quotes a rename and its hunk for the conversation", () => {
    const text = formatFileDiff({
      path: "src/b.ts",
      oldPath: "src/a.ts",
      status: "renamed",
      hunks: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: [" context"], resolution: null }],
    });
    expect(text).toContain("diff --git a/src/a.ts b/src/b.ts");
    expect(text).toContain("rename from src/a.ts");
    expect(text).toContain("@@ -1,1 +1,1 @@");
    expect(text).toContain(" context");
  });
});

describe("toUnifiedPatch", () => {
  it("writes a git-apply header and the hunk", () => {
    const patch = toUnifiedPatch({
      path: "src/a.ts",
      oldPath: null,
      status: "modified",
      hunks: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: ["-old", "+new"], resolution: null }],
    });
    expect(patch).toBe("--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,1 +1,1 @@\n-old\n+new\n");
  });
});
