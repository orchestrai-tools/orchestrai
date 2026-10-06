import { describe, expect, it } from "vitest";
import { canTestInApp, collectBacklogIds, testingWorkflow } from "./factory-batch";

describe("collectBacklogIds", () => {
  it("walks every page until the backlog says there is no next page", async () => {
    const ids = await collectBacklogIds(async (page) => {
      if (page === 0) return { items: [{ id: "a" }, { id: "b" }], hasNextPage: true };
      if (page === 1) return { items: [{ id: "c" }], hasNextPage: false };
      throw new Error("should not read past the last page");
    });
    expect(ids).toEqual(["a", "b", "c"]);
  });
});

describe("testing workflow", () => {
  const workflows = [
    { id: "review-loop", valid: true },
    { id: "verify-review-loop", valid: true, verifyRequired: true },
    { id: "broken", valid: false, verifyRequired: true },
  ];

  it("switches to the template that tests the running app, and back", () => {
    expect(canTestInApp(workflows)).toBe(true);
    expect(testingWorkflow(workflows, true)).toBe("verify-review-loop");
    expect(testingWorkflow(workflows, false)).toBe("review-loop");
  });
});
