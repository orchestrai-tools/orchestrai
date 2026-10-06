import { useState } from "react"
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { NEXT_RUN, type MemoryEntry } from "@/data/memory"
import { findProject, type ProjectId } from "@/lib/projects"
import { InlineText } from "@/pages/memory/inline-text"
import type { nextSlice } from "@/pages/memory/rank"

/**
 * What the next run is handed: a short ranked slice under a token budget.
 * The rule that feeds it sits beside it, because it explains what is missing.
 */
export function SliceBand({
  project,
  slice,
  onSelect,
}: {
  project: ProjectId
  slice: ReturnType<typeof nextSlice>
  onSelect: (entry: MemoryEntry) => void
}) {
  const [open, setOpen] = useState(false)
  const next = NEXT_RUN[project]
  const share = Math.min(100, Math.round((slice.used / slice.budget) * 100))

  return (
    <section aria-label="Next run's memory" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
        <span className="font-medium">
          {next ? (
            <>
              The next run, <span className="font-mono text-xs">{next.task}</span> {next.title}, gets
            </>
          ) : (
            `The next run in ${findProject(project).name} gets`
          )}{" "}
          {slice.included.length} {slice.included.length === 1 ? "entry" : "entries"}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {slice.used.toLocaleString()} of {slice.budget.toLocaleString()} tokens
        </span>
        <Button size="xs" variant="ghost" className="ml-auto" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? <ChevronDownIcon /> : <ChevronRightIcon />}
          {open ? "Hide the slice" : "Show the slice"}
        </Button>
      </div>
      <div aria-hidden className="h-1 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-foreground/50" style={{ width: `${share}%` }} />
      </div>
      <p className="text-xs text-muted-foreground">
        Project memory is written only after a task's pull request merges. Pinned entries go first, then the best-ranked against the task's
        goal, until the budget or the {slice.floor} relevance floor, whichever comes first.
      </p>
      {open && (
        <div className="flex flex-col gap-1 pt-1">
          <ol className="-mx-2 flex flex-col">
            {slice.included.map((item, index) => (
              <li key={item.entry.id}>
                <button
                  type="button"
                  onClick={() => onSelect(item.entry)}
                  className="flex w-full items-baseline gap-3 rounded-md px-2 py-(--row-py) text-left text-sm hover:bg-muted"
                >
                  <span className="w-4 shrink-0 text-xs text-muted-foreground tabular-nums">{index + 1}</span>
                  <span className="w-16 shrink-0 text-xs text-muted-foreground">{item.why}</span>
                  <span className="min-w-0 flex-1 truncate">
                    <InlineText text={item.entry.content} />
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{item.tokens} tokens</span>
                </button>
              </li>
            ))}
          </ol>
          <p className="text-xs text-muted-foreground">
            Left out: {slice.belowFloor.length} below the floor
            {slice.overBudget.length > 0 && `, ${slice.overBudget.length} over the budget`}. Held lessons wait for their merge.
          </p>
        </div>
      )}
    </section>
  )
}
