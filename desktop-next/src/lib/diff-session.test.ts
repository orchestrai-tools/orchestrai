import { expect, test } from "vitest";
import {
  collapsedAfterToggle,
  diffScrollToApply,
  diffScrollToStore,
  diffViewToRestore,
  hunkKey,
  hunkNearestTop,
} from "./diff-session";

test("closing a diff file keeps it collapsed", () => {
  expect(collapsedAfterToggle([], "app.tsx", false)).toEqual(["app.tsx"]);
  expect(collapsedAfterToggle(["app.tsx"], "app.tsx", false)).toEqual(["app.tsx"]);
  expect(collapsedAfterToggle(["app.tsx", "readme.md"], "app.tsx", true)).toEqual(["readme.md"]);
});

test("split view comes back while the page is still unified", () => {
  expect(diffViewToRestore("split", "unified")).toBe("split");
  expect(diffViewToRestore("unified", "unified")).toBeNull();
  expect(diffViewToRestore("split", "split")).toBeNull();
});

test("the hunk at the top of the list is the one worth keeping", () => {
  expect(hunkKey({ oldStart: 1, oldLines: 2, newStart: 1, newLines: 4 })).toBe("1:2:1:4");
  expect(
    hunkNearestTop(
      [
        { file: "a.ts", key: "1:1:1:1", top: 10 },
        { file: "b.ts", key: "4:2:4:2", top: 80 },
      ],
      40,
    ),
  ).toEqual({ file: "a.ts", key: "1:1:1:1" });
});

test("a diff scroll waits until the page can show it", () => {
  expect(diffScrollToApply(240, 80)).toBeNull();
  expect(diffScrollToApply(240, 400)).toBe(240);
  expect(diffScrollToStore(0, 0)).toBeNull();
  expect(diffScrollToStore(0, 400)).toBe(0);
  expect(diffScrollToStore(80, 400)).toBe(80);
});
