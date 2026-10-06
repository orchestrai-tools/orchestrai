import type { AutomationRun, AutomationRunStatus } from "@warpforge/protocol";

export interface RunStatusMeta {
  label: string;
  hint: string;
}

export const RUN_STATUS_META: Record<AutomationRunStatus, RunStatusMeta> = {
  completed: { hint: "The agent finished its turn.", label: "Completed" },
  failed: { hint: "The run started but the agent did not finish.", label: "Failed" },
  pending: { hint: "Waiting for the precheck before any work is dispatched.", label: "Pending" },
  running: { hint: "A task is running the prompt right now.", label: "Running" },
  skipped_missed: { hint: "Came due while the app was closed, and past the grace window.", label: "Skipped · missed" },
  skipped_precheck: { hint: "The precheck command did not authorize this run.", label: "Skipped · precheck" },
  skipped_running: { hint: "The previous run of this automation had not finished.", label: "Skipped · overlap" },
  skipped_quota: { hint: "The agent's account was out of quota, so no work was started.", label: "Skipped · quota" },
};

/** How long a run took, or that it is still going. */
export function runDuration(run: Pick<AutomationRun, "startedAt" | "finishedAt">): string {
  if (!run.finishedAt) return "still running";
  const seconds = Math.max(0, run.finishedAt - run.startedAt);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
