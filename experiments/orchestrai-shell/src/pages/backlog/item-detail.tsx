import { useState, type ReactNode } from "react"
import { ChevronDownIcon, EllipsisIcon, ExternalLinkIcon, XIcon } from "lucide-react"

import { MarkdownPage } from "@/components/common/markdown"
import { StatusMark } from "@/components/common/status-mark"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { FactoryEntry, WorkItem } from "@/data/backlog"
import { ME } from "@/data/github"
import { findTask } from "@/data/tasks"
import { cn } from "@/lib/utils"
import { useBacklogStore, type factoryActions } from "@/pages/backlog/backlog-store"
import type { LinkedTask } from "@/pages/backlog/backlog-row"
import { factoryLabel, PRIORITIES, PRIORITY_LABEL, PRIORITY_TONE, SIZE_HINT, SIZES, SOURCE_LABEL, STATUS_DOT, STATUS_LABEL, STATUSES } from "@/pages/backlog/labels"
import type { ConfirmRequest } from "@/components/common/confirm-dialog"
import { Section } from "@/pages/github/pull-sections"

interface Props {
  item: WorkItem
  entry?: FactoryEntry
  task?: LinkedTask
  hold?: string
  factory: ReturnType<typeof factoryActions>
  onStart: () => void
  onStartInFactory: () => void
  onOpenTask: (id: string) => void
  onConfirm: (request: ConfirmRequest) => void
  copy: (text: string, what: string) => void
  onClose: () => void
}

