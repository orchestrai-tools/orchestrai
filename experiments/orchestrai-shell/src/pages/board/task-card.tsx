import { MoreHorizontalIcon } from "lucide-react"

import { StatusDot } from "@/components/common/status-mark"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ProjectBadge } from "@/components/window/project-badge"
import { findAgent } from "@/data/agents"
import type { Stage, Task } from "@/data/tasks"
import { findProject } from "@/lib/projects"
import { cn } from "@/lib/utils"

const STAGES: readonly Stage[] = ["requirements", "plan", "implement", "review", "verify", "merge"]

/** Six ticks for the stages; a tall tick marks a stop where the run waits for a person. */
export function StageTrack({ task, className }: { task: Task; className?: string }) {
  const current = STAGES.indexOf(task.stage)
  return (
    <div className={cn("flex items-end gap-0.5", className)} aria-label={`Stage: ${task.stage}`}>
      {STAGES.map((stage, index) => (
        <span
          key={stage}
          title={`${stage}${task.stopPoints.includes(stage) ? " · stops for you" : ""}`}
          className={cn(
            "w-3 rounded-[1px]",
            task.stopPoints.includes(stage) ? "h-2.5" : "h-1.5",
            task.status === "done" || index < current
              ? "bg-foreground/50"
              : index === current
                ? "bg-foreground"
                : "bg-foreground/12"
          )}
        />
      ))}
    </div>
  )
}

const PR_TONE = { passing: "bg-emerald-500", failing: "bg-red-500", pending: "bg-amber-500" }

/** One card per task: a status mark and a one-line summary. Opening it shows only that task. */
export function TaskCard({
  task,
  selected,
  onOpen,
  showProject = false,
}: {
  task: Task
  selected: boolean
  onOpen: () => void
  /** On Home, cards from every project share one board, so each names its project. */
  showProject?: boolean
}) {
  const agent = findAgent(task.agent)
  const project = findProject(task.project)
  return (
    <div
      className={cn(
        "group/card relative rounded-md border bg-background text-left shadow-xs transition-colors hover:border-foreground/25",
        selected && "border-foreground/40"
      )}
    >
      <button type="button" onClick={onOpen} className="flex w-full flex-col gap-2 p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="flex items-start gap-2 pr-6">
          <StatusDot status={task.status} className="mt-1.5" />
          <span className="text-sm leading-snug font-medium">{task.title}</span>
        </span>
        <span className="line-clamp-2 text-xs text-muted-foreground">{task.summary}</span>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          {showProject && (
            <>
              <span className="flex min-w-0 items-center gap-1.5">
                <ProjectBadge project={project} className="size-3.5 text-[9px]" />
                <span className="truncate">{project.name}</span>
              </span>
              <span aria-hidden>·</span>
            </>
          )}
          <span>{agent.name}</span>
          <span aria-hidden>·</span>
          <span>{task.elapsed}</span>
          {task.pr && (
            <span className="ml-auto flex items-center gap-1">
              <span aria-hidden className={cn("size-1.5 rounded-full", PR_TONE[task.pr.checks])} />#{task.pr.number}
            </span>
          )}
        </span>
        <span className="flex items-center gap-2">
          <span className="min-w-0 truncate font-mono text-[11px] text-muted-foreground">{task.branch}</span>
          <StageTrack task={task} className="ml-auto shrink-0" />
        </span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Actions for ${task.title}`}
            className="absolute top-2 right-2 opacity-0 group-hover/card:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
          >
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={onOpen}>Open</DropdownMenuItem>
          {task.status === "running" ? <DropdownMenuItem>Pause</DropdownMenuItem> : <DropdownMenuItem>Resume</DropdownMenuItem>}
          {agent.canFork && <DropdownMenuItem>Fork session</DropdownMenuItem>}
          {task.pr && <DropdownMenuItem>Open pull request #{task.pr.number}</DropdownMenuItem>}
          <DropdownMenuItem>Open worktree in terminal</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem>Archive</DropdownMenuItem>
          <DropdownMenuItem variant="destructive">Stop and discard…</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
