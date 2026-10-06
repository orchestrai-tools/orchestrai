import { daemon } from "@warpforge/daemon";
import type { TaskInfo } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@warpforge/ui/components/dropdown-menu";
import { Input } from "@warpforge/ui/components/input";
import { Kbd } from "@warpforge/ui/components/kbd";
import { cn } from "@warpforge/ui/lib/utils";
import { useState, type FormEvent, type KeyboardEvent } from "react";
import { pinnedRoots } from "../../lib/pin-group";
import { useShell } from "../../lib/shell-store";
import { useDaemon } from "../../lib/use-daemon";
import { SessionPanel } from "./session-panel";
import { agentName, type SessionRow } from "./session-rows";
import { SessionStatusDot } from "./session-status";
import { useSessionsLayout, type GridLayout } from "./sessions-store";

const GRID: Record<GridLayout, string> = {
  "1": "grid-cols-1 grid-rows-1",
  "2": "grid-cols-2 grid-rows-1",
  "4": "grid-cols-2 grid-rows-2",
};

function EmptyPanel({
  candidates,
  onPick,
}: {
  candidates: SessionRow[];
  onPick: (task: TaskInfo) => void;
}) {
  return (
    <div className="flex min-h-0 flex-col items-center justify-center gap-2 rounded-md border border-dashed text-xs text-muted-foreground">
      <span>Empty panel</span>
      {candidates.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="xs">
              Show a session
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-80">
            {candidates.map((row) => (
              <DropdownMenuItem key={row.id} onSelect={() => row.task && onPick(row.task)}>
                <SessionStatusDot status={row.status} />
                <span className="min-w-0 flex-1 truncate">{row.title}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <span>Every task is already on the grid.</span>
      )}
    </div>
  );
}

/** Daintree's fleet broadcast: one prompt to every selected panel, from a single input bar. */
function BroadcastBar({ targets }: { targets: TaskInfo[] }) {
  const agents = useDaemon().snapshot.agents;
  const [text, setText] = useState("");
  const [result, setResult] = useState<string>();
  const count = targets.length;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const body = text.trim();
    if (!body || count === 0) return;
    setText("");
    const sent = await Promise.allSettled(
      targets.map((task) =>
        daemon.request("session.prompt", { task_id: task.id, text: body, attachments: [] }),
      ),
    );
    const failed = sent.filter((entry) => entry.status === "rejected").length;
    const queued = targets.filter((task) => task.status === "running").length;
    setResult(
      [
        `Sent to ${count - failed}`,
        queued ? `${queued} queued behind a running turn` : "",
        failed ? `${failed} refused it` : "",
      ]
        .filter(Boolean)
        .join(" · "),
    );
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <Input
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setResult(undefined);
          }}
          disabled={count === 0}
          aria-label="Message the selected sessions"
          placeholder={
            count === 0
              ? "Select panels to message them together"
              : count === 1
                ? "Message the selected session"
                : `Message ${count} selected sessions at once`
          }
        />
        <Button type="submit" size="sm" disabled={!text.trim() || count === 0}>
          {count > 1 ? `Send to ${count}` : "Send"}
        </Button>
      </div>
      <p role="status" className="truncate text-xs text-muted-foreground">
        {result ??
          (count > 0
            ? `To ${targets.map((task) => `${agentName(agents, task.agent)} · ${task.title || task.prompt}`).join(", ")}`
            : "Each agent keeps its own prompt, slash commands, and history. This only sends the same message to several at once.")}
      </p>
    </form>
  );
}

/**
 * The pinned tasks as a panel wall (Daintree): preset layouts, one toolbar
 * acting on the selected panels, maximize and return.
 */
