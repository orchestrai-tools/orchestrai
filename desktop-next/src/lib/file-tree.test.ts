import { expect, test } from "vitest";
import {
  buildFileTree,
  closedFromExpanded,
  expandedFromClosed,
  readExpanded,
  savedExpanded,
  treeScrollToStore,
} from "./file-tree";

test("files nest under their directories", () => {
  const tree = buildFileTree([
    { path: "README.md", changed: false },
    { path: "src/app.tsx", changed: true },
    { path: "packages/ui/button.tsx", changed: true },
  ]);
  expect(tree.map((node) => node.name)).toEqual(["packages", "src", "README.md"]);
  expect(tree[0]?.children[0]?.name).toBe("ui");
  expect(tree[0]?.changed).toBe(true);
  expect(tree[1]?.children[0]?.path).toBe("src/app.tsx");
});

test("a collapsed changed folder stays collapsed", () => {
  const tree = buildFileTree([
    { path: "src/app.tsx", changed: true },
    { path: "packages/ui/button.tsx", changed: true },
  ]);
  const closed = closedFromExpanded(tree, ["src"]);
  expect(closed.packages).toBe(true);
  expect(closed.src).toBeUndefined();
  expect(expandedFromClosed(tree, closed)).toEqual(["src"]);
});

test("a tree that cannot scroll keeps the saved offset", () => {
  expect(treeScrollToStore(0, 0, 0)).toBeNull();
  expect(treeScrollToStore(0, 0, 240)).toEqual({ treeScrollTop: 0, treeScrollLeft: 0 });
  expect(treeScrollToStore(80, 0, 240)).toEqual({ treeScrollTop: 80, treeScrollLeft: 0 });
});

test("collapsing every folder is remembered", () => {
  expect(readExpanded([])).toBeNull();
  expect(savedExpanded([])).toEqual(["\0"]);
  expect(readExpanded(savedExpanded([]))).toEqual([]);
  expect(readExpanded(savedExpanded(["src"]))).toEqual(["src"]);
});
