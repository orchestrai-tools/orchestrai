import { PinIcon } from "lucide-react"

import { SectionLabel } from "@/components/common/page-toolbar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { MEMORY_SETTINGS, type MemoryEntry, type MemoryKind, type MemoryScope } from "@/data/memory"
import { cn } from "@/lib/utils"
import { SelectMenu } from "@/components/common/select-menu"
import { InlineText } from "@/pages/memory/inline-text"
import { KIND_LABEL, SCOPE_LABEL, searchMemory, sourceLabel, type SearchHit } from "@/pages/memory/rank"

export type ScopeFilter = "all" | MemoryScope
export type KindFilter = "all" | MemoryKind

const SCOPES: readonly { id: ScopeFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "task", label: "Held" },
  { id: "project", label: "Project" },
  { id: "global", label: "Global" },
]

const GROUP_ORDER: readonly MemoryScope[] = ["task", "project", "global"]

function Row({
  hit,
  selected,
  onSelect,
  onTogglePin,
}: {
  hit: SearchHit
  selected: boolean
  onSelect: () => void
  onTogglePin: () => void
}) {
  const { entry } = hit
  return (
    <li className={cn("group/row flex items-start gap-1 rounded-md hover:bg-muted", selected && "bg-muted")}>
      <button
        type="button"
        aria-current={selected ? "true" : undefined}
        onClick={onSelect}
        className="flex min-w-0 flex-1 flex-col gap-0.5 rounded-md px-2 py-(--row-py) text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="line-clamp-2 text-sm">
          <InlineText text={entry.content} marks={hit.marks} />
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {KIND_LABEL[entry.kind]} · {sourceLabel(entry)} ·{" "}
          {entry.injected ? `in ${entry.injected} run${entry.injected === 1 ? "" : "s"}` : "not injected yet"}
          {hit.via === "meaning" && " · matched by meaning"}
        </span>
      </button>
      {entry.scope !== "task" && (
        <Button
          size="icon-xs"
          variant="ghost"
          aria-pressed={entry.pinned ?? false}
          aria-label={entry.pinned ? "Unpin" : "Pin to every run's slice"}
          title={entry.pinned ? "Unpin" : "Pin: always first in the slice"}
          onClick={onTogglePin}
          className={cn("mt-1 mr-1", entry.pinned ? "text-foreground" : "text-muted-foreground opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100")}
        >
          <PinIcon className={cn(entry.pinned && "fill-current")} />
        </Button>
      )}
    </li>
  )
}

export function MemoryList({
  entries,
  query,
  onQueryChange,
  scope,
  onScopeChange,
  kind,
  onKindChange,
  tag,
  onTagChange,
  selectedId,
  onSelect,
  onTogglePin,
  className,
}: {
  entries: readonly MemoryEntry[]
  query: string
  onQueryChange: (query: string) => void
  scope: ScopeFilter
  onScopeChange: (scope: ScopeFilter) => void
  kind: KindFilter
  onKindChange: (kind: KindFilter) => void
  tag: string
  onTagChange: (tag: string) => void
  selectedId: string | undefined
  onSelect: (id: string) => void
  onTogglePin: (entry: MemoryEntry) => void
  className?: string
}) {
  const filtered = entries.filter(
    (entry) => (scope === "all" || entry.scope === scope) && (kind === "all" || entry.kind === kind) && (!tag || entry.tags.includes(tag))
  )
  const tagCounts = new Map<string, number>()
  for (const entry of entries) for (const name of entry.tags) tagCounts.set(name, (tagCounts.get(name) ?? 0) + 1)
  const tags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name]) => name)
  const searching = query.trim().length > 0
  const hits = searching ? searchMemory(filtered, query) : null
  const count = (id: ScopeFilter) => (id === "all" ? entries.length : entries.filter((entry) => entry.scope === id).length)
  const groups = hits
    ? [{ label: `${hits.length} ${hits.length === 1 ? "match" : "matches"}, best first`, hint: undefined, items: hits }]
    : GROUP_ORDER.map((group) => ({
        label: SCOPE_LABEL[group],
        hint:
          group === "task"
            ? "Lessons from tasks whose pull request has not merged. They become project memory when it merges, and are dropped if the task is abandoned."
            : undefined,
        items: filtered
          .filter((entry) => entry.scope === group)
          .sort((a, b) => Number(b.pinned ?? false) - Number(a.pinned ?? false))
          .map((entry): SearchHit => ({ entry, via: "keyword", marks: [] })),
      })).filter((group) => group.items.length > 0)

  return (
    <section aria-label="Memory entries" className={cn("flex min-w-0 flex-col gap-3", className)}>
      <div className="flex flex-col gap-2">
        <Input
          type="search"
          aria-label="Search memory"
          placeholder="Search memory"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup type="single" size="sm" variant="outline" spacing={0} value={scope} onValueChange={(next) => next && onScopeChange(next as ScopeFilter)} aria-label="Scope">
            {SCOPES.map((item) => (
              <ToggleGroupItem key={item.id} value={item.id}>
                {item.label} <span className="text-muted-foreground tabular-nums">{count(item.id)}</span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <SelectMenu
            label="Kind"
            value={kind}
            className="h-7"
            options={[{ value: "all", label: "Any kind" }, ...Object.entries(KIND_LABEL).map(([value, label]) => ({ value, label }))]}
            onChange={(value) => onKindChange(value as KindFilter)}
          />
          <SelectMenu
            label="Tag"
            value={tag}
            className="h-7 max-w-40"
            options={[{ value: "", label: "Any tag" }, ...tags.map((name) => ({ value: name, label: `#${name}`, hint: `${tagCounts.get(name)} entries` }))]}
            onChange={onTagChange}
          />
        </div>
        <p className="text-xs text-muted-foreground" title={`Full-text ranking plus local embeddings (${MEMORY_SETTINGS.embeddingModel}), fused by rank. Offline it falls back to keywords.`}>
          {MEMORY_SETTINGS.search === "hybrid" ? "Search matches keywords and meaning." : "Search matches keywords."} Every hit counts as a use.
        </p>
      </div>

      {groups.length === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">
          {searching || scope !== "all" || kind !== "all" || tag
            ? "Nothing matches. Try another word, or clear a filter."
            : "Nothing in memory yet. Lessons land here when a task's pull request merges."}
        </p>
      ) : (
        groups.map((group) => (
          <div key={group.label}>
            <SectionLabel className="px-2 pb-1">{group.label}</SectionLabel>
            {group.hint && <p className="px-2 pb-1 text-xs text-muted-foreground">{group.hint}</p>}
            <ul className="flex flex-col">
              {group.items.map((hit) => (
                <Row
                  key={hit.entry.id}
                  hit={hit}
                  selected={hit.entry.id === selectedId}
                  onSelect={() => onSelect(hit.entry.id)}
                  onTogglePin={() => onTogglePin(hit.entry)}
                />
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  )
}
