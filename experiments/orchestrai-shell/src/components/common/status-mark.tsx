import { cn } from "@/lib/utils"
import type { RunStatus } from "@/data/tasks"

const TONE: Record<RunStatus, string> = {
  running: "bg-emerald-500",
  "needs-you": "bg-amber-500",
  stopped: "bg-amber-500",
  failed: "bg-red-500",
  review: "bg-sky-500",
  queued: "bg-muted-foreground/40",
  done: "bg-muted-foreground/40",
}

export const STATUS_LABEL: Record<RunStatus, string> = {
  running: "Running",
  "needs-you": "Needs you",
  stopped: "Stopped",
  failed: "Failed",
  review: "In review",
  queued: "Queued",
  done: "Done",
}

/** A dot is often enough (calm technology); the label is there for anyone who needs words. */
export function StatusDot({ status, className }: { status: RunStatus; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-flex size-2 shrink-0 rounded-full",
        TONE[status],
        status === "running" && "after:absolute after:inset-0 after:animate-ping after:rounded-full after:bg-emerald-500/60",
        className
      )}
    />
  )
}

export function StatusMark({ status, className }: { status: RunStatus; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
      <StatusDot status={status} />
      {STATUS_LABEL[status]}
    </span>
  )
}
