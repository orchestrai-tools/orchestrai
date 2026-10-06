import { cn } from "@/lib/utils"
import type { Project } from "@/lib/projects"

/** The project's coloured initial, standing in for TradingView's symbol logo. */
export function ProjectBadge({ project, className }: { project: Project; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-[4px] text-[10px] leading-none font-semibold text-white",
        project.color,
        className
      )}
    >
      {project.initial}
    </span>
  )
}

/** Live status beside the name, where TradingView shows the price change. */
export function ProjectStatus({ project, className }: { project: Project; className?: string }) {
  const running = project.running > 0
  return (
    <span
      className={cn(
        "flex shrink-0 items-center gap-1 tabular-nums",
        running ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
        className
      )}
    >
      <span aria-hidden className={cn("size-1.5 rounded-full", running ? "bg-current" : "bg-muted-foreground/50")} />
      {running ? `${project.running} running` : "idle"}
    </span>
  )
}
