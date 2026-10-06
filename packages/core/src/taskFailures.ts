import type { SessionUpdate, TaskInfo } from "@warpforge/protocol";

export type FailureKind = "interrupted" | "tool_call" | "orchestration" | "workflow_stage";

export interface FailureInfo {
  kind: FailureKind;
  /** Human-readable one-liner, e.g. "tool call failed", "node implement failed". */
  reason: string;
}

function latestToolCallFailure(updates: SessionUpdate[]): { title: string } | null {
  const latest = new Map<string, { failed: boolean; idx: number; title: string }>();
  updates.forEach((update, idx) => {
    if (update.kind === "tool_call") {
      latest.set(update.tool_call_id, {
        failed: update.status === "failed",
        idx,
        title: update.title,
      });
    }
  });

  let lastFailedIdx = -1;
  let title = "";
  for (const entry of latest.values()) {
    if (entry.failed && entry.idx > lastFailedIdx) {
      lastFailedIdx = entry.idx;
      title = entry.title;
    }
  }
  if (lastFailedIdx === -1) return null;

  for (let i = lastFailedIdx + 1; i < updates.length; i++) {
    const kind = updates[i]?.kind;
    if (kind === "user_message" || kind === "agent_text") return null;
  }

  return { title: title.length > 60 ? `${title.slice(0, 57)}...` : title };
}

/** Why this task counts as failed, or null when it does not. */
export function detectFailure(task: TaskInfo, updates: SessionUpdate[] | undefined): FailureInfo | null {
  if (task.workflowRun?.waiting != null && task.workflowRun.waiting.kind !== "paused") return null;
  if (task.status === "blocked") return null;

  if (task.status === "interrupted") {
    return { kind: "interrupted", reason: "session lost on daemon restart" };
  }

  if (updates) {
    const failedCall = latestToolCallFailure(updates);
    if (failedCall) return { kind: "tool_call", reason: `tool call failed: ${failedCall.title}` };
  }

  const failedNode = task.orchestrationGraph?.nodes.find((node) => node.status === "failed");
  if (failedNode) return { kind: "orchestration", reason: `node ${failedNode.kind} failed` };

  if (task.workflowRun?.stage === "failed") return { kind: "workflow_stage", reason: "workflow stage failed" };

  return null;
}

export function buildFailureList(
  tasks: TaskInfo[],
  sessionUpdates: Record<string, SessionUpdate[]>,
): Array<{ task: TaskInfo } & FailureInfo> {
  const failures: Array<{ task: TaskInfo } & FailureInfo> = [];
  for (const task of tasks) {
    const failure = detectFailure(task, sessionUpdates[task.id]);
    if (failure) failures.push({ task, ...failure });
  }
  return failures.sort((a, b) => b.task.updatedAt - a.task.updatedAt);
}
