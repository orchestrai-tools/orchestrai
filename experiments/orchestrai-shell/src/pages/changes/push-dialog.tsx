import { useState } from "react"
import { ChevronDownIcon, SparklesIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ME, type PullRequest } from "@/data/github"
import type { Task } from "@/data/tasks"
import type { ProjectId } from "@/lib/projects"
import { cn } from "@/lib/utils"
import type { GitActions, GitState } from "@/pages/changes/git-store"
import { STATUS_TONE } from "@/pages/changes/tree"
import { nextNumber, useGithubStore } from "@/pages/github/github-store"

interface Props {
  mode: "push" | "pr" | null
  onClose: () => void
  project: ProjectId
  state: GitState
  task?: Task
  /** The pull request already open for this branch, if any: a second one is never created. */
  existing?: PullRequest
  actions: GitActions
  onForcePush: () => void
  onOpenPull: (number: number) => void
}

/** Push previews exactly what leaves: the outgoing commits and their files, before anything goes over the network. */
export function PushDialog({ mode, onClose, project, state, task, existing, actions, onForcePush, onOpenPull }: Props) {
  const [view, setView] = useState<"push" | "pr">("push")
  const [selectedHash, setSelectedHash] = useState<string>()
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [base, setBase] = useState("")
  const [draft, setDraft] = useState(true)
  const [opened, setOpened] = useState<typeof mode>(null)
  const addPull = useGithubStore((store) => store.addPull)

  if (mode !== opened) {
    setOpened(mode)
    if (mode) {
      setView(mode)
      setSelectedHash(state.outgoing[0]?.hash)
      setTitle(state.outgoing.length === 1 ? state.outgoing[0].subject : (task?.title ?? state.branch))
      setBody("")
      setBase(state.base ?? "main")
    }
  }

  const upstream = state.upstream ?? `origin/${state.branch}`
  const selected = state.outgoing.find((commit) => commit.hash === selectedHash) ?? state.outgoing[0]
  const needsPush = !state.upstream || state.outgoing.length > 0
  const canPush = state.outgoing.length > 0 && !state.diverged

  const draftText = () => {
    const ticket = task && /^orc-\d+$/.test(task.id) ? `Backlog: ${task.id.toUpperCase()}\n\n` : ""
    setTitle(task?.title ?? state.outgoing[0]?.subject ?? state.branch)
    setBody(`${ticket}## Summary\n${task ? `${task.summary}.` : "What changed and why."}\n\n## Commits\n${state.outgoing.map((commit) => `- ${commit.subject}`).join("\n") || "- (already pushed)"}\n\n## Verification\n- [ ] CI`)
  }

  const openPr = () => {
    if (needsPush) actions.push(false)
    const number = nextNumber(project)
    const files = new Set(state.outgoing.flatMap((commit) => commit.files.map((entry) => entry.path)))
    addPull({
      project,
      number,
      title: title.trim(),
      author: ME,
      agent: task?.agent,
      task: task?.id,
      state: draft ? "draft" : "open",
      checks: "pending",
      review: draft ? "none" : "review-required",
      reviewers: [],
      branch: state.branch,
      base: base.trim() || "main",
      labels: [],
      additions: task?.changes.additions ?? 0,
      deletions: task?.changes.deletions ?? 0,
      files: task?.changes.files ?? files.size,
      comments: 0,
      unresolved: 0,
      updated: "Just now",
      age: 0,
      body,
      unseen: false,
    })
    onClose()
    onOpenPull(number)
  }

  return (
    <Dialog open={mode !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="gap-0 p-0 sm:max-w-3xl">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle>{view === "push" ? `Push ${state.branch}` : "Open a pull request"}</DialogTitle>
          <DialogDescription className="font-mono text-xs">
            {state.branch} → {view === "push" ? upstream : base || "main"}
            {!state.upstream && view === "push" && <span className="font-sans"> · created by this push</span>}
          </DialogDescription>
        </DialogHeader>

        {view === "push" ? (
          <div className="grid h-80 grid-cols-2">
            <div className="min-h-0 overflow-y-auto border-r p-2">
              {state.outgoing.length === 0 && (
                <p className="p-3 text-sm text-muted-foreground">
                  {state.diverged ? "The amended commit rewrote history the upstream already has." : `Nothing to push. ${state.branch} is up to date with ${upstream}.`}
                </p>
              )}
              {state.outgoing.map((commit) => (
                <button
                  key={commit.hash}
                  type="button"
                  onClick={() => setSelectedHash(commit.hash)}
                  className={cn("flex w-full flex-col rounded-md px-3 py-(--row-py) text-left", commit === selected ? "bg-muted" : "hover:bg-muted/50")}
                >
                  <span className="truncate text-sm">{commit.subject}</span>
                  <span className="text-xs text-muted-foreground">
                    <span className="font-mono">{commit.hash}</span> · {commit.author} · {commit.time} · {commit.files.length} {commit.files.length === 1 ? "file" : "files"}
                  </span>
                </button>
              ))}
            </div>
            <ul className="min-h-0 overflow-y-auto p-3">
              {selected?.files.map((entry) => (
                <li key={entry.path} className="flex items-center gap-2 py-0.5 text-xs">
                  <span className={cn("w-3 font-mono", STATUS_TONE[entry.status])}>{entry.status}</span>
                  <span className="truncate font-mono">{entry.path}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <FieldGroup className="gap-4 px-5 py-4">
            {existing ? (
              <p className="text-sm text-muted-foreground">
                Pull request #{existing.number} is already open for {state.branch}. Pushing updates it; a second one is never created.
              </p>
            ) : (
              <>
                <Field>
                  <FieldLabel htmlFor="pr-title">Title</FieldLabel>
                  <Input id="pr-title" value={title} onChange={(event) => setTitle(event.target.value)} />
                </Field>
                <Field>
                  <div className="flex items-center">
                    <FieldLabel htmlFor="pr-body">Description</FieldLabel>
                    <Button variant="ghost" size="xs" className="ml-auto text-muted-foreground" onClick={draftText}>
                      <SparklesIcon />
                      Draft from the commits
                    </Button>
                  </div>
                  <Textarea id="pr-body" value={body} onChange={(event) => setBody(event.target.value)} placeholder="Markdown. Closes #N links an issue." className="h-36 font-mono text-xs" />
                </Field>
                <div className="flex items-end gap-4">
                  <Field className="max-w-48">
                    <FieldLabel htmlFor="pr-base">Base branch</FieldLabel>
                    <Input id="pr-base" value={base} onChange={(event) => setBase(event.target.value)} className="font-mono" />
                  </Field>
                  <label className="flex h-8 items-center gap-2 text-sm">
                    <Checkbox checked={draft} onCheckedChange={(value) => setDraft(value === true)} />
                    Open as a draft
                  </label>
                </div>
              </>
            )}
          </FieldGroup>
        )}

        <DialogFooter className="items-center border-t px-5 py-3 sm:justify-start">
          {view === "push" ? (
            <>
              <p className="text-xs text-muted-foreground">
                {state.diverged
                  ? "A plain push is refused. Force push with lease replaces the upstream unless someone pushed since your last fetch."
                  : !state.upstream && state.outgoing.length
                    ? `The first push creates ${upstream}.`
                    : state.outgoing.length
                      ? `${state.outgoing.length} outgoing ${state.outgoing.length === 1 ? "commit" : "commits"}`
                      : ""}
              </p>
              <div className="ml-auto flex gap-2">
                <Button variant="outline" onClick={onClose}>Cancel</Button>
                <Button variant="secondary" onClick={() => (existing ? onOpenPull(existing.number) : setView("pr"))}>
                  {existing ? `Open #${existing.number}` : "Create pull request…"}
                </Button>
                <div className="flex">
                  <Button
                    className="rounded-r-none"
                    disabled={!canPush}
                    onClick={() => {
                      actions.push(false)
                      onClose()
                    }}
                  >
                    Push
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button className="rounded-l-none border-l border-primary-foreground/20 px-1.5" aria-label="Push options" disabled={!state.outgoing.length && !state.diverged}>
                        <ChevronDownIcon />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-60">
                      <DropdownMenuItem onSelect={onForcePush} className="flex-col items-start gap-0">
                        Force push with lease…
                        <span className="text-xs text-muted-foreground">Refuses if the upstream moved since your last fetch</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setView("push")}>Back</Button>
              <div className="ml-auto flex gap-2">
                <Button variant="outline" onClick={onClose}>Cancel</Button>
                {existing ? (
                  <Button onClick={() => onOpenPull(existing.number)}>Open #{existing.number}</Button>
                ) : (
                  <Button disabled={!title.trim()} onClick={openPr}>
                    {needsPush ? "Push and open" : "Open"} {draft ? "draft pull request" : "pull request"}
                  </Button>
                )}
              </div>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
