import { AlertTriangle, CircleCheckBig, Loader2, Pause, Play, Plus, Square } from "lucide-react";
import { memo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { factoryStage } from "@/lib/factory";
import { cn } from "@/lib/utils";
import { verifyBarrier, workflowStageLabel } from "@/lib/workflow";

import { daemon } from "../daemon";
import type { TaskInfo, WorkflowRunInfo } from "../protocol";

/**
 * Pipeline status strip + controls for a workflow parent task.
 *
 * A workflow parent has no agent session of its own — the daemon drives its
 * stages — so this bar (not the composer) is where the pipeline is steered.
 * The composer takes over only when a stage asks a question; see
 * `ChatComposer`.
 */
export const WorkflowControls = memo(function WorkflowControls({ task }: { task: TaskInfo }) {
  const run = task.workflowRun;
  const [busyAction, setBusyAction] = useState<string | null>(null);
  if (!run) return null;

  const waiting = run.waiting ?? null;
  const finished = run.stage === "done" || run.stage === "failed";
  const busy = busyAction !== null;

  const act = async (label: string, fn: () => Promise<void>) => {
    setBusyAction(label);
    try {
      await fn();
    } catch (e) {
      toast.error(`Could not ${label}`, {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="shrink-0 border-t border-rule px-3 py-2">
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <StageIndicator run={run} />
        <span className="ml-auto flex items-center gap-1.5">
          {!finished && (waiting === null || waiting.kind === "paused") && (
            <>
              {waiting?.kind === "paused" ? (
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-6 gap-1 px-2 text-[13px]"
                  disabled={busy}
                  onClick={() => void act("resume", () => daemon.workflowResume(task.id))}
                >
                  {busyAction === "resume" ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Play className="size-3" />
                  )}
                  {busyAction === "resume" ? "Resuming…" : "Resume"}
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 gap-1 px-2 text-[13px]"
                  disabled={busy || run.pauseRequested}
                  title={
                    run.pauseRequested
                      ? "The pipeline will hold once the running stage finishes"
                      : "Let the running stage finish, then hold before the next one"
                  }
                  onClick={() => void act("pause", () => daemon.workflowPause(task.id))}
                >
                  {busyAction === "pause" ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Pause className="size-3" />
                  )}
                  {busyAction === "pause" || run.pauseRequested ? "Pausing…" : "Pause"}
                </Button>
              )}
            </>
          )}
          {!finished && waiting?.kind !== "limit" && (
            <Button
              size="sm"
              variant="destructive"
              className="h-6 gap-1 px-2 text-[13px]"
              disabled={busy}
              onClick={() =>
                void act("stop the workflow", async () => {
                  await daemon.request("task.cancel", { task_id: task.id });
                })
              }
            >
              {busyAction === "stop the workflow" ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Square className="size-3 fill-current" />
              )}
              {busyAction === "stop the workflow" ? "Stopping…" : "Stop"}
            </Button>
          )}
        </span>
      </div>

      {waiting?.kind === "limit" && (
        <LimitDecision
          task={task}
          summary={waiting.question ?? ""}
          busyAction={busyAction}
          act={act}
        />
      )}

      {waiting?.kind === "paused" && (
        <p className="mt-1.5 text-[13px] text-muted-foreground">
          Paused before the {workflowStageLabel(run.stage)} stage. Type a message to resume with it
          as guidance, or press Resume.
        </p>
      )}
    </div>
  );
});

const LIMIT_COPY = {
  blocked: {
    body: "Verification could not run",
    extendOne: "Retry verification",
    extendOneTitle: "Run the verify stage again, e.g. after opening the app or starting services",
    extendTwo: null,
    extendTwoTitle: null,
    finish: "Continue to review",
    finishTitle: "Skip the verification gate and let the reviewers look at the change",
    hint: "Retry verification, continue to review without it, or stop the workflow.",
    title: "Verification could not run",
  },
  failed: {
    body: "The change keeps failing verification in the running app",
    extendOne: "1 more attempt",
    extendOneTitle: "Run one more fix → verify cycle",
    extendTwo: "2 more attempts",
    extendTwoTitle: "Run two more fix → verify cycles",
    finish: "Continue to review",
    finishTitle: "Skip the verification gate and let the reviewers look at the change",
    hint: "Continue the fix → verify loop, continue to review without a pass, or stop the workflow.",
    title: "Verification keeps failing",
  },
  review: {
    body: "Reviewers still request changes",
    extendOne: "1 more round",
    extendOneTitle: "Run one more fix → review cycle",
    extendTwo: "2 more rounds",
    extendTwoTitle: "Run two more fix → review cycles",
    finish: "Finish for review",
    finishTitle: "Stop the pipeline and send the current changes to human review",
    hint: "Continue the fix → review loop, finish with the current changes, or stop the workflow.",
    title: "Review limit reached",
  },
} as const;

/** Buttons shown when review rounds or verify attempts ran out. */
function LimitDecision({
  task,
  summary,
  busyAction,
  act,
}: {
  task: TaskInfo;
  summary: string;
  busyAction: string | null;
  act: (label: string, fn: () => Promise<void>) => Promise<void>;
}) {
  const busy = busyAction !== null;
  const barrierId = task.workflowRun?.waiting?.barrierId ?? undefined;
  const copy = LIMIT_COPY[verifyBarrier(task.workflowRun) ?? "review"];
  return (
    <section
      aria-label={copy.title}
      className="mt-2 rounded-md border border-warn/40 bg-warn/[0.07] p-3"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" />
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-foreground">{copy.title}</p>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {copy.body}
            {summary ? ` — ${summary}` : ""}.
          </p>
          <p className="mt-1 text-[13px] text-muted-foreground">{copy.hint}</p>
        </div>
      </div>

      <div aria-live="polite" className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          className="gap-1 px-2.5"
          disabled={busy}
          title={copy.extendOneTitle}
          onClick={() =>
            void act("add one review round", () =>
              daemon.workflowDecide(task.id, "extend", { barrierId, rounds: 1 }),
            )
          }
        >
          {busyAction === "add one review round" ? <Loader2 className="animate-spin" /> : <Plus />}
          {busyAction === "add one review round" ? "Continuing…" : copy.extendOne}
        </Button>
        {copy.extendTwo && (
          <Button
            size="sm"
            className="gap-1 px-2.5"
            disabled={busy}
            title={copy.extendTwoTitle ?? undefined}
            onClick={() =>
              void act("add two review rounds", () =>
                daemon.workflowDecide(task.id, "extend", { barrierId, rounds: 2 }),
              )
            }
          >
            {busyAction === "add two review rounds" ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Plus />
            )}
            {busyAction === "add two review rounds" ? "Continuing…" : copy.extendTwo}
          </Button>
        )}
        <Button
          size="sm"
          className="gap-1 px-2.5"
          disabled={busy}
          title={copy.finishTitle}
          onClick={() =>
            void act("finish the workflow", () =>
              daemon.workflowDecide(task.id, "finish", { barrierId }),
            )
          }
        >
          {busyAction === "finish the workflow" ? (
            <Loader2 className="animate-spin" />
          ) : (
            <CircleCheckBig />
          )}
          {busyAction === "finish the workflow" ? "Finishing…" : copy.finish}
        </Button>
        <Button
          size="sm"
          variant="destructive"
          className="gap-1 px-2.5"
          disabled={busy}
          title="Stop immediately and mark the workflow as interrupted"
          onClick={() =>
            void act("stop the workflow", () =>
              daemon.workflowDecide(task.id, "stop", { barrierId }),
            )
          }
        >
          {busyAction === "stop the workflow" ? (
            <Loader2 className="animate-spin" />
          ) : (
            <Square className="fill-current" />
          )}
          {busyAction === "stop the workflow" ? "Stopping…" : "Stop"}
        </Button>
      </div>

      <p className="mt-2 text-[11px] text-muted-foreground">
        These buttons continue without guidance. To add guidance, type it below and press Send
        instead — that runs one more round with your note.
      </p>
    </section>
  );
}

function StageIndicator({ run }: { run: WorkflowRunInfo }) {
  const waiting = run.waiting ?? null;
  const paused = waiting?.kind === "paused";
  const chip = paused ? null : factoryStage({ status: "running", workflowRun: run }, null);
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1.5">
      <span className="truncate font-medium text-foreground" title={run.workflowName}>
        {run.workflowName}
      </span>
      <span className="text-border">·</span>
      <span className="text-muted-foreground">
        {paused
          ? `paused before ${workflowStageLabel(run.stage)}`
          : (chip ?? workflowStageLabel(run.stage))}
      </span>
      {run.round > 0 &&
        run.stage !== "done" &&
        run.stage !== "failed" &&
        !chip?.includes("round") && (
          <span className="tnum text-muted-foreground">
            round {run.round}/{run.maxRounds}
          </span>
        )}
      {run.verdict && (
        <span
          className={cn(
            "rounded-full px-1.5 py-0.5 text-[11px] font-medium",
            run.verdict === "approve" ? "bg-ok/12 text-ok" : "bg-warn/12 text-warn",
          )}
        >
          {run.verdict === "approve" ? "approved" : "changes requested"}
        </span>
      )}
    </span>
  );
}
