import { buildSnoozePresets } from "@warpforge/core/snooze";
import { daemon } from "@warpforge/daemon";
import type { RunnerStatus, TaskInfo } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@warpforge/ui/components/dropdown-menu";
import { cn } from "@warpforge/ui/lib/utils";
import { MoreHorizontalIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { openExternalLink } from "../../lib/external-link";
import { taskIsPinned } from "../../lib/pin-group";
import { useShell } from "../../lib/shell-store";
import { useArchiveWorktree, useDeleteTask } from "../../lib/task-palette";
import { useDaemon } from "../../lib/use-daemon";
import { canRunAgain, isFactoryTask, isSnoozed, queuedOrder } from "../../model/factory";
import { taskTitle } from "./task-facts";

async function run(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (error) {
    toast.error(error instanceof Error ? error.message : `Could not ${label}`);
  }
}

/** The task's actions behind one "more" button: snooze, settle, queue order, pin, archive, delete. */
export function TaskMenu({
  task,
  onOpen,
  className,
}: {
  task: TaskInfo;
  onOpen: () => void;
  className?: string;
}) {
  const state = useDaemon();
  const shell = useShell();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<RunnerStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const tasks = state.snapshot.tasks;
  const pull = state.taskPullRequests?.[task.id];
  const factory = isFactoryTask(task);
  const pinned = taskIsPinned(tasks, shell.pinned, task.id);

  useEffect(() => {
    if (!open || !factory) return;
    void daemon
      .runnerStatus(task.project)
      .then((next) => {
        setStatus(next);
        setStatusError(null);
      })
      .catch((err: unknown) =>
        setStatusError(err instanceof Error ? err.message : "Could not load the queue"),
      );
  }, [open, factory, task.project]);

  const order = status ? queuedOrder(status.entries) : [];
  const index = order.indexOf(task.id);
  const queued = status?.entries.some(
    (entry) => entry.taskId === task.id && entry.state === "queued",
  );

  function move(by: number) {
    const next = [...order];
    next.splice(index, 1);
    next.splice(index + by, 0, task.id);
    void run("reorder", () => daemon.runnerReorder(task.project, next));
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`Actions for ${taskTitle(task)}`}
          className={cn("data-[state=open]:opacity-100", className)}
        >
          <MoreHorizontalIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onSelect={onOpen}>Open</DropdownMenuItem>
        {isSnoozed(task) ? (
          <DropdownMenuItem
            onSelect={() =>
              void run("wake", () => daemon.request("task.unsnooze", { task_id: task.id }))
            }
          >
            Wake now
          </DropdownMenuItem>
        ) : task.settledOverride === true ? (
          <DropdownMenuItem
            onSelect={() =>
              void run("return", () => daemon.request("task.unsettle", { task_id: task.id }))
            }
          >
            Return to active
          </DropdownMenuItem>
        ) : (
          <>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Remind later</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {buildSnoozePresets(Date.now()).map((preset) => (
                  <DropdownMenuItem
                    key={preset.id}
                    onSelect={() =>
                      void run("snooze", () =>
                        daemon.request("task.snooze", { task_id: task.id, until: preset.until }),
                      )
                    }
                  >
                    {preset.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            {task.status !== "running" && (
              <DropdownMenuItem
                onSelect={() =>
                  void run("settle", () => daemon.request("task.settle", { task_id: task.id }))
                }
              >
                Mark handled
              </DropdownMenuItem>
            )}
          </>
        )}
        {task.status === "running" && (
          <DropdownMenuItem
            onSelect={() =>
              void run("stop", () => daemon.request("task.cancel", { task_id: task.id }))
            }
          >
            Stop
          </DropdownMenuItem>
        )}
        {factory && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Factory queue
            </DropdownMenuLabel>
            {statusError && <p className="px-1.5 py-1 text-xs text-destructive">{statusError}</p>}
            {queued ? (
              <>
                <DropdownMenuItem
                  onSelect={() =>
                    void run("start", () => daemon.runnerStartNow(task.project, task.id))
                  }
                >
                  Start now
                </DropdownMenuItem>
                <DropdownMenuItem disabled={index <= 0} onSelect={() => move(-1)}>
                  Move up
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={index < 0 || index >= order.length - 1}
                  onSelect={() => move(1)}
                >
                  Move down
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() =>
                    void run("dequeue", () => daemon.runnerDequeue(task.project, task.id))
                  }
                >
                  Remove from queue
                </DropdownMenuItem>
              </>
            ) : (
              canRunAgain(task) && (
                <DropdownMenuItem
                  onSelect={() =>
                    void run("retry", () => daemon.runnerRetry(task.project, task.id))
                  }
                >
                  Run again
                </DropdownMenuItem>
              )
            )}
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => shell.togglePin(task.id, tasks)}>
          {pinned ? "Unpin from Home" : "Pin to Home"}
        </DropdownMenuItem>
        {pull && (
          <DropdownMenuItem onSelect={() => void openExternalLink(pull.url)}>
            Open pull request #{pull.number}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void run("archive", () => daemon.archiveTask(task.id))}>
          Archive
        </DropdownMenuItem>
        {task.worktree && (
          <DropdownMenuItem onSelect={() => useArchiveWorktree.getState().ask(task.id)}>
            Archive and remove worktree…
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => useDeleteTask.getState().ask(task.id)}
        >
          Delete…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
