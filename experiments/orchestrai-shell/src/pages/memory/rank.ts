import { MEMORY_SETTINGS, tokensOf, type MemoryEntry, type MemoryKind, type MemoryScope } from "@/data/memory"

export const KIND_LABEL: Record<MemoryKind, string> = {
  fact: "Fact",
  decision: "Decision",
  preference: "Preference",
  gotcha: "Gotcha",
  note: "Note",
}

export const SCOPE_LABEL: Record<MemoryScope, string> = {
  task: "Held until merge",
  project: "Project",
  global: "Global",
}

export function sourceLabel(entry: MemoryEntry): string {
  const { source } = entry
  if (source.kind === "merged") return `Merged #${source.pr}${source.task ? ` · ${source.task}` : ""}`
  if (source.kind === "held") return `${source.task} · waiting for #${source.pr}`
  return source.note ?? "Written by you"
}

/** Stands in for the embedding model: words that mean the same thing without sharing letters. */
const MEANING: Record<string, string[]> = {
  flaky: ["race", "one ci run in three", "never locally"],
  flake: ["race", "one ci run in three"],
  freeze: ["blocking", "single-threaded"],
  freez: ["blocking", "single-threaded"],
  hang: ["blocking", "single-threaded", "unkillable"],
  slow: ["blocking", "freezes"],
  folder: ["directory", "registry"],
  config: ["directory", "registry"],
  home: ["~/.orchestrai", "~/.warpforge"],
  money: ["minor units", "rounding"],
  cent: ["minor units"],
  layout: ["aspect-ratio", "layout-shift"],
  jank: ["layout-shift", "aspect-ratio"],
  fork: ["upstream", "warpforgehq"],
  terminal: ["xterm", "drawer"],
  lint: ["clippy", "vale"],
  long: ["500 lines", "400 lines"],
  big: ["500 lines", "split a module"],
  commit: ["changeset", "merge commit"],
  kill: ["listener", "lost agent"],
}

const stem = (word: string) => (word.length > 4 ? word.replace(/(ing|ed|es|s)$/, "") : word)

export interface SearchHit {
  entry: MemoryEntry
  via: "keyword" | "meaning"
  marks: string[]
}

/** Every word must match, as the daemon's first pass does; with nothing found it retries with any word. */
export function searchMemory(entries: readonly MemoryEntry[], query: string, hybrid = MEMORY_SETTINGS.search === "hybrid"): SearchHit[] {
  const terms = [...new Set(query.toLowerCase().split(/[^a-z0-9_]+/).filter((term) => term.length >= 2).map(stem))]
  if (!terms.length) return []
  const scored = entries.map((entry) => {
    const text = `${entry.content} ${entry.tags.join(" ")}`.toLowerCase()
    const words = text.split(/[^a-z0-9_]+/)
    const keyword = terms.filter((term) => words.some((word) => word.startsWith(term)))
    const meaning = hybrid ? terms.filter((term) => !keyword.includes(term) && (MEANING[term] ?? []).some((near) => text.includes(near))) : []
    return { entry, keyword, meaning, hits: keyword.length + meaning.length }
  })
  const all = scored.filter((hit) => hit.hits === terms.length)
  const matched = all.length ? all : scored.filter((hit) => hit.hits > 0)
  return matched
    .sort((a, b) => b.keyword.length * 2 + b.meaning.length - (a.keyword.length * 2 + a.meaning.length))
    .map(({ entry, keyword }): SearchHit => ({ entry, via: keyword.length ? "keyword" : "meaning", marks: keyword }))
}

export interface SliceEntry {
  entry: MemoryEntry
  tokens: number
  why: string
}

/** Pinned first, then by rank, until the budget or the relevance floor: a short slice, not everything that fits. */
export function nextSlice(entries: readonly MemoryEntry[]) {
  const { budget, floor } = MEMORY_SETTINGS
  const eligible = entries.filter((entry) => entry.scope !== "task")
  const ordered = [
    ...eligible.filter((entry) => entry.pinned).sort((a, b) => b.score - a.score),
    ...eligible.filter((entry) => !entry.pinned && entry.score >= floor).sort((a, b) => b.score - a.score),
  ]
  const included: SliceEntry[] = []
  const overBudget: MemoryEntry[] = []
  let used = 0
  for (const entry of ordered) {
    const tokens = tokensOf(entry)
    if (used + tokens > budget) {
      overBudget.push(entry)
      continue
    }
    used += tokens
    included.push({ entry, tokens, why: entry.pinned ? "Pinned" : `Rank ${entry.score.toFixed(2)}` })
  }
  const belowFloor = eligible.filter((entry) => !entry.pinned && entry.score < floor)
  return { included, overBudget, belowFloor, used, budget, floor }
}

export function sliceStatus(entry: MemoryEntry, slice: ReturnType<typeof nextSlice>): string {
  if (entry.scope === "task") return "Not yet: held until its pull request merges"
  if (slice.included.some((item) => item.entry.id === entry.id)) return entry.pinned ? "Included, pinned" : `Included, rank ${entry.score.toFixed(2)}`
  if (slice.overBudget.includes(entry)) return `Left out: over the ${slice.budget.toLocaleString()}-token budget`
  return `Left out: rank ${entry.score.toFixed(2)} is below the ${slice.floor} floor`
}
