import type { SessionUpdate } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import { cn } from "@warpforge/ui/lib/utils";
import { ChevronRightIcon } from "lucide-react";
import { SectionLabel } from "../../components/common/page-toolbar";
import { formatElapsed } from "../../lib/live-line";
import { useDaemon } from "../../lib/use-daemon";
import { ProjectBadge } from "../../shell/project-badge";
import { agentName, nowSec, taskTitle } from "../board/task-facts";
import { TaskMenu } from "../board/task-menu";
import { DecisionActions } from "../inbox/decision-actions";
import { KIND_LABEL, type InboxEntry } from "../inbox/inbox-items";

const NONE: SessionUpdate[] = [];

/**
 * Everything any agent is blocked on, across every project, most urgent first.
 * A permission or question is answered right in the row; opening a row goes to the task.
 */
export function WaitingList({
  items,
  onOpen,
  onOpenInbox,
}: {
  items: InboxEntry[];
  onOpen: (item: InboxEntry) => void;
  onOpenInbox?: () => void;
}) {
  const state = useDaemon();
  const now = nowSec();
  return (
    <section aria-label="Waiting for you" className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <SectionLabel>Waiting for you</SectionLabel>
        <span className="text-xs text-muted-foreground tabular-nums">{items.length}</span>
        {onOpenInbox && (
          <Button
            variant="link"
            size="sm"
            className="ml-auto h-auto p-0 text-xs"
            onClick={onOpenInbox}
          >
            Open Inbox
          </Button>
        )}
      </div>
      <ul className="overflow-hidden rounded-md border bg-background">
        {items.map((item) => (
          <li
            key={item.task.id}
            className="group/row flex items-center gap-2 border-b pr-2 last:border-b-0 hover:bg-muted/60"
          >
            <button
              type="button"
              onClick={() => onOpen(item)}
              className="flex min-w-0 flex-1 items-center gap-3 py-(--row-py) pl-3 text-left text-sm outline-none focus-visible:bg-muted/60"
            >
              <span
                aria-hidden
                className={cn(
                  "size-1.5 shrink-0 rounded-full",
                  item.kind === "blocked" ? "bg-red-500" : "bg-amber-500",
                )}
              />
              <span className="w-20 shrink-0 text-xs text-muted-foreground">
                {KIND_LABEL[item.kind]}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{taskTitle(item.task)}</span>
                <span className="block truncate text-xs text-muted-foreground">{item.reason}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                <ProjectBadge name={item.task.project} className="size-3.5 text-[9px]" />
                {item.task.project}
              </span>
              <span className="w-24 shrink-0 truncate text-xs text-muted-foreground">
                {agentName(state.snapshot.agents, item.task.agent)}
              </span>
              <span className="w-8 shrink-0 text-right text-xs text-muted-foreground">
                {formatElapsed(item.task.updatedAt, now)}
              </span>
            </button>
            <span className="flex shrink-0 items-center gap-1">
              <DecisionActions
                task={item.task}
                updates={state.sessionUpdates[item.task.id] ?? NONE}
                compact
              />
            </span>
            <TaskMenu
              task={item.task}
              onOpen={() => onOpen(item)}
              className="opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100"
            />
            <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground opacity-0 group-hover/row:opacity-100" />
          </li>
        ))}
      </ul>
    </section>
  );
}
