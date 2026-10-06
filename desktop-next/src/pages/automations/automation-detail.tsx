import type { Automation, AutomationRun } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@warpforge/ui/components/dropdown-menu";
import { MoreHorizontalIcon } from "lucide-react";
import type { ReactNode } from "react";
import { SectionLabel } from "../../components/common/page-toolbar";
import { RUN_STATUS_META, runDuration } from "../../lib/automation-run";
import { nextDetail, runsGoTo, triggerLine, zoneOf } from "./describe";
import { RunDot } from "./run-dot";
import { formatWhen } from "./schedule";

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="contents">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

function RunRow({ run, onOpen, onOpenTask }: { run: AutomationRun; onOpen: () => void; onOpenTask: (id: string) => void }) {
  const meta = RUN_STATUS_META[run.status];
  return (
    <li className="group/row flex items-start gap-3 rounded-md px-2 py-(--row-py) hover:bg-muted">
      <span className="mt-1.5">
        <RunDot status={run.status} />
      </span>
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left outline-none focus-visible:underline">
        <span className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="text-muted-foreground tabular-nums">#{run.runNumber}</span>
          <span className="font-medium">{meta.label}</span>
          <span className="text-xs text-muted-foreground">
            {run.trigger === "manual" ? "By hand" : "Scheduled"} · {formatWhen((run.startedAt || run.scheduledFor) * 1000)} ·{" "}
            {runDuration(run)}
          </span>
        </span>
        <span className={run.error ? "line-clamp-2 block text-xs" : "line-clamp-2 block text-xs text-muted-foreground"}>
          {run.error ?? run.output ?? meta.hint}
        </span>
      </button>
      {run.taskId && (
        <Button
          size="xs"
          variant="ghost"
          onClick={() => onOpenTask(run.taskId ?? "")}
          className="opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100"
        >
          Open task
        </Button>
      )}
    </li>
  );
}

/** One automation: what it starts, when, the guards around a run, and its history. */
export function AutomationDetail({
  automation,
  runs,
  runsError,
  onRetryRuns,
  onRunNow,
  onToggle,
  onEdit,
  onDuplicate,
  onDelete,
  onOpenRun,
  onOpenTask,
}: {
  automation: Automation;
  runs: AutomationRun[];
  runsError: string | null;
  onRetryRuns: () => void;
  onRunNow: () => void;
  onToggle: (enabled: boolean) => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onOpenRun: (run: AutomationRun) => void;
  onOpenTask: (id: string) => void;
}) {
  const running = runs.some((run) => run.status === "running" || run.status === "pending");

  return (
    <article className="flex min-w-0 flex-col gap-6">
      <header className="flex flex-col gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{automation.name}</h2>
          <p className="text-sm text-muted-foreground">
            {triggerLine(automation)} · {zoneOf(automation)}
            <span className="font-mono text-xs"> · {automation.trigger.cron}</span>
          </p>
          <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            {!automation.enabled && <span aria-hidden className="size-1.5 rounded-full bg-muted-foreground/40" />}
            {nextDetail(automation)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={onRunNow}
            disabled={running}
            title={running ? "One run at a time: the last run has not finished" : "Runs once now; the schedule is untouched"}
          >
            Run now
          </Button>
          <Button size="sm" variant="outline" onClick={() => onToggle(!automation.enabled)}>
            {automation.enabled ? "Pause" : "Resume"}
          </Button>
          <Button size="sm" variant="outline" onClick={onEdit}>
            Edit
          </Button>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button size="icon-sm" variant="ghost" aria-label={`More actions for ${automation.name}`}>
                <MoreHorizontalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuItem onSelect={onDuplicate}>Duplicate</DropdownMenuItem>
              {automation.lastTaskId && (
                <DropdownMenuItem onSelect={() => onOpenTask(automation.lastTaskId ?? "")}>Open the last task</DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                Delete…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <dl className="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
        <Fact label="Prompt">
          <span className="whitespace-pre-wrap">{automation.prompt}</span>
        </Fact>
        <Fact label="Agent">
          {automation.agent} <span className="text-muted-foreground">· {automation.model || "agent default"}</span>
        </Fact>
        <Fact label="Runs go to">{runsGoTo(automation)}</Fact>
        <Fact label="Precheck">
          {automation.precheck ? (
            <>
              <code className="font-mono text-xs break-words">{automation.precheck}</code>
              <span className="block text-xs text-muted-foreground">
                Runs in the project folder before each scheduled run; a non-zero exit skips the run.
              </span>
            </>
          ) : (
            "None"
          )}
        </Fact>
        <Fact label="Missed-run grace">
          {automation.missedRunGraceMinutes} minutes
          <span className="block text-xs text-muted-foreground">
            A run that came due while OrchestrAI was closed still runs if it is less late than this.
          </span>
        </Fact>
        <Fact label="Project">{automation.project}</Fact>
        <Fact label="Created">{formatWhen(automation.createdAt * 1000)}</Fact>
      </dl>

      <section className="flex flex-col gap-1">
        <SectionLabel className="pb-1">Run history</SectionLabel>
        {runsError && (
          <p className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400">
            {runsError}
            <Button size="xs" variant="outline" onClick={onRetryRuns}>
              Retry
            </Button>
          </p>
        )}
        {runs.length === 0 && !runsError ? (
          <p className="text-xs text-muted-foreground">No runs yet. Run now starts one without touching the schedule.</p>
        ) : (
          <ol className="-mx-2 flex flex-col">
            {runs.map((run) => (
              <RunRow key={run.id} run={run} onOpen={() => onOpenRun(run)} onOpenTask={onOpenTask} />
            ))}
          </ol>
        )}
        <p className="pt-1 text-xs text-muted-foreground">
          One run at a time: an occurrence that comes due while the last run is still going is skipped, and says so. Every run is a
          real task with its own transcript and diff.
        </p>
      </section>
    </article>
  );
}
