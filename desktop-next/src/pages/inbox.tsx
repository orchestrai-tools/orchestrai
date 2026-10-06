import { ToggleGroup, ToggleGroupItem } from "@warpforge/ui/components/toggle-group";
import { cn } from "@warpforge/ui/lib/utils";
import { CheckIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { PageToolbar } from "../components/common/page-toolbar";
import { formatElapsed } from "../lib/live-line";
import { isTypingTarget, listStep } from "../lib/editor-nav";
import { usePrFeedback } from "../lib/pr-feedback";
import { useShell } from "../lib/shell-store";
import { useDaemon } from "../lib/use-daemon";
import { visibleTasks } from "../model/tasks";
import { agentName, nowSec, taskTitle } from "./board/task-facts";
import { InboxDetail } from "./inbox/inbox-detail";
import { KIND_LABEL, KINDS, inboxEntries, type InboxKind } from "./inbox/inbox-items";
import { useInboxScope, type InboxScope } from "./inbox/inbox-scope";

type KindFilter = "all" | InboxKind;

/**
 * Every approval and question from every agent, in one place (Antigravity).
 * Scope starts at this project and widens on purpose (Retool). J and K move, Enter opens the task.
 */
export function Inbox() {
  const state = useDaemon();
  const project = useShell((shell) => shell.project);
  const openTask = useShell((shell) => shell.openTask);
  const handled = usePrFeedback((store) => store.handledByTask);
  const { scope, setScope } = useInboxScope();
  const [kind, setKind] = useState<KindFilter>("all");
  const [selectedId, setSelectedId] = useState<string>();
  const [done, setDone] = useState(0);

  const all = scope === "all" || !project;
  const items = inboxEntries(
    visibleTasks(state.snapshot.tasks, all ? null : project),
    state.taskPullRequests ?? {},
    handled,
    state.sessionUpdates,
  ).filter((item) => kind === "all" || item.kind === kind);
  const selected = items.find((item) => item.task.id === selectedId) ?? items[0];
  const now = nowSec();

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) return;
      if (event.key === "Enter" && selected) {
        event.preventDefault();
        openTask(selected.task.id, selected.task.project);
        return;
      }
      const step = listStep(event.key);
      if (!step || !selected) return;
      event.preventDefault();
      const index = items.indexOf(selected);
      setSelectedId(items[Math.min(Math.max(index + step, 0), items.length - 1)]?.task.id);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items, selected, openTask]);

  return (
    <div className="grid h-full grid-cols-[minmax(18rem,24rem)_1fr]">
      <div className="flex min-h-0 flex-col gap-3 border-r p-4">
        <PageToolbar title="Inbox" meta={`${items.length} waiting`}>
          {project && (
            <ToggleGroup
              type="single"
              size="sm"
              variant="outline"
              spacing={0}
              value={scope}
              onValueChange={(next) => next && setScope(next as InboxScope)}
              aria-label="Scope"
            >
              <ToggleGroupItem value="project" className="px-2.5 text-xs">
                {project}
              </ToggleGroupItem>
              <ToggleGroupItem value="all" className="px-2.5 text-xs">
                All projects
              </ToggleGroupItem>
            </ToggleGroup>
          )}
        </PageToolbar>
        <ToggleGroup
          type="single"
          size="sm"
          spacing={1}
          value={kind}
          onValueChange={(next) => next && setKind(next as KindFilter)}
          aria-label="Kind"
          className="flex-wrap justify-start"
        >
          {(["all", ...KINDS] as const).map((entry) => (
            <ToggleGroupItem key={entry} value={entry} className="h-6 px-2 text-xs">
              {entry === "all" ? "All" : KIND_LABEL[entry]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <ul
          role="listbox"
          aria-label="Waiting for you"
          className="-mx-2 min-h-0 flex-1 overflow-y-auto"
        >
          {items.map((item) => (
            <li key={item.task.id}>
              <button
                type="button"
                role="option"
                aria-selected={item === selected}
                onClick={() => setSelectedId(item.task.id)}
                onDoubleClick={() => openTask(item.task.id, item.task.project)}
                className={cn(
                  "flex w-full flex-col gap-0.5 rounded-md px-2 py-(--row-py) text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  item === selected ? "bg-muted" : "hover:bg-muted/50",
                )}
              >
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span
                    aria-hidden
                    className={cn(
                      "size-1.5 rounded-full",
                      item.kind === "blocked" ? "bg-red-500" : "bg-amber-500",
                    )}
                  />
                  {KIND_LABEL[item.kind]}
                  {all && <span>· {item.task.project}</span>}
                  <span className="ml-auto">{formatElapsed(item.task.updatedAt, now)}</span>
                </span>
                <span className="truncate text-sm font-medium">{taskTitle(item.task)}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {agentName(state.snapshot.agents, item.task.agent)} · {item.reason}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {done > 0 && (
          <p className="text-xs text-muted-foreground">
            {done} handled this session. Receipts are on each task.
          </p>
        )}
      </div>

      <div className="min-h-0 overflow-y-auto">
        {selected ? (
          <InboxDetail
            key={selected.task.id}
            entry={selected}
            onResolve={() => setDone((count) => count + 1)}
            onOpenTask={() => openTask(selected.task.id, selected.task.project)}
          />
        ) : (
          <div className="dot-grid flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <CheckIcon className="size-5" />
            Nothing needs you{all ? "" : " in this project"}.
          </div>
        )}
      </div>
    </div>
  );
}
