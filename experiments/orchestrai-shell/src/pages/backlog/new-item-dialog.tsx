import { useState } from "react"
import { WandSparklesIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Kbd } from "@/components/ui/kbd"
import { SOURCES, type ItemSource, type ItemStatus, type Priority, type Size, type WorkItem } from "@/data/backlog"
import { ME } from "@/data/github"
import { findProject, type ProjectId } from "@/lib/projects"
import { cn } from "@/lib/utils"
import { useBacklogStore } from "@/pages/backlog/backlog-store"
import { PRIORITIES, PRIORITY_LABEL, SIZES, SOURCE_LABEL, STATUS_LABEL, STATUSES } from "@/pages/backlog/labels"
import { say } from "@/pages/changes/toast-store"
import { nextNumber } from "@/pages/github/github-store"

function Pick<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string; disabled?: boolean; hint?: string }[]; onChange: (value: T) => void; label: string }) {
  const current = options.find((option) => option.value === value)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="xs" className="text-xs" aria-label={label}>
          {current?.label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuRadioGroup value={value} onValueChange={(next) => onChange(next as T)}>
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
              {option.hint && <span className="ml-auto text-xs text-muted-foreground">{option.hint}</span>}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function nextLocalNumber(project: ProjectId, items: WorkItem[]) {
  const numbers = items.filter((item) => item.source === "local").map((item) => Number(item.number.replace(/\D/g, "")) || 0)
  const next = Math.max(0, ...numbers) + 1
  return project === "orchestrai" ? `ORC-${String(next).padStart(2, "0")}` : `#${next}`
}

/**
 * A work item by hand: local, or written to the project's tracker and
 * mirrored here. A tracker that is not connected stays in the list, disabled,
 * so the option is its own hint.
 */
export function NewItemDialog({ project, items, open, onClose, onCreated }: { project: ProjectId; items: WorkItem[]; open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const create = useBacklogStore((store) => store.create)
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [status, setStatus] = useState<ItemStatus>("todo")
  const [priority, setPriority] = useState<Priority>("none")
  const [size, setSize] = useState<Size>("M")
  const [source, setSource] = useState<ItemSource>("local")
  const [leaving, setLeaving] = useState(false)
  const repo = findProject(project).repo
  const linear = SOURCES[project].linearTeam

  const reset = () => {
    setTitle("")
    setBody("")
    setStatus("todo")
    setPriority("none")
    setSource("local")
    setLeaving(false)
  }
  const close = () => {
    if (title.trim() && !leaving) {
      setLeaving(true)
      return
    }
    reset()
    onClose()
  }
  const submit = () => {
    if (!title.trim()) return
    const github = source === "github"
    const issue = github ? nextNumber(project) : 0
    const number = github ? `#${issue}` : source === "linear" ? "WEB-151" : nextLocalNumber(project, items)
    const item: WorkItem = {
      id: `new-${Date.now()}`,
      project,
      number,
      title: title.trim(),
      body: body.trim(),
      source,
      status: source === "local" ? status : "todo",
      remoteStatus: source === "local" ? undefined : source === "github" ? "Open" : "Todo",
      priority,
      size,
      assignee: source === "local" ? ME : undefined,
      labels: [],
      created: "Just now",
      updated: "Just now",
      age: 0,
      url: github ? `https://github.com/${repo}/issues/${issue}` : undefined,
    }
    create(item)
    say(source === "local" ? `Created ${number} in the backlog` : `Created ${number} in ${SOURCE_LABEL[source]} and mirrored it here`)
    reset()
    onCreated(item.id)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="gap-3 sm:max-w-xl" onKeyDown={(event) => event.key === "Enter" && (event.metaKey || event.ctrlKey) && submit()}>
        <DialogHeader>
          <DialogTitle>New work item</DialogTitle>
          <DialogDescription>
            {source === "local" ? "Saved to this project's backlog in .warpforge/backlog, committed with the repository." : source === "github" ? `Creates an issue in ${repo} and mirrors it here.` : `Creates an issue in ${linear} and mirrors it here.`}
          </DialogDescription>
        </DialogHeader>
        <textarea
          autoFocus
          rows={1}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.metaKey || event.ctrlKey) return
            event.preventDefault()
            if (event.shiftKey) document.getElementById("new-item-body")?.focus()
            else submit()
          }}
          placeholder="What needs to happen?"
          aria-label="Title"
          className="field-sizing-content resize-none bg-transparent text-base font-medium outline-none placeholder:text-muted-foreground/60"
        />
        <textarea
          id="new-item-body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Add a description… (markdown, optional)"
          aria-label="Description"
          className="field-sizing-content max-h-64 min-h-16 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
        />
        <div className="flex flex-wrap items-center gap-1.5">
          <Pick label="Source" value={source} onChange={setSource} options={[
            { value: "local", label: "Local" },
            { value: "github", label: "GitHub", disabled: !SOURCES[project].github, hint: SOURCES[project].github ? undefined : "not connected" },
            { value: "linear", label: "Linear", disabled: !linear, hint: linear ? undefined : "no team mapped" },
          ]} />
          {source === "local" && <Pick label="Status" value={status} onChange={setStatus} options={STATUSES.map((value) => ({ value, label: STATUS_LABEL[value] }))} />}
          <Pick label="Priority" value={priority} onChange={setPriority} options={PRIORITIES.map((value) => ({ value, label: PRIORITY_LABEL[value] }))} />
          <Pick label="Size" value={size} onChange={setSize} options={SIZES.map((value) => ({ value, label: `Size ${value}` }))} />
          <Button
            variant="ghost"
            size="xs"
            className="ml-auto text-xs text-muted-foreground"
            disabled={!title.trim()}
            onClick={() => {
              setTitle(title.trim().replace(/^./, (letter) => letter.toUpperCase()))
              if (!/done when/i.test(body)) setBody(`${body.trim() ? `${body.trim()}\n\n` : ""}**Done when:** `)
            }}
            title="Polish the item with Codex: a clear title and a Done when line"
          >
            <WandSparklesIcon />
            Enhance
          </Button>
        </div>
        <div className={cn("flex items-center gap-2 border-t pt-3", leaving && "text-sm")}>
          {leaving ? (
            <>
              <span className="text-sm text-muted-foreground">Discard this draft? It has not been created yet.</span>
              <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setLeaving(false)}>Keep editing</Button>
              <Button variant="destructive" size="sm" onClick={close}>Discard draft</Button>
            </>
          ) : (
            <>
              <span className="text-xs text-muted-foreground">Enter creates · Shift-Enter moves to the description</span>
              <Button size="sm" className="ml-auto" disabled={!title.trim()} onClick={submit}>
                Create <Kbd className="border-primary-foreground/20 bg-primary-foreground/10 text-primary-foreground">⌘↵</Kbd>
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
