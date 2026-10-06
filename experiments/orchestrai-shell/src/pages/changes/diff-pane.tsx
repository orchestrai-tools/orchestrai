import { EllipsisIcon, FileCheck2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { findAgent } from "@/data/agents"
import type { ChangedFile } from "@/data/git"
import type { Task } from "@/data/tasks"
import type { ConfirmRequest } from "@/components/common/confirm-dialog"
import { DiffView } from "@/pages/changes/diff-view"
import { useGitStore, type DiffMode, type GitActions, type GitState } from "@/pages/changes/git-store"
import { hunkHeader, patchText } from "@/pages/changes/patch"
import type { BundleMode } from "@/pages/changes/staging-tree"
import { say } from "@/pages/changes/toast-store"
import { splitPath, STATUS_WORD } from "@/pages/changes/tree"

interface Props {
  file?: ChangedFile
  state: GitState
  task?: Task
  actions: GitActions
  onConfirm: (request: ConfirmRequest) => void
  onBundle: (mode: BundleMode, paths: string[]) => void
  copy: (text: string, what: string) => void
}

/** The selected file's diff, with the notes bar above it when there are notes for the agent. */
export function DiffPane({ file, state, task, actions, onConfirm, onBundle, copy }: Props) {
  const mode = useGitStore((store) => store.diffMode)
  const setMode = useGitStore((store) => store.setDiffMode)
  const agent = task ? findAgent(task.agent).name : undefined

  if (!file) return <CleanState state={state} />

  const { dir, name } = splitPath(file.path)
  const discardFile = () =>
    onConfirm({
      title: file.status === "U" ? `Delete ${name}?` : `Discard changes in ${name}?`,
      description: file.status === "U" ? "It is not in git, so nothing can bring it back." : "The file goes back to the last commit. Your edits are lost.",
      items: [file.path],
      confirmLabel: file.status === "U" ? "Delete file" : "Discard changes",
      destructive: true,
      onConfirm: () => actions.discard([file.path]),
    })

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-10 items-center gap-3 border-b px-4">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="shrink-0 text-xs text-muted-foreground">{STATUS_WORD[file.status]}</span>
          <span className="truncate font-mono text-sm" title={file.path}>
            <span className="text-muted-foreground">{dir}</span>
            {name}
          </span>
          {file.from && <span className="truncate text-xs text-muted-foreground">from {file.from}</span>}
        </div>
        <span className="ml-auto shrink-0 font-mono text-xs tabular-nums">
          <span className="text-emerald-600 dark:text-emerald-400">+{file.additions}</span>{" "}
          <span className="text-red-600 dark:text-red-400">−{file.deletions}</span>
        </span>
        <ToggleGroup type="single" variant="outline" size="sm" spacing={0} value={mode} onValueChange={(next) => next && setMode(next as DiffMode)} aria-label="Diff layout">
          <ToggleGroupItem value="unified" className="px-3 text-xs">Unified</ToggleGroupItem>
          <ToggleGroupItem value="split" className="px-3 text-xs">Split</ToggleGroupItem>
        </ToggleGroup>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`More for ${name}`}>
              <EllipsisIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            {agent && <DropdownMenuItem onSelect={() => say(`Sent the diff of ${name} to ${agent}`)}>Send this diff to {agent}</DropdownMenuItem>}
            <DropdownMenuItem onSelect={() => copy(file.path, "path")}>Copy path</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => copy(patchText(file), "patch")}>Copy as patch</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onBundle("shelf", [file.path])}>Shelve…</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onBundle("stash", [file.path])}>Stash…</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={discardFile}>
              {file.status === "U" ? "Delete file…" : "Discard changes…"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <NotesBar state={state} agent={agent} onSend={() => agent && actions.sendNotes(agent)} copy={copy} />
      <div className="min-h-0 flex-1 overflow-auto">
        <DiffView
          key={file.path}
          file={file}
          mode={mode}
          notes={state.notes}
          onAddNote={(line, body) => actions.addNote({ path: file.path, line, body })}
          onRemoveNote={actions.removeNote}
          onDiscardHunk={(index) =>
            onConfirm({
              title: `Discard this hunk of ${name}?`,
              description: "Only these lines go back to the last commit; the rest of the file keeps your edits.",
              items: [`${hunkHeader(file.hunks[index])} ${file.hunks[index].section}`.trim()],
              confirmLabel: "Discard hunk",
              destructive: true,
              onConfirm: () => actions.discardHunk(file.path, index),
            })
          }
        />
      </div>
    </div>
  )
}

function NotesBar({ state, agent, onSend, copy }: { state: GitState; agent?: string; onSend: () => void; copy: (text: string, what: string) => void }) {
  if (!state.notes.length) return null
  const unsent = state.notes.filter((note) => !note.sent).length
  const prompt = state.notes.map((note) => `${note.path}:${note.line.split(":")[1]} — ${note.body}`).join("\n")
  return (
    <div className="flex items-center gap-3 border-b bg-muted/30 px-4 py-1.5 text-xs">
      <span className="min-w-0 truncate text-muted-foreground">
        {state.notes.length} {state.notes.length === 1 ? "note" : "notes"}
        {unsent > 0 && unsent < state.notes.length && ` · ${unsent} not sent`}
        {" · "}
        {state.notes.map((note) => `${note.path.split("/").at(-1)}:${note.line.split(":")[1]}`).join(", ")}
      </span>
      <div className="ml-auto flex shrink-0 gap-1.5">
        {agent ? (
          <Button size="xs" variant={unsent ? "default" : "outline"} onClick={onSend}>
            {unsent ? `Send to ${agent}` : "Send again"}
          </Button>
        ) : (
          <Button size="xs" variant="outline" onClick={() => copy(prompt, "notes")}>
            Copy as a prompt
          </Button>
        )}
      </div>
    </div>
  )
}

function CleanState({ state }: { state: GitState }) {
  const pushed = state.upstream && state.outgoing.length === 0
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
      <FileCheck2Icon className="size-5 text-muted-foreground" />
      <p className="text-sm font-medium">Nothing to commit</p>
      <p className="max-w-sm text-xs text-muted-foreground">
        {state.branch} has no uncommitted changes.{" "}
        {state.outgoing.length > 0
          ? `${state.outgoing.length} ${state.outgoing.length === 1 ? "commit is" : "commits are"} waiting to be pushed.`
          : pushed
            ? `Everything is pushed to ${state.upstream}.`
            : ""}
        {state.incoming > 0 && ` ${state.incoming} new on ${state.upstream} to pull.`}
      </p>
    </div>
  )
}
