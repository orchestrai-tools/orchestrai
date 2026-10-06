import { SectionLabel } from "@/components/common/page-toolbar"
import { StatusDot } from "@/components/common/status-mark"
import type { RunStatus } from "@/data/tasks"
import { stageChain, type Workflow } from "@/data/workflows"
import type { ProjectId } from "@/lib/projects"
import { cn } from "@/lib/utils"
import { runsOf } from "@/pages/workflows/model"

const ATTENTION: readonly RunStatus[] = ["needs-you", "stopped", "failed"]

function Row({
  workflow,
  project,
  selected,
  onSelect,
}: {
  workflow: Workflow
  project: ProjectId
  selected: boolean
  onSelect: () => void
}) {
  const { tasks, count } = runsOf(workflow, project)
  const live = tasks.find((task) => ATTENTION.includes(task.status)) ?? tasks.find((task) => task.status === "running")
  return (
    <li>
      <button
        type="button"
        aria-current={selected ? "true" : undefined}
        onClick={onSelect}
        className={cn(
          "flex w-full flex-col gap-0.5 rounded-md px-2 py-(--row-py) text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
          selected && "bg-muted"
        )}
      >
        <span className="flex items-center gap-2">
          <span className={cn("truncate text-sm font-medium", workflow.error && "text-muted-foreground")}>{workflow.name}</span>
          {live && <StatusDot status={live.status} />}
          <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">
            {count === 0 ? "No runs" : `${count} run${count === 1 ? "" : "s"}`}
          </span>
        </span>
        <span className={cn("truncate text-xs", workflow.error ? "text-destructive" : "text-muted-foreground")}>
          {workflow.error ? "Can't load the file" : stageChain(workflow)}
        </span>
      </button>
    </li>
  )
}

/** Project files first, in the order they are used; built-ins after them, as the daemon lists them. */
export function WorkflowList({
  workflows,
  project,
  selectedId,
  onSelect,
  className,
}: {
  workflows: Workflow[]
  project: ProjectId
  selectedId: string | undefined
  onSelect: (id: string) => void
  className?: string
}) {
  const groups = [
    { label: "In this project", items: workflows.filter((workflow) => workflow.source === "project") },
    { label: "Built in", items: workflows.filter((workflow) => workflow.source === "builtin") },
  ].filter((group) => group.items.length > 0)

  return (
    <nav aria-label="Workflows" className={cn("flex flex-col gap-4", className)}>
      {groups.map((group) => (
        <div key={group.label}>
          <SectionLabel className="px-2 pb-1">{group.label}</SectionLabel>
          <ul className="flex flex-col">
            {group.items.map((workflow) => (
              <Row
                key={workflow.id}
                workflow={workflow}
                project={project}
                selected={workflow.id === selectedId}
                onSelect={() => onSelect(workflow.id)}
              />
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}
