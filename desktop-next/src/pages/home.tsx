import { buildFailureList } from "@warpforge/core/taskFailures";
import { daemon } from "@warpforge/daemon";
import { Button } from "@warpforge/ui/components/button";
import { ToggleGroup, ToggleGroupItem } from "@warpforge/ui/components/toggle-group";
import { FolderPlusIcon, PlusIcon } from "lucide-react";
import { useState } from "react";

import { PageToolbar, SectionLabel } from "../components/common/page-toolbar";
import { SelectMenu, type SelectOption } from "../components/common/select-menu";
import { plural } from "../lib/plural";
import { usePrFeedback } from "../lib/pr-feedback";
import { useShell, type ShellState } from "../lib/shell-store";
import { useDaemon } from "../lib/use-daemon";
import { groupByColumn, visibleTasks } from "../model/tasks";
import { BoardColumns, TaskList } from "./board/task-views";
import { PinnedGrid } from "./home/pinned-grid";
import { WaitingList } from "./home/waiting-list";
import { inboxEntries } from "./inbox/inbox-items";
import { useInboxScope } from "./inbox/inbox-scope";

const ALL = "all";
type Filter = "all" | "failed";

const FILTER_OPTIONS: readonly SelectOption[] = [
  { value: "all", label: "Every task" },
  { value: "failed", label: "Failed", hint: "A tool call, stage, or session that broke" },
];

/**
 * The pinned Home tab: attention across every project. Projects stay where
 * things live; Home is where you see what needs you and what is running.
 * Opening anything here jumps into its project.
 */
export function Home() {
  const state = useDaemon();
  const shell = useShell();
  const handled = usePrFeedback((store) => store.handledByTask);
  const [project, setProject] = useState<string>(ALL);
  const [filter, setFilter] = useState<Filter>("all");
  const projects = state.snapshot.projects;
  const pulls = state.taskPullRequests ?? {};

  const everything = visibleTasks(state.snapshot.tasks);
  const tasks = visibleTasks(everything, project === ALL ? null : project);
  const failures = buildFailureList(tasks, state.sessionUpdates);
  const shown = filter === "failed" ? failures.map((item) => item.task) : tasks;
  const waiting = inboxEntries(shown, pulls, handled, state.sessionUpdates);
  const running = tasks.filter((task) => task.status === "running").length;
  const projectCount = new Set(tasks.map((task) => task.project)).size;
  const view = shell.homeView;

  const projectOptions: SelectOption[] = [
    { value: ALL, label: "All projects" },
    ...projects.map((entry) => ({ value: entry.name, label: entry.name, hint: entry.path })),
  ];
  const openTask = (id: string, name: string) => shell.openTask(id, name);
  const openInbox = shell.project
    ? () => {
        useInboxScope.getState().setScope("all");
        shell.openProject(shell.project as string);
        shell.setPage("inbox");
      }
    : undefined;

  return (
    <div className="dot-grid flex min-h-full flex-col gap-6 p-4">
      <PageToolbar
        title="Home"
        meta={`${plural(tasks.length, "task")} in ${plural(projectCount, "project")} · ${running} running${failures.length > 0 ? ` · ${failures.length} failed` : ""}`}
      >
        <SelectMenu
          label="Project"
          value={project}
          options={projectOptions}
          onChange={setProject}
          className="h-7 w-44 text-xs"
        />
        <SelectMenu
          label="Show"
          value={filter}
          options={FILTER_OPTIONS}
          onChange={(next) => setFilter(next as Filter)}
          className="h-7 w-32 text-xs"
        />
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          spacing={0}
          value={view}
          onValueChange={(next) => next && shell.setHomeView(next as ShellState["homeView"])}
          aria-label="View"
        >
          <ToggleGroupItem value="board" className="px-3 text-xs">
            Board
          </ToggleGroupItem>
          <ToggleGroupItem value="list" className="px-3 text-xs">
            List
          </ToggleGroupItem>
          <ToggleGroupItem value="pinned" className="px-3 text-xs">
            Pinned
          </ToggleGroupItem>
        </ToggleGroup>
        <Button size="sm" onClick={() => shell.toggle("newTask")}>
          <PlusIcon data-icon="inline-start" />
          New task
        </Button>
      </PageToolbar>

      {state.connection !== "connected" && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm"
        >
          <span className="min-w-0 flex-1">
            {state.connectionError ?? `Daemon is ${state.connection}.`}
          </span>
          <Button size="xs" variant="outline" onClick={() => void daemon.connect()}>
            Retry
          </Button>
        </div>
      )}

      {projects.length === 0 && state.connection === "connected" && (
        <div className="flex flex-col items-center gap-3 rounded-md border border-dashed bg-background px-6 py-10 text-center">
          <FolderPlusIcon className="size-5 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No projects yet. Add a folder to start a task in it.
          </p>
          <Button size="sm" variant="outline" onClick={() => shell.toggle("adding")}>
            Add project…
          </Button>
        </div>
      )}

      {waiting.length > 0 && (
        <WaitingList
          items={waiting}
          onOpen={(item) => openTask(item.task.id, item.task.project)}
          onOpenInbox={openInbox}
        />
      )}

      {view === "pinned" ? (
        <section aria-label="Pinned" className="flex flex-col gap-2">
          <SectionLabel>Pinned</SectionLabel>
          <PinnedGrid tasks={everything} />
        </section>
      ) : (
        <section aria-label="Every task" className="flex flex-col gap-2">
          <SectionLabel>{filter === "failed" ? "Failed tasks" : "Every task"}</SectionLabel>
          <div className="overflow-x-auto pb-2">
            {view === "board" ? (
              <BoardColumns
                grouped={groupByColumn(shown, pulls, handled, state.sessionUpdates)}
                open={(task) => openTask(task.id, task.project)}
                showProject
              />
            ) : (
              <TaskList
                tasks={shown}
                open={(task) => openTask(task.id, task.project)}
                showProject
              />
            )}
          </div>
        </section>
      )}
    </div>
  );
}
