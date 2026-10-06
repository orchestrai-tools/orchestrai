import { StatusMark } from "@/components/common/status-mark"
import { ProjectBadge } from "@/components/window/project-badge"
import { findAgent } from "@/data/agents"
import { BOARD_COLUMNS, type Task } from "@/data/tasks"
import { findProject } from "@/lib/projects"
import { cn } from "@/lib/utils"
import { StageTrack, TaskCard } from "@/pages/board/task-card"

interface TaskViewProps {
  tasks: Task[]
  selected?: string
  open: (task: Task) => void
  /** Home mixes every project on one board, so each card and row names its project. */
  showProject?: boolean
}

/** Columns in the order a person acts on them: what needs you first. */
export function BoardColumns({ tasks, selected, open, showProject = false }: TaskViewProps) {
  return (
    <div className="grid min-w-[44rem] grid-cols-4 gap-4">
      {BOARD_COLUMNS.map((column) => {
        const items = tasks.filter((task) => column.statuses.includes(task.status))
        return (
          <section key={column.id} aria-label={column.title} className="flex min-w-0 flex-col gap-2">
            <h2 className="flex items-baseline gap-2 px-1 text-xs font-medium">
              {column.title}
              <span className="text-muted-foreground tabular-nums">{items.length}</span>
            </h2>
            {items.length === 0 ? (
              <p className="rounded-md border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
                {column.id === "attention" ? "Nothing is waiting on you" : "Empty"}
              </p>
            ) : (
              items.map((task) => (
                <TaskCard key={task.id} task={task} selected={selected === task.id} onOpen={() => open(task)} showProject={showProject} />
              ))
            )}
          </section>
        )
      })}
    </div>
  )
}

export function TaskList({ tasks, selected, open, showProject = false }: TaskViewProps) {
  return (
    <div role="table" aria-label="Tasks" className="rounded-md border bg-background text-sm">
      <div role="row" className="grid grid-cols-[1fr_7rem_7rem_6rem_5rem] gap-3 border-b px-3 py-2 text-xs text-muted-foreground">
        <span>Task</span>
        <span>Status</span>
        <span>Agent</span>
        <span>Stage</span>
        <span className="text-right">Updated</span>
      </div>
      {tasks.map((task) => (
        <button
          key={task.id}
          type="button"
          role="row"
          onClick={() => open(task)}
          className={cn(
            "grid w-full grid-cols-[1fr_7rem_7rem_6rem_5rem] items-center gap-3 border-b px-3 py-(--row-py) text-left last:border-b-0 hover:bg-muted/60",
            selected === task.id && "bg-muted"
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            {showProject && <ProjectBadge project={findProject(task.project)} />}
            <span className="min-w-0">
              <span className="block truncate font-medium">{task.title}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {showProject && `${findProject(task.project).name} · `}
                {task.summary}
              </span>
            </span>
          </span>
          <StatusMark status={task.status} />
          <span className="truncate text-xs">{findAgent(task.agent).name}</span>
          <StageTrack task={task} />
          <span className="text-right text-xs text-muted-foreground">{task.updated}</span>
        </button>
      ))}
    </div>
  )
}
