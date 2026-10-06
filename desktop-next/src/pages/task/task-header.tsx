import { daemon } from "@warpforge/daemon";
import type { OrchNodeInfo, SessionUpdate, TaskInfo, TaskPullRequest } from "@warpforge/protocol";
import { Badge } from "@warpforge/ui/components/badge";
import { Button } from "@warpforge/ui/components/button";
import { cn } from "@warpforge/ui/lib/utils";
import { FolderGit2Icon, MessageSquareIcon, PauseIcon, PlayIcon, SquareIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { StatusMark, runStatus } from "../../components/common/status-mark";
import { useDaemon } from "../../lib/use-daemon";
import { isChat } from "../../model/chat";
import { agentTurnActive } from "../../model/factory";
import { AccountMenu } from "./account-menu";
import { AdvisorButton, AgentSwitchMenu, PullButton } from "./header-chips";
import { TaskMenu } from "./task-menu";
import { TaskTitle } from "./task-title";

const NODE_TONE: Record<OrchNodeInfo["status"], string> = {
  complete: "bg-foreground/50",
  running: "bg-foreground",
  failed: "bg-red-500",
  skipped: "bg-foreground/12",
  pending: "bg-foreground/12",
};

/** One tick per step of the run, in order; the running step is darkest. */
function StageTrack({ nodes }: { nodes: OrchNodeInfo[] }) {
  return (
    <div className="flex items-end gap-0.5" aria-hidden>
      {nodes.map((node) => (
        <span
          key={node.id}
          title={`${node.kind} · ${node.status}`}
          className={cn("h-1.5 w-3 rounded-[1px]", NODE_TONE[node.status])}
        />
      ))}
    </div>
  );
}

const RELATIVE = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

function startedLabel(createdAt: number): string {
  const seconds = Math.round(createdAt - Date.now() / 1000);
  const minutes = Math.round(seconds / 60);
  const hours = Math.round(minutes / 60);
  const days = Math.round(hours / 24);
  if (Math.abs(seconds) < 60) return "started just now";
  if (Math.abs(minutes) < 60) return `started ${RELATIVE.format(minutes, "minute")}`;
  if (Math.abs(hours) < 24) return `started ${RELATIVE.format(hours, "hour")}`;
  return `started ${RELATIVE.format(days, "day")}`;
}

async function act(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (error) {
    toast.error(error instanceof Error ? error.message : `Could not ${label}`);
  }
}

/** Pause, resume, and stop: a workflow pauses between stages; any live turn can be stopped. */
function RunControls({ task }: { task: TaskInfo }) {
  const [busy, setBusy] = useState(false);
  const run = task.workflowRun;
  const waiting = run?.waiting ?? null;
  const finished = run ? run.stage === "done" || run.stage === "failed" : true;
  const canStop = run ? !finished && waiting?.kind !== "limit" : agentTurnActive(task);

  async function guarded(label: string, fn: () => Promise<unknown>) {
    setBusy(true);
    await act(label, fn);
    setBusy(false);
  }

  return (
    <>
      {run && !finished && waiting?.kind === "paused" && (
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => void guarded("resume", () => daemon.workflowResume(task.id))}
        >
          <PlayIcon />
          {busy ? "Resuming…" : "Resume"}
        </Button>
      )}
      {run && !finished && waiting == null && (
        <Button
          variant="outline"
          size="sm"
          disabled={busy || run.pauseRequested}
          onClick={() => void guarded("pause", () => daemon.workflowPause(task.id))}
        >
          <PauseIcon />
          {run.pauseRequested ? "Pausing…" : "Pause"}
        </Button>
      )}
      {canStop && (
        <Button
          variant="outline"
          size="sm"
          aria-label="Stop"
          disabled={busy}
          onClick={() =>
            void guarded("stop", () => daemon.request("task.cancel", { task_id: task.id }))
          }
        >
          <SquareIcon />
        </Button>
      )}
    </>
  );
}

/**
 * The same header for every task: what it is, who runs it, where its run
 * is, and start/stop/pause/resume plus everything else in one place.
 */
export function TaskHeader({
  task,
  pull,
  updates,
  onContinue,
}: {
  task: TaskInfo;
  pull: TaskPullRequest | undefined;
  updates: SessionUpdate[];
  onContinue: (agent: string) => void;
}) {
  const state = useDaemon();
  const run = task.workflowRun;
  const nodes = task.orchestrationGraph?.nodes ?? [];
  const chat = isChat(task);

  return (
    <header className="flex flex-col gap-3">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <TaskTitle task={task} />
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            {chat && (
              <Badge variant="outline" className="text-muted-foreground">
                <MessageSquareIcon />
                Chat
              </Badge>
            )}
            <StatusMark status={runStatus(task, Boolean(pull))} />
            <span aria-hidden>·</span>
            <AccountMenu
              agentId={task.agent}
              agents={state.snapshot.agents ?? []}
              accounts={state.snapshot.accounts ?? []}
            />
            {run && (
              <>
                <span aria-hidden>·</span>
                <span>{run.workflowName}</span>
              </>
            )}
            <AgentSwitchMenu task={task} tasks={state.snapshot.tasks} />
            {task.worktree && (
              <>
                <span aria-hidden>·</span>
                <Badge variant="outline" title={task.worktree} className="text-muted-foreground">
                  <FolderGit2Icon />
                  Git worktree
                </Badge>
              </>
            )}
            <span aria-hidden>·</span>
            <span>{startedLabel(task.createdAt)}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {!chat && <PullButton pull={pull} />}
          {!chat && <AdvisorButton task={task} />}
          <RunControls task={task} />
          <TaskMenu task={task} updates={updates} onContinue={onContinue} />
        </div>
      </div>
      {run && (
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {nodes.length > 0 && <StageTrack nodes={nodes} />}
          <span>
            {run.stage}
            {run.round > 0 ? ` · round ${run.round} of ${run.maxRounds}` : ""}
            {run.verdict
              ? ` · ${run.verdict === "approve" ? "approved" : "changes requested"}`
              : ""}
            {run.pauseRequested ? " · pause queued" : ""}
          </span>
        </div>
      )}
    </header>
  );
}
