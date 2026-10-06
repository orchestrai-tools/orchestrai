import { expect, test } from "vitest";
import type { FileDiff, GitRoot } from "@warpforge/protocol";
import { filesByRoot, groupFilesByDirectory, rootLabel } from "./git-roots";

function file(path: string): FileDiff {
  return { hunks: [], oldPath: null, path, status: "modified" };
}

const primary: GitRoot = { branch: "main", name: "demo", path: "/demo", remotes: [] };
const nested: GitRoot = { branch: "feat/shell", name: "packages/ui", path: "/demo/packages/ui", remotes: [] };

test("files group under their parent directory", () => {
  const groups = groupFilesByDirectory([file("README.md"), file("src/app.tsx"), file("src/main.tsx")]);
  expect(groups.map((group) => [group.directory, group.files.map((item) => item.path)])).toEqual([
    ["", ["README.md"]],
    ["src", ["src/app.tsx", "src/main.tsx"]],
  ]);
});

test("one root stays a single list", () => {
  expect(filesByRoot([file("README.md")], [primary])).toBeNull();
});

test("a nested root owns the files under it", () => {
  const groups = filesByRoot([file("README.md"), file("packages/ui/button.tsx")], [primary, nested]);
  expect(groups?.map((group) => [rootLabel(group.root), group.files.map((item) => item.path)])).toEqual([
    ["demo [main]", ["README.md"]],
    ["packages/ui [feat/shell]", ["packages/ui/button.tsx"]],
  ]);
});
