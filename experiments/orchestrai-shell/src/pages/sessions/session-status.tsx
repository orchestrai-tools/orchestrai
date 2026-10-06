import { STATUS_LABEL, StatusDot } from "@/components/common/status-mark"
import type { SessionStatus } from "@/data/sessions"
import { cn } from "@/lib/utils"

/** Idle has no process attached, so it gets a hollow dot rather than a status colour. */
export function SessionStatusDot({ status, className }: { status: SessionStatus; className?: string }) {
  if (status === "idle") {
    return <span aria-hidden className={cn("inline-flex size-2 shrink-0 rounded-full border border-muted-foreground/60", className)} />
  }
  return <StatusDot status={status} className={className} />
}

export function SessionStatusMark({ status, className }: { status: SessionStatus; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
      <SessionStatusDot status={status} />
      {status === "idle" ? "Idle" : STATUS_LABEL[status]}
    </span>
  )
}
