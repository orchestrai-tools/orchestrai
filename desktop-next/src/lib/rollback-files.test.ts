import { expect, test } from "vitest";
import { rollbackHunkIndexes } from "./rollback-files";

test("rollback rejects hunks from the bottom, and an added file once", () => {
  expect(rollbackHunkIndexes({ hunks: [{}, {}, {}], status: "modified" })).toEqual([2, 1, 0]);
  expect(rollbackHunkIndexes({ hunks: [], status: "added" })).toEqual([0]);
});
