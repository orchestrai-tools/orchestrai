import { useEffect, useMemo, useState } from "react"
import { ChevronDownIcon } from "lucide-react"

import { PageToolbar } from "@/components/common/page-toolbar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { StashEntry } from "@/data/git"
import { findTask } from "@/data/tasks"
import type { Worktree } from "@/data/worktrees"
import { useProjectWorktrees } from "@/components/sidebar/worktree-switcher"
import { useAppActions, useAppId, useAppSession, useIsFrontApp } from "@/lib/app-instance"
import { selectSelection } from "@/lib/window-store"
import { BranchBar } from "@/pages/changes/branch-bar"
import { CommitBox } from "@/pages/changes/commit-box"
import { ConfirmRequestDialog, type ConfirmRequest } from "@/components/common/confirm-dialog"
import { DiffPane } from "@/pages/changes/diff-pane"
import { gitActions, seedState, useGitStore } from "@/pages/changes/git-store"
import { PageToast } from "@/pages/changes/page-toast"
import { PushDialog } from "@/pages/changes/push-dialog"
import { BundleDialog, ShelfPanel, StashPanel } from "@/pages/changes/shelf-stash"
import { StagingTree, type BundleMode } from "@/pages/changes/staging-tree"
import { say } from "@/pages/changes/toast-store"
import { CreateWorktreeDialog, MergeDialog, SetupLogDialog } from "@/pages/changes/worktree-dialogs"
import { WorktreesView } from "@/pages/changes/worktrees-view"
import { useGithubStore, usePulls } from "@/pages/github/github-store"

type View = "changes" | "worktrees"
type RailTab = "commit" | "shelf" | "stash"

const NO_STASH: StashEntry[] = []

/**
 * Git for one worktree: what changed, what the next commit takes, and the
 * diff of the file in hand. The Worktrees view lists every checkout of the
 * project. Anything that loses work asks first and names what it loses.
 */
