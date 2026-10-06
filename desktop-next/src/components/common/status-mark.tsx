import { isSettledTask } from "@warpforge/core/taskShelf";
import type { TaskInfo } from "@warpforge/protocol";
import { cn } from "@warpforge/ui/lib/utils";

import { isChat } from "../../model/chat";
import { needsPerson } from "../../model/tasks";

export type RunStatus =
  | "running"
  | "waiting"
  | "needs-you"
  | "stopped"
  | "failed"
  | "review"
  | "queued"
  | "done"
  | "idle";

const TONE: Record<RunStatus, string> = {
  running: "bg-emerald-500",
  waiting: "bg-muted-foreground/40",
  "needs-you": "bg-amber-500",
  stopped: "bg-amber-500",
  failed: "bg-red-500",
  review: "bg-sky-500",
  queued: "bg-muted-foreground/40",
  done: "bg-muted-foreground/40",
  idle: "bg-muted-foreground/40",
};

export const STATUS_LABEL: Record<RunStatus, string> = {
  running: "Running",
  waiting: "Waiting",
  "needs-you": "Needs you",
  stopped: "Stopped",
  failed: "Failed",
  review: "In review",
  queued: "Queued",
  done: "Done",
  idle: "Idle",
};

/** One word for where a task is, from the daemon's status, its workflow stage, and its pull request. */
export function runStatus(task: TaskInfo, hasPullRequest = false): RunStatus {
  if (isChat(task)) {
    if (needsPerson(task)) return "needs-you";
    if (task.status === "running") return "running";
    return task.status === "interrupted" ? "stopped" : "idle";
  }
  if (task.workflowRun?.stage === "failed") return "failed";
  if (task.status === "interrupted") return "stopped";
  if (needsPerson(task)) return "needs-you";
  if (isSettledTask(task)) return "done";
  if (task.workflowRun?.stage === "review" || hasPullRequest) return "review";
  if (task.status === "queued") return "queued";
  return task.status === "waiting" ? "waiting" : "running";
}

/** A dot is often enough; the label is there for anyone who needs words. */
export function StatusDot({ status, className }: { status: RunStatus; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-flex size-2 shrink-0 rounded-full",
        TONE[status],
        status === "running" &&
          "after:absolute after:inset-0 after:animate-ping after:rounded-full after:bg-emerald-500/60 motion-reduce:after:hidden",
        className,
      )}
    />
  );
}

export function StatusMark({ status, className }: { status: RunStatus; className?: string }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground", className)}
    >
      <StatusDot status={status} />
      {STATUS_LABEL[status]}
    </span>
  );
}
