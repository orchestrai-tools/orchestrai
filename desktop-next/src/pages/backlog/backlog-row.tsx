import type { BacklogItem, RunnerEntry } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import { Checkbox } from "@warpforge/ui/components/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@warpforge/ui/components/dropdown-menu";
import { cn } from "@warpforge/ui/lib/utils";
import { ExternalLinkIcon } from "lucide-react";
import { STATUS_LABEL as TASK_STATUS_LABEL, StatusDot, type RunStatus } from "../../components/common/status-mark";
import { openExternalLink } from "../../lib/external-link";
import {
  ago,
  factoryLabel,
  isClosed,
  PRIORITIES,
  priorityLabel,
  priorityTone,
  sourceLabel,
  statusDot,
  statusLabel,
} from "./labels";

export interface LinkedTask {
  id: string;
  status: RunStatus;
  title: string;
}

interface Props {
  item: BacklogItem;
  entry?: RunnerEntry;
  task?: LinkedTask;
  selected: boolean;
  checked: boolean;
  selecting: boolean;
  onSelect: () => void;
  onCheck: (on: boolean) => void;
  onPriority: (priority: string) => void;
  onStart: () => void;
  onOpenTask: (id: string) => void;
}

/** One item on one line, every field after the title at a fixed width so the list reads down its columns. */
export function BacklogRow({
  item,
  entry,
  task,
  selected,
  checked,
  selecting,
  onSelect,
  onCheck,
  onPriority,
  onStart,
  onOpenTask,
}: Props) {
  const closed = isClosed(item.status);
  const stop = (event: { stopPropagation: () => void }) => event.stopPropagation();
  return (
    <div
      role="listitem"
      aria-current={selected || undefined}
      onClick={onSelect}
      className={cn(
        "group/row flex cursor-default items-center gap-3 rounded-sm px-2 py-(--row-py) text-sm",
        selected ? "bg-muted" : "hover:bg-muted/50",
      )}
    >
      <span onClick={stop} className="flex">
        <Checkbox
          aria-label={`Select #${item.number}`}
          checked={checked}
          onCheckedChange={(value) => onCheck(value === true)}
          className={cn(!checked && !selecting && "opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100")}
        />
      </span>
      <span className="w-16 shrink-0 truncate font-mono text-xs text-muted-foreground">#{item.number}</span>
      <span className="flex min-w-0 flex-1 items-baseline gap-2">
        <button
          type="button"
          onClick={onSelect}
          className={cn("truncate text-left", closed ? "text-muted-foreground" : "font-medium")}
          title={item.title}
        >
          {item.title}
        </button>
        {entry && <span className="shrink-0 text-xs text-muted-foreground">{factoryLabel(entry)}</span>}
      </span>
      <span
        className="flex w-24 shrink-0 items-center gap-1.5 text-xs"
        title={item.source === "local" || !item.remoteStatus ? undefined : `${sourceLabel(item.source)}: ${item.remoteStatus}`}
      >
        <span aria-hidden className={cn("size-2 shrink-0 rounded-full", statusDot(item.status))} />
        <span className="truncate text-muted-foreground">{statusLabel(item.status)}</span>
      </span>
      <span className="w-20 shrink-0" onClick={stop}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="xs"
              className={cn("-ml-2 text-xs", priorityTone(item.priority))}
              aria-label={`Priority of #${item.number}: ${priorityLabel(item.priority)}`}
            >
              {item.priority === "none" ? "—" : priorityLabel(item.priority)}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-40">
            <DropdownMenuLabel>Priority</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={item.priority} onValueChange={onPriority}>
              {PRIORITIES.map((priority) => (
                <DropdownMenuRadioItem key={priority} value={priority}>
                  {priorityLabel(priority)}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </span>
      <span className="hidden w-14 shrink-0 truncate text-xs text-muted-foreground @3xl:block">
        {sourceLabel(item.source)}
      </span>
      <span className="hidden w-20 shrink-0 truncate text-xs text-muted-foreground @4xl:block">
        {item.assignee || "Nobody"}
      </span>
      <span className="hidden w-24 shrink-0 @2xl:block" onClick={stop}>
        {task && (
          <button
            type="button"
            onClick={() => onOpenTask(task.id)}
            className="flex max-w-full items-center gap-1.5 text-xs hover:underline"
            title={`${TASK_STATUS_LABEL[task.status]} · ${task.title}`}
          >
            <StatusDot status={task.status} />
            <span className="truncate font-mono">{task.id.slice(0, 8)}</span>
          </button>
        )}
      </span>
      <span className="w-16 shrink-0 text-right text-xs text-muted-foreground">{ago(item.updatedAt)}</span>
      <span
        className="flex w-20 shrink-0 justify-end gap-0.5 opacity-0 group-hover/row:opacity-100 focus-within:opacity-100"
        onClick={stop}
      >
        {task ? (
          <Button variant="ghost" size="xs" onClick={() => onOpenTask(task.id)}>
            Open task
          </Button>
        ) : !closed && !entry ? (
          <Button variant="ghost" size="xs" onClick={onStart}>
            Start…
          </Button>
        ) : null}
        {item.url && (
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Open #${item.number} in ${sourceLabel(item.source)}`}
            onClick={() => void openExternalLink(item.url ?? "")}
          >
            <ExternalLinkIcon />
          </Button>
        )}
      </span>
    </div>
  );
}
