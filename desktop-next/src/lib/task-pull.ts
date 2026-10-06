import { daemon } from "@warpforge/daemon";
import type { TaskPullRequest, TaskPullState } from "@warpforge/protocol";
import { useEffect } from "react";
import { useDaemon } from "./use-daemon";

const OPEN_TASK_MAX_AGE_SECS = 15;

const STATE_LABEL: Record<TaskPullState, string> = {
  closed: "Closed",
  draft: "Draft",
  merged: "Merged",
  open: "Open",
};

/** Open, draft, merged, or closed, the way the task header reads it. */
export function pullStateLabel(pull: TaskPullRequest): string {
  return STATE_LABEL[pull.state];
}

/** What a task's pull request chip says about its checks. */
export function pullCheckLabel(pull: TaskPullRequest): string {
  if (pull.state !== "open" && pull.state !== "draft") return "";
  if (pull.checks === "failing") {
    const failed = pull.failedChecks?.length ?? 0;
    if (failed > 0) return `${failed} check${failed === 1 ? "" : "s"} failing`;
    return "Checks failing";
  }
  if (pull.checks === "passing") return "Checks passing";
  if (pull.checks === "pending") return "Checks running";
  return "";
}

/** Re-check worktree pull requests when the app is connected and when the window focuses. */
export function useTaskPullSync() {
  const connection = useDaemon().connection;
  useEffect(() => {
    if (connection !== "connected") return;
    const refresh = () => {
      void daemon.refreshTaskPullRequests().catch(() => undefined);
    };
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [connection]);
}

/** Re-check one task's pull request when that task is open. */
export function useOpenTaskPull(taskId: string | undefined, hasWorktree: boolean) {
  useEffect(() => {
    if (!taskId || !hasWorktree) return;
    void daemon.refreshTaskPullRequests([taskId], OPEN_TASK_MAX_AGE_SECS).catch(() => undefined);
  }, [taskId, hasWorktree]);
}
