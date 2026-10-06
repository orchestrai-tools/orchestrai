import { Button } from "@warpforge/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@warpforge/ui/components/dropdown-menu";
import { ToggleGroup, ToggleGroupItem } from "@warpforge/ui/components/toggle-group";
import { cn } from "@warpforge/ui/lib/utils";
import { ChevronDownIcon, EllipsisIcon } from "lucide-react";
import { useState } from "react";
import { formatElapsed } from "../../lib/live-line";
import { listedAgents, showOrigin, type SessionOrigin } from "../../lib/session-filter";
import { useDaemon } from "../../lib/use-daemon";
import { ListSkeletonRows } from "../github/list-controls";
import { agentName, type SessionRow } from "./session-rows";
import { SessionStatusMark } from "./session-status";

export interface SessionActions {
  onOpen: (row: SessionRow) => void;
  onContinue: (row: SessionRow) => void;
  onFork: (row: SessionRow) => void;
  onStop: (row: SessionRow) => void;
  onTogglePin: (row: SessionRow) => void;
  onCopyId: (row: SessionRow) => void;
  onHide: (row: SessionRow, hide: boolean) => void;
  isPinned: (row: SessionRow) => boolean;
}

const COLUMNS =
  "grid grid-cols-[minmax(15rem,1fr)_9rem_minmax(8rem,12rem)_4.5rem_4rem_9.5rem] items-center gap-3";

