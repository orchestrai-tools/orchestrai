import { describe, expect, it } from "vitest";
import { rankFiles } from "./file-rank";

describe("file rank", () => {
  it("puts a file whose name starts with the query ahead of a path that only contains it", () => {
    const ranked = rankFiles(
      [
        { path: "src/app.tsx", changed: true },
        { path: "packages/ui/button.tsx", changed: false },
        { path: "README.md", changed: false },
      ],
      "app",
    );
    expect(ranked.map((file) => file.path)).toEqual(["src/app.tsx"]);
  });
});