function Chip<T extends string>({ label, value, options, onChange, children }: { label: string; value: T; options: { value: T; label: string; hint?: string }[]; onChange: (value: T) => void; children: ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="xs" className="text-xs" aria-label={label}>
          {children}
          <ChevronDownIcon className="text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuRadioGroup value={value} onValueChange={(next) => onChange(next as T)}>
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
              {option.hint && <span className="ml-auto text-xs text-muted-foreground">{option.hint}</span>}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * One work item beside the list. Only a local item's words, status and
 * assignee are ours to edit: a tracker owns those for its issues, and a sync
 * would undo the edit. Priority and size are always ours.
 */
export function ItemDetail({ item, entry, task, hold, factory, onStart, onStartInFactory, onOpenTask, onConfirm, copy, onClose }: Props) {
  const patch = useBacklogStore((store) => store.patch)
  const remove = useBacklogStore((store) => store.remove)
  const [title, setTitle] = useState<string | null>(null)
  const [body, setBody] = useState<string | null>(null)
  const local = item.source === "local"
  const full = findTask(task?.id)
  const closed = item.status === "done" || item.status === "cancelled"

  return (
    <aside aria-label={item.number} className="flex h-full min-h-0 flex-col">
      <header className="flex flex-col gap-1.5 border-b px-4 py-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="truncate">
            <span className="font-mono">{item.number}</span> · {SOURCE_LABEL[item.source]} · {item.assignee ?? "Nobody"}
          </span>
          <div className="ml-auto flex shrink-0">
            {item.url && (
              <Button variant="ghost" size="icon-xs" aria-label={`Open in ${SOURCE_LABEL[item.source]}`} asChild>
                <a href={item.url} target="_blank" rel="noreferrer">
                  <ExternalLinkIcon />
                </a>
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-xs" aria-label={`More for ${item.number}`}>
                  <EllipsisIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onSelect={() => copy(item.number, "number")}>Copy {item.number}</DropdownMenuItem>
                {item.url && <DropdownMenuItem onSelect={() => copy(item.url!, "link")}>Copy link</DropdownMenuItem>}
                {local && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() =>
                        onConfirm({
                          title: `Delete ${item.number}?`,
                          description: `“${item.title}” leaves the backlog for good.${item.task ? ` The task ${item.task} keeps running.` : ""}`,
                          items: [`${item.number} ${item.title}`],
                          confirmLabel: "Delete item",
                          destructive: true,
                          onConfirm: () => {
                            remove(item.id)
                            onClose()
                          },
                        })
                      }
                    >
                      Delete item…
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="ghost" size="icon-xs" aria-label="Close the detail" onClick={onClose}>
              <XIcon />
            </Button>
          </div>
        </div>
        {title !== null ? (
          <Input
            autoFocus
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={() => {
              if (title.trim() && title.trim() !== item.title) patch(item.id, { title: title.trim() })
              setTitle(null)
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") setTitle(null)
              if (event.key === "Enter") event.currentTarget.blur()
            }}
            aria-label="Title"
            className="h-7 text-sm font-semibold"
          />
        ) : (
          <h2 className="text-sm leading-snug font-semibold">
            {local ? (
              <button type="button" onClick={() => setTitle(item.title)} className="-mx-1 rounded-sm px-1 text-left hover:bg-muted" title="Rename">
                {item.title}
              </button>
            ) : (
              item.title
            )}
          </h2>
        )}
        <div className="-ml-2 flex flex-wrap items-center gap-0.5">
          {local ? (
            <Chip label="Status" value={item.status} options={STATUSES.map((value) => ({ value, label: STATUS_LABEL[value] }))} onChange={(status) => patch(item.id, { status })}>
              <span aria-hidden className={cn("size-2 rounded-full", STATUS_DOT[item.status])} />
              {STATUS_LABEL[item.status]}
            </Chip>
          ) : (
            <span className="flex h-6 items-center gap-1.5 px-2 text-xs" title={`${SOURCE_LABEL[item.source]} owns this status; Orchestrai reads it and never writes it back`}>
              <span aria-hidden className={cn("size-2 rounded-full", STATUS_DOT[item.status])} />
              {item.remoteStatus}
            </span>
          )}
          <Chip label="Priority" value={item.priority} options={PRIORITIES.map((value) => ({ value, label: PRIORITY_LABEL[value] }))} onChange={(priority) => patch(item.id, { priority })}>
            <span className={PRIORITY_TONE[item.priority]}>{PRIORITY_LABEL[item.priority]}</span>
          </Chip>
          <Chip label="Size" value={item.size ?? "M"} options={SIZES.map((value) => ({ value, label: value, hint: SIZE_HINT[value] }))} onChange={(size) => patch(item.id, { size })}>
            Size {item.size ?? "—"}
          </Chip>
          {local ? (
            <Chip label="Assignee" value={item.assignee ?? "nobody"} options={[{ value: ME, label: ME, hint: "you" }, { value: "nobody", label: "Nobody" }]} onChange={(next) => patch(item.id, { assignee: next === "nobody" ? undefined : next })}>
              {item.assignee ?? "Nobody"}
            </Chip>
          ) : (
            <span className="px-2 text-xs text-muted-foreground">{item.assignee ?? "Nobody"}</span>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 py-3">
        {entry && (
          <Section title="Factory" aside={factoryLabel(entry)}>
            {entry.state === "queued" && (
              <>
                <p className="text-xs text-muted-foreground">{entry.wait ? `Waiting: ${entry.wait}.` : hold ? `Waiting: ${hold}.` : "Next in line."}</p>
                <div className="flex gap-1.5">
                  <Button size="xs" variant="outline" onClick={() => factory.startNow(entry, item)} title="Starts past slots, open PRs, the daily cap, disk and headroom; never past a signed-out or exhausted account">
                    Start now
                  </Button>
                  <Button size="xs" variant="ghost" onClick={() => factory.dequeue(entry, item)}>Remove from queue</Button>
                </div>
              </>
            )}
            {entry.state === "delivered" && <p className="text-xs text-muted-foreground">Delivered as draft PR #{entry.pr}. Merging it marks this item done; closing it sends the item back to To do.</p>}
            {entry.state === "running" && <p className="text-xs text-muted-foreground">Running {entry.task}. It commits and opens a draft PR when the workflow succeeds.</p>}
          </Section>
        )}
        {task && (
          <Section title="Task">
            <button type="button" onClick={() => onOpenTask(task.id)} className="flex min-w-0 items-center gap-2 text-left text-xs hover:underline">
              <StatusMark status={task.status} />
              <span className="font-mono">{task.id}</span>
              <span className="truncate text-muted-foreground">{full ? `${full.changes.files} files · ${full.updated}` : "Waiting for a free worker"}</span>
            </button>
          </Section>
        )}
        {item.labels.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {item.labels.map((label) => (
              <span key={label} className="rounded-sm border px-1.5 text-xs text-muted-foreground">{label}</span>
            ))}
          </div>
        )}
        <Section title="Description" aside={local && body === null ? <Button variant="ghost" size="xs" onClick={() => setBody(item.body)}>Edit</Button> : undefined}>
          {body !== null ? (
            <div className="flex flex-col gap-1.5">
              <Textarea
                autoFocus
                value={body}
                onChange={(event) => setBody(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setBody(null)
                  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                    patch(item.id, { body })
                    setBody(null)
                  }
                }}
                aria-label="Description"
                className="min-h-48 font-mono text-xs"
              />
              <div className="flex justify-end gap-1.5">
                <Button variant="ghost" size="xs" onClick={() => setBody(null)}>Cancel</Button>
                <Button
                  size="xs"
                  onClick={() => {
                    patch(item.id, { body })
                    setBody(null)
                  }}
                >
                  Save ⌘↵
                </Button>
              </div>
            </div>
          ) : item.body ? (
            <MarkdownPage markdown={item.body} />
          ) : (
            <p className="text-xs text-muted-foreground">{local ? "No description yet." : "No description in the tracker."}</p>
          )}
        </Section>
      </div>

      <footer className="flex items-center gap-3 border-t px-4 py-2.5">
        <span className="text-xs text-muted-foreground">Created {item.created} · updated {item.updated}</span>
        <div className="ml-auto flex gap-1.5">
          {!closed && !entry && !task && <Button size="xs" variant="outline" onClick={onStartInFactory} title="A workflow makes the change, commits, and opens a draft PR">Start in Factory…</Button>}
          {task ? <Button size="xs" onClick={() => onOpenTask(task.id)}>Open task</Button> : !closed && !entry && <Button size="xs" onClick={onStart}>Start task…</Button>}
        </div>
      </footer>
    </aside>
  )
}
