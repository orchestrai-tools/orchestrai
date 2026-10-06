import { useMemo, useState } from "react"
import { ArrowDownNarrowWideIcon, ArrowUpNarrowWideIcon, EllipsisIcon } from "lucide-react"

import { PageToolbar } from "@/components/common/page-toolbar"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { SOURCES, taskIdFor, type WorkItem } from "@/data/backlog"
import { ME } from "@/data/github"
import { findTask } from "@/data/tasks"
import { useAppActions, useAppSession } from "@/lib/app-instance"
import type { ProjectId } from "@/lib/projects"
import { BacklogList } from "@/pages/backlog/backlog-list"
import type { LinkedTask } from "@/pages/backlog/backlog-row"
import { factoryActions, sourceKey, useBacklogStore, useFactory, useWorkItems } from "@/pages/backlog/backlog-store"
import { FactorySettingsDialog, FactoryStrip, RunInFactoryDialog } from "@/pages/backlog/factory"
import { filterItems, IDLE_FILTERS, isNarrowed, SORT_LABEL, type BacklogFilters, type SortKey } from "@/pages/backlog/filters"
import { ItemDetail } from "@/pages/backlog/item-detail"
import { PRIORITIES, PRIORITY_LABEL, SIZES, SOURCE_LABEL, STATUS_LABEL, STATUSES } from "@/pages/backlog/labels"
import { NewItemDialog } from "@/pages/backlog/new-item-dialog"
import { ConfirmRequestDialog, type ConfirmRequest } from "@/components/common/confirm-dialog"
import { PageToast } from "@/pages/changes/page-toast"
import { say } from "@/pages/changes/toast-store"
import { useGithubStore } from "@/pages/github/github-store"
import { FilterBar, FilterMenu, SearchField } from "@/pages/github/list-controls"
import { StartTaskDialog, type StartRequest } from "@/pages/github/start-task-dialog"

/** Work that is not started yet, from every tracker the project reaches, in one list. Each item can become a task. */
export function BacklogPage() {
  const project = useAppSession((session) => session.project)
  return <Backlog key={project} project={project} />
}

