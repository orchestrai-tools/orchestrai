import { useMemo, useState, type KeyboardEvent } from "react"
import { EllipsisIcon, ExternalLinkIcon } from "lucide-react"

import { STATUS_LABEL, StatusDot } from "@/components/common/status-mark"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ME, type PullRequest } from "@/data/github"
import { findTask } from "@/data/tasks"
import { cn } from "@/lib/utils"
import { FilterBar, FilterMenu, SearchField } from "@/pages/github/list-controls"
import { PullMenuItems, ReviewerItems, type PullHandlers } from "@/pages/github/pull-actions"
import { attemptsFor, authorLabel, CHECK_DOT, CHECK_LABEL, REVIEW_LABEL, STATE_LABEL } from "@/pages/github/pull-meta"

type StateFilter = "open" | "merged" | "closed" | "all"
type Sort = "recent" | "oldest"

interface Filters {
  query: string
  state: StateFilter
  author: string
  label: string
  sort: Sort
}

const IDLE: Filters = { query: "", state: "open", author: "anyone", label: "any", sort: "recent" }

function matches(pull: PullRequest, filters: Filters) {
  const live = pull.state === "open" || pull.state === "draft"
  if (filters.state === "open" && !live) return false
  if ((filters.state === "merged" || filters.state === "closed") && pull.state !== filters.state) return false
  if (filters.author === "me" && pull.author !== ME) return false
  if (filters.author === "agents" && !pull.agent) return false
  if (filters.author === "people" && pull.agent) return false
  if (!["anyone", "me", "agents", "people"].includes(filters.author) && pull.author !== filters.author) return false
  if (filters.label !== "any" && !pull.labels.includes(filters.label)) return false
  const needle = filters.query.trim().toLowerCase()
  if (!needle) return true
  return [pull.title, `#${pull.number}`, pull.branch, pull.author, pull.task ?? "", ...pull.labels].join(" ").toLowerCase().includes(needle)
}

/** Pull requests, the most recently moved first. A task's pull request carries its fix attempts. */
export function PullList({ pulls, selected, onSelect, handlers }: { pulls: PullRequest[]; selected?: number; onSelect: (number: number) => void; handlers: PullHandlers }) {
  const [filters, setFilters] = useState<Filters>(IDLE)
  const set = (patch: Partial<Filters>) => setFilters((current) => ({ ...current, ...patch }))
  const authors = [...new Set(pulls.map((pull) => pull.author))].filter((login) => login !== ME)
  const labels = [...new Set(pulls.flatMap((pull) => pull.labels))].sort()
  const rows = useMemo(
    () => pulls.filter((pull) => matches(pull, filters)).sort((a, b) => (filters.sort === "recent" ? a.age - b.age : b.age - a.age)),
    [pulls, filters]
  )
  const narrowed = JSON.stringify({ ...filters, sort: IDLE.sort }) !== JSON.stringify(IDLE)
  const move = (event: KeyboardEvent) => {
    const step = event.key === "j" || event.key === "ArrowDown" ? 1 : event.key === "k" || event.key === "ArrowUp" ? -1 : 0
    if (!step || !rows.length || (event.target as HTMLElement).closest("[role=menu]")) return
    event.preventDefault()
    const index = rows.findIndex((pull) => pull.number === selected)
    onSelect(rows[Math.min(rows.length - 1, Math.max(0, index + step))].number)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <FilterBar
        onReset={narrowed ? () => setFilters({ ...IDLE, sort: filters.sort }) : undefined}
        sort={
          <FilterMenu
            label="Sort"
            idle="recent"
            value={filters.sort}
            onChange={(sort) => set({ sort })}
            options={[{ value: "recent", label: "Recently updated" }, { value: "oldest", label: "Least recently updated" }]}
          />
        }
      >
        <SearchField value={filters.query} onChange={(query) => set({ query })} placeholder="Filter pull requests" />
        <FilterMenu
          label="State"
          idle="open"
          value={filters.state}
          onChange={(state) => set({ state })}
          options={[{ value: "open", label: "Open and draft" }, { value: "merged", label: "Merged" }, { value: "closed", label: "Closed" }, { value: "all", label: "All" }]}
        />
        <FilterMenu
          label="Author"
          idle="anyone"
          value={filters.author}
          onChange={(author) => set({ author })}
          options={[
            { value: "anyone", label: "Anyone" },
            { value: "me", label: "You", hint: ME },
            { value: "agents", label: "Agents", hint: "opened by a task" },
            { value: "people", label: "People" },
            ...(authors.length ? ["separator" as const] : []),
            ...authors.map((login) => ({ value: login, label: login })),
          ]}
        />
        <FilterMenu label="Label" idle="any" value={filters.label} onChange={(label) => set({ label })} options={[{ value: "any", label: "Any label" }, ...labels.map((label) => ({ value: label, label }))]} />
      </FilterBar>

      <div role="list" aria-label="Pull requests, J and K move" onKeyDown={move} className="@container min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {rows.length === 0 && <p className="px-2 py-6 text-center text-sm text-muted-foreground">No pull request matches these filters.</p>}
        {rows.map((pull) => (
          <PullRow key={pull.number} pull={pull} selected={pull.number === selected} onSelect={() => onSelect(pull.number)} handlers={handlers} />
        ))}
      </div>
    </div>
  )
}

