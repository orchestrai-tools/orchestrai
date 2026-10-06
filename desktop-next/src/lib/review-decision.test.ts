import { describe, expect, it } from "vitest";
import type { TaskInfo, TaskStatus } from "@warpforge/protocol";
import { assistantMark, reviewDecisionLabel } from "./review-decision";

function task(status: TaskStatus): TaskInfo {
  return {
    id: "t1",
    project: "app",
    prompt: "review",
    agent: "claude",
    status,
    tags: ["pr-review", "pr:acme/widgets#7"],
    title: "review",
    createdAt: 1,
    updatedAt: 1,
    filesChanged: 0,
    blockedReason: null,
    origin: "pr-review",
  };
}

describe("review decision and assistant mark", () => {
  it("names the three review decisions", () => {
    expect(reviewDecisionLabel("APPROVED")).toBe("Approved");
    expect(reviewDecisionLabel("changes_requested")).toBe("Changes requested");
    expect(reviewDecisionLabel("REVIEW_REQUIRED")).toBe("Review required");
    expect(reviewDecisionLabel("UNKNOWN")).toBeNull();
  });

  it("marks a running assistant ahead of a finished one", () => {
    const pull = { repo: "acme/widgets", number: 7 };
    expect(assistantMark([task("running")], pull)).toBe("running");
    expect(assistantMark([task("waiting")], pull)).toBe("ready");
    expect(assistantMark([task("running")].map((item) => ({ ...item, tags: [] })), pull)).toBeNull();
  });
});
