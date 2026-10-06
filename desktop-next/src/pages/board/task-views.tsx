import type { TaskInfo } from "@warpforge/protocol";
import { cn } from "@warpforge/ui/lib/utils";
import type { ReactNode } from "react";
import { StatusMark, runStatus } from "../../components/common/status-mark";
import { COLUMNS, type ColumnId } from "../../model/tasks";
import { ProjectBadge } from "../../shell/project-badge";
import { failureKindLabel } from "./failure-label";
import { StageTrack, TaskCard } from "./task-card";
import { TaskMenu } from "./task-menu";
import { taskTitle, useTaskLine } from "./task-facts";

interface TaskViewProps {
  selected?: string | null;
  open: (task: TaskInfo) => void;
  /** Home mixes every project on one board, so each card and row names its project. */
  showProject?: boolean;
}

/** Columns in the order a person acts on them: what needs you first. */
export function BoardColumns({
  grouped,
  selected,
  open,
  showProject = false,
  columnAction,
}: TaskViewProps & {
  grouped: Record<ColumnId, TaskInfo[]>;
  /** An action that belongs to one column, shown beside its count. */
  columnAction?: (column: ColumnId) => ReactNode;
}) {
  return (
    <div className="grid min-w-[44rem] grid-cols-4 gap-4">
      {COLUMNS.map((column) => {
        const items = grouped[column.id];
        return (
          <section
            key={column.id}
            aria-label={column.title}
            className="flex min-w-0 flex-col gap-2"
          >
            <h2 className="flex items-baseline gap-2 px-1 text-xs font-medium">
              {column.title}
              <span className="text-muted-foreground tabular-nums">{items.length}</span>
              {columnAction && <span className="ml-auto">{columnAction(column.id)}</span>}
            </h2>
            {items.length === 0 ? (
              <p className="rounded-md border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
                {column.id === "needs-you" ? "Nothing is waiting on you" : "Empty"}
              </p>
            ) : (
              items.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  selected={selected === task.id}
                  onOpen={() => open(task)}
                  showProject={showProject}
                />
              ))
            )}
          </section>
        );
      })}
    </div>
  );
}

const ROW = "grid grid-cols-[1fr_7rem_7rem_6rem_5rem] gap-3";

/** The same tasks as rows, for scanning many at once. */
export function TaskList({ tasks, ...props }: TaskViewProps & { tasks: TaskInfo[] }) {
  return (
    <div role="table" aria-label="Tasks" className="rounded-md border bg-background text-sm">
      <div role="row" className={cn(ROW, "border-b py-2 pr-10 pl-3 text-xs text-muted-foreground")}>
        <span>Task</span>
        <span>Status</span>
        <span>Agent</span>
        <span>Stage</span>
        <span className="text-right">Updated</span>
      </div>
      {tasks.length === 0 ? (
        <p className="px-3 py-6 text-center text-xs text-muted-foreground">No tasks.</p>
      ) : (
        tasks.map((task) => <TaskRow key={task.id} task={task} {...props} />)
      )}
    </div>
  );
}

function TaskRow({
  task,
  selected,
  open,
  showProject = false,
}: TaskViewProps & { task: TaskInfo }) {
  const line = useTaskLine(task);
  const summary = [
    showProject && task.project,
    line.activity?.label,
    line.summary || line.facts.join(" · "),
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div role="row" className="group/row relative border-b last:border-b-0">
      <button
        type="button"
        onClick={() => open(task)}
        className={cn(
          ROW,
          "w-full items-center py-(--row-py) pr-10 pl-3 text-left outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
          selected === task.id && "bg-muted",
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          {showProject && <ProjectBadge name={task.project} />}
          <span className="min-w-0">
            <span className="block truncate font-medium">{taskTitle(task)}</span>
            {line.failure ? (
              <span className="block truncate text-xs text-red-600 dark:text-red-400">
                {failureKindLabel(line.failure.kind)} · {line.failure.reason}
              </span>
            ) : (
              summary && (
                <span className="block truncate text-xs text-muted-foreground">{summary}</span>
              )
            )}
          </span>
        </span>
        <StatusMark status={runStatus(task, Boolean(line.pull))} />
        <span className="truncate text-xs">{line.agent}</span>
        <StageTrack task={task} />
        <span className="text-right text-xs text-muted-foreground">{line.elapsed}</span>
      </button>
      <TaskMenu
        task={task}
        onOpen={() => open(task)}
        className="absolute top-1/2 right-2 -translate-y-1/2 opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100"
      />
    </div>
  );
}
