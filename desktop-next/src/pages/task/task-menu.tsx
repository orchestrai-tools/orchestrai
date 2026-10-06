import { buildSnoozePresets } from "@warpforge/core/snooze";
import { daemon } from "@warpforge/daemon";
import type { RunnerStatus, SessionUpdate, TaskInfo } from "@warpforge/protocol";
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
import { MoreHorizontalIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "../../components/common/confirm-dialog";
import { taskIsPinned } from "../../lib/pin-group";
import { promoteChat } from "../../lib/quick-chat";
import { isChat } from "../../model/chat";
import { useShell } from "../../lib/shell-store";
import { transcriptPath, transcriptToMarkdown } from "../../lib/transcript-doc";
import { useDaemon } from "../../lib/use-daemon";
import { canRunAgain, isFactoryTask, isSnoozed, queuedOrder } from "../../model/factory";

async function run(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (error) {
    toast.error(error instanceof Error ? error.message : `Could not ${label}`);
  }
}

type Confirm = "archive" | "delete" | null;

/**
 * Everything else you can do with this task in one menu: continue or hand
 * it to another agent, remind later, its Factory queue place, pin, save the
 * conversation as a doc, archive, and delete.
 */
export function TaskMenu({
  task,
  updates,
  onContinue,
}: {
  task: TaskInfo;
  updates: SessionUpdate[];
  onContinue: (agent: string) => void;
}) {
  const shell = useShell();
  const state = useDaemon();
  const tasks = state.snapshot.tasks;
  const agents = (state.snapshot.agents ?? []).filter(
    (agent) => agent.enabled && agent.id !== task.agent,
  );
  const pull = state.taskPullRequests?.[task.id];
  const [status, setStatus] = useState<RunnerStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const factory = isFactoryTask(task);
  const chat = isChat(task);
  const snoozed = isSnoozed(task);
  const settled = task.settledOverride === true;
  const pinned = taskIsPinned(tasks, shell.pinned, task.id);
  const order = status ? queuedOrder(status.entries) : [];
  const index = order.indexOf(task.id);
  const queued =
    status?.entries.some((entry) => entry.taskId === task.id && entry.state === "queued") ?? false;

  function loadQueue(open: boolean) {
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
  }

  function move(by: number) {
    const next = [...order];
    next.splice(index, 1);
    next.splice(index + by, 0, task.id);
    void run("reorder", () => daemon.runnerReorder(task.project, next));
  }

  async function saveTranscript() {
    const path = transcriptPath(task.title, task.id);
    try {
      await daemon.request("docs.write", {
        project: task.project,
        path,
        content: transcriptToMarkdown(task.title, updates),
      });
      toast.success(`Saved to ${path}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    }
  }

  return (
    <>
      <DropdownMenu onOpenChange={loadQueue}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="More task actions">
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          {chat && (
            <>
              <DropdownMenuItem onSelect={() => void promoteChat(task.id)}>
                Make it a task
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem onSelect={() => onContinue(task.agent)} disabled={updates.length === 0}>
            Continue in a new session
          </DropdownMenuItem>
          {agents.length > 0 && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger disabled={updates.length === 0}>
                Hand to another agent
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-48">
                {agents.map((agent) => (
                  <DropdownMenuItem key={agent.id} onSelect={() => onContinue(agent.id)}>
                    {agent.displayName}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}
          <DropdownMenuItem onSelect={() => void saveTranscript()} disabled={updates.length === 0}>
            Save transcript as a doc
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => shell.togglePin(task.id, tasks)}>
            {pinned ? "Unpin from Home" : "Pin to Home"}
          </DropdownMenuItem>
          {!chat && <DropdownMenuSeparator />}
          {chat ? null : snoozed ? (
            <DropdownMenuItem
              onSelect={() =>
                void run("wake", () => daemon.request("task.unsnooze", { task_id: task.id }))
              }
            >
              Wake
            </DropdownMenuItem>
          ) : settled ? (
            <DropdownMenuItem
              onSelect={() =>
                void run("return", () => daemon.request("task.unsettle", { task_id: task.id }))
              }
            >
              Return to the board
            </DropdownMenuItem>
          ) : (
            <>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Remind later</DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-48">
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
          {factory && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                Factory queue
              </DropdownMenuLabel>
              {statusError && <p className="px-2 py-1 text-xs text-destructive">{statusError}</p>}
              {queued && (
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
              )}
              {!queued && canRunAgain(task) && (
                <DropdownMenuItem
                  onSelect={() =>
                    void run("retry", () => daemon.runnerRetry(task.project, task.id))
                  }
                >
                  Run again
                </DropdownMenuItem>
              )}
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void run("archive", () => daemon.archiveTask(task.id))}>
            Archive
          </DropdownMenuItem>
          {task.worktree && (
            <DropdownMenuItem onSelect={() => setConfirm("archive")}>
              Archive and remove worktree…
            </DropdownMenuItem>
          )}
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirm("delete")}>
            Delete…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirm === "archive"}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={
          pull?.state === "merged"
            ? "Archive task and remove its worktree?"
            : "Archive and remove the worktree?"
        }
        description={
          pull?.state === "merged"
            ? `Pull request #${pull.number} is merged. The task moves to history and its worktree folder and local branch are deleted. The conversation stays.`
            : "The task moves to history and its worktree folder is deleted."
        }
        items={task.worktree ? [task.worktree] : undefined}
        confirmLabel="Archive and remove"
        onConfirm={() => void run("archive", () => daemon.archiveTask(task.id, true))}
      />
      <ConfirmDialog
        open={confirm === "delete"}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="Delete this task?"
        description="The task and its conversation will be gone."
        confirmLabel="Delete task"
        onConfirm={() => void run("delete", () => daemon.deleteTask(task.id))}
      />
    </>
  );
}
