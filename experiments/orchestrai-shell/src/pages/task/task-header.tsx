import { GitPullRequestIcon, MoreHorizontalIcon, PauseIcon, PlayIcon, SquareIcon } from "lucide-react"

import { StatusMark } from "@/components/common/status-mark"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { AGENTS, findAgent } from "@/data/agents"
import type { Task } from "@/data/tasks"
import { StageTrack } from "@/pages/board/task-card"

/**
 * The same header for every task: what it is, who runs it, where it is in
 * its stages, and start/stop/pause/resume in one place (DESIGN-PHILOSOPHY §12).
 */
export function TaskHeader({ task }: { task: Task }) {
  const agent = findAgent(task.agent)
  const live = task.status === "running" || task.status === "needs-you"

  return (
    <header className="flex flex-col gap-3">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-semibold">{task.title}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <StatusMark status={task.status} />
            <span aria-hidden>·</span>
            <span>{agent.name}</span>
            <span aria-hidden>·</span>
            <span>{task.workflow}</span>
            <span aria-hidden>·</span>
            <span className="font-mono">{task.branch}</span>
            <span aria-hidden>·</span>
            <span>{task.elapsed}</span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {task.pr && (
            <Button variant="outline" size="sm">
              <GitPullRequestIcon />#{task.pr.number}
            </Button>
          )}
          {live ? (
            <Button variant="outline" size="sm">
              <PauseIcon />
              Pause
            </Button>
          ) : (
            task.status !== "done" && (
              <Button variant="outline" size="sm">
                <PlayIcon />
                Resume
              </Button>
            )
          )}
          {live && (
            <Button variant="outline" size="sm" aria-label="Stop">
              <SquareIcon />
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="More task actions">
                <MoreHorizontalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {agent.canContinue && <DropdownMenuItem>Continue in a new session</DropdownMenuItem>}
              {agent.canFork && <DropdownMenuItem>Fork session</DropdownMenuItem>}
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Hand to another agent</DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-44">
                  {AGENTS.filter((entry) => entry.id !== agent.id && entry.status === "ready").map((entry) => (
                    <DropdownMenuItem key={entry.id}>{entry.name}</DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Autonomy</DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-40">
                  <DropdownMenuRadioGroup value={task.autonomy}>
                    <DropdownMenuRadioItem value="suggest">Suggest</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="draft">Draft</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="execute">Execute</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuItem>Open worktree in terminal</DropdownMenuItem>
              <DropdownMenuItem>Open transcript as a doc</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs text-muted-foreground">Ending</DropdownMenuLabel>
              <DropdownMenuItem>Stop at goal: check the result, then stop</DropdownMenuItem>
              <DropdownMenuItem>Grind: continue to the turn cap</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Archive</DropdownMenuItem>
              <DropdownMenuItem variant="destructive">Stop and discard worktree…</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <StageTrack task={task} />
        <span>
          {task.stage}
          {task.stopPoints.length > 0 && ` · stops for you at ${task.stopPoints.join(", ")}`}
        </span>
        {task.attempts && (
          <span className="ml-auto">
            CI fix attempt {task.attempts.used} of {task.attempts.cap}
          </span>
        )}
      </div>
    </header>
  )
}
