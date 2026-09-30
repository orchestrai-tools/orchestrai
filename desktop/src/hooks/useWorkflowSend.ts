import { useCallback } from "react";

import { isFactoryTask } from "@/lib/factory";

import { daemon } from "../daemon";
import type { PromptSubmission, TaskInfo } from "../protocol";

/** The stage task of a finished pipeline that last changed the code. */
export interface WorkflowHandoff {
  taskId: string;
  /** The stage's label on the timeline, e.g. "fix (round 2)". */
  label: string;
  agent: string;
}

export interface WorkflowSend {
  /** True when this task is a workflow parent — it has no agent session. */
  isWorkflow: boolean;
  /** True while the pipeline has no barrier open: the parent's composer has no addressee. */
  disabled: boolean;
  /**
   * For a finished pipeline, where feedback on its change goes (PR feedback,
   * diff notes); `send` delivers there. Null while the pipeline is live.
   */
  handoff: WorkflowHandoff | null;
  /** Why nothing can take a message right now, or null when something can. */
  undeliverable: string | null;
  /** `undefined` keeps the composer's own default placeholder. */
  placeholder: string | undefined;
  /**
   * Deliver a composed message. Returns true when it was delivered as
   * pipeline input, so callers must not also prompt the (nonexistent) parent
   * session; throws when the pipeline has nowhere to take it.
   */
  send: (submission: PromptSubmission) => Promise<boolean>;
}

/**
 * The last implement or fix stage of a finished pipeline. The run cannot take
 * input once it has ended, so that stage's own session is the agent that made
 * the change.
 * @param task A workflow parent task.
 * @returns The stage, or null while the run is live or no stage edited code.
 */
export function workflowHandoff(task: TaskInfo): WorkflowHandoff | null {
  const stage = task.workflowRun?.stage;
  if (stage !== "done" && stage !== "failed") return null;
  const nodes = task.orchestrationGraph?.nodes ?? [];
  for (let index = nodes.length - 1; index >= 0; index--) {
    const { agent, id, kind, taskId } = nodes[index];
    if ((kind === "implement" || kind === "fix") && taskId) return { agent, label: id, taskId };
  }
  return null;
}

/**
 * Routing for messages typed into a workflow parent's composer.
 *
 * The parent task has no ACP session of its own — the daemon drives its stages
 * — so `session.prompt` would be rejected. A message is only meaningful at the
 * barriers where the pipeline is waiting for a human, and each barrier has its
 * own RPC; once the run has ended, feedback on its change goes to the stage in
 * `handoff`. Shared by every composer that can be pointed at a task, so no
 * surface can accidentally fall through to the raw prompt path.
 * @param task The task a composer or notice is pointed at.
 * @returns The routing for that task.
 */
export function useWorkflowSend(task: TaskInfo): WorkflowSend {
  const run = task.workflowRun ?? null;
  // A Factory task waiting for its turn has no pipeline yet, and no session:
  // a prompt must not start one.
  const notStarted = !run && isFactoryTask(task);
  const waiting = run?.waiting ?? null;
  const finished = run?.stage === "done" || run?.stage === "failed";
  const disabled = (!!run && !waiting) || notStarted;
  const handoff = workflowHandoff(task);
  const undeliverable = notStarted
    ? "This Factory task has not started yet"
    : !run || waiting || handoff
      ? null
      : finished
        ? "This pipeline ended before any stage changed the code"
        : "The pipeline is running on its own; open a stage to message its agent";

  const send = useCallback(
    async (submission: PromptSubmission): Promise<boolean> => {
      if (notStarted) throw new Error(undeliverable ?? "This Factory task has not started yet");
      if (!run) return false;
      const text = submission.text.trim();
      switch (waiting?.kind) {
        case "question":
          await daemon.workflowReply(task.id, text, waiting.barrierId ?? undefined);
          return true;
        case "paused":
          await daemon.workflowResume(task.id, text || undefined);
          return true;
        case "limit":
          // Typed guidance rides along with one more round of fixes.
          await daemon.workflowDecide(task.id, "extend", {
            barrierId: waiting.barrierId ?? undefined,
            note: text || undefined,
            rounds: 1,
          });
          return true;
        default:
          if (!handoff) throw new Error(undeliverable ?? "Nothing can take this message");
          await daemon.request("session.prompt", { task_id: handoff.taskId, ...submission });
          return true;
      }
    },
    [handoff, notStarted, run, task.id, undeliverable, waiting],
  );

  return {
    disabled,
    handoff,
    isWorkflow: !!run || notStarted,
    placeholder: notStarted
      ? "This Factory task starts on its own when it can — nothing to send yet."
      : waiting?.kind === "limit" && waiting.stage === "verify"
        ? "Add guidance for the next attempt, or pick an option above…"
        : placeholderFor(waiting?.kind, !!run, finished),
    send,
    undeliverable,
  };
}

function placeholderFor(
  kind: "question" | "limit" | "paused" | undefined,
  isWorkflow: boolean,
  finished: boolean,
): string | undefined {
  switch (kind) {
    case "question":
      return "Answer the stage's question…";
    case "paused":
      return "Add guidance for the next stage, then send to resume…";
    case "limit":
      return "Add guidance for another fix round, or pick an option above…";
    default:
      if (!isWorkflow) return undefined;
      return finished
        ? "This pipeline has finished — open a stage above to continue with that agent, or start a new task."
        : "The pipeline is running — open a stage above to message that agent.";
  }
}
