import { expect, test } from "vitest";
import { findIndexToRestore, findIndexToSave, findToRestore, tabsToRestore } from "./file-tabs";

test("open file tabs come back when the page has none yet", () => {
  expect(tabsToRestore({ tabs: ["README.md"], activePath: "README.md" }, null, [])).toEqual({
    path: "README.md",
    tabs: ["README.md"],
  });
  expect(tabsToRestore({ tabs: ["README.md"], activePath: "README.md" }, "app.tsx", [])).toBeNull();
  expect(tabsToRestore({ tabs: [], activePath: null }, null, [])).toBeNull();
});

test("a file search comes back when the box is empty", () => {
  expect(findToRestore("button", "")).toBe("button");
  expect(findToRestore("button", "app")).toBeNull();
  expect(findToRestore("  ", "")).toBeNull();
});

test("the selected search match comes back for the same query", () => {
  expect(findIndexToRestore(2, 5, true)).toBe(2);
  expect(findIndexToRestore(9, 5, true)).toBe(4);
  expect(findIndexToRestore(2, 5, false)).toBe(0);
  expect(findIndexToSave("button", 2, "button")).toBe(2);
  expect(findIndexToSave("button", 2, "column")).toBe(0);
});
