import { daemon } from "@warpforge/daemon";
import type { BacklogItem } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@warpforge/ui/components/dropdown-menu";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@warpforge/ui/components/resizable";
import { Tooltip, TooltipContent, TooltipTrigger } from "@warpforge/ui/components/tooltip";
import { ArrowDownNarrowWideIcon, ArrowUpNarrowWideIcon, EllipsisIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmRequestDialog, type ConfirmRequest } from "../components/common/confirm-dialog";
import { PageBody, PageToolbar } from "../components/common/page-toolbar";
import { runStatus } from "../components/common/status-mark";
import { useCreateAsk } from "../lib/create-ask";
import { useTaskDraft } from "../lib/new-task";
import { useShell } from "../lib/shell-store";
import { syncTrackers, trackerSyncMessage } from "../lib/tracker-sync";
import { useDaemon } from "../lib/use-daemon";
import { BacklogList } from "./backlog/backlog-list";
import type { LinkedTask } from "./backlog/backlog-row";
import { FactoryStrip, RunInFactoryDialog } from "./backlog/factory";
import { FactoryQueueDialog } from "./backlog/factory-queue";
import { FactorySettingsDialog } from "./backlog/factory-settings-dialog";
import { ItemDetail } from "./backlog/item-detail";
import { availableSources, PRIORITIES, priorityLabel, sourceLabel, STATUSES, statusLabel } from "./backlog/labels";
import { FilterBar, FilterMenu, SearchField } from "./backlog/list-controls";
import { NewItemDialog } from "./backlog/new-item-dialog";
import {
  filtersFromView,
  IDLE_FILTERS,
  isNarrowed,
  SORT_LABEL,
  useBacklogItems,
  useFactory,
  useProjectSources,
  viewFromFilters,
  type BacklogFilters,
  type SortKey,
} from "./backlog/use-backlog";

/** Work that is not started yet, from every tracker the project reaches, in one list. Each item can become a task. */
export function Backlog() {
  const project = useShell((state) => state.project);
  if (!project) {
    return (
      <PageBody>
        <PageToolbar title="Backlog" />
        <p className="text-sm text-muted-foreground">Open a project to see its backlog.</p>
      </PageBody>
    );
  }
  return <ProjectBacklog key={project} project={project} />;
}

