import { useState } from "react"
import { SparklesIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import type { ChangedFile, ShelfEntry, StashEntry } from "@/data/git"
import { cn } from "@/lib/utils"
import type { ConfirmRequest } from "@/components/common/confirm-dialog"
import type { GitActions } from "@/pages/changes/git-store"
import type { BundleMode } from "@/pages/changes/staging-tree"
import { STATUS_TONE } from "@/pages/changes/tree"

type Entry = { id: string; title: string; meta: string; files: ChangedFile[] }

const files = (count: number) => `${count} ${count === 1 ? "file" : "files"}`

/** Named bundles of uncommitted work Orchestrai keeps outside the repo, one shelf per worktree. */
export function ShelfPanel({ entries, actions, onConfirm }: { entries: ShelfEntry[]; actions: GitActions; onConfirm: (request: ConfirmRequest) => void }) {
  return (
    <BundleList
      entries={entries.map((entry) => ({ id: entry.id, title: entry.name, meta: `${entry.created} · ${entry.branch} · ${files(entry.files.length)}`, files: entry.files }))}
      empty="Nothing on the shelf. Right-click files in Commit and choose Shelve…"
      onApply={(entry) => actions.unshelve(entry.id, false)}
      onApplyDrop={(entry) =>
        onConfirm({
          title: `Apply and drop “${entry.title}”?`,
          description: `${files(entry.files.length)} go back into the worktree, then the shelf entry is deleted.`,
          items: entry.files.map((file) => file.path),
          confirmLabel: "Apply and drop",
          onConfirm: () => actions.unshelve(entry.id, true),
        })
      }
      onDrop={(entry) =>
        onConfirm({
          title: `Delete “${entry.title}”?`,
          description: "The worktree is untouched, but the shelved changes are gone for good.",
          items: entry.files.map((file) => file.path),
          confirmLabel: "Delete entry",
          destructive: true,
          onConfirm: () => actions.dropShelf(entry.id),
        })
      }
      labels={{ apply: "Apply", applyDrop: "Apply and drop", drop: "Delete…" }}
    />
  )
}

/** Git's own stash. It is one per repository, so entries from other worktrees show up here too. */
export function StashPanel({ entries, actions, onConfirm }: { entries: StashEntry[]; actions: GitActions; onConfirm: (request: ConfirmRequest) => void }) {
  const find = (id: string) => entries.find((entry) => entry.id === id)!
  return (
    <BundleList
      entries={entries.map((entry) => ({ id: entry.id, title: entry.message, meta: `${entry.id} · ${entry.created} · ${entry.branch} · ${files(entry.files.length)}`, files: entry.files }))}
      empty={'No stash entries. Stash files from Commit, or run git stash push -m "name" in a terminal.'}
      note="The stash is shared by every worktree of this repository."
      onApply={(entry) => actions.applyStash(find(entry.id), false)}
      onApplyDrop={(entry) =>
        onConfirm({
          title: `Pop ${entry.id}?`,
          description: `${files(entry.files.length)} go back into this worktree, then ${entry.id} is dropped from the stash.`,
          items: entry.files.map((file) => file.path),
          confirmLabel: "Pop",
          onConfirm: () => actions.applyStash(find(entry.id), true),
        })
      }
      onRestoreFile={(entry, path) => actions.applyStash(find(entry.id), false, path)}
      onDrop={(entry) =>
        onConfirm({
          title: `Drop ${entry.id}?`,
          description: "The worktree is untouched, but the stashed changes are gone for good.",
          items: entry.files.map((file) => file.path),
          confirmLabel: "Drop entry",
          destructive: true,
          onConfirm: () => actions.dropStash(find(entry.id)),
        })
      }
      labels={{ apply: "Apply", applyDrop: "Pop", drop: "Drop…" }}
    />
  )
}

function BundleList({
  entries,
  empty,
  note,
  labels,
  onApply,
  onApplyDrop,
  onDrop,
  onRestoreFile,
}: {
  entries: Entry[]
  empty: string
  note?: string
  labels: { apply: string; applyDrop: string; drop: string }
  onApply: (entry: Entry) => void
  onApplyDrop: (entry: Entry) => void
  onDrop: (entry: Entry) => void
  onRestoreFile?: (entry: Entry, path: string) => void
}) {
  const [selectedId, setSelectedId] = useState<string>()
  const [previewPath, setPreviewPath] = useState<string>()
  const selected = entries.find((entry) => entry.id === selectedId) ?? entries[0]
  const preview = selected?.files.find((file) => file.path === previewPath) ?? selected?.files[0]

  if (!entries.length) return <p className="px-3 py-2 text-xs text-muted-foreground">{empty}</p>

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-1.5 pb-2">
      <ul>
        {entries.map((entry) => (
          <li key={entry.id}>
            <button
              type="button"
              onClick={() => {
                setSelectedId(entry.id)
                setPreviewPath(undefined)
              }}
              className={cn("flex w-full flex-col rounded-sm px-2 py-(--row-py) text-left", entry === selected ? "bg-muted" : "hover:bg-muted/50")}
            >
              <span className="truncate text-sm font-medium">{entry.title}</span>
              <span className="truncate text-xs text-muted-foreground">{entry.meta}</span>
            </button>
          </li>
        ))}
      </ul>
      {selected && (
        <div className="mt-2 flex flex-col gap-2 border-t px-2 pt-2">
          <div className="flex flex-wrap gap-1">
            <Button size="xs" variant="outline" onClick={() => onApply(selected)}>{labels.apply}</Button>
            <Button size="xs" variant="outline" onClick={() => onApplyDrop(selected)}>{labels.applyDrop}</Button>
            <Button size="xs" variant="ghost" className="ml-auto text-red-600 dark:text-red-400" onClick={() => onDrop(selected)}>{labels.drop}</Button>
          </div>
          <ul>
            {selected.files.map((file) => (
              <li key={file.path} className="group/row flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setPreviewPath(file.path)}
                  className={cn("flex min-w-0 flex-1 items-center gap-1.5 rounded-sm px-1 py-0.5 text-left text-xs", file === preview ? "bg-muted" : "hover:bg-muted/50")}
                >
                  <span className={cn("w-3 shrink-0 font-mono", STATUS_TONE[file.status])}>{file.status}</span>
                  <span className="truncate font-mono">{file.path}</span>
                </button>
                {onRestoreFile && (
                  <Button size="xs" variant="ghost" className="opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100" onClick={() => onRestoreFile(selected, file.path)}>
                    Restore
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {preview && <MiniDiff file={preview} />}
        </div>
      )}
      {note && <p className="mt-auto px-2 pt-3 text-xs text-muted-foreground">{note}</p>}
    </div>
  )
}

/** A read-only preview: what applying this entry would put back. */
function MiniDiff({ file }: { file: ChangedFile }) {
  return (
    <div className="max-h-64 overflow-auto rounded-sm bg-muted/40 py-1 font-mono text-xs leading-4">
      {file.hunks.flatMap((part) => part.lines).map((line, index) => (
        <div
          key={index}
          className={cn(
            "px-2 whitespace-pre",
            line.kind === "add" && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
            line.kind === "del" && "bg-red-500/10 text-red-700 dark:text-red-300"
          )}
        >
          {line.kind === "add" ? "+" : line.kind === "del" ? "−" : " "}
          {line.text}
        </div>
      ))}
    </div>
  )
}

/** Names a shelf entry or a stash message before the files leave the worktree. */
export function BundleDialog({
  request,
  draftName,
  onSubmit,
  onClose,
}: {
  request: { mode: BundleMode; paths: string[] } | null
  draftName: string
  onSubmit: (mode: BundleMode, paths: string[], name: string) => void
  onClose: () => void
}) {
  const [name, setName] = useState("")
  if (!request) return null
  const verb = request.mode === "shelf" ? "Shelve" : "Stash"
  const submit = () => {
    onSubmit(request.mode, request.paths, name)
    setName("")
    onClose()
  }
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {verb} {files(request.paths.length)}
          </DialogTitle>
          <DialogDescription>
            {request.mode === "shelf"
              ? "The changes leave this worktree and wait on its shelf, outside the repository."
              : "The changes go into git's stash with git stash push; every worktree of this repository sees it."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && submit()}
            placeholder={request.mode === "shelf" ? "Name (blank for an automatic one)" : "Message (blank for git's default)"}
            aria-label={request.mode === "shelf" ? "Shelf name" : "Stash message"}
          />
          <Button variant="outline" onClick={() => setName(draftName)}>
            <SparklesIcon />
            Draft
          </Button>
        </div>
        <ul className="max-h-32 overflow-y-auto font-mono text-xs text-muted-foreground">
          {request.paths.map((path) => (
            <li key={path} className="truncate">{path}</li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit}>{verb}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
