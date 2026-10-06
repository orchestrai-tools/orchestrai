import { describe, expect, it } from "vitest";
import { rankSymbolMatches } from "./symbol-matches";

describe("symbol matches", () => {
  it("prefers a definition in the same kind of file over a heading", () => {
    const ranked = rankSymbolMatches(
      [
        { path: "README.md", line: 1, column: 3, text: "# shell" },
        { path: "src/board.tsx", line: 4, column: 7, text: "const shell = columns" },
        { path: "src/app.tsx", line: 1, column: 17, text: "export function shell() {" },
      ],
      "shell",
      "src/app.tsx",
    );
    expect(ranked.map((match) => match.path)).toEqual(["src/app.tsx", "src/board.tsx"]);
  });
});
