import type { WorkflowRunInfo, WorkflowVerification } from "@warpforge/protocol";

export function workflowStageLabel(stage: WorkflowRunInfo["stage"]): string {
  switch (stage) {
    case "plan":
      return "planning";
    case "implement":
      return "implementing";
    case "review":
      return "reviewing";
    case "fix":
      return "fixing";
    case "verify":
      return "verifying";
    case "done":
      return "done";
    case "failed":
      return "failed";
    default:
      // A newer daemon may report a stage this build does not know; show the
      // raw value rather than silently rendering nothing.
      return stage;
  }
}

/**
 * The verify barrier a pipeline waits at, if any: verification kept failing
 * (`failed`) or could not run at all (`blocked`). Both reuse the `limit` wait.
 * @param run A workflow parent's run.
 * @returns The barrier kind, or null when the run is not waiting on verify.
 */
export function verifyBarrier(
  run: WorkflowRunInfo | null | undefined,
): "failed" | "blocked" | null {
  const waiting = run?.waiting;
  if (waiting?.kind !== "limit" || waiting.stage !== "verify") return null;
  return latestVerification(run)?.verdict === "blocked" ? "blocked" : "failed";
}

/**
 * The newest verification of a run.
 * @param run A workflow parent's run.
 * @returns The last verify-stage record, or null without one.
 */
export function latestVerification(
  run: WorkflowRunInfo | null | undefined,
): WorkflowVerification | null {
  const all = run?.verifications ?? [];
  return all.length > 0 ? all[all.length - 1] : null;
}

/**
 * The verification a verify stage task reported.
 * @param run A workflow parent's run.
 * @param taskId The verify stage's task.
 * @returns Its record, or null when the task is not a verify stage.
 */
export function verificationOf(
  run: WorkflowRunInfo | null | undefined,
  taskId: string | null,
): WorkflowVerification | null {
  if (!taskId) return null;
  return run?.verifications?.find((v) => v.taskId === taskId) ?? null;
}