function ProjectBacklog({ project }: { project: string }) {
  const shell = useShell();
  const state = useDaemon();
  const [filters, setFilters] = useState<BacklogFilters>(() => filtersFromView(shell.backlogByProject[project]));
  const backlog = useBacklogItems(project, filters);
  const factory = useFactory(project);
  const sources = useProjectSources(project);
  const creating = useCreateAsk((ask) => ask.kind === "work");
  const [selectedId, setSelectedId] = useState<string>();
  const [created, setCreated] = useState<BacklogItem | null>(null);
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const [runItems, setRunItems] = useState<BacklogItem[] | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [syncing, setSyncing] = useState(false);
  const items = backlog.items;
  const entries = factory.entries;
  const selected = items.find((item) => item.id === selectedId) ?? (created?.id === selectedId ? created : undefined);

  const set = (next: Partial<BacklogFilters>) => {
    const merged = { ...filters, ...next };
    setFilters(merged);
    shell.setBacklogView(project, viewFromFilters(merged));
  };

  const entryOf = (item: BacklogItem) => entries.find((entry) => entry.itemId === item.id);
  const taskOf = (item: BacklogItem): LinkedTask | undefined => {
    const id = item.taskId || entryOf(item)?.taskId;
    const task = id
      ? state.snapshot.tasks.find((candidate) => candidate.id === id)
      : state.snapshot.tasks.find((candidate) => candidate.backlogItemId === item.id);
    if (!task) return undefined;
    return { id: task.id, status: runStatus(task, Boolean(state.taskPullRequests?.[task.id])), title: task.title };
  };
  const openTask = (id: string) => shell.openTask(id, project);
  const startTask = (item: BacklogItem) =>
    useTaskDraft
      .getState()
      .open(`${item.title}\n\n${item.body}`.trim(), "", { id: item.id, project, number: item.number });
  const checkedItems = items.filter((item) => checked.has(item.id));
  const stoppable = entries.filter((entry) => entry.state === "queued" || entry.state === "running");

  const replace = (item: BacklogItem) => {
    backlog.replace(item);
    if (created?.id === item.id) setCreated(item);
  };

  const priority = (item: BacklogItem, next: string) =>
    void daemon
      .updateBacklog({ itemId: item.id, project, priority: next })
      .then((updated) => {
        replace(updated);
        toast.success(`#${item.number} is ${next === "none" ? "without a priority" : `${priorityLabel(next).toLowerCase()} priority`}`);
      })
      .catch((err: unknown) => toast.error(err instanceof Error ? err.message : "Could not set the priority"));

  const sync = () => {
    setSyncing(true);
    void syncTrackers(project, [...checked])
      .then((result) => toast.success(trackerSyncMessage(result)))
      .catch((err: unknown) => toast.error(err instanceof Error ? err.message : "Could not sync"))
      .finally(() => setSyncing(false));
  };

  const stopAll = () =>
    setConfirm({
      title: "Stop all Factory tasks?",
      description:
        "Running Factory tasks in this project stop and their items go back to To do; queued ones are removed. Their work so far stays where it is.",
      items: stoppable.map((entry) => `${entry.number ? `#${entry.number} ` : ""}${entry.title} · ${entry.state}`),
      confirmLabel: "Stop all",
      destructive: true,
      onConfirm: () =>
        void daemon
          .runnerStop(project)
          .then(() => {
            toast.success("Stopped the Factory tasks");
            factory.reload();
            backlog.reload();
          })
          .catch((err: unknown) => toast.error(err instanceof Error ? err.message : "Could not stop the Factory")),
    });

  const meta = `${backlog.total} item${backlog.total === 1 ? "" : "s"}${entries.length ? ` · ${entries.length} in the Factory` : ""}`;

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <PageToolbar title="Backlog" meta={meta} className="px-4 pt-4 pb-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm" disabled={syncing} onClick={sync}>
              {syncing ? "Syncing…" : "Sync"}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {checked.size ? `Refreshes the ${checked.size} selected tracker items.` : "Imports new tracker issues and refreshes their status."}
          </TooltipContent>
        </Tooltip>
        <Button
          variant="outline"
          size="sm"
          disabled={!items.length}
          onClick={() => setRunItems(checkedItems.length ? checkedItems : items)}
        >
          Run in Factory…
        </Button>
        <Button size="sm" onClick={() => useCreateAsk.getState().ask("work")}>
          New item
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="More for the backlog">
              <EllipsisIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onSelect={() => setQueueOpen(true)}>Factory queue…</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setSettingsOpen(true)}>Factory settings…</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" disabled={!stoppable.length} onSelect={stopAll}>
              Stop all Factory tasks…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </PageToolbar>

      <FactoryStrip project={project} factory={factory} onQueue={() => setQueueOpen(true)} onSettings={() => setSettingsOpen(true)} />

      <FilterBar
        onReset={
          isNarrowed(filters) ? () => set({ ...IDLE_FILTERS, sort: filters.sort, descending: filters.descending }) : undefined
        }
        sort={
          <>
            {checked.size > 0 && (
              <span className="mr-2 flex items-center gap-1 text-xs text-muted-foreground">
                {checked.size} selected
                <Button variant="outline" size="xs" onClick={() => setRunItems(checkedItems)}>
                  Start {checked.size} in Factory…
                </Button>
                <Button variant="ghost" size="xs" onClick={() => setChecked(new Set())}>
                  Clear
                </Button>
              </span>
            )}
            <FilterMenu
              label="Sort"
              idle="updated"
              value={filters.sort}
              onChange={(sort: SortKey) => set({ sort })}
              options={(Object.keys(SORT_LABEL) as SortKey[]).map((value) => ({ value, label: SORT_LABEL[value] }))}
            />
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={filters.descending ? "Descending; switch to ascending" : "Ascending; switch to descending"}
              onClick={() => set({ descending: !filters.descending })}
            >
              {filters.descending ? <ArrowDownNarrowWideIcon /> : <ArrowUpNarrowWideIcon />}
            </Button>
          </>
        }
      >
        <SearchField value={filters.query} onChange={(query) => set({ query })} placeholder="Search title or description" />
        <FilterMenu
          label="Status"
          idle=""
          value={filters.status}
          onChange={(status) => set({ status })}
          options={[{ value: "", label: "Any status" }, "separator", ...STATUSES.map((value) => ({ value, label: statusLabel(value) }))]}
        />
        <FilterMenu
          label="Priority"
          idle=""
          value={filters.priority}
          onChange={(next) => set({ priority: next })}
          options={[{ value: "", label: "Any priority" }, ...PRIORITIES.map((value) => ({ value, label: priorityLabel(value) }))]}
        />
        <FilterMenu
          label="Assignee"
          idle=""
          value={filters.assignee}
          onChange={(assignee) => set({ assignee })}
          options={[{ value: "", label: "Anyone" }, ...backlog.assignees.map((name) => ({ value: name, label: name }))]}
        />
        <FilterMenu
          label="Source"
          idle=""
          value={filters.source}
          onChange={(source) => set({ source })}
          options={[
            { value: "", label: "Every source" },
            ...availableSources(sources, filters.source).map((value) => ({ value, label: sourceLabel(value) })),
          ]}
        />
      </FilterBar>

      <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
        <ResizablePanel id="backlog-list" minSize="40%">
          <div className="flex h-full min-h-0 flex-col">
            <BacklogList
              rows={items}
              total={backlog.total}
              hasMore={backlog.hasMore}
              loading={backlog.loading}
              error={backlog.error}
              onRetry={backlog.reload}
              onLoadMore={backlog.loadMore}
              entryOf={entryOf}
              taskOf={taskOf}
              selectedId={selected?.id}
              checked={checked}
              onSelect={setSelectedId}
              onCheck={(id, on) =>
                setChecked((current) => {
                  const next = new Set(current);
                  if (on) next.add(id);
                  else next.delete(id);
                  return next;
                })
              }
              onPriority={priority}
              onStart={startTask}
              onOpenTask={openTask}
              empty={
                isNarrowed(filters) ? "Nothing matches these filters." : "No work items yet. Tracker issues and anything you add by hand land here."
              }
            />
          </div>
        </ResizablePanel>
        {selected && (
          <>
            <ResizableHandle />
            <ResizablePanel id="backlog-detail" defaultSize="40%" minSize="28%" maxSize="60%">
              <ItemDetail
                key={selected.id}
                project={project}
                item={selected}
                entry={entryOf(selected)}
                task={taskOf(selected)}
                assignees={backlog.assignees}
                factory={factory}
                onSaved={replace}
                onDeleted={() => {
                  setSelectedId(undefined);
                  backlog.reload();
                }}
                onStart={() => startTask(selected)}
                onStartInFactory={() => setRunItems([selected])}
                onOpenTask={openTask}
                onConfirm={setConfirm}
                onClose={() => setSelectedId(undefined)}
              />
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>

      <RunInFactoryDialog
        project={project}
        items={runItems}
        factory={factory}
        onStarted={backlog.reload}
        onClose={() => {
          setRunItems(null);
          setChecked(new Set());
        }}
      />
      <FactorySettingsDialog project={project} factory={factory} open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <FactoryQueueDialog project={project} factory={factory} open={queueOpen} onClose={() => setQueueOpen(false)} />
      <NewItemDialog
        project={project}
        sources={sources}
        open={creating}
        onClose={() => useCreateAsk.getState().clear()}
        onCreated={(item) => {
          setCreated(item);
          setSelectedId(item.id);
          backlog.reload();
        }}
      />
      <ConfirmRequestDialog request={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}
