import { describe, expect, it } from "vitest";

import {
  anchorNote,
  formatDiffNotesPrompt,
  orderedRange,
  splitLines,
  type DiffNote,
} from "./diffNotes";

function note(overrides: Partial<DiffNote> = {}): DiffNote {
  return {
    body: "Rename this.",
    createdAt: 1,
    endLine: 2,
    id: "n1",
    path: "src/a.ts",
    snippet: ["const b = 2;"],
    startLine: 2,
    ...overrides,
  };
}

describe("anchorNote", () => {
  const lines = ["const a = 1;", "const b = 2;", "const c = 3;"];

  it("stays put while its lines are unchanged", () => {
    expect(anchorNote(note(), lines)).toEqual({ endLine: 2, outdated: false, startLine: 2 });
  });

  it("follows its snippet when lines are inserted above", () => {
    const moved = ["// header", "// more", ...lines];
    expect(anchorNote(note(), moved)).toEqual({ endLine: 4, outdated: false, startLine: 4 });
  });

  it("keeps a range's span when it moves", () => {
    const range = note({ endLine: 3, snippet: ["const b = 2;", "const c = 3;"], startLine: 2 });
    expect(anchorNote(range, ["x", ...lines])).toEqual({
      endLine: 4,
      outdated: false,
      startLine: 3,
    });
  });

  it("picks the occurrence nearest to where the note was", () => {
    const repeated = ["}", "a", "b", "}", "c"];
    const brace = note({ endLine: 3, snippet: ["}"], startLine: 3 });
    expect(anchorNote(brace, repeated).startLine).toBe(4);
  });

  it("ignores trailing whitespace and CRLF", () => {
    expect(anchorNote(note(), splitLines("const a = 1;\r\nconst b = 2;   \r\n"))).toEqual({
      endLine: 2,
      outdated: false,
      startLine: 2,
    });
  });

  it("is outdated when the snippet is gone, clamped into the file", () => {
    const rewritten = note({ endLine: 9, snippet: ["x", "y"], startLine: 8 });
    expect(anchorNote(rewritten, ["one", "two", "three"])).toEqual({
      endLine: 3,
      outdated: true,
      startLine: 3,
    });
  });
});

describe("orderedRange", () => {
  it("orders a drag upwards", () => {
    expect(orderedRange(7, 3)).toEqual({ end: 7, start: 3 });
    expect(orderedRange(3, 3)).toEqual({ end: 3, start: 3 });
  });
});

describe("formatDiffNotesPrompt", () => {
  it("lists every note with its place, quoted lines and text, sorted by file and line", () => {
    const text = formatDiffNotesPrompt([
      note({
        body: "Second.",
        id: "n2",
        path: "src/b.ts",
        snippet: ["b()"],
        startLine: 1,
        endLine: 1,
      }),
      note({
        body: "Use a map.",
        endLine: 14,
        snippet: ["for (const x of xs) {", "  push(x);", "}"],
        startLine: 12,
      }),
    ]);
    expect(text).toBe(
      [
        "Review notes on your changes (2 notes). Address each one. Where a note is wrong, leave the code as it is and say why.",
        "",
        "1. src/a.ts:12-14",
        "   > for (const x of xs) {",
        "   >   push(x);",
        "   > }",
        "   Use a map.",
        "",
        "2. src/b.ts:1",
        "   > b()",
        "   Second.",
        "",
      ].join("\n"),
    );
  });

  it("flags an outdated note and truncates a long quote", () => {
    const snippet = Array.from({ length: 15 }, (_, index) => `line ${index + 1}`);
    const text = formatDiffNotesPrompt([
      note({ endLine: 15, outdated: true, snippet, startLine: 1 }),
    ]);
    expect(text).toContain(
      "1. src/a.ts:1-15 (outdated: the quoted lines are no longer in the file)",
    );
    expect(text).toContain("   > line 12\n   > … (3 more lines)\n   Rename this.");
    expect(text).not.toContain("line 13");
  });
});
