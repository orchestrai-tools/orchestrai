import { daemon } from "@warpforge/daemon";
import type { PromptAttachment, TaskInfo } from "@warpforge/protocol";
import { isFactoryTask } from "../model/factory";

export type WorkflowDelivery =
  | { kind: "prompt" }
  | { kind: "reply"; barrierId?: string }
  | { kind: "resume" }
  | { kind: "extend"; barrierId?: string }
  | { kind: "handoff"; taskId: string }
  | { kind: "blocked"; reason: string };

/** Where a message typed on a workflow task should go. A normal task stays a prompt. */
export function workflowDelivery(task: TaskInfo | undefined): WorkflowDelivery {
  if (!task) return { kind: "prompt" };
  const run = task.workflowRun ?? null;
  if (!run && isFactoryTask(task)) return { kind: "blocked", reason: "This Factory task has not started yet" };
  if (!run) return { kind: "prompt" };
  const waiting = run.waiting ?? null;
  if (waiting?.kind === "question") return { kind: "reply", barrierId: waiting.barrierId ?? undefined };
  if (waiting?.kind === "paused") return { kind: "resume" };
  if (waiting?.kind === "limit") return { kind: "extend", barrierId: waiting.barrierId ?? undefined };
  const handoff = workflowHandoff(task);
  if (handoff) return { kind: "handoff", taskId: handoff };
  const finished = run.stage === "done" || run.stage === "failed";
  return {
    kind: "blocked",
    reason: finished
      ? "This pipeline ended before any stage changed the code"
      : "The pipeline is running on its own; open a stage to message its agent",
  };
}

export function workflowPlaceholder(task: TaskInfo | undefined): string | null {
  const delivery = workflowDelivery(task);
  if (delivery.kind === "blocked") return delivery.reason;
  if (delivery.kind === "reply") return "Answer the stage's question…";
  if (delivery.kind === "resume") return "Add guidance for the next stage, then send to resume…";
  if (delivery.kind === "extend") return "Add guidance for another round, or pick an option above…";
  if (delivery.kind === "handoff") return "This pipeline has finished. Send to continue with the stage that changed the code.";
  return null;
}

/** Send a composer message. A workflow barrier uses its own call instead of a session prompt. */
export async function deliverComposerMessage(
  task: TaskInfo | undefined,
  taskId: string,
  text: string,
  attachments: PromptAttachment[],
): Promise<void> {
  const delivery = workflowDelivery(task);
  if (delivery.kind === "blocked") throw new Error(delivery.reason);
  if (delivery.kind === "reply") {
    await daemon.workflowReply(taskId, text, delivery.barrierId);
    return;
  }
  if (delivery.kind === "resume") {
    await daemon.workflowResume(taskId, text || undefined);
    return;
  }
  if (delivery.kind === "extend") {
    await daemon.workflowDecide(taskId, "extend", { barrierId: delivery.barrierId, note: text || undefined, rounds: 1 });
    return;
  }
  const target = delivery.kind === "handoff" ? delivery.taskId : taskId;
  await daemon.request("session.prompt", { task_id: target, text, attachments });
}

function workflowHandoff(task: TaskInfo): string | null {
  const stage = task.workflowRun?.stage;
  if (stage !== "done" && stage !== "failed") return null;
  const nodes = task.orchestrationGraph?.nodes ?? [];
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const node = nodes[index];
    if ((node.kind === "implement" || node.kind === "fix") && node.taskId) return node.taskId;
  }
  return null;
}