function AgentFilter({
  present,
  value,
  onChange,
}: {
  present: string[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const agents = useDaemon().snapshot.agents;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="xs" className="text-muted-foreground">
          {value.length === 0 ? "All agents" : value.map((id) => agentName(agents, id)).join(", ")}
          <ChevronDownIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-48">
        {present.map((id) => (
          <DropdownMenuCheckboxItem
            key={id}
            checked={value.includes(id)}
            onSelect={(event) => event.preventDefault()}
            onCheckedChange={(checked) =>
              onChange(checked ? [...value, id] : value.filter((entry) => entry !== id))
            }
          >
            {agentName(agents, id)}
          </DropdownMenuCheckboxItem>
        ))}
        {value.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onChange([])}>Show all agents</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function RowMenu({
  row,
  hidden,
  actions,
}: {
  row: SessionRow;
  hidden: boolean;
  actions: SessionActions;
}) {
  const pinned = row.task ? actions.isPinned(row) : false;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`More for ${row.title}`}
          className="opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
        >
          <EllipsisIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onSelect={() => actions.onOpen(row)}>
          {row.task ? "Open the task" : "Continue here…"}
        </DropdownMenuItem>
        {row.task && (
          <DropdownMenuItem onSelect={() => actions.onTogglePin(row)}>
            {pinned ? "Remove from the grid" : "Add to the grid"}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => actions.onCopyId(row)}>Copy session id</DropdownMenuItem>
        {row.task?.status === "running" && (
          <DropdownMenuItem onSelect={() => actions.onStop(row)}>Stop the turn</DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => actions.onHide(row, !hidden)}>
          {hidden ? "Show in this list again" : "Hide from this list"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Row({
  row,
  hidden,
  selected,
  now,
  actions,
}: {
  row: SessionRow;
  hidden: boolean;
  selected: boolean;
  now: number;
  actions: SessionActions;
}) {
  const agents = useDaemon().snapshot.agents;
  const open = () => actions.onOpen(row);
  return (
    <div
      role="row"
      onClick={open}
      className={cn(
        COLUMNS,
        "group/row cursor-default border-b px-3 py-(--row-py) last:border-b-0 hover:bg-muted/60",
        selected && "bg-muted",
        hidden && "opacity-60",
      )}
    >
      <div role="cell" className="min-w-0">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            open();
          }}
          className="block w-full truncate text-left font-medium outline-none focus-visible:underline"
        >
          {row.title}
        </button>
        <span className="block truncate text-xs text-muted-foreground">
          {row.origin} · {row.source}
        </span>
      </div>
      <div role="cell" className="min-w-0 text-xs">
        <span className="block truncate">{agentName(agents, row.agent)}</span>
        {row.task?.model && (
          <span className="block truncate text-muted-foreground">{row.task.model}</span>
        )}
      </div>
      <div role="cell" className="min-w-0">
        <SessionStatusMark status={row.status} />
        {row.activity && (
          <span className="block truncate text-xs text-muted-foreground" title={row.activity}>
            {row.activity}
          </span>
        )}
      </div>
      <div
        role="cell"
        className="text-right text-xs tabular-nums"
        title={row.messages === null ? "Counted once the conversation is opened" : undefined}
      >
        {row.messages ?? "—"}
      </div>
      <div role="cell" className="text-right text-xs text-muted-foreground">
        {row.updatedAt > 0 ? formatElapsed(row.updatedAt, now) : "—"}
      </div>
      <div
        role="cell"
        className="flex items-center justify-end gap-1"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex gap-1 opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100">
          {row.external && (
            <Button size="xs" variant="outline" onClick={() => actions.onContinue(row)}>
              Continue
            </Button>
          )}
          {row.task && row.task.status !== "queued" && (
            <Button size="xs" variant="outline" onClick={() => actions.onFork(row)}>
              Fork
            </Button>
          )}
        </div>
        <RowMenu row={row} hidden={hidden} actions={actions} />
      </div>
    </div>
  );
}

function Group(props: {
  label: string;
  rows: SessionRow[];
  hidden: readonly string[];
  selectedId?: string;
  now: number;
  actions: SessionActions;
}) {
  if (props.rows.length === 0) return null;
  return (
    <div role="rowgroup">
      <div
        role="row"
        className="flex items-baseline gap-2 border-b px-3 pt-3 pb-1.5 text-xs font-medium"
      >
        {props.label}
        <span className="font-normal text-muted-foreground tabular-nums">{props.rows.length}</span>
      </div>
      {props.rows.map((row) => (
        <Row
          key={row.id}
          row={row}
          hidden={props.hidden.includes(row.id)}
          selected={row.id === props.selectedId}
          now={props.now}
          actions={props.actions}
        />
      ))}
    </div>
  );
}

/** Every session in the project, live ones first, each group newest first. */
export function SessionList({
  rows,
  hidden,
  loading,
  selectedId,
  notice,
  actions,
}: {
  rows: SessionRow[];
  hidden: readonly string[];
  loading: boolean;
  selectedId?: string;
  notice?: string;
  actions: SessionActions;
}) {
  const [origin, setOrigin] = useState<SessionOrigin>("all");
  const [agents, setAgents] = useState<string[]>([]);
  const [showHidden, setShowHidden] = useState(false);
  const now = Math.floor(Date.now() / 1000);
  const hiddenCount = rows.filter((row) => hidden.includes(row.id)).length;
  const shown = rows.filter(
    (row) =>
      showOrigin(origin, row.outside ? "outside" : "here") &&
      (agents.length === 0 || agents.includes(row.agent)) &&
      (showHidden || !hidden.includes(row.id)),
  );
  const groups = { hidden, selectedId, now, actions };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup
          type="single"
          size="sm"
          spacing={1}
          value={origin}
          onValueChange={(next) => next && setOrigin(next as SessionOrigin)}
          aria-label="Where the session started"
        >
          <ToggleGroupItem value="all" className="h-6 px-2 text-xs">
            All
          </ToggleGroupItem>
          <ToggleGroupItem value="here" className="h-6 px-2 text-xs">
            Started here
          </ToggleGroupItem>
          <ToggleGroupItem value="outside" className="h-6 px-2 text-xs">
            Outside the app
          </ToggleGroupItem>
        </ToggleGroup>
        <AgentFilter
          present={listedAgents(rows.map((row) => row.agent))}
          value={agents}
          onChange={setAgents}
        />
        {hiddenCount > 0 && (
          <Button
            variant="ghost"
            size="xs"
            className="text-muted-foreground"
            onClick={() => setShowHidden((value) => !value)}
          >
            {showHidden ? "Hide them again" : `Show hidden (${hiddenCount})`}
          </Button>
        )}
        {notice && (
          <p role="status" className="ml-auto truncate text-xs text-muted-foreground">
            {notice}
          </p>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <div
          role="table"
          aria-label="Sessions"
          className="min-w-[56rem] rounded-md border bg-background text-sm"
        >
          <div
            role="row"
            className={cn(COLUMNS, "border-b px-3 py-2 text-xs text-muted-foreground")}
          >
            <span role="columnheader">Session</span>
            <span role="columnheader">Agent</span>
            <span role="columnheader">Status</span>
            <span role="columnheader" className="text-right">
              Messages
            </span>
            <span role="columnheader" className="text-right">
              Updated
            </span>
            <span role="columnheader" className="sr-only">
              Actions
            </span>
          </div>
          <Group label="Live" rows={shown.filter((row) => row.live)} {...groups} />
          <Group label="Idle and finished" rows={shown.filter((row) => !row.live)} {...groups} />
          {loading && rows.length === 0 && <ListSkeletonRows label="Loading sessions" />}
          {!loading && shown.length === 0 && (
            <p className="px-3 py-8 text-center text-xs text-muted-foreground">
              {rows.length === 0
                ? "No sessions in this project yet."
                : "No sessions match these filters."}
            </p>
          )}
        </div>
      </div>
    </>
  );
}
