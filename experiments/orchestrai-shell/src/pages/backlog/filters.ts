import type { ItemSource, ItemStatus, Priority, Size, WorkItem } from "@/data/backlog"
import { ME } from "@/data/github"
import { PRIORITY_RANK, SIZE_RANK, STATUS_RANK } from "@/pages/backlog/labels"

export type SortKey = "updated" | "priority" | "status" | "number" | "title" | "size"

export interface BacklogFilters {
  query: string
  status: "any" | "open" | ItemStatus
  priority: "any" | Priority
  assignee: string
  source: "any" | ItemSource
  size: "any" | Size
  sort: SortKey
  descending: boolean
}

/** Everything, the most recently changed first. */
export const IDLE_FILTERS: BacklogFilters = { query: "", status: "any", priority: "any", assignee: "anyone", source: "any", size: "any", sort: "updated", descending: true }

export const SORT_LABEL: Record<SortKey, string> = { updated: "Updated", priority: "Priority", status: "Status", number: "Number", title: "Title", size: "Size" }

export function isNarrowed(filters: BacklogFilters) {
  return filters.query !== "" || filters.status !== "any" || filters.priority !== "any" || filters.assignee !== "anyone" || filters.source !== "any" || filters.size !== "any"
}

function matches(item: WorkItem, filters: BacklogFilters) {
  if (filters.status === "open" && (item.status === "done" || item.status === "cancelled")) return false
  if (filters.status !== "any" && filters.status !== "open" && item.status !== filters.status) return false
  if (filters.priority !== "any" && item.priority !== filters.priority) return false
  if (filters.source !== "any" && item.source !== filters.source) return false
  if (filters.size !== "any" && item.size !== filters.size) return false
  if (filters.assignee === "me" && item.assignee !== ME) return false
  if (filters.assignee === "none" && item.assignee) return false
  if (!["anyone", "me", "none"].includes(filters.assignee) && item.assignee !== filters.assignee) return false
  const needle = filters.query.trim().toLowerCase()
  return !needle || `${item.number} ${item.title} ${item.body} ${item.labels.join(" ")}`.toLowerCase().includes(needle)
}

const numberOf = (item: WorkItem) => Number(item.number.replace(/\D/g, "")) || 0

/**
 * Ascending order, least first: oldest, least urgent, least active, smallest.
 * Status, priority and size sort by rank, never by the word.
 */
function compare(a: WorkItem, b: WorkItem, sort: SortKey) {
  switch (sort) {
    case "updated":
      return b.age - a.age
    case "priority":
      return PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority]
    case "status":
      return STATUS_RANK[b.status] - STATUS_RANK[a.status]
    case "size":
      return (a.size ? SIZE_RANK[a.size] : -1) - (b.size ? SIZE_RANK[b.size] : -1)
    case "number":
      return numberOf(a) - numberOf(b)
    case "title":
      return a.title.localeCompare(b.title)
  }
}

/** Ties break on the item's number, so the order never wobbles between renders. */
export function filterItems(items: WorkItem[], filters: BacklogFilters) {
  return items
    .filter((item) => matches(item, filters))
    .sort((a, b) => {
      const order = compare(a, b, filters.sort) || numberOf(a) - numberOf(b)
      return filters.descending ? -order : order
    })
}
