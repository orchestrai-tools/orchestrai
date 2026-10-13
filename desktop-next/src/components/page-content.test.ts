import { expect, it } from "vitest";

import { pageScope } from "./page-content";

it("gives file and git state a new identity for every checkout, including worktree changes", () => {
  const input = { page: "files", project: "p", taskId: "t", checkoutId: "t", worktree: "/a" };
  expect(pageScope(input)).not.toBe(pageScope({ ...input, checkoutId: "" }));
  expect(pageScope(input)).not.toBe(pageScope({ ...input, project: "other" }));
  expect(pageScope(input)).not.toBe(pageScope({ ...input, worktree: "/b" }));
  expect(pageScope({ ...input, page: "task" })).not.toBe(
    pageScope({ ...input, page: "task", taskId: "other" }),
  );
});
