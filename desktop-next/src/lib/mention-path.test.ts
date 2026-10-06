import { describe, expect, it } from "vitest";
import {
  extractFileReferences,
  insertFileRef,
  mentionToken,
  replaceMention,
  resolveMention,
  splitFileReference,
} from "./mention-path";

describe("markdown file mentions", () => {
  const known = new Set(["src/app.ts", "README.md"]);

  it("opens a known path and keeps a trailing line number", () => {
    expect(resolveMention("`src/app.ts:12`", known)).toEqual({ path: "src/app.ts", line: 11 });
    expect(resolveMention("src/app.ts:12,", known)).toEqual({ path: "src/app.ts", line: 11 });
    expect(resolveMention("./README.md", known)).toEqual({ path: "README.md", line: 0 });
    expect(resolveMention("/repo/src/app.ts", known, "/repo")).toEqual({
      path: "src/app.ts",
      line: 0,
    });
    expect(resolveMention("missing.ts", known)).toBeNull();
  });

  it("mentions a file and an optional line range", () => {
    expect(mentionToken("src/app.ts")).toBe("@src/app.ts");
    expect(mentionToken("src/app.ts", { start: 2, end: 2 })).toBe("@src/app.ts#L2");
    expect(mentionToken("src/app.ts", { start: 2, end: 4 })).toBe("@src/app.ts#L2-4");
    expect(mentionToken("my file.md", { start: 1, end: 3 })).toBe('@"my file.md"#L1-3');
  });

  it("replaces the typed mention with the file path", () => {
    expect(replaceMention("see @read", 4, 9, "README.md")).toEqual({
      value: "see @README.md ",
      caret: 15,
    });
  });

  it("sends a mentioned path, including a line range", () => {
    expect(extractFileReferences("see @README.md and @src/app.ts#L2-4")).toEqual([
      "README.md",
      "src/app.ts#L2-4",
    ]);
    expect(splitFileReference("src/app.ts#L2-4")).toEqual({
      path: "src/app.ts",
      range: { start: 2, end: 4 },
    });
  });

  it("inserts a file mention at the caret", () => {
    expect(insertFileRef("see ", 4, "src/app.ts")).toEqual({
      value: "see @src/app.ts ",
      caret: 16,
    });
    expect(insertFileRef("", 0, "my file.md")).toEqual({ value: '@"my file.md" ', caret: 14 });
  });
});
