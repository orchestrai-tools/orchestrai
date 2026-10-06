import type { TaskInfo, WorkflowStage } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import { cn } from "@warpforge/ui/lib/utils";

import { StatusDot, runStatus } from "../../components/common/status-mark";
import { plural } from "../../lib/plural";
import { useShell } from "../../lib/shell-store";
import { ProjectBadge } from "../../shell/project-badge";
import { failureKindLabel } from "./failure-label";
import { TONE_TEXT, taskTitle, useTaskLine, worktreeName } from "./task-facts";
import { TaskMenu } from "./task-menu";

const STAGES = ["plan", "implement", "review", "verify"] as const;

function stageIndex(stage: WorkflowStage): number {
  if (stage === "fix") return STAGES.indexOf("review");
  if (stage === "done") return STAGES.length;
  return STAGES.indexOf(stage as (typeof STAGES)[number]);
}

/** One tick per workflow stage: done stages are dim, the current one solid. Only workflow runs have stages. */
export function StageTrack({ task, className }: { task: TaskInfo; className?: string }) {
  const run = task.workflowRun;
  if (!run) return null;
  const current = stageIndex(run.stage);
  return (
    <div className={cn("flex items-end gap-0.5", className)} aria-label={`Stage: ${run.stage}`}>
      {STAGES.map((stage, index) => (
        <span
          key={stage}
          title={stage}
          className={cn(
            "h-1.5 w-3 rounded-[1px]",
            run.stage === "failed"
              ? "bg-red-500/40"
              : index < current
                ? "bg-foreground/50"
                : index === current
                  ? "bg-foreground"
                  : "bg-foreground/12",
          )}
        />
      ))}
    </div>
  );
}

const PR_TONE = { passing: "bg-emerald-500", failing: "bg-red-500", pending: "bg-amber-500" };

/** One card per task: a status mark and a one-line summary. Click opens it. */
export function TaskCard({
  task,
  selected,
  onOpen,
  showProject = false,
}: {
  task: TaskInfo;
  selected: boolean;
  onOpen: () => void;
  /** On Home, cards from every project share one board, so each names its project. */
  showProject?: boolean;
}) {
  const line = useTaskLine(task);
  const branch = worktreeName(task.worktree);
  return (
    <div
      className={cn(
        "group/card relative rounded-md border bg-background text-left shadow-xs transition-colors hover:border-foreground/25",
        selected && "border-foreground/40",
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-pressed={selected}
        className="flex w-full flex-col gap-2 p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex items-start gap-2 pr-6">
          <StatusDot status={runStatus(task, Boolean(line.pull))} className="mt-1.5" />
          <span className="text-sm leading-snug font-medium">{taskTitle(task)}</span>
        </span>
        {line.summary && (
          <span className="line-clamp-2 text-xs text-muted-foreground">{line.summary}</span>
        )}
        {line.facts.length > 0 && (
          <span className="line-clamp-2 text-xs text-amber-600 dark:text-amber-400">
            {line.facts.join(" · ")}
          </span>
        )}
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {showProject && (
            <>
              <span className="flex min-w-0 items-center gap-1.5">
                <ProjectBadge name={task.project} className="size-3.5 text-[9px]" />
                <span className="truncate">{task.project}</span>
              </span>
              <span aria-hidden>·</span>
            </>
          )}
          <span>{line.agent}</span>
          <span aria-hidden>·</span>
          <span>{line.elapsed}</span>
          {line.activity && (
            <span className={TONE_TEXT[line.activity.tone]}>{line.activity.label}</span>
          )}
          {line.tools > 0 && <span>{line.tools} tools</span>}
          {task.filesChanged > 0 && <span>{plural(task.filesChanged, "file")}</span>}
          {line.workers && <span>{line.workers}</span>}
          {line.pull && (
            <span className="ml-auto flex items-center gap-1">
              {line.pull.checks && (
                <span
                  aria-hidden
                  className={cn("size-1.5 rounded-full", PR_TONE[line.pull.checks])}
                />
              )}
              #{line.pull.number}
            </span>
          )}
        </span>
        {(branch || task.workflowRun) && (
          <span className="flex items-center gap-2">
            {branch && (
              <span
                className="min-w-0 truncate font-mono text-[11px] text-muted-foreground"
                title={task.worktree ?? ""}
              >
                {branch}
              </span>
            )}
            <StageTrack task={task} className="ml-auto shrink-0" />
          </span>
        )}
      </button>
      {line.failure && (
        <div className="flex items-center gap-2 border-t px-3 py-1.5 text-xs">
          <span className="font-medium text-red-600 dark:text-red-400">
            {failureKindLabel(line.failure.kind)}
          </span>
          <span className="min-w-0 flex-1 truncate text-muted-foreground">
            {line.failure.reason}
          </span>
          <Button variant="link" size="xs" className="h-auto p-0" onClick={onOpen}>
            Retry
          </Button>
        </div>
      )}
      <TaskMenu
        task={task}
        onOpen={onOpen}
        className="absolute top-2 right-2 opacity-0 group-hover/card:opacity-100 focus-visible:opacity-100"
      />
    </div>
  );
}

/** The selected task is the open one; opening goes to its conversation. */
export function useTaskSelection() {
  const selected = useShell((state) => state.taskId);
  const openTask = useShell((state) => state.openTask);
  return {
    selected,
    open: (task: TaskInfo) => openTask(task.id, task.project),
  };
}
