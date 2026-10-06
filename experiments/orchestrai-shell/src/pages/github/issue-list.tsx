import { useMemo, useState, type KeyboardEvent } from "react"
import { ExternalLinkIcon } from "lucide-react"

import { STATUS_LABEL, StatusDot } from "@/components/common/status-mark"
import { Button } from "@/components/ui/button"
import { ME, type Issue } from "@/data/github"
import { cn } from "@/lib/utils"
import { issueSource, useGithubStore, useIssueTask } from "@/pages/github/github-store"
import { FilterBar, FilterMenu, SearchField } from "@/pages/github/list-controls"

interface Filters {
  query: string
  state: "open" | "closed" | "all"
  label: string
  assignee: string
  linked: "any" | "task" | "none"
  sort: "recent" | "oldest"
}

const IDLE: Filters = { query: "", state: "open", label: "any", assignee: "anyone", linked: "any", sort: "recent" }

interface Props {
  issues: Issue[]
  selected?: number
  onSelect: (number: number) => void
  onStart: (issue: Issue) => void
  onOpenTask: (id: string) => void
  url: (issue: Issue) => string
}

/** Issues straight from GitHub. Any of them can become a task, and then each names the other. */
export function IssueList({ issues, selected, onSelect, onStart, onOpenTask, url }: Props) {
  const [filters, setFilters] = useState<Filters>(IDLE)
  const started = useGithubStore((store) => store.started)
  const set = (patch: Partial<Filters>) => setFilters((current) => ({ ...current, ...patch }))
  const labels = [...new Set(issues.flatMap((issue) => issue.labels))].sort()
  const assignees = [...new Set(issues.flatMap((issue) => (issue.assignee && issue.assignee !== ME ? [issue.assignee] : [])))]
  const rows = useMemo(() => {
    const needle = filters.query.trim().toLowerCase()
    return issues
      .filter((issue) => {
        const linked = Boolean(issue.task || started[issueSource(issue.project, issue.number)])
        if (filters.state !== "all" && issue.state !== filters.state) return false
        if (filters.label !== "any" && !issue.labels.includes(filters.label)) return false
        if (filters.assignee === "me" && issue.assignee !== ME) return false
        if (filters.assignee === "none" && issue.assignee) return false
        if (!["anyone", "me", "none"].includes(filters.assignee) && issue.assignee !== filters.assignee) return false
        if (filters.linked === "task" && !linked) return false
        if (filters.linked === "none" && linked) return false
        return !needle || [issue.title, `#${issue.number}`, issue.author, ...issue.labels].join(" ").toLowerCase().includes(needle)
      })
      .sort((a, b) => (filters.sort === "recent" ? a.age - b.age : b.age - a.age))
  }, [issues, filters, started])
  const narrowed = JSON.stringify({ ...filters, sort: IDLE.sort }) !== JSON.stringify(IDLE)
  const move = (event: KeyboardEvent) => {
    const step = event.key === "j" || event.key === "ArrowDown" ? 1 : event.key === "k" || event.key === "ArrowUp" ? -1 : 0
    if (!step || !rows.length || (event.target as HTMLElement).closest("[role=menu]")) return
    event.preventDefault()
    const index = rows.findIndex((issue) => issue.number === selected)
    onSelect(rows[Math.min(rows.length - 1, Math.max(0, index + step))].number)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <FilterBar
        onReset={narrowed ? () => setFilters({ ...IDLE, sort: filters.sort }) : undefined}
        sort={<FilterMenu label="Sort" idle="recent" value={filters.sort} onChange={(sort) => set({ sort })} options={[{ value: "recent", label: "Recently updated" }, { value: "oldest", label: "Least recently updated" }]} />}
      >
        <SearchField value={filters.query} onChange={(query) => set({ query })} placeholder="Filter issues" />
        <FilterMenu label="State" idle="open" value={filters.state} onChange={(state) => set({ state })} options={[{ value: "open", label: "Open" }, { value: "closed", label: "Closed" }, { value: "all", label: "All" }]} />
        <FilterMenu label="Label" idle="any" value={filters.label} onChange={(label) => set({ label })} options={[{ value: "any", label: "Any label" }, ...labels.map((label) => ({ value: label, label }))]} />
        <FilterMenu
          label="Assignee"
          idle="anyone"
          value={filters.assignee}
          onChange={(assignee) => set({ assignee })}
          options={[{ value: "anyone", label: "Anyone" }, { value: "me", label: "You", hint: ME }, { value: "none", label: "Nobody" }, ...assignees.map((login) => ({ value: login, label: login }))]}
        />
        <FilterMenu label="Task" idle="any" value={filters.linked} onChange={(linked) => set({ linked })} options={[{ value: "any", label: "With or without" }, { value: "task", label: "Has a task" }, { value: "none", label: "No task yet" }]} />
      </FilterBar>
      <div role="list" aria-label="Issues, J and K move" onKeyDown={move} className="@container min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {rows.length === 0 && <p className="px-2 py-6 text-center text-sm text-muted-foreground">No issue matches these filters.</p>}
        {rows.map((issue) => (
          <IssueRow key={issue.number} issue={issue} selected={issue.number === selected} onSelect={() => onSelect(issue.number)} onStart={() => onStart(issue)} onOpenTask={onOpenTask} url={url(issue)} />
        ))}
      </div>
    </div>
  )
}

