import type { ReactNode } from "react"

import type { ForwardStatus, ServiceStatus } from "@/data/services"
import { cn } from "@/lib/utils"

type RuntimeStatus = ServiceStatus | ForwardStatus

const TONE: Record<RuntimeStatus, string> = {
  running: "bg-emerald-500",
  active: "bg-emerald-500",
  starting: "bg-amber-500 animate-pulse",
  restarting: "bg-amber-500 animate-pulse",
  failed: "bg-red-500",
  stopped: "bg-muted-foreground/40",
}

/** The same dot for a service and a port-forward, so the two lists scan as one. */
export function RuntimeDot({ status, className }: { status: RuntimeStatus; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-full", TONE[status], className)} />
}

export function LocalMark({ fields }: { fields?: string[] }) {
  if (!fields?.length) return null
  return (
    <span title={`Set by your local config: ${fields.join(", ")}`} className="shrink-0 rounded-sm border px-1 text-xs leading-4 text-muted-foreground">
      local
    </span>
  )
}

export function Notice({ tone, children }: { tone: "danger" | "warn" | "quiet"; children: ReactNode }) {
  return (
    <div
      role={tone === "quiet" ? "status" : "alert"}
      className={cn(
        "flex items-start gap-2 text-xs",
        tone === "danger" && "text-red-600 dark:text-red-400",
        tone === "warn" && "text-amber-700 dark:text-amber-400",
        tone === "quiet" && "text-muted-foreground"
      )}
    >
      {children}
    </div>
  )
}