export function SessionGrid({
  rows,
  notice,
  maximized,
  onMaximize,
  onOpen,
  onFork,
}: {
  rows: SessionRow[];
  notice?: string;
  maximized: string | null;
  onMaximize: (id: string | null) => void;
  onOpen: (row: SessionRow) => void;
  onFork: (row: SessionRow) => void;
}) {
  const tasks = rows.flatMap((row) => (row.task ? [row.task] : []));
  const pins = useShell((state) => state.pinned);
  const togglePin = useShell((state) => state.togglePin);
  const layout = useSessionsLayout((state) => state.layout);
  const pinned = pinnedRoots(tasks, pins);
  const [selected, setSelected] = useState<string[]>(() =>
    maximized ? [maximized] : pinned.slice(0, 1).map((task) => task.id),
  );

  const byId = new Map(tasks.map((task) => [task.id, task]));
  const slots = maximized
    ? [byId.get(maximized)]
    : Array.from({ length: Number(layout) }, (_, index) => pinned[index]);
  const visible = slots.filter((task): task is TaskInfo => task !== undefined);
  const chosen = visible.filter((task) => selected.includes(task.id));
  const single = chosen.length === 1 ? chosen[0] : undefined;
  const singleRow = single ? rows.find((row) => row.id === single.id) : undefined;
  const candidates = rows.filter((row) => row.task && !pinned.some((task) => task.id === row.id));

  const choose = (id: string, additive: boolean) =>
    setSelected((current) =>
      additive
        ? current.includes(id)
          ? current.filter((entry) => entry !== id)
          : [...current, id]
        : [id],
    );
  const toggleMaximize = () => {
    if (maximized) onMaximize(null);
    else if (single) onMaximize(single.id);
  };
  const remove = () => {
    for (const task of chosen) togglePin(task.id, tasks);
    if (maximized && chosen.some((task) => task.id === maximized)) onMaximize(null);
    setSelected([]);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" && event.altKey) {
      event.preventDefault();
      toggleMaximize();
    } else if (event.key === "Escape" && maximized) {
      onMaximize(null);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2" onKeyDown={onKeyDown}>
      <div
        role="toolbar"
        aria-label="Selected panels"
        className="flex min-h-7 flex-wrap items-center gap-1"
      >
        <span className="mr-2 max-w-[40%] min-w-0 truncate text-xs text-muted-foreground">
          {singleRow
            ? singleRow.title
            : chosen.length > 1
              ? `${chosen.length} panels selected`
              : "Select a panel. ⌘-click to add more."}
        </span>
        <Button
          size="xs"
          variant="ghost"
          disabled={!singleRow}
          onClick={() => singleRow && onOpen(singleRow)}
        >
          Open
        </Button>
        <Button size="xs" variant="ghost" disabled={!single && !maximized} onClick={toggleMaximize}>
          {maximized ? "Back to grid" : "Maximize"}
          <Kbd>⌥↵</Kbd>
        </Button>
        <Button size="xs" variant="ghost" disabled={chosen.length === 0} onClick={remove}>
          Remove from grid
        </Button>
        {singleRow && single?.status !== "queued" && (
          <Button size="xs" variant="ghost" onClick={() => onFork(singleRow)}>
            Fork
          </Button>
        )}
        {notice && (
          <p
            role="status"
            className="ml-2 min-w-0 flex-1 truncate text-xs text-muted-foreground"
            title={notice}
          >
            {notice}
          </p>
        )}
        <Button
          size="xs"
          variant="ghost"
          className="ml-auto"
          disabled={visible.length === 0}
          onClick={() =>
            setSelected(chosen.length === visible.length ? [] : visible.map((task) => task.id))
          }
        >
          {chosen.length === visible.length && visible.length > 0
            ? "Clear selection"
            : "Select all"}
        </Button>
      </div>

      <div className={cn("grid min-h-0 flex-1 gap-2", GRID[maximized ? "1" : layout])}>
        {slots.map((task, index) =>
          task ? (
            <SessionPanel
              key={task.id}
              task={task}
              selected={selected.includes(task.id)}
              maximized={maximized !== null || layout === "1"}
              onSelect={(additive) => choose(task.id, additive)}
            />
          ) : (
            <EmptyPanel
              key={`empty-${index}`}
              candidates={candidates}
              onPick={(task) => togglePin(task.id, tasks)}
            />
          ),
        )}
      </div>

      <BroadcastBar targets={chosen} />
    </div>
  );
}
