import type { TaskInfo } from "@warpforge/protocol";
import { describe, expect, it, vi } from "vitest";

import { deliverComposerMessage, workflowDelivery, workflowPlaceholder } from "./workflow-send";

function task(patch: Partial<TaskInfo>): TaskInfo {
  return {
    id: "t",
    project: "demo",
    prompt: "go",
    agent: "claude",
    status: "running",
    tags: [],
    ...patch,
  } as TaskInfo;
}

describe("workflowDelivery", () => {
  it("resumes a paused pipeline and answers a question", () => {
    expect(
      workflowDelivery(
        task({ workflowRun: { stage: "review", waiting: { kind: "paused" } } as never }),
      ),
    ).toEqual({
      kind: "resume",
    });
    expect(
      workflowDelivery(
        task({
          workflowRun: { stage: "review", waiting: { kind: "question", barrierId: "b1" } } as never,
        }),
      ),
    ).toEqual({ kind: "reply", barrierId: "b1" });
    expect(
      workflowPlaceholder(
        task({ workflowRun: { stage: "review", waiting: { kind: "paused" } } as never }),
      ),
    ).toMatch(/resume/);
  });

  it("refuses a Factory task that has not started", () => {
    expect(workflowDelivery(task({ tags: ["runner"] })).kind).toBe("blocked");
  });
});

vi.mock("@warpforge/daemon", () => ({
  daemon: {
    request: vi.fn(),
    workflowReply: vi.fn(),
    workflowResume: vi.fn(),
    workflowDecide: vi.fn(),
  },
}));
import { daemon } from "@warpforge/daemon";
const attachment = { type: "file" as const, path: "README.md" };
it.each(["question", "paused", "limit"])(
  "refuses attachments for %s before sending any request",
  async (kind) => {
    vi.clearAllMocks();
    const workflow = task({ workflowRun: { stage: "review", waiting: { kind } } as never });
    await expect(deliverComposerMessage(workflow, "t", "keep", [attachment])).rejects.toThrow(
      "supports text only",
    );
    for (const rpc of [
      daemon.request,
      daemon.workflowReply,
      daemon.workflowResume,
      daemon.workflowDecide,
    ])
      expect(rpc).not.toHaveBeenCalled();
  },
);
it("forwards attachments to a normal agent and to the completed workflow's implementation stage", async () => {
  vi.clearAllMocks();
  await deliverComposerMessage(task({}), "t", "normal", [attachment]);
  expect(daemon.request).toHaveBeenLastCalledWith("session.prompt", {
    task_id: "t",
    text: "normal",
    attachments: [attachment],
  });
  const finished = task({
    workflowRun: { stage: "done" } as never,
    orchestrationGraph: { nodes: [{ kind: "implement", taskId: "child" }] } as never,
  });
  await deliverComposerMessage(finished, "t", "continue", [attachment]);
  expect(daemon.request).toHaveBeenLastCalledWith("session.prompt", {
    task_id: "child",
    text: "continue",
    attachments: [attachment],
  });
});
