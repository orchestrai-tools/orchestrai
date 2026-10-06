import { EllipsisIcon } from "lucide-react"

import { StatusMark } from "@/components/common/status-mark"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { DISK } from "@/data/git"
import { findTask } from "@/data/tasks"
import type { Worktree } from "@/data/worktrees"
import type { ProjectId } from "@/lib/projects"
import { cn } from "@/lib/utils"
import type { ConfirmRequest } from "@/components/common/confirm-dialog"
import { gitActions, seedState, useGitStore, type GitState } from "@/pages/changes/git-store"
import { say } from "@/pages/changes/toast-store"

interface Props {
  project: ProjectId
  worktrees: Worktree[]
  currentId?: string
  onOpen: (id: string) => void
  onOpenTask: (id: string) => void
  onMerge: (worktree: Worktree) => void
  onSetupLog: (worktree: Worktree) => void
  onConfirm: (request: ConfirmRequest) => void
}

const COLUMNS = "grid grid-cols-[minmax(0,1.5fr)_minmax(0,1.3fr)_6rem_8.5rem_4.5rem_4.5rem] items-center gap-3"
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`

function baseLabel(state: GitState) {
  if (!state.base) return state.incoming ? `${state.incoming} behind ${state.upstream}` : `Even with ${state.upstream ?? "origin"}`
  const parts = [state.aheadOfBase && `${state.aheadOfBase} ahead`, state.behindBase && `${state.behindBase} behind`].filter(Boolean)
  return parts.length ? `${parts.join(", ")} ${state.base}` : `Even with ${state.base}`
}

/** Every checkout of the project: the project folder first, then one per task, each with what removing it would lose. */
export function WorktreesView({ project, worktrees, currentId, onOpen, onOpenTask, onMerge, onSetupLog, onConfirm }: Props) {
  const states = useGitStore((store) => store.states)
  const removeWorktree = useGitStore((store) => store.removeWorktree)
  const stateOf = (worktree: Worktree) => states[worktree.id] ?? seedState(worktree)

  const remove = (worktree: Worktree, state: GitState) => {
    const task = findTask(worktree.task)
    const blockers = [state.files.length && plural(state.files.length, "uncommitted file"), state.outgoing.length && plural(state.outgoing.length, "unpushed commit")].filter(Boolean)
    onConfirm({
      title: `Remove ${worktree.branch}?`,
      description: task
        ? `Deletes the checkout and its branch, and archives the task ${task.id}. A pull request stays on GitHub.`
        : "Deletes the checkout and its branch. Nothing else is touched.",
      items: [worktree.path, worktree.branch],
      confirmLabel: "Remove worktree",
      destructive: true,
      refusal: blockers.length ? `Refused: it has ${blockers.join(" and ")}. Commit and push them, or discard them, first.` : undefined,
      onConfirm: () => {
        removeWorktree(worktree.id)
        say(`Removed ${worktree.path}`)
      },
    })
  }

  const reclaim = (worktree: Worktree, state: GitState) =>
    onConfirm({
      title: `Reclaim build artifacts in ${worktree.branch}?`,
      description: "Deletes node_modules, target and the other build folders inside this worktree only. Source files stay; the next build recreates them.",
      items: [`${worktree.path}/target/`, `${worktree.path}/desktop/node_modules/`],
      confirmLabel: `Reclaim ${state.size}`,
      onConfirm: () => gitActions(worktree, project).reclaim(),
    })

  return (
    <div className="flex min-h-0 flex-1 flex-col px-4 pb-4">
      <div role="table" aria-label="Worktrees" className="text-sm">
        <div role="row" className={cn(COLUMNS, "border-b px-2 py-2 text-xs text-muted-foreground")}>
          <span>Branch</span>
          <span>Task</span>
          <span>Changes</span>
          <span>Base</span>
          <span className="text-right">On disk</span>
          <span />
        </div>
        {worktrees.map((worktree) => {
          const state = stateOf(worktree)
          const task = findTask(worktree.task)
          return (
            <div
              key={worktree.id}
              role="row"
              onDoubleClick={() => onOpen(worktree.id)}
              className={cn(COLUMNS, "group/row rounded-sm px-2 py-(--row-py)", worktree.id === currentId ? "bg-muted/60" : "hover:bg-muted/40")}
            >
              <span className="min-w-0">
                <span className="block truncate font-mono text-sm">{state.branch}</span>
                <span className="block truncate text-xs text-muted-foreground" title={worktree.path}>{worktree.path}</span>
              </span>
              <span className="min-w-0">
                {task ? (
                  <button type="button" onClick={() => onOpenTask(task.id)} className="flex w-full min-w-0 items-center gap-2 text-left hover:underline">
                    <StatusMark status={task.status} className="shrink-0" />
                    <span className="truncate text-xs">{task.title}</span>
                  </button>
                ) : (
                  <span className="text-xs text-muted-foreground">{state.base ? "No task" : "Project checkout"}</span>
                )}
              </span>
              <span className={cn("text-xs", !state.files.length && "text-muted-foreground")}>{state.files.length ? `${state.files.length} changed` : "Clean"}</span>
              <span className="truncate text-xs text-muted-foreground">{baseLabel(state)}</span>
              <span className="text-right text-xs text-muted-foreground tabular-nums">{state.size}</span>
              <span className="flex justify-end gap-0.5">
                <Button variant="ghost" size="xs" className="opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100" onClick={() => onOpen(worktree.id)}>
                  {worktree.id === currentId ? "Current" : "Open"}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-xs" aria-label={`More for ${state.branch}`}>
                      <EllipsisIcon />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem onSelect={() => onOpen(worktree.id)}>Open in Changes</DropdownMenuItem>
                    {task && <DropdownMenuItem onSelect={() => onOpenTask(task.id)}>Open task {task.id}</DropdownMenuItem>}
                    {state.setupLog && <DropdownMenuItem onSelect={() => onSetupLog(worktree)}>Setup log…</DropdownMenuItem>}
                    {state.base && <DropdownMenuItem onSelect={() => onMerge(worktree)}>Merge into {state.base}…</DropdownMenuItem>}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => reclaim(worktree, state)}>Reclaim build artifacts…</DropdownMenuItem>
                    {state.base && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onSelect={() => remove(worktree, state)}>Remove worktree…</DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </span>
            </div>
          )
        })}
      </div>
      <p className="mt-auto pt-4 text-xs text-muted-foreground">
        {DISK.free} free on {DISK.volume}. A built worktree of this repository takes about 15 GB; Reclaim build artifacts gives most of it back without touching the source.
      </p>
    </div>
  )
}
