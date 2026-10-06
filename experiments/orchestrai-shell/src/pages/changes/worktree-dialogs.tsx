import { useState } from "react"

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
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { Worktree } from "@/data/worktrees"
import { findProject, type ProjectId } from "@/lib/projects"
import { seedState, useGitStore, type GitState } from "@/pages/changes/git-store"
import { say } from "@/pages/changes/toast-store"

type Start = "branch" | "origin" | "existing" | "pull"

const START_HINT: Record<Start, string> = {
  branch: "A new branch forked from the project's current branch.",
  origin: "A new branch forked from origin's default branch, fetched first.",
  existing: "Checks out a branch as it is. Git allows one checkout per branch.",
  pull: "Checks out a pull request's head, through a remote for a fork.",
}

/** A worktree is a second checkout of the same repository, under .warpforge/worktrees, so parallel work never shares files. */
export function CreateWorktreeDialog({ project, open, onClose, onCreated }: { project: ProjectId; open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const base = findProject(project).branch
  const [start, setStart] = useState<Start>("origin")
  const [branch, setBranch] = useState("")
  const [source, setSource] = useState("")
  const [setup, setSetup] = useState(true)
  const createWorktree = useGitStore((store) => store.createWorktree)
  const name = (start === "existing" ? source : start === "pull" ? `pr-${source.replace(/\D/g, "")}` : branch).trim()
  const valid = /^[\w./-]+$/.test(name) && (start !== "pull" || /\d/.test(source))
  const path = `.warpforge/worktrees/${name.replaceAll("/", "-") || "…"}`

  const create = () => {
    if (!valid) return
    const worktree: Worktree = { id: `${project}-wt-${name}`, project, branch: name, path, dirty: 0, ahead: 0, behind: 0 }
    const state: GitState = { ...seedState(worktree), base, branch: name, size: setup ? "1.4 GB" : "212 MB", lastCommit: { hash: "", message: "" } }
    createWorktree(worktree, state)
    say(`Created ${path}${setup ? " · copied .env* and ran bun install" : ""}`)
    setBranch("")
    setSource("")
    onCreated(worktree.id)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New worktree</DialogTitle>
          <DialogDescription>A second checkout of {findProject(project).repo}, with its own branch and its own files.</DialogDescription>
        </DialogHeader>
        <FieldGroup className="gap-4">
          <Field>
            <FieldLabel>Start from</FieldLabel>
            <ToggleGroup type="single" variant="outline" size="sm" spacing={0} value={start} onValueChange={(next) => next && setStart(next as Start)} className="w-full">
              <ToggleGroupItem value="origin" className="flex-1 text-xs">origin/{base}</ToggleGroupItem>
              <ToggleGroupItem value="branch" className="flex-1 text-xs">{base}</ToggleGroupItem>
              <ToggleGroupItem value="existing" className="flex-1 text-xs">Existing branch</ToggleGroupItem>
              <ToggleGroupItem value="pull" className="flex-1 text-xs">Pull request</ToggleGroupItem>
            </ToggleGroup>
            <FieldDescription className="text-xs">{START_HINT[start]}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="worktree-name">{start === "existing" ? "Branch" : start === "pull" ? "Pull request number" : "New branch"}</FieldLabel>
            <Input
              id="worktree-name"
              autoFocus
              value={start === "existing" || start === "pull" ? source : branch}
              onChange={(event) => (start === "existing" || start === "pull" ? setSource(event.target.value) : setBranch(event.target.value))}
              onKeyDown={(event) => event.key === "Enter" && create()}
              placeholder={start === "pull" ? "#213" : start === "existing" ? "orc-02-upstream-sync" : "spike/jj-probe"}
              className="font-mono"
            />
            <FieldDescription className="font-mono text-xs">{path}</FieldDescription>
          </Field>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={setup} onCheckedChange={(value) => setSetup(value === true)} className="mt-0.5" />
            <span>
              Copy files and run setup from workspace.yaml
              <span className="block text-xs text-muted-foreground">copy: .env* · setup: bun install. The output goes to a setup log.</span>
            </span>
          </label>
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!valid} onClick={create}>Create worktree</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Merges a worktree's branch into its base without touching your own checkout,
 * unless the base is checked out there and clean. A conflict leaves every ref as it was.
 */
export function MergeDialog({ worktree, state, onClose, onMerged }: { worktree: Worktree | null; state?: GitState; onClose: () => void; onMerged: (removed: boolean) => void }) {
  const [remove, setRemove] = useState(true)
  const removeWorktree = useGitStore((store) => store.removeWorktree)
  if (!worktree || !state) return null
  const dirty = state.files.length
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Merge into {state.base}?</DialogTitle>
          <DialogDescription>
            The branch is merged into {state.base}. Your own checkout is touched only when {state.base} is checked out there, and then only if it is clean.
          </DialogDescription>
        </DialogHeader>
        <p className="rounded-md bg-muted/60 px-3 py-2 font-mono text-xs">
          {state.branch} → {state.base} · {state.aheadOfBase} {state.aheadOfBase === 1 ? "commit" : "commits"}
        </p>
        {dirty > 0 ? (
          <p className="text-sm text-red-600 dark:text-red-400">
            Refused: {dirty} uncommitted {dirty === 1 ? "file" : "files"} would be left out. A merge takes commits, not edits; commit or discard them first.
          </p>
        ) : (
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={remove} onCheckedChange={(value) => setRemove(value === true)} />
            Remove the worktree after merging
          </label>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{dirty ? "Close" : "Cancel"}</Button>
          {!dirty && (
            <Button
              disabled={state.aheadOfBase === 0}
              onClick={() => {
                say(`Merged ${state.branch} into ${state.base}${remove ? " and removed the worktree" : ""}`)
                if (remove) removeWorktree(worktree.id)
                else useGitStore.getState().update(worktree.id, () => ({ aheadOfBase: 0 }))
                onMerged(remove)
                onClose()
              }}
            >
              Merge
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** What the workspace.yaml setup printed when the worktree was made. */
export function SetupLogDialog({ worktree, lines, onClose }: { worktree: Worktree | null; lines?: string[]; onClose: () => void }) {
  return (
    <Dialog open={worktree !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Setup log</DialogTitle>
          <DialogDescription className="font-mono text-xs">{worktree?.path}</DialogDescription>
        </DialogHeader>
        <pre className="max-h-96 overflow-auto rounded-md bg-muted/60 p-3 font-mono text-xs leading-5">{(lines ?? []).join("\n")}</pre>
      </DialogContent>
    </Dialog>
  )
}