function Backlog({ project }: { project: ProjectId }) {
  const { select } = useAppActions()
  const items = useWorkItems(project)
  const started = useGithubStore((store) => store.started)
  const patch = useBacklogStore((store) => store.patch)
  const sync = useBacklogStore((store) => store.sync)
  const synced = useBacklogStore((store) => store.synced[project]) ?? "4m ago"
  const { entries, hold } = useFactory(project)
  const factory = useMemo(() => factoryActions(project), [project])
  const [filters, setFilters] = useState<BacklogFilters>(IDLE_FILTERS)
  const [selectedId, setSelectedId] = useState<string>()
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set())
  const [start, setStart] = useState<StartRequest | null>(null)
  const [runItems, setRunItems] = useState<WorkItem[] | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null)
  const rows = useMemo(() => filterItems(items, filters), [items, filters])
  const selected = items.find((item) => item.id === selectedId)
  const set = (next: Partial<BacklogFilters>) => setFilters((current) => ({ ...current, ...next }))
  const assignees = [...new Set(items.flatMap((item) => (item.assignee && item.assignee !== ME ? [item.assignee] : [])))]
  const sources = [...new Set(items.map((item) => item.source))]

  const entryOf = (item: WorkItem) => entries.find((entry) => entry.item === item.id)
  const taskOf = (item: WorkItem): LinkedTask | undefined => {
    const task = findTask(item.task)
    if (task) return { id: task.id, status: task.status, title: task.title }
    const begun = started[sourceKey(item)]
    if (begun) return { id: begun.id, status: "queued", title: begun.title }
    const entry = entryOf(item)
    if (entry && entry.state !== "queued") return { id: entry.task, status: entry.state === "delivered" ? "review" : "running", title: item.title }
    return undefined
  }
  const openTask = (id: string) => (findTask(id) ? select("task", id, "task") : say(`${id} is queued; it shows on the board once a worker picks it up`))
  const startTask = (item: WorkItem) =>
    setStart({ source: sourceKey(item), label: item.number, goal: `${item.title}\n\n${item.body}`.trim(), taskId: taskIdFor(item), closes: item.source === "github" ? `Closes ${item.number}` : `Backlog: ${item.number}` })
  const copy = (text: string, what: string) => void navigator.clipboard?.writeText(text).then(() => say(`Copied ${what}`), () => say(`Could not copy the ${what}`, "error"))
  const checkedItems = items.filter((item) => checked.has(item.id))
  const runnable = entries.filter((entry) => entry.state === "queued" || entry.state === "running").length

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <PageToolbar title="Backlog" meta={`${items.length} items${entries.length ? ` · ${entries.length} in the Factory` : ""}`} className="px-4 pt-4 pb-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                sync(project)
                say(`Synced ${sources.filter((source) => source !== "local").map((source) => SOURCE_LABEL[source]).join(" and ") || "trackers"} · nothing new`)
              }}
            >
              Sync
            </Button>
          </TooltipTrigger>
          <TooltipContent>Imports new tracker issues and refreshes their status. Last synced {synced}.</TooltipContent>
        </Tooltip>
        <Button variant="outline" size="sm" onClick={() => setRunItems(checkedItems.length ? checkedItems : rows)}>
          Run in Factory…
        </Button>
        <Button size="sm" onClick={() => setCreating(true)}>New item</Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="More for the backlog">
              <EllipsisIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuItem onSelect={() => setSettingsOpen(true)}>Factory settings…</DropdownMenuItem>
            <DropdownMenuLabel className="font-normal">
              Linear: {SOURCES[project].linearTeam ?? "no team mapped, so nothing is imported from Linear"}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              disabled={!runnable}
              onSelect={() =>
                setConfirm({
                  title: "Stop all Factory tasks?",
                  description: "Running Factory tasks in this project stop and their items go back to To do; queued ones are removed. Their work so far stays where it is.",
                  items: entries.filter((entry) => entry.state === "queued" || entry.state === "running").map((entry) => `${entry.task} · ${entry.state}`),
                  confirmLabel: "Stop all",
                  destructive: true,
                  onConfirm: () => factory.stopAll(items),
                })
              }
            >
              Stop all Factory tasks…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </PageToolbar>

      <FactoryStrip project={project} onSettings={() => setSettingsOpen(true)} />

      <FilterBar
        onReset={isNarrowed(filters) ? () => setFilters({ ...IDLE_FILTERS, sort: filters.sort, descending: filters.descending }) : undefined}
        sort={
          <>
            {checked.size > 0 && (
              <span className="mr-2 flex items-center gap-1 text-xs text-muted-foreground">
                {checked.size} selected
                <Button variant="outline" size="xs" onClick={() => setRunItems(checkedItems)}>Start {checked.size} in Factory…</Button>
                <Button variant="ghost" size="xs" onClick={() => setChecked(new Set())}>Clear</Button>
              </span>
            )}
            <FilterMenu label="Sort" idle="updated" value={filters.sort} onChange={(sort: SortKey) => set({ sort })} options={(Object.keys(SORT_LABEL) as SortKey[]).map((value) => ({ value, label: SORT_LABEL[value] }))} />
            <Button variant="ghost" size="icon-xs" aria-label={filters.descending ? "Descending; switch to ascending" : "Ascending; switch to descending"} onClick={() => set({ descending: !filters.descending })}>
              {filters.descending ? <ArrowDownNarrowWideIcon /> : <ArrowUpNarrowWideIcon />}
            </Button>
          </>
        }
      >
        <SearchField value={filters.query} onChange={(query) => set({ query })} placeholder="Search title or description" />
        <FilterMenu label="Status" idle="any" value={filters.status} onChange={(status) => set({ status })} options={[{ value: "any", label: "Any status" }, { value: "open", label: "Not done" }, "separator", ...STATUSES.map((value) => ({ value, label: STATUS_LABEL[value] }))]} />
        <FilterMenu label="Priority" idle="any" value={filters.priority} onChange={(priority) => set({ priority })} options={[{ value: "any", label: "Any priority" }, ...PRIORITIES.map((value) => ({ value, label: PRIORITY_LABEL[value] }))]} />
        <FilterMenu label="Assignee" idle="anyone" value={filters.assignee} onChange={(assignee) => set({ assignee })} options={[{ value: "anyone", label: "Anyone" }, { value: "me", label: "You", hint: ME }, { value: "none", label: "Nobody" }, ...assignees.map((login) => ({ value: login, label: login }))]} />
        {sources.length > 1 && <FilterMenu label="Source" idle="any" value={filters.source} onChange={(source) => set({ source })} options={[{ value: "any", label: "Every source" }, ...sources.map((value) => ({ value, label: SOURCE_LABEL[value] }))]} />}
        <FilterMenu label="Size" idle="any" value={filters.size} onChange={(size) => set({ size })} options={[{ value: "any", label: "Any size" }, ...SIZES.map((value) => ({ value, label: value }))]} />
      </FilterBar>

      <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
        <ResizablePanel id="backlog-list" minSize="40%">
          <div className="flex h-full min-h-0 flex-col">
            <BacklogList
              key={JSON.stringify(filters)}
              rows={rows}
              entryOf={entryOf}
              taskOf={taskOf}
              selectedId={selected?.id}
              checked={checked}
              onSelect={setSelectedId}
              onCheck={(id, on) => setChecked((current) => (on ? new Set([...current, id]) : new Set([...current].filter((entry) => entry !== id))))}
              onPriority={(item, priority) => {
                patch(item.id, { priority })
                say(`${item.number} is ${priority === "none" ? "without a priority" : `${priority} priority`}`)
              }}
              onStart={startTask}
              onOpenTask={openTask}
              empty={isNarrowed(filters) ? "Nothing matches these filters." : "No work items yet. Tracker issues and anything you add by hand land here."}
            />
          </div>
        </ResizablePanel>
        {selected && (
          <>
            <ResizableHandle />
            <ResizablePanel id="backlog-detail" defaultSize="40%" minSize="28%" maxSize="60%">
              <ItemDetail
                key={selected.id}
                item={selected}
                entry={entryOf(selected)}
                task={taskOf(selected)}
                hold={hold}
                factory={factory}
                onStart={() => startTask(selected)}
                onStartInFactory={() => setRunItems([selected])}
                onOpenTask={openTask}
                onConfirm={setConfirm}
                copy={copy}
                onClose={() => setSelectedId(undefined)}
              />
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>

      <StartTaskDialog
        request={start}
        onClose={() => setStart(null)}
        onStarted={(request) => {
          const item = items.find((candidate) => sourceKey(candidate) === request.source)
          if (item?.source === "local" && item.status === "todo") patch(item.id, { status: "in_progress" })
        }}
      />
      <RunInFactoryDialog
        project={project}
        items={runItems}
        onClose={() => {
          setRunItems(null)
          setChecked(new Set())
        }}
      />
      <FactorySettingsDialog project={project} open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <NewItemDialog project={project} items={items} open={creating} onClose={() => setCreating(false)} onCreated={setSelectedId} />
      <ConfirmRequestDialog request={confirm} onClose={() => setConfirm(null)} />
      <PageToast />
    </div>
  )
}
