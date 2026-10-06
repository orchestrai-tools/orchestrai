import type { AgentLimitWindow } from "@warpforge/protocol";
import { cn } from "@warpforge/ui/lib/utils";
import { quotaLeft } from "../../lib/account-chip";
import { formatResetRelative } from "../../lib/agent-limits";

/** One quota window: its label, a bar filled by what is left, and the number. Red only when spent. */
export function QuotaWindow({ window, now }: { window: AgentLimitWindow; now: number }) {
  const left = quotaLeft(window.usedPercent);
  const low = left > 0 && left <= 20;
  const resets =
    window.resetsAt !== undefined ? formatResetRelative(window.resetsAt, now) : undefined;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs" title={resets}>
      <span className="text-muted-foreground">{window.label}</span>
      <span aria-hidden className="h-1 w-10 overflow-hidden rounded-full bg-muted">
        <span
          className={cn(
            "block h-full rounded-full",
            left === 0 ? "bg-red-500" : low ? "bg-amber-500" : "bg-foreground/45",
          )}
          style={{ width: `${left}%` }}
        />
      </span>
      <span
        className={cn(
          "tabular-nums",
          left === 0
            ? "text-red-600 dark:text-red-400"
            : low
              ? "text-amber-700 dark:text-amber-400"
              : "text-muted-foreground",
        )}
      >
        {left === 0 ? "Limit reached" : `${left}% left`}
      </span>
      {left === 0 && resets && <span className="text-muted-foreground">· {resets}</span>}
    </span>
  );
}
