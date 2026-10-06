import { expect, test } from "vitest";
import { diffFileKeyAction, nextDiffPath } from "./pull-file-nav";

const paths = ["src/board.tsx", "docs/board.md", "notes.md"];

test("brackets step through the diff files", () => {
  expect(nextDiffPath(paths, paths[0], "]", new Set())).toBe("docs/board.md");
  expect(nextDiffPath(paths, "", "]", new Set())).toBe("src/board.tsx");
  expect(nextDiffPath(paths, "", "[", new Set())).toBe("notes.md");
  expect(nextDiffPath(paths, paths[0], "[", new Set())).toBe("src/board.tsx");
});

test("braces skip files already marked viewed", () => {
  const viewed = new Set(["src/board.tsx", "docs/board.md"]);
  expect(nextDiffPath(paths, paths[0], "}", viewed)).toBe("notes.md");
  expect(nextDiffPath(paths, "notes.md", "{", viewed)).toBeNull();
});

test("v ticks the open file and ignores a modifier", () => {
  const preventDefault = () => undefined;
  expect(
    diffFileKeyAction(
      { key: "v", metaKey: false, ctrlKey: false, altKey: false, preventDefault },
      { paths, active: paths[0], viewed: new Set(), typing: false },
    ),
  ).toEqual({ toggle: true });
  expect(
    diffFileKeyAction(
      { key: "]", metaKey: true, ctrlKey: false, altKey: false, preventDefault },
      { paths, active: paths[0], viewed: new Set(), typing: false },
    ),
  ).toBeNull();
});
