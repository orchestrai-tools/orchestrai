import { expect, test } from "vitest";
import {
  changeIndexNear,
  chooseChangeIndex,
  changedLineCount,
  changedLineNumbers,
  changedLineText,
  nextChangeIndex,
  revertChangedLine,
} from "./line-changes";

test("previous change starts at the last one", () => {
  expect(nextChangeIndex(-1, 1, 3)).toBe(0);
  expect(nextChangeIndex(-1, -1, 3)).toBe(2);
  expect(nextChangeIndex(0, -1, 3)).toBe(2);
  expect(nextChangeIndex(2, 1, 3)).toBe(0);
});

test("next and previous follow the cursor line", () => {
  const lines = [1, 4, 9];
  expect(changeIndexNear(lines, 4, 1)).toBe(2);
  expect(changeIndexNear(lines, 4, -1)).toBe(0);
  expect(changeIndexNear(lines, 0, 1)).toBe(0);
  expect(changeIndexNear(lines, 20, -1)).toBe(2);
});

test("a moved cursor leaves the selected change", () => {
  const lines = [1, 4, 9];
  expect(chooseChangeIndex(0, 1, lines, 1)).toBe(1);
  expect(chooseChangeIndex(0, 1, lines, 4)).toBe(2);
  expect(chooseChangeIndex(2, -1, lines, 4)).toBe(0);
});

test("counts lines that differ from the committed text", () => {
  expect(changedLineCount("shell\n", "project shell\n")).toBe(1);
  expect(changedLineCount("a\nb\n", "a\nb\n")).toBe(0);
  expect(changedLineCount("a\n", "a\nb\n")).toBe(1);
  expect(changedLineNumbers("# Board\n", "# Board\n\nColumns are visible.\n")).toEqual([1, 2]);
  expect(revertChangedLine("# Board\n", "# Board\n\nColumns are visible.\n", 2)).toBe(
    "# Board\n\n",
  );
  expect(changedLineText("# Board\n", "# Board\n\nColumns are visible.\n", 2)).toBe(
    "Columns are visible.",
  );
});