function PullRow({ pull, selected, onSelect, handlers }: { pull: PullRequest; selected: boolean; onSelect: () => void; handlers: PullHandlers }) {
  const task = findTask(pull.task)
  const attempts = attemptsFor(pull)
  const live = pull.state === "open" || pull.state === "draft"
  return (
    <div role="listitem" aria-current={selected || undefined} onClick={onSelect} className={cn("group/row flex cursor-default items-center gap-3 rounded-sm px-2 py-(--row-py)", selected ? "bg-muted" : "hover:bg-muted/50")}>
      <span aria-label={pull.unseen ? "Updated since you last looked" : undefined} className={cn("size-1.5 shrink-0 rounded-full", pull.unseen && "bg-sky-500")} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline gap-2">
          <button type="button" onClick={onSelect} className={cn("truncate text-left text-sm", pull.unseen ? "font-semibold" : "font-medium", !live && "text-muted-foreground")}>
            {pull.title}
          </button>
          <span className="hidden shrink-0 gap-1 @3xl:flex">
            {pull.labels.map((label) => (
              <span key={label} className="rounded-sm border px-1 text-xs text-muted-foreground">{label}</span>
            ))}
          </span>
        </div>
        <p className="truncate text-xs text-muted-foreground">
          #{pull.number} · {STATE_LABEL[pull.state]} · {authorLabel(pull)} · <span className="font-mono">{pull.branch}</span> → {pull.base} ·{" "}
          <span className="text-emerald-600 dark:text-emerald-400">+{pull.additions}</span> <span className="text-red-600 dark:text-red-400">−{pull.deletions}</span>
        </p>
      </div>
      <span className="flex w-40 shrink-0 items-center gap-1.5 text-xs" title={`Checks: ${CHECK_LABEL[pull.checks]}`}>
        <span aria-hidden className={cn("size-2 shrink-0 rounded-full", CHECK_DOT[pull.checks])} />
        <span className={cn(pull.checks === "failing" ? "text-foreground" : "text-muted-foreground")}>{CHECK_LABEL[pull.checks]}</span>
        {attempts && (
          <span className={cn("truncate", attempts.used >= attempts.cap && pull.checks === "failing" ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground")}>
            · fix {attempts.used} of {attempts.cap}
          </span>
        )}
      </span>
      <span className={cn("hidden w-32 shrink-0 truncate text-xs @2xl:block", pull.review === "changes-requested" ? "text-foreground" : "text-muted-foreground")}>
        {live || pull.review === "approved" ? REVIEW_LABEL[pull.review] : ""}
      </span>
      <span className="hidden w-28 shrink-0 @4xl:block">
        {task ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              handlers.openTask(task.id)
            }}
            className="flex items-center gap-1.5 text-xs hover:underline"
            title={`${STATUS_LABEL[task.status]} · ${task.title}`}
          >
            <StatusDot status={task.status} />
            <span className="font-mono">{task.id}</span>
          </button>
        ) : (
          <span className="text-xs text-muted-foreground/60">No task</span>
        )}
      </span>
      <span className="w-16 shrink-0 text-right text-xs text-muted-foreground">{pull.updated}</span>
      <span className="flex w-28 shrink-0 justify-end gap-0.5 opacity-0 group-hover/row:opacity-100 focus-within:opacity-100" onClick={(event) => event.stopPropagation()}>
        {pull.state === "draft" ? (
          <Button variant="ghost" size="xs" onClick={() => handlers.markReady(pull)}>Mark ready</Button>
        ) : pull.state === "open" ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="xs">Review…</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <ReviewerItems pull={pull} handlers={handlers} />
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        <Button variant="ghost" size="icon-xs" aria-label={`Open #${pull.number} on GitHub`} onClick={() => handlers.openOnGithub(pull)}>
          <ExternalLinkIcon />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-xs" aria-label={`More for #${pull.number}`}>
              <EllipsisIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <PullMenuItems pull={pull} handlers={handlers} />
          </DropdownMenuContent>
        </DropdownMenu>
      </span>
    </div>
  )
}
