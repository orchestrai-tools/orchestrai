import { describe, expect, it } from "vitest";
import { groupMatchesByFile, highlightSegments, previewWindow, stepMatch } from "./file-search";

describe("file search", () => {
  it("keeps two hits in one file together and highlights the query", () => {
    const groups = groupMatchesByFile([
      { path: "src/app.tsx", line: 1, column: 17, text: "export function shell() {" },
      { path: "src/board.tsx", line: 4, column: 7, text: "const shell = columns" },
      { path: "src/app.tsx", line: 8, column: 8, text: "return shell.render()" },
    ]);
    expect(groups.map((group) => [group.path, group.matches.length])).toEqual([
      ["src/app.tsx", 2],
      ["src/board.tsx", 1],
    ]);
    expect(highlightSegments("return shell.render()", "shell").filter((segment) => segment.hit).map((segment) => segment.text)).toEqual([
      "shell",
    ]);
    expect(previewWindow("# Board\n\nColumns are visible.\n", 1).lines[0]).toBe("# Board");
    expect(stepMatch(0, 4, 1)).toBe(1);
    expect(stepMatch(0, 4, -1)).toBe(3);
  });
});
