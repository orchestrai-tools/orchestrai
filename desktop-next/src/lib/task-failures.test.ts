import type { SessionUpdate, TaskInfo } from "@warpforge/protocol";
import { describe, expect, it } from "vitest";
import { detectFailure } from "@warpforge/core/taskFailures";
import { failureKindLabel } from "../pages/board/failure-label";

function task(patch: Partial<TaskInfo>): TaskInfo {
  return {
    id: "t",
    project: "demo",
    prompt: "do the thing",
    agent: "claude",
    status: "waiting",
    tags: [],
    title: "Do the thing",
    createdAt: 0,
    updatedAt: 0,
    filesChanged: 0,
    blockedReason: null,
    ...patch,
  };
}

describe("detectFailure", () => {
  it("names an interrupted session and a failed tool that nobody answered", () => {
    expect(detectFailure(task({ status: "interrupted" }), [])?.reason).toBe(
      "session lost on daemon restart",
    );
    const updates = [
      { kind: "tool_call", status: "failed", title: "cargo test", tool_call_id: "1" },
    ] as SessionUpdate[];
    expect(detectFailure(task({}), updates)?.reason).toBe("tool call failed: cargo test");
    expect(detectFailure(task({ status: "blocked" }), updates)).toBeNull();
  });

  it("labels the kind the way the Failed list does", () => {
    expect(failureKindLabel("interrupted")).toBe("Interrupted");
    expect(failureKindLabel("tool_call")).toBe("Tool call");
    expect(failureKindLabel("orchestration")).toBe("Node");
    expect(failureKindLabel("workflow_stage")).toBe("Stage");
  });
});
