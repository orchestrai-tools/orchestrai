import type { ItemRunOutcome, RunnerEntryState } from "@/protocol";

export const ENTRY_STATE_LABEL: Record<RunnerEntryState, string> = {
  delivered: "Draft PR in review",
  delivering: "Opening pull request",
  queued: "Queued",
  running: "Running",
};

type Tone = "ok" | "warn" | "destructive" | "outline";

export const OUTCOME_META: Record<ItemRunOutcome, { label: string; tone: Tone }> = {
  delivered: { label: "In review", tone: "ok" },
  delivering: { label: "Opening PR", tone: "outline" },
  delivery_failed: { label: "PR not opened", tone: "destructive" },
  failed: { label: "Failed", tone: "destructive" },
  limit_hit: { label: "Review limit", tone: "warn" },
  merged: { label: "Merged", tone: "ok" },
  no_changes: { label: "No changes", tone: "outline" },
  rejected: { label: "Closed unmerged", tone: "warn" },
  running: { label: "Running", tone: "outline" },
  stopped: { label: "Stopped", tone: "warn" },
  task_deleted: { label: "Task deleted", tone: "outline" },
};

/**
 * A run's cost as the Factory shows it. Harnesses that report nothing (Codex)
 * read as "not reported", never as $0.
 * @param usd The cost in USD, when an agent reported one.
 * @returns The formatted cost.
 */
export function formatCost(usd: number | null | undefined): string {
  return usd == null ? "not reported" : `$${usd.toFixed(2)}`;
}
