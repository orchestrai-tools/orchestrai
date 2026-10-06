import { describe, expect, it } from "vitest";
import type { PullComment } from "@warpforge/protocol";
import {
  appendSuggestion,
  commentSpan,
  pairHunkLines,
  parseUnifiedPatch,
  patchCounts,
  patchFileLabel,
  reviewThreadsByLine,
  suggestionSeed,
} from "./pull-diff";

const PATCH = [
  "diff --git a/src/a.ts b/src/a.ts",
  "index 111..222 100644",
  "--- a/src/a.ts",
  "+++ b/src/a.ts",
  "@@ -1,3 +1,4 @@",
  " unchanged",
  "-removed line",
  "+added line",
  " more context",
  "+another addition",
  "diff --git a/bin/img b/bin/img",
  "new file mode 100644",
  "Binary files /dev/null and b/bin/img differ",
].join("\n");

describe("parseUnifiedPatch", () => {
  it("numbers additions and deletions on their own side", () => {
    const [block, binary] = parseUnifiedPatch(PATCH);
    expect(block?.path).toBe("src/a.ts");
    expect(binary?.binary).toBe(true);
    const hunk = block?.hunks[0];
    expect(hunk?.lines.map((line) => line.kind)).toEqual([
      "context",
      "del",
      "add",
      "context",
      "add",
    ]);
    expect(hunk?.lines[1]?.oldNumber).toBe(2);
    expect(hunk?.lines[2]?.newNumber).toBe(2);
    expect(patchCounts(block!)).toEqual({ additions: 2, deletions: 1 });
    expect(patchFileLabel(block!)).toBe("src/a.ts");
    const rows = pairHunkLines(hunk?.lines ?? []);
    expect(rows.some((row) => row.left?.kind === "del" && row.right?.kind === "add")).toBe(true);
  });
});

describe("patchFileLabel", () => {
  it("names a rename from the removed path", () => {
    const [block] = parseUnifiedPatch(
      [
        "diff --git a/README.md b/docs/board.md",
        "--- a/README.md",
        "+++ b/docs/board.md",
        "@@ -1 +1 @@",
        "-# Board",
        "+# Project board",
      ].join("\n"),
    );
    expect(patchFileLabel(block!)).toBe("README.md → docs/board.md");
    expect(patchCounts(block!)).toEqual({ additions: 1, deletions: 1 });
  });
});

describe("reviewThreadsByLine", () => {
  it("keeps inline comments on their post-image line", () => {
    const comment = {
      id: "c1",
      kind: "review_comment",
      body: "here",
      createdAt: "",
      url: "",
      path: "src/a.ts",
      line: 4,
      replies: [],
    } satisfies PullComment;
    const index = reviewThreadsByLine([
      comment,
      { ...comment, id: "c2", kind: "comment", line: 1 },
      { ...comment, id: "c3", path: undefined, line: 2 },
    ]);
    expect(
      index
        .get("src/a.ts")
        ?.get(4)
        ?.map((item) => item.id),
    ).toEqual(["c1"]);
  });
});

describe("suggestion", () => {
  it("seeds a suggestion with the current line", () => {
    const [block] = parseUnifiedPatch(
      [
        "diff --git a/src/a.ts b/src/a.ts",
        "--- a/src/a.ts",
        "+++ b/src/a.ts",
        "@@ -1 +1 @@",
        "-old",
        "+project shell",
      ].join("\n"),
    );
    expect(suggestionSeed(block!, "RIGHT", 1)).toEqual(["project shell"]);
    expect(appendSuggestion("", ["project shell"])).toBe("```suggestion\nproject shell\n```");
    expect(suggestionSeed(block!, "RIGHT", 1, 1)).toEqual(["project shell"]);
  });

  it("grows a comment from the first line when shift is held", () => {
    const first = commentSpan(null, { path: "src/a.ts", side: "RIGHT", line: 2 }, false);
    const span = commentSpan(first, { path: "src/a.ts", side: "RIGHT", line: 4 }, true);
    expect(span).toMatchObject({ anchor: 2, startLine: 2, line: 4 });
    const upward = commentSpan(first, { path: "src/a.ts", side: "RIGHT", line: 1 }, true);
    expect(upward).toMatchObject({ anchor: 2, startLine: 1, line: 2 });
  });
});
