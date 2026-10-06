import type { ItemRunOutcome, RunnerEntry } from "@warpforge/protocol";

export const STATUSES = ["todo", "in_progress", "waiting", "done", "cancelled"] as const;
export const PRIORITIES = ["urgent", "high", "medium", "low", "none"] as const;

const STATUS_LABEL: Record<string, string> = {
  todo: "To do",
  in_progress: "In progress",
  waiting: "Waiting",
  done: "Done",
  cancelled: "Cancelled",
};

const STATUS_DOT: Record<string, string> = {
  todo: "border border-muted-foreground/60",
  in_progress: "bg-sky-500",
  waiting: "bg-amber-500",
  done: "bg-muted-foreground/40",
  cancelled: "border border-muted-foreground/30",
};

const PRIORITY_LABEL: Record<string, string> = {
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
  none: "No priority",
};

/** Ranked by weight and contrast; only urgent takes a colour. */
const PRIORITY_TONE: Record<string, string> = {
  urgent: "font-medium text-red-600 dark:text-red-400",
  high: "text-foreground",
  medium: "text-muted-foreground",
  low: "text-muted-foreground/70",
  none: "text-muted-foreground/50",
};

const SOURCE_LABEL: Record<string, string> = { local: "Local", github: "GitHub", linear: "Linear" };

export const statusLabel = (status: string) => STATUS_LABEL[status] ?? status;
export const statusDot = (status: string) => STATUS_DOT[status] ?? "bg-muted-foreground/40";
export const priorityLabel = (priority: string) => PRIORITY_LABEL[priority] ?? priority;
export const priorityTone = (priority: string) => PRIORITY_TONE[priority] ?? "text-muted-foreground";
export const sourceLabel = (source: string) => SOURCE_LABEL[source] ?? source;
export const isClosed = (status: string) => status === "done" || status === "cancelled";

export const SOURCES = ["local", "github", "linear"] as const;
export type Source = (typeof SOURCES)[number];

/**
 * The sources a project actually has, in display order. Until the daemon
 * answers, every source is offered rather than hiding a filter that works.
 * A source already chosen stays listed so the menu can show and clear it.
 */
export function availableSources(
  sources: { github: boolean; linear: boolean } | undefined,
  current = "",
): Source[] {
  return SOURCES.filter(
    (source) => !sources || source === "local" || sources[source] || source === current,
  );
}

export function factoryLabel(entry: RunnerEntry): string {
  switch (entry.state) {
    case "queued":
      return "In Factory · Queued";
    case "running":
      return "In Factory · Running";
    case "delivering":
      return "In Factory · Opening PR";
    case "delivered":
      return entry.prNumber ? `In Factory · PR #${entry.prNumber}` : "In Factory · Ready for review";
  }
}

export const OUTCOME_LABEL: Record<ItemRunOutcome, string> = {
  running: "Running",
  delivering: "Opening PR",
  delivered: "Draft PR open",
  merged: "Merged",
  rejected: "PR closed",
  no_changes: "No changes",
  limit_hit: "Hit the round limit",
  stopped: "Stopped",
  failed: "Failed",
  delivery_failed: "Could not open the PR",
  task_deleted: "Task deleted",
  completed: "Completed",
};

export const OUTCOME_DOT: Record<ItemRunOutcome, string> = {
  running: "bg-emerald-500",
  delivering: "bg-emerald-500",
  delivered: "bg-sky-500",
  merged: "bg-muted-foreground/40",
  rejected: "border border-muted-foreground/60",
  no_changes: "border border-muted-foreground/60",
  limit_hit: "bg-amber-500",
  stopped: "bg-amber-500",
  failed: "bg-red-500",
  delivery_failed: "bg-red-500",
  task_deleted: "border border-muted-foreground/30",
  completed: "bg-muted-foreground/40",
};

/** "3m ago" from epoch seconds. */
export function ago(at: number, now = Math.floor(Date.now() / 1000)): string {
  const seconds = Math.max(0, now - at);
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