function IssueRow({ issue, selected, onSelect, onStart, onOpenTask, url }: { issue: Issue; selected: boolean; onSelect: () => void; onStart: () => void; onOpenTask: (id: string) => void; url: string }) {
  const { task, started } = useIssueTask(issue)
  const closed = issue.state === "closed"
  return (
    <div role="listitem" aria-current={selected || undefined} onClick={onSelect} className={cn("group/row flex cursor-default items-center gap-3 rounded-sm px-2 py-(--row-py)", selected ? "bg-muted" : "hover:bg-muted/50")}>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline gap-2">
          <button type="button" onClick={onSelect} className={cn("truncate text-left text-sm font-medium", closed && "text-muted-foreground")}>
            {issue.title}
          </button>
          <span className="hidden shrink-0 gap-1 @3xl:flex">
            {issue.labels.map((label) => (
              <span key={label} className="rounded-sm border px-1 text-xs text-muted-foreground">{label}</span>
            ))}
          </span>
        </div>
        <p className="truncate text-xs text-muted-foreground">
          #{issue.number} · {closed ? "Closed" : issue.column ?? "Open"} · opened by {issue.author}
          {issue.comments > 0 && ` · ${issue.comments} ${issue.comments === 1 ? "comment" : "comments"}`}
          {issue.closedBy && ` · ${closed ? "closed by" : "fixed in"} #${issue.closedBy}`}
        </p>
      </div>
      <span className="hidden w-24 shrink-0 truncate text-xs text-muted-foreground @2xl:block">{issue.assignee ?? "Nobody"}</span>
      <span className="flex w-28 shrink-0 items-center text-xs" onClick={(event) => event.stopPropagation()}>
        {task ? (
          <button type="button" onClick={() => onOpenTask(task.id)} className="flex items-center gap-1.5 hover:underline" title={`${STATUS_LABEL[task.status]} · ${task.title}`}>
            <StatusDot status={task.status} />
            <span className="font-mono">{task.id}</span>
          </button>
        ) : started ? (
          <span className="flex items-center gap-1.5" title={`Queued · ${started.title}`}>
            <StatusDot status="queued" />
            <span className="font-mono">{started.id}</span>
          </span>
        ) : closed ? null : (
          <Button variant="ghost" size="xs" className="-ml-2 opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100" onClick={onStart}>
            Start task…
          </Button>
        )}
      </span>
      <span className="w-16 shrink-0 text-right text-xs text-muted-foreground">{issue.updated}</span>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        onClick={(event) => event.stopPropagation()}
        aria-label={`Open #${issue.number} on GitHub`}
        className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 group-hover/row:opacity-100 hover:bg-muted hover:text-foreground focus-visible:opacity-100"
      >
        <ExternalLinkIcon className="size-3" />
      </a>
    </div>
  )
}
