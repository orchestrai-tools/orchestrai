import { daemon } from "@warpforge/daemon";
import type { SessionUpdate, TaskInfo } from "@warpforge/protocol";
import { Checkbox } from "@warpforge/ui/components/checkbox";
import { cn } from "@warpforge/ui/lib/utils";
import { coalesceTailUpdates } from "@warpforge/core/sessionStream";
import { toolDisplayTitle } from "@warpforge/core/toolDisplay";
import { useEffect, useRef } from "react";
import { formatElapsed } from "../../lib/live-line";
import { useShell } from "../../lib/shell-store";
import { useDaemon } from "../../lib/use-daemon";
import { agentName, sessionRows } from "./session-rows";
import { SessionStatusDot, SessionStatusMark } from "./session-status";

const NONE: SessionUpdate[] = [];
const TOOL_STATE = {
  pending: "waiting",
  in_progress: "running",
  completed: "done",
  failed: "failed",
} as const;

function Line({ update, size }: { update: SessionUpdate; size: string }) {
  switch (update.kind) {
    case "user_message":
      return <li className={cn(size, "font-medium whitespace-pre-wrap")}>{update.text}</li>;
    case "agent_text":
      return <li className={cn(size, "leading-relaxed whitespace-pre-wrap")}>{update.text}</li>;
    case "agent_thought":
      return <li className="line-clamp-2 text-xs text-muted-foreground italic">{update.text}</li>;
    case "workflow_event":
      return <li className="text-xs text-muted-foreground">{update.title}</li>;
    case "tool_call": {
      const waiting = Boolean(update.pendingPermission);
      return (
        <li
          className={cn(
            "flex items-center gap-2 rounded-sm px-1.5 py-0.5 font-mono text-xs text-muted-foreground",
            waiting && "bg-amber-500/10 text-foreground",
            update.status === "failed" && "bg-red-500/10 text-foreground",
          )}
        >
          <span className="min-w-0 flex-1 truncate" title={toolDisplayTitle(update)}>
            {toolDisplayTitle(update)}
          </span>
          {waiting ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                useShell.getState().setPage("inbox");
              }}
              className="shrink-0 font-sans underline-offset-2 hover:underline"
            >
              Answer in Inbox
            </button>
          ) : (
            <span
              className={cn(
                "shrink-0 font-sans",
                update.status === "in_progress" && "animate-pulse",
              )}
            >
              {TOOL_STATE[update.status]}
            </span>
          )}
        </li>
      );
    }
    default:
      return null;
  }
}

/**
 * One pinned task in the grid: a mini transcript and its reported status.
 * No controls of its own; the toolbar above the grid acts on the selection.
 */
export function SessionPanel({
  task,
  selected,
  maximized,
  onSelect,
}: {
  task: TaskInfo;
  selected: boolean;
  maximized: boolean;
  onSelect: (additive: boolean) => void;
}) {
  const state = useDaemon();
  const updates = state.sessionUpdates[task.id] ?? NONE;
  const tail = coalesceTailUpdates(updates, 80);
  const row = sessionRows([task], [], state.sessionUpdates)[0];
  const body = useRef<HTMLOListElement>(null);
  const size = maximized ? "text-sm" : "text-xs";
  const empty = updates.length === 0;

  useEffect(() => {
    if (empty) void daemon.loadSessionHistory(task.id).catch(() => undefined);
  }, [task.id, empty]);

  useEffect(() => {
    const element = body.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [tail.length]);

  if (!row) return null;
  return (
    <section
      aria-label={row.title}
      tabIndex={0}
      onClick={(event) => onSelect(event.metaKey || event.ctrlKey || event.shiftKey)}
      className={cn(
        "group/panel flex min-h-0 min-w-0 flex-col rounded-md border bg-background outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected ? "border-foreground/40 ring-1 ring-foreground/15" : "hover:border-foreground/25",
      )}
    >
      <header className="flex items-center gap-2 border-b px-3 py-1.5">
        <Checkbox
          checked={selected}
          onClick={(event) => event.stopPropagation()}
          onCheckedChange={() => onSelect(true)}
          aria-label={`Select ${row.title}`}
          className={cn(
            !selected && "opacity-0 group-hover/panel:opacity-100 focus-visible:opacity-100",
          )}
        />
        <SessionStatusDot status={row.status} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium" title={row.title}>
          {row.title}
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {agentName(state.snapshot.agents, task.agent)} ·{" "}
          {formatElapsed(task.updatedAt, Math.floor(Date.now() / 1000))}
        </span>
      </header>
      <ol ref={body} className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-3 py-2">
        {empty && <li className="text-xs text-muted-foreground">Loading the conversation…</li>}
        {tail.map((update, index) => (
          <Line key={index} update={update} size={size} />
        ))}
        {row.status === "running" && row.activity && (
          <li className="flex items-center gap-2 text-xs text-muted-foreground">
            <span aria-hidden className="inline-block h-3 w-1.5 animate-pulse bg-foreground/60" />
            {row.activity}
          </li>
        )}
      </ol>
      <footer className="flex min-w-0 items-center gap-3 px-3 pb-1.5 text-xs text-muted-foreground">
        <SessionStatusMark status={row.status} />
        <span className="truncate">{row.origin}</span>
        {task.model && <span className="ml-auto shrink-0 truncate">{task.model}</span>}
      </footer>
    </section>
  );
}
