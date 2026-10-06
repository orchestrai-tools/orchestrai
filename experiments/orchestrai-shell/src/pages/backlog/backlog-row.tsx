import { ExternalLinkIcon } from "lucide-react"

import { STATUS_LABEL as TASK_STATUS_LABEL, StatusDot } from "@/components/common/status-mark"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { FactoryEntry, Priority, WorkItem } from "@/data/backlog"
import type { RunStatus } from "@/data/tasks"
import { cn } from "@/lib/utils"
import { factoryLabel, PRIORITIES, PRIORITY_LABEL, PRIORITY_TONE, SOURCE_LABEL, STATUS_DOT, STATUS_LABEL } from "@/pages/backlog/labels"

export interface LinkedTask {
  id: string
  status: RunStatus
  title: string
}

interface Props {
  item: WorkItem
  entry?: FactoryEntry
  task?: LinkedTask
  selected: boolean
  checked: boolean
  selecting: boolean
  onSelect: () => void
  onCheck: (on: boolean) => void
  onPriority: (priority: Priority) => void
  onStart: () => void
  onOpenTask: (id: string) => void
}

/** One item on one line, every field after the title at a fixed width so the list reads down its columns. */
export function BacklogRow({ item, entry, task, selected, checked, selecting, onSelect, onCheck, onPriority, onStart, onOpenTask }: Props) {
  const closed = item.status === "done" || item.status === "cancelled"
  return (
    <div role="listitem" aria-current={selected || undefined} onClick={onSelect} className={cn("group/row flex cursor-default items-center gap-3 rounded-sm px-2 py-(--row-py) text-sm", selected ? "bg-muted" : "hover:bg-muted/50")}>
      <span onClick={(event) => event.stopPropagation()} className="flex">
        <Checkbox
          aria-label={`Select ${item.number}`}
          checked={checked}
          onCheckedChange={(value) => onCheck(value === true)}
          className={cn(!checked && !selecting && "opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100")}
        />
      </span>
      <span className="w-16 shrink-0 truncate font-mono text-xs text-muted-foreground">{item.number}</span>
      <span className="flex min-w-0 flex-1 items-baseline gap-2">
        <button type="button" onClick={onSelect} className={cn("truncate text-left", closed ? "text-muted-foreground" : "font-medium")} title={item.title}>
          {item.title}
        </button>
        {entry && <span className="shrink-0 text-xs text-muted-foreground">{factoryLabel(entry)}</span>}
      </span>
      <span className="flex w-24 shrink-0 items-center gap-1.5 text-xs" title={item.source === "local" ? undefined : `${SOURCE_LABEL[item.source]}: ${item.remoteStatus}`}>
        <span aria-hidden className={cn("size-2 shrink-0 rounded-full", STATUS_DOT[item.status])} />
        <span className="truncate text-muted-foreground">{STATUS_LABEL[item.status]}</span>
      </span>
      <span className="w-20 shrink-0" onClick={(event) => event.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="xs" className={cn("-ml-2 text-xs", PRIORITY_TONE[item.priority])} aria-label={`Priority of ${item.number}: ${PRIORITY_LABEL[item.priority]}`}>
              {item.priority === "none" ? "—" : PRIORITY_LABEL[item.priority]}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-40">
            <DropdownMenuLabel>Priority</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={item.priority} onValueChange={(next) => onPriority(next as Priority)}>
              {PRIORITIES.map((priority) => (
                <DropdownMenuRadioItem key={priority} value={priority}>
                  {PRIORITY_LABEL[priority]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </span>
      <span className="w-5 shrink-0 text-center font-mono text-xs text-muted-foreground">{item.size ?? "—"}</span>
      <span className="hidden w-14 shrink-0 truncate text-xs text-muted-foreground @3xl:block">{SOURCE_LABEL[item.source]}</span>
      <span className="hidden w-20 shrink-0 truncate text-xs text-muted-foreground @4xl:block">{item.assignee ?? "Nobody"}</span>
      <span className="hidden w-24 shrink-0 @2xl:block" onClick={(event) => event.stopPropagation()}>
        {task && (
          <button type="button" onClick={() => onOpenTask(task.id)} className="flex items-center gap-1.5 text-xs hover:underline" title={`${TASK_STATUS_LABEL[task.status]} · ${task.title}`}>
            <StatusDot status={task.status} />
            <span className="truncate font-mono">{task.id}</span>
          </button>
        )}
      </span>
      <span className="w-16 shrink-0 text-right text-xs text-muted-foreground">{item.updated}</span>
      <span className="flex w-20 shrink-0 justify-end gap-0.5 opacity-0 group-hover/row:opacity-100 focus-within:opacity-100" onClick={(event) => event.stopPropagation()}>
        {task ? (
          <Button variant="ghost" size="xs" onClick={() => onOpenTask(task.id)}>Open task</Button>
        ) : !closed && !entry ? (
          <Button variant="ghost" size="xs" onClick={onStart}>Start…</Button>
        ) : null}
        {item.url && (
          <Button variant="ghost" size="icon-xs" aria-label={`Open ${item.number} in ${SOURCE_LABEL[item.source]}`} asChild>
            <a href={item.url} target="_blank" rel="noreferrer">
              <ExternalLinkIcon />
            </a>
          </Button>
        )}
      </span>
    </div>
  )
}
