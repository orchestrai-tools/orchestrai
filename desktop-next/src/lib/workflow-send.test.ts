import { describe, expect, it } from "vitest";
import type { TaskInfo } from "@warpforge/protocol";
import { workflowDelivery, workflowPlaceholder } from "./workflow-send";

function task(patch: Partial<TaskInfo>): TaskInfo {
  return { id: "t", project: "demo", prompt: "go", agent: "claude", status: "running", tags: [], ...patch } as TaskInfo;
}

describe("workflowDelivery", () => {
  it("resumes a paused pipeline and answers a question", () => {
    expect(workflowDelivery(task({ workflowRun: { stage: "review", waiting: { kind: "paused" } } as never }))).toEqual({
      kind: "resume",
    });
    expect(
      workflowDelivery(task({ workflowRun: { stage: "review", waiting: { kind: "question", barrierId: "b1" } } as never })),
    ).toEqual({ kind: "reply", barrierId: "b1" });
    expect(workflowPlaceholder(task({ workflowRun: { stage: "review", waiting: { kind: "paused" } } as never }))).toMatch(
      /resume/,
    );
  });

  it("refuses a Factory task that has not started", () => {
    expect(workflowDelivery(task({ tags: ["runner"] })).kind).toBe("blocked");
  });
});
