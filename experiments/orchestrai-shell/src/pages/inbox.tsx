import { useState, type KeyboardEvent } from "react"
import { CheckIcon } from "lucide-react"

import { PageToolbar } from "@/components/common/page-toolbar"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { findAgent } from "@/data/agents"
import { INBOX, inboxFor, KIND_LABEL, type InboxItem } from "@/data/inbox"
import { findTask } from "@/data/tasks"
import { useAppActions, useAppSession } from "@/lib/app-instance"
import { findProject } from "@/lib/projects"
import { cn } from "@/lib/utils"
import { selectSelection } from "@/lib/window-store"
import { InboxDetail } from "@/pages/inbox/inbox-detail"

type KindFilter = "all" | InboxItem["kind"]

/**
 * Every approval and question from every agent, in one place (Antigravity).
 * Scope starts at this project and widens on purpose (Retool). J and K move.
 */
export function InboxPage() {
  const project = useAppSession((session) => session.project)
  const scope = useAppSession((session) => selectSelection(session, "inbox")) === "all" ? "all" : "project"
  const { select, selectProject } = useAppActions()
  const [kind, setKind] = useState<KindFilter>("all")
  const [resolved, setResolved] = useState<Record<string, string>>({})
  const [selectedId, setSelectedId] = useState<string>()

  const items = (scope === "all" ? [...INBOX] : inboxFor(project)).filter(
    (item) => (kind === "all" || item.kind === kind) && !resolved[item.id]
  )
  const selected = items.find((item) => item.id === selectedId) ?? items[0]
  const done = Object.keys(resolved).length

  const move = (event: KeyboardEvent) => {
    const step = event.key === "j" ? 1 : event.key === "k" ? -1 : 0
    if (!step || !selected) return
    const index = items.indexOf(selected)
    setSelectedId(items[Math.min(Math.max(index + step, 0), items.length - 1)]?.id)
  }

  return (
    <div className="grid h-full grid-cols-[minmax(18rem,24rem)_1fr]">
      <div className="flex min-h-0 flex-col gap-3 border-r p-4" onKeyDown={move}>
        <PageToolbar title="Inbox" meta={`${items.length} waiting`}>
          <ToggleGroup
            type="single"
            size="sm"
            variant="outline"
            spacing={0}
            value={scope}
            onValueChange={(next) => next && select("inbox", next)}
            aria-label="Scope"
          >
            <ToggleGroupItem value="project" className="px-2.5 text-xs">{findProject(project).name}</ToggleGroupItem>
            <ToggleGroupItem value="all" className="px-2.5 text-xs">All projects</ToggleGroupItem>
          </ToggleGroup>
        </PageToolbar>
        <ToggleGroup type="single" size="sm" spacing={1} value={kind} onValueChange={(next) => next && setKind(next as KindFilter)} aria-label="Kind" className="flex-wrap justify-start">
          {(["all", "permission", "question", "ci", "review"] as const).map((entry) => (
            <ToggleGroupItem key={entry} value={entry} className="h-6 px-2 text-xs">
              {entry === "all" ? "All" : KIND_LABEL[entry]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <ul role="listbox" aria-label="Waiting for you" className="-mx-2 min-h-0 flex-1 overflow-y-auto">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                role="option"
                aria-selected={item === selected}
                onClick={() => setSelectedId(item.id)}
                className={cn(
                  "flex w-full flex-col gap-0.5 rounded-md px-2 py-(--row-py) text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  item === selected ? "bg-muted" : "hover:bg-muted/50"
                )}
              >
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span aria-hidden className={cn("size-1.5 rounded-full", item.risk === "high" ? "bg-red-500" : "bg-amber-500")} />
                  {KIND_LABEL[item.kind]}
                  {scope === "all" && <span>· {findProject(item.project).name}</span>}
                  <span className="ml-auto">{item.time}</span>
                </span>
                <span className="truncate text-sm font-medium">{item.title}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {findAgent(item.agent).name} · {findTask(item.task)?.title}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {done > 0 && <p className="text-xs text-muted-foreground">{done} handled this session. Receipts are on each task.</p>}
      </div>

      <div className="min-h-0 overflow-y-auto">
        {selected ? (
          <InboxDetail
            key={selected.id}
            item={selected}
            onResolve={(answer) => setResolved((current) => ({ ...current, [selected.id]: answer }))}
            onOpenTask={() => {
              if (selected.project !== project) selectProject(selected.project)
              select("task", selected.task, "task")
            }}
          />
        ) : (
          <div className="dot-grid flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <CheckIcon className="size-5" />
            Nothing needs you{scope === "project" ? " in this project" : ""}.
          </div>
        )}
      </div>
    </div>
  )
}
