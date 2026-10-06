import { describe, expect, it } from "vitest";
import type { TaskPullRequest } from "@warpforge/protocol";
import { pullCheckLabel, pullStateLabel } from "./task-pull";

function pull(over: Partial<TaskPullRequest>): TaskPullRequest {
  return {
    number: 7,
    state: "open",
    title: "Sketch the shell",
    url: "https://github.com/orchestrai/demo/pull/7",
    ...over,
  };
}

describe("pullCheckLabel", () => {
  it("counts failing checks", () => {
    expect(
      pullCheckLabel(
        pull({
          checks: "failing",
          failedChecks: [{ name: "ci / lint", state: "failing", url: "https://example.com" }],
        }),
      ),
    ).toBe("1 check failing");
  });

  it("names passing and running checks", () => {
    expect(pullCheckLabel(pull({ checks: "passing" }))).toBe("Checks passing");
    expect(pullCheckLabel(pull({ checks: "pending" }))).toBe("Checks running");
  });

  it("is quiet once the pull request is merged", () => {
    expect(pullCheckLabel(pull({ checks: "failing", state: "merged" }))).toBe("");
  });
});

describe("pullStateLabel", () => {
  it("names each pull request state", () => {
    expect(pullStateLabel(pull({ state: "open" }))).toBe("Open");
    expect(pullStateLabel(pull({ state: "draft" }))).toBe("Draft");
    expect(pullStateLabel(pull({ state: "merged" }))).toBe("Merged");
    expect(pullStateLabel(pull({ state: "closed" }))).toBe("Closed");
  });
});
