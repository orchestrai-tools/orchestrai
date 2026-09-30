import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PromptSubmission, TaskInfo, WorkflowRunInfo } from "../protocol";
import { useWorkflowSend } from "./useWorkflowSend";

const workflowReply = vi.fn<(...args: unknown[]) => Promise<void>>(async () => {});
const workflowResume = vi.fn<(...args: unknown[]) => Promise<void>>(async () => {});
const workflowDecide = vi.fn<(...args: unknown[]) => Promise<void>>(async () => {});
const request = vi.fn<(...args: unknown[]) => Promise<void>>(async () => {});

vi.mock("../daemon", () => ({
  daemon: {
    request: (...args: unknown[]) => request(...(args as [])),
    workflowDecide: (...args: unknown[]) => workflowDecide(...(args as [])),
    workflowReply: (...args: unknown[]) => workflowReply(...(args as [])),
    workflowResume: (...args: unknown[]) => workflowResume(...(args as [])),
  },
}));

// Rendered, not called bare: React Compiler output needs a live dispatcher
// (useMemoCache), so the hook has to run inside a real renderer.
function send(box: TaskInfo) {
  return renderHook(() => useWorkflowSend(box), {}).result.current;
}

function task(run: Partial<WorkflowRunInfo> | null): TaskInfo {
  return {
    agent: "claude",
    blockedReason: null,
    createdAt: 1,
    filesChanged: 0,
    id: "t_1",
    project: "warpforge",
    prompt: "do it",
    status: "running",
    tags: [],
    title: "",
    updatedAt: 1,
    workflowRun: run
      ? {
          maxRounds: 2,
          round: 1,
          stage: "review",
          workflowId: "wf",
          workflowName: "Loop",
          ...run,
        }
      : null,
  };
}

const submission = (text: string): PromptSubmission => ({ attachments: [], text });

describe("useWorkflowSend", () => {
  beforeEach(() => vi.clearAllMocks());

  it("never prompts a queued Factory task, which has no session yet", async () => {
    const box = send({ ...task(null), status: "queued", tags: ["runner", "workflow:wf"] });
    expect(box.isWorkflow).toBe(true);
    expect(box.disabled).toBe(true);
    await expect(box.send(submission("go"))).rejects.toThrow(/has not started yet/);
    expect(request).not.toHaveBeenCalled();
  });

  it("declines to handle a plain task so the caller prompts its session", async () => {
    const box = send(task(null));
    expect(box.isWorkflow).toBe(false);
    expect(box.disabled).toBe(false);
    expect(await box.send(submission("hello"))).toBe(false);
  });

  it("routes each barrier to its own RPC", async () => {
    expect(await send(task({ waiting: { kind: "question" } })).send(submission("Postgres"))).toBe(
      true,
    );
    expect(workflowReply).toHaveBeenCalledWith("t_1", "Postgres", undefined);

    await send(task({ waiting: { kind: "paused" } })).send(submission("carry on"));
    expect(workflowResume).toHaveBeenCalledWith("t_1", "carry on");

    await send(task({ waiting: { kind: "limit" } })).send(submission("focus here"));
    expect(workflowDecide).toHaveBeenCalledWith("t_1", "extend", {
      barrierId: undefined,
      note: "focus here",
      rounds: 1,
    });
  });

  it("passes the barrier id the caller saw, so a stale answer is refused", async () => {
    await send(task({ waiting: { barrierId: "b_7", kind: "question" } })).send(
      submission("Postgres"),
    );
    expect(workflowReply).toHaveBeenCalledWith("t_1", "Postgres", "b_7");

    await send(task({ waiting: { barrierId: "b_8", kind: "limit" } })).send(submission("go"));
    expect(workflowDecide).toHaveBeenCalledWith("t_1", "extend", {
      barrierId: "b_8",
      note: "go",
      rounds: 1,
    });
  });

  it("refuses a message a running pipeline has no addressee for", async () => {
    // Reporting it as handled would let a caller mark undelivered feedback sent.
    const box = send(task({ stage: "review", waiting: null }));
    expect(box.handoff).toBeNull();
    expect(box.undeliverable).toMatch(/running on its own/);
    await expect(box.send(submission("hi"))).rejects.toThrow(/running on its own/);
    expect(request).not.toHaveBeenCalled();
    expect(workflowReply).not.toHaveBeenCalled();
    expect(workflowResume).not.toHaveBeenCalled();
    expect(workflowDecide).not.toHaveBeenCalled();
  });

  it("hands a finished pipeline's feedback to its last code-changing stage", async () => {
    const finished = {
      ...task({ stage: "done", waiting: null }),
      orchestrationGraph: {
        goal: "Loop",
        id: "t_1",
        nodes: [
          {
            agent: "claude",
            id: "implement",
            kind: "implement",
            status: "complete",
            taskId: "t_impl",
          },
          { agent: "codex", id: "fix (round 1)", kind: "fix", status: "complete", taskId: "t_fix" },
          { agent: "gemini", id: "review", kind: "review", status: "complete", taskId: "t_rev" },
        ],
      },
    } satisfies TaskInfo;
    const box = send(finished);
    expect(box.handoff).toEqual({ agent: "codex", label: "fix (round 1)", taskId: "t_fix" });
    expect(box.undeliverable).toBeNull();
    expect(await box.send(submission("CI failed"))).toBe(true);
    expect(request).toHaveBeenCalledWith("session.prompt", {
      attachments: [],
      task_id: "t_fix",
      text: "CI failed",
    });
  });

  it("refuses a finished pipeline whose stages never changed the code", async () => {
    const box = send(task({ stage: "failed", waiting: null }));
    expect(box.handoff).toBeNull();
    expect(box.undeliverable).toMatch(/ended before any stage changed the code/);
    await expect(box.send(submission("hi"))).rejects.toThrow(/ended before/);
    expect(request).not.toHaveBeenCalled();
  });

  it("explains why the box is disabled, differently for running vs finished", () => {
    expect(send(task({ stage: "review" })).placeholder).toMatch(/open a stage above/);
    expect(send(task({ stage: "done" })).placeholder).toMatch(/has finished/);
    expect(send(task({ waiting: { kind: "question" } })).placeholder).toMatch(/Answer the stage/);
  });
});