export function ChangesPage() {
  const app = useAppId()
  const front = useIsFrontApp()
  const project = useAppSession((session) => session.project)
  const selectedWorktree = useAppSession((session) => selectSelection(session, "worktree"))
  const selectedFile = useAppSession((session) => selectSelection(session, "file"))
  const { select, setPage } = useAppActions()
  const stash = useGitStore((store) => store.stash[project]) ?? NO_STASH
  const worktrees = useProjectWorktrees(project)
  const worktree = worktrees.find((entry) => entry.id === selectedWorktree) ?? worktrees[0]
  const stored = useGitStore((store) => store.states[worktree.id])
  const state = stored ?? seedState(worktree)
  const actions = useMemo(() => gitActions(worktree, project), [worktree, project])
  const task = findTask(worktree.task)
  const pull = usePulls(project).find((entry) => entry.branch === state.branch && (entry.state === "open" || entry.state === "draft"))
  const file = state.files.find((entry) => entry.path === selectedFile) ?? state.files[0]

  const view = useAppSession((session) => selectSelection(session, "changes-view") as View | undefined) ?? "changes"
  const setView = (next: View) => select("changes-view", next)
  const [railTab, setRailTab] = useState<RailTab>("commit")
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null)
  const [bundle, setBundle] = useState<{ mode: BundleMode; paths: string[] } | null>(null)
  const [push, setPush] = useState<"push" | "pr" | null>(null)
  const [creating, setCreating] = useState(false)
  const [merging, setMerging] = useState<Worktree | null>(null)
  const [setupLog, setSetupLog] = useState<Worktree | null>(null)

  useEffect(() => {
    if (!front) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey && event.shiftKey && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setPush("push")
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [front])

  const copy = (text: string, what: string) =>
    void navigator.clipboard?.writeText(text).then(
      () => say(`Copied ${what}`),
      () => say(`Could not copy the ${what}`, "error")
    )
  const openTask = (id: string) => select("task", id, "task")
  const openPull = (number: number) => {
    const { selectPull, setTab } = useGithubStore.getState()
    setTab(`${app}:${project}`, "pulls")
    selectPull(`${app}:${project}`, number)
    setPage("github")
  }
  const openWorktree = (id: string) => {
    select("worktree", id)
    setView("changes")
  }
  const forcePush = () => {
    setPush(null)
    setConfirm({
      title: `Force push ${state.branch}?`,
      description: `Replaces ${state.upstream ?? "the upstream"} with your local branch. With --force-with-lease, git refuses if anyone pushed to it since your last fetch, so their commits are never overwritten without you seeing them.`,
      items: state.outgoing.map((commit) => `${commit.hash} ${commit.subject}`),
      confirmLabel: "Force push",
      destructive: true,
      onConfirm: () => actions.push(true),
    })
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <PageToolbar
        title="Changes"
        meta={view === "worktrees" ? `${worktrees.length} worktrees` : state.files.length ? `${state.files.length} changed` : "Clean"}
        className="px-4 pt-4 pb-3"
      >
        <ToggleGroup type="single" variant="outline" size="sm" spacing={0} value={view} onValueChange={(next) => next && setView(next as View)} aria-label="View">
          <ToggleGroupItem value="changes" className="px-3 text-xs">Changes</ToggleGroupItem>
          <ToggleGroupItem value="worktrees" className="px-3 text-xs">Worktrees</ToggleGroupItem>
        </ToggleGroup>
        {view === "changes" ? (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button variant="outline" size="sm" disabled={!state.upstream} onClick={actions.pull}>
                    Pull{state.incoming ? <span className="text-muted-foreground tabular-nums">{state.incoming}</span> : null}
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {state.upstream ? `Fetch and rebase onto ${state.upstream}. Local changes are stashed and put back; a conflict rolls everything back.` : "Nothing to pull from until the first push creates an upstream."}
              </TooltipContent>
            </Tooltip>
            <div className="flex">
              <Button variant="outline" size="sm" className="rounded-r-none" onClick={() => setPush("push")}>
                Push{state.outgoing.length ? <span className="text-muted-foreground tabular-nums">{state.outgoing.length}</span> : null}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="rounded-l-none border-l-0 px-1.5" aria-label="Push options">
                    <ChevronDownIcon />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                  <DropdownMenuItem onSelect={() => setPush("push")}>
                    Push… <DropdownMenuShortcut>⇧⌘K</DropdownMenuShortcut>
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => (pull ? openPull(pull.number) : setPush("pr"))}>{pull ? `Open pull request #${pull.number}` : "Create pull request…"}</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" disabled={!state.upstream || (!state.outgoing.length && !state.diverged)} onSelect={forcePush}>
                    Force push with lease…
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setCreating(true)}>New worktree</Button>
        )}
      </PageToolbar>

      {view === "worktrees" ? (
        <WorktreesView
          project={project}
          worktrees={worktrees}
          currentId={worktree.id}
          onOpen={openWorktree}
          onOpenTask={openTask}
          onMerge={setMerging}
          onSetupLog={setSetupLog}
          onConfirm={setConfirm}
        />
      ) : (
        <>
          <BranchBar
            project={project}
            state={state}
            task={task}
            pull={pull}
            busyBranches={worktrees.filter((entry) => entry.id !== worktree.id).map((entry) => entry.branch)}
            actions={actions}
            onConfirm={setConfirm}
            onMerge={() => setMerging(worktree)}
            onOpenTask={() => task && openTask(task.id)}
            onOpenPull={() => pull && openPull(pull.number)}
            copy={copy}
          />
          <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
            <ResizablePanel id="changes-rail" defaultSize="32%" minSize="22%" maxSize="50%">
              <div className="flex h-full min-h-0 flex-col bg-sidebar/40">
                <Tabs value={railTab} onValueChange={(next) => setRailTab(next as RailTab)} className="gap-0">
                  <TabsList className="w-full justify-start px-3">
                    <TabsTrigger value="commit">Commit</TabsTrigger>
                    <TabsTrigger value="shelf">Shelf{state.shelf.length > 0 && <span className="text-xs text-muted-foreground tabular-nums">{state.shelf.length}</span>}</TabsTrigger>
                    <TabsTrigger value="stash">Stash{stash.length > 0 && <span className="text-xs text-muted-foreground tabular-nums">{stash.length}</span>}</TabsTrigger>
                  </TabsList>
                </Tabs>
                {railTab === "commit" && (
                  <>
                    <StagingTree
                      state={state}
                      project={project}
                      actions={actions}
                      selected={file?.path}
                      onSelect={(path) => select("file", path)}
                      onBundle={(mode, paths) => setBundle({ mode, paths })}
                      onConfirm={setConfirm}
                      copy={copy}
                    />
                    <CommitBox key={worktree.id} state={state} actions={actions} />
                  </>
                )}
                {railTab === "shelf" && <ShelfPanel entries={state.shelf} actions={actions} onConfirm={setConfirm} />}
                {railTab === "stash" && <StashPanel entries={stash} actions={actions} onConfirm={setConfirm} />}
              </div>
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel id="changes-diff" minSize="40%">
              <div className="flex h-full min-h-0 flex-col">
                <DiffPane file={file} state={state} task={task} actions={actions} onConfirm={setConfirm} onBundle={(mode, paths) => setBundle({ mode, paths })} copy={copy} />
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </>
      )}

      <ConfirmRequestDialog request={confirm} onClose={() => setConfirm(null)} />
      <BundleDialog
        request={bundle}
        draftName={state.draftMessage.split("\n")[0] || "Work in progress"}
        onClose={() => setBundle(null)}
        onSubmit={(mode, paths, name) => {
          if (mode === "shelf") {
            actions.shelve(paths, name)
            setRailTab("shelf")
          } else {
            actions.stash(paths, name)
            setRailTab("stash")
          }
        }}
      />
      <PushDialog mode={push} onClose={() => setPush(null)} project={project} state={state} task={task} existing={pull} actions={actions} onForcePush={forcePush} onOpenPull={openPull} />
      <CreateWorktreeDialog project={project} open={creating} onClose={() => setCreating(false)} onCreated={openWorktree} />
      <MergeDialog worktree={merging} state={merging ? (useGitStore.getState().states[merging.id] ?? seedState(merging)) : undefined} onClose={() => setMerging(null)} onMerged={(removed) => removed && setView("worktrees")} />
      <SetupLogDialog worktree={setupLog} lines={setupLog ? seedState(setupLog).setupLog : undefined} onClose={() => setSetupLog(null)} />
      <PageToast />
    </div>
  )
}
