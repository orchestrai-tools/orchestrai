import { useState } from "react"
import { ChevronDownIcon, GitBranchIcon } from "lucide-react"

import { StatusMark } from "@/components/common/status-mark"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { BRANCHES } from "@/data/git"
import type { PullRequest } from "@/data/github"
import type { Task } from "@/data/tasks"
import type { ProjectId } from "@/lib/projects"
import { cn } from "@/lib/utils"
import type { ConfirmRequest } from "@/components/common/confirm-dialog"
import { useGitStore, type GitActions, type GitState } from "@/pages/changes/git-store"
import { say } from "@/pages/changes/toast-store"

const CHECKS_TONE = { passing: "bg-emerald-500", failing: "bg-red-500", pending: "bg-amber-500", none: "bg-muted-foreground/40" } as const

interface Props {
  project: ProjectId
  state: GitState
  task?: Task
  /** The open pull request for this branch, whoever opened it. */
  pull?: PullRequest
  /** Branches checked out in the project's other worktrees: git allows one checkout per branch. */
  busyBranches: string[]
  actions: GitActions
  onConfirm: (request: ConfirmRequest) => void
  onMerge: () => void
  onOpenTask: () => void
  onOpenPull: () => void
  copy: (text: string, what: string) => void
}

/** Where this worktree stands: its branch, its upstream, its base, and the task and PR it belongs to. */
export function BranchBar({ project, state, task, pull, busyBranches, actions, onConfirm, onMerge, onOpenTask, onOpenPull, copy }: Props) {
  const [naming, setNaming] = useState<"create" | "rename" | null>(null)
  const deleted = useGitStore((store) => store.deletedBranches)
  const known = BRANCHES[project] ?? { local: [state.branch], remote: [] }
  const local = known.local.filter((name) => !deleted.includes(`${project}:${name}`))
  const branches = { local: local.includes(state.branch) ? local : [state.branch, ...local], remote: known.remote }
  const deletable = branches.local.filter((name) => name !== state.branch && name !== "main" && name !== "develop" && !busyBranches.includes(name))
  const upstream = state.diverged
    ? `Diverged from ${state.upstream} after an amend; only a force push can land it`
    : !state.upstream
      ? "Not pushed yet"
      : [state.outgoing.length && `${state.outgoing.length} to push`, state.incoming && `${state.incoming} to pull`].filter(Boolean).join(" · ") || `Up to date with ${state.upstream}`

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b px-4 py-1.5 text-xs text-muted-foreground">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="xs" className="-ml-2 font-mono text-foreground">
            <GitBranchIcon />
            {state.branch}
            <ChevronDownIcon className="text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel className="font-mono">{state.branch}</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => setNaming("create")}>
            New branch from here… <DropdownMenuShortcut>⌥⌘N</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!state.base} onSelect={() => setNaming("rename")}>Rename branch…</DropdownMenuItem>
          {state.base && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={actions.rebaseOntoBase}>Rebase onto {state.base}</DropdownMenuItem>
              <DropdownMenuItem onSelect={actions.mergeBaseIn}>Merge {state.base} into this branch</DropdownMenuItem>
              <DropdownMenuItem onSelect={onMerge}>Merge into {state.base}…</DropdownMenuItem>
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Switch branch</DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-64">
              <DropdownMenuLabel>Local</DropdownMenuLabel>
              {branches.local.map((name) => (
                <DropdownMenuItem key={name} disabled={name === state.branch || busyBranches.includes(name)} onSelect={() => actions.switchBranch(name)} className="font-mono text-xs">
                  {name}
                  {(name === state.branch || busyBranches.includes(name)) && (
                    <span className="ml-auto font-sans text-muted-foreground">{name === state.branch ? "current" : "in a worktree"}</span>
                  )}
                </DropdownMenuItem>
              ))}
              {branches.remote.length > 0 && <DropdownMenuLabel>Remote · checks out a local copy</DropdownMenuLabel>}
              {branches.remote.map((name) => {
                const localName = name.split("/").slice(1).join("/")
                const busy = localName === state.branch || busyBranches.includes(localName)
                return (
                  <DropdownMenuItem key={name} disabled={busy} onSelect={() => actions.switchBranch(localName)} className="font-mono text-xs">
                    {name}
                  </DropdownMenuItem>
                )
              })}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem onSelect={() => copy(state.branch, "branch name")}>Copy branch name</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="text-red-600 dark:text-red-400" disabled={!deletable.length}>Delete a branch</DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-64">
              {deletable.map((name) => (
                <DropdownMenuItem
                  key={name}
                  variant="destructive"
                  className="font-mono text-xs"
                  onSelect={() =>
                    onConfirm({
                      title: `Delete ${name}?`,
                      description: "The local branch is deleted with git branch -D. Commits that no other branch or remote holds are lost.",
                      items: [name],
                      confirmLabel: "Delete branch",
                      destructive: true,
                      onConfirm: () => actions.deleteBranch(name),
                    })
                  }
                >
                  {name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>

      <span className={cn(state.diverged && "text-amber-600 dark:text-amber-400")}>{upstream}</span>
      {state.base && (
        <span className="flex items-center gap-1.5">
          {state.aheadOfBase} ahead of {state.base}
          {state.behindBase > 0 && (
            <>
              , {state.behindBase} behind
              <Button variant="link" size="xs" className="h-auto px-0 text-xs" onClick={actions.rebaseOntoBase}>
                Rebase onto {state.base}
              </Button>
            </>
          )}
        </span>
      )}

      <span className="ml-auto flex items-center gap-4">
        {pull && (
          <button type="button" onClick={onOpenPull} className="flex items-center gap-1.5 hover:text-foreground">
            <span aria-hidden className={cn("size-2 rounded-full", CHECKS_TONE[pull.checks])} />
            {pull.state === "draft" ? "Draft PR" : "PR"} #{pull.number} · {pull.checks === "none" ? "no checks" : `checks ${pull.checks}`}
            {task?.attempts && ` · fix ${task.attempts.used} of ${task.attempts.cap}`}
          </button>
        )}
        {task && (
          <button type="button" onClick={onOpenTask} className="flex items-center gap-1.5 hover:text-foreground" title={task.title}>
            <StatusMark status={task.status} />
            <span className="font-mono">{task.id}</span>
          </button>
        )}
      </span>

      <BranchNameDialog
        mode={naming}
        from={state.branch}
        onClose={() => setNaming(null)}
        onSubmit={(name, checkout) => {
          if (naming === "rename") actions.renameBranch(name)
          else if (checkout) actions.switchBranch(name)
          else say(`Created branch ${name} from ${state.branch}`)
        }}
      />
    </div>
  )
}

function BranchNameDialog({ mode, from, onClose, onSubmit }: { mode: "create" | "rename" | null; from: string; onClose: () => void; onSubmit: (name: string, checkout: boolean) => void }) {
  const [name, setName] = useState("")
  const [checkout, setCheckout] = useState(true)
  const valid = /^[\w./-]+$/.test(name.trim()) && name.trim() !== from
  const submit = () => {
    if (!valid) return
    onSubmit(name.trim(), checkout)
    setName("")
    onClose()
  }
  return (
    <Dialog open={mode !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "rename" ? "Rename branch" : "New branch"}</DialogTitle>
          <DialogDescription>
            {mode === "rename" ? <>Renames <span className="font-mono">{from}</span>. Its upstream keeps the old name until the next push.</> : <>Starts from <span className="font-mono">{from}</span>, uncommitted changes included.</>}
          </DialogDescription>
        </DialogHeader>
        <Input autoFocus value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && submit()} placeholder={mode === "rename" ? from : `${from}-2`} className="font-mono" aria-label="Branch name" />
        {mode === "create" && (
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={checkout} onCheckedChange={(value) => setCheckout(value === true)} />
            Check out the new branch
          </label>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!valid} onClick={submit}>{mode === "rename" ? "Rename" : "Create branch"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
