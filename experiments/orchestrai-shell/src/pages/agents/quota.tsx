import { percentLeft, type LimitWindow } from "@/data/usage"
import { cn } from "@/lib/utils"

/** One quota window: its label, a bar filled by what is left, and the number. Red only when spent. */
export function QuotaWindow({ window, showReset = false }: { window: LimitWindow; showReset?: boolean }) {
  const left = percentLeft(window.usedPercent)
  const low = left > 0 && left <= 20
  return (
    <span className="inline-flex items-center gap-1.5 text-xs" title={window.resets}>
      <span className="text-muted-foreground">{window.label}</span>
      <span aria-hidden className="h-1 w-10 overflow-hidden rounded-full bg-muted">
        <span
          className={cn("block h-full rounded-full", left === 0 ? "bg-red-500" : low ? "bg-amber-500" : "bg-foreground/45")}
          style={{ width: `${left}%` }}
        />
      </span>
      <span
        className={cn(
          "tabular-nums",
          left === 0 ? "text-red-600 dark:text-red-400" : low ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"
        )}
      >
        {left === 0 ? "Limit reached" : `${left}% left`}
      </span>
      {showReset && <span className="text-muted-foreground">· {window.resets}</span>}
    </span>
  )
}
