import { describe, expect, it } from "vitest";

import {
  allFolders,
  branchRows,
  buildBranchTree,
  defaultOpenFolders,
  flattenBranchTree,
  type BranchRow,
} from "./branch-tree";

function rows(branches: string[], open: Set<string> = new Set()): BranchRow[] {
  const root = buildBranchTree(branches);
  const out: BranchRow[] = [];
  flattenBranchTree(root, 0, "", open, out);
  return out;
}

const labels = (list: BranchRow[]) => list.map((row) => row.label);

describe("buildBranchTree", () => {
  it("leads with main, ahead of the folders", () => {
    const list = rows([
      "claude/one",
      "feat/agent-account/foo",
      "fix/bar",
      "docs-astro-site",
      "main",
      "pre-squash-backup",
    ]);

    expect(labels(list)).toEqual([
      "main",
      "claude",
      "feat",
      "fix",
      "docs-astro-site",
      "pre-squash-backup",
    ]);
  });

  it("keeps the other leaves after the folders", () => {
    expect(labels(rows(["main", "release", "zebra", "feat/x"]))).toEqual([
      "main",
      "feat",
      "release",
      "zebra",
    ]);
  });

  it("nests a folder's children under it once it is open", () => {
    const list = rows(["main", "feat/agent-account/foo"], new Set(["feat", "feat/agent-account"]));

    expect(labels(list)).toEqual(["main", "feat", "agent-account", "foo"]);
    expect(list[list.length - 1]).toMatchObject({ branch: "feat/agent-account/foo", depth: 2 });
  });

  it("opens every top-level folder by default", () => {
    const root = buildBranchTree(["main", "feat/one", "fix/two"]);

    expect([...defaultOpenFolders(root)].sort()).toEqual(["feat", "fix"]);
  });

  it("lists every nested folder", () => {
    const root = buildBranchTree(["main", "feat/a/one", "origin/fix/two"]);

    expect([...allFolders(root)].sort()).toEqual(["feat", "feat/a", "origin", "origin/fix"]);
  });
});

describe("branchRows", () => {
  it("keeps closed folders closed while browsing", () => {
    expect(labels(branchRows(["main", "feat/one"], "", new Set()))).toEqual(["main", "feat"]);
  });

  it("shows search matches inside their folders, expanded", () => {
    const list = branchRows(
      ["main", "feat/shell", "feat/column", "fix/shell-scroll"],
      "SHELL",
      new Set(),
    );

    expect(labels(list)).toEqual(["feat", "shell", "fix", "shell-scroll"]);
    expect(list[1]).toMatchObject({ branch: "feat/shell", depth: 1 });
  });

  it("returns nothing when no branch matches", () => {
    expect(branchRows(["main"], "nope", new Set())).toEqual([]);
  });
});
