import { pendingPermission } from "@warpforge/core/sessionPermissions";
import { daemon } from "@warpforge/daemon";
import type { SessionUpdate, TaskInfo, TaskPullRequest } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import { cn } from "@warpforge/ui/lib/utils";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "../../components/common/confirm-dialog";
import { PermissionButtons } from "./tool-line";

export type Tone = "amber" | "red" | "sky" | "neutral";

/** A quiet panel with a colored edge: the one shape every "this needs you" note on the task page takes. */
export function Frame({
  tone,
  label,
  children,
  role,
}: {
  tone: Tone;
  label: ReactNode;
  children: ReactNode;
  role?: "alert" | "status";
}) {
  return (
    <section
      role={role}
      className={cn(
        "flex flex-col gap-3 rounded-md border-l-2 bg-muted/50 px-4 py-3",
        tone === "amber" && "border-l-amber-500",
        tone === "red" && "border-l-red-500",
        tone === "sky" && "border-l-sky-500",
        tone === "neutral" && "border-l-border",
      )}
    >
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {children}
    </section>
  );
}

interface Ask {
  requestId: string;
  title: string;
  options: string[];
  origin?: string;
}

function currentAsk(task: TaskInfo, updates: SessionUpdate[]): Ask | null {
  if (!task.pendingPermission) return null;
  for (let index = updates.length - 1; index >= 0; index -= 1) {
    const update = updates[index];
    if (update.kind === "tool_call" && update.pendingPermission) {
      return {
        requestId: update.pendingPermission.request_id,
        title: update.title,
        options: update.pendingPermission.options,
      };
    }
  }
  const open = pendingPermission(updates);
  if (!open) return null;
  return {
    requestId: open.request_id,
    title: open.title,
    options: open.options,
    origin: open.browser_origin,
  };
}

function WorkflowWait({ task }: { task: TaskInfo }) {
  const [busy, setBusy] = useState(false);
  const run = task.workflowRun;
  const waiting = run?.waiting;
  if (!run || !waiting) return null;
  const barrierId = waiting.barrierId ?? undefined;

  async function act(label: string, fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Could not ${label}`);
    } finally {
      setBusy(false);
    }
  }

  if (waiting.kind === "question") {
    return (
      <Frame tone="amber" label={`The ${waiting.stage ?? run.stage} stage is asking`}>
        <p className="text-sm whitespace-pre-wrap">
          {waiting.question || "The stage is waiting for your answer."}
        </p>
        <p className="text-xs text-muted-foreground">
          Answer in the composer below; the run continues with it.
        </p>
      </Frame>
    );
  }
  if (waiting.kind === "limit") {
    return (
      <Frame tone="amber" label={`Round limit reached · ${run.round} of ${run.maxRounds}`}>
        {waiting.question && <p className="text-sm whitespace-pre-wrap">{waiting.question}</p>}
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={busy}
            onClick={() =>
              void act("extend", () =>
                daemon.workflowDecide(task.id, "extend", { barrierId, rounds: 1 }),
              )
            }
          >
            One more round
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() =>
              void act("finish", () => daemon.workflowDecide(task.id, "finish", { barrierId }))
            }
          >
            Finish
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto text-destructive"
            disabled={busy}
            onClick={() =>
              void act("stop", () => daemon.workflowDecide(task.id, "stop", { barrierId }))
            }
          >
            Stop
          </Button>
        </div>
      </Frame>
    );
  }
  return (
    <Frame tone="amber" label={`Paused before the ${run.stage} stage`}>
      {waiting.question && <p className="text-sm">{waiting.question}</p>}
      <p className="text-xs text-muted-foreground">
        Type a message to resume with it as guidance, or resume as is.
      </p>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={busy}
          onClick={() => void act("resume", () => daemon.workflowResume(task.id))}
        >
          {busy ? "Resuming…" : "Resume"}
        </Button>
      </div>
    </Frame>
  );
}

function MergedCard({ task, pull }: { task: TaskInfo; pull: TaskPullRequest }) {
  const [open, setOpen] = useState(false);
  return (
    <Frame tone="sky" label={`Pull request #${pull.number} is merged`}>
      <p className="text-sm">
        The work is in. Archive the task to move it to history and delete its worktree and local
        branch.
      </p>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          Archive and remove worktree
        </Button>
      </div>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Archive task and remove its worktree?"
        description={`Pull request #${pull.number} is merged. The task moves to history and its worktree folder and local branch are deleted. The conversation stays.`}
        items={task.worktree ? [task.worktree] : undefined}
        confirmLabel="Archive and remove"
        onConfirm={() =>
          void daemon
            .archiveTask(task.id, true)
            .then(() => toast.success("Task archived and worktree removed"))
            .catch((err: unknown) =>
              toast.error(err instanceof Error ? err.message : "Could not archive"),
            )
        }
      />
    </Frame>
  );
}

/**
 * Whatever this task needs from a person right now, under the header: a
 * permission the agent is waiting on, a workflow stage's question or round
 * limit, a paused run, or a merged pull request ready to clean up.
 */
export function AttentionCard({
  task,
  updates,
  agentName,
  pull,
}: {
  task: TaskInfo;
  updates: SessionUpdate[];
  agentName: string;
  pull: TaskPullRequest | undefined;
}) {
  const ask = currentAsk(task, updates);
  if (ask) {
    return (
      <Frame tone="amber" role="alert" label={`${agentName} is asking permission`}>
        <pre className="rounded-sm bg-background px-3 py-2 font-mono text-xs whitespace-pre-wrap">
          {ask.title}
        </pre>
        {ask.origin && (
          <p className="text-xs text-muted-foreground">
            Lets the agent use {ask.origin} in the in-app browser.
          </p>
        )}
        <PermissionButtons taskId={task.id} requestId={ask.requestId} options={ask.options} />
      </Frame>
    );
  }
  if (
    task.workflowRun?.waiting &&
    task.workflowRun.stage !== "done" &&
    task.workflowRun.stage !== "failed"
  ) {
    return <WorkflowWait task={task} />;
  }
  if (pull?.state === "merged" && task.worktree) return <MergedCard task={task} pull={pull} />;
  return null;
}
