import type { FactoryEntry, ItemSource, ItemStatus, Priority, Size } from "@/data/backlog"

export const STATUSES: readonly ItemStatus[] = ["todo", "in_progress", "waiting", "done", "cancelled"]
export const PRIORITIES: readonly Priority[] = ["urgent", "high", "medium", "low", "none"]
export const SIZES: readonly Size[] = ["S", "M", "L"]

export const STATUS_LABEL: Record<ItemStatus, string> = { todo: "To do", in_progress: "In progress", waiting: "Waiting", done: "Done", cancelled: "Cancelled" }

export const STATUS_DOT: Record<ItemStatus, string> = {
  todo: "border border-muted-foreground/60",
  in_progress: "bg-sky-500",
  waiting: "bg-amber-500",
  done: "bg-muted-foreground/40",
  cancelled: "border border-muted-foreground/30",
}

export const PRIORITY_LABEL: Record<Priority, string> = { urgent: "Urgent", high: "High", medium: "Medium", low: "Low", none: "No priority" }

/** Ranked by weight and contrast; only urgent takes a colour. */
export const PRIORITY_TONE: Record<Priority, string> = {
  urgent: "font-medium text-red-600 dark:text-red-400",
  high: "text-foreground",
  medium: "text-muted-foreground",
  low: "text-muted-foreground/70",
  none: "text-muted-foreground/50",
}

export const SOURCE_LABEL: Record<ItemSource, string> = { local: "Local", github: "GitHub", linear: "Linear" }

export const SIZE_HINT: Record<Size, string> = { S: "a day or two", M: "about a week", L: "more than a week" }

/** Status and priority sort by rank, never by the word: alphabetical puts High before Low before Urgent. */
export const PRIORITY_RANK: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 }
export const STATUS_RANK: Record<ItemStatus, number> = { in_progress: 0, waiting: 1, todo: 2, done: 3, cancelled: 4 }
export const SIZE_RANK: Record<Size, number> = { S: 0, M: 1, L: 2 }

export function factoryLabel(entry: FactoryEntry) {
  switch (entry.state) {
    case "queued":
      return "In Factory · Queued"
    case "running":
      return "In Factory · Running"
    case "delivering":
      return "In Factory · Opening PR"
    case "delivered":
      return entry.pr ? `In Factory · PR #${entry.pr}` : "In Factory · Ready for review"
  }
}
