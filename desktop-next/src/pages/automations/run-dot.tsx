import type { AutomationRunStatus } from "@warpforge/protocol";
import { cn } from "@warpforge/ui/lib/utils";
import { StatusDot } from "../../components/common/status-mark";

/** Skips are hollow: nothing ran, which is different from something that ran and failed. */
const TONE: Record<Exclude<AutomationRunStatus, "running">, string> = {
  pending: "bg-muted-foreground/40",
  completed: "bg-emerald-500",
  failed: "bg-red-500",
  skipped_precheck: "border border-muted-foreground/60",
  skipped_missed: "border border-muted-foreground/60",
  skipped_running: "border border-muted-foreground/60",
  skipped_quota: "border border-amber-500",
};

/** One run's outcome as a dot. */
export function RunDot({ status, className }: { status: AutomationRunStatus; className?: string }) {
  if (status === "running") return <StatusDot status="running" className={className} />;
  return <span aria-hidden className={cn("inline-flex size-2 shrink-0 rounded-full", TONE[status], className)} />;
}
