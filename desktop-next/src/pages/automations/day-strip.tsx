import type { Automation, AutomationRun } from "@warpforge/protocol";
import { RUN_STATUS_META } from "../../lib/automation-run";
import { nextAt, recentRuns } from "./describe";
import { RunDot } from "./run-dot";
import { countdown, formatWhen } from "./schedule";

const DAY = 24 * 60 * 60 * 1000;

/** What ran in the last day, as marks on a line: the marks are the summary, so there is nothing to read twice. */
export function DayStrip({
  automations,
  runsOf,
  onSelect,
}: {
  automations: readonly Automation[];
  runsOf: (automation: Automation) => AutomationRun[];
  onSelect: (id: string) => void;
}) {
  const now = Date.now();
  const recent = recentRuns(automations, runsOf, now);
  const count = (match: (run: AutomationRun) => boolean) => recent.filter(({ run }) => match(run)).length;
  const summary = [
    [count((run) => run.status === "completed"), "completed"],
    [count((run) => run.status === "running"), "running"],
    [count((run) => run.status === "failed"), "failed"],
    [count((run) => run.status.startsWith("skipped")), "skipped"],
  ]
    .filter(([n]) => Number(n) > 0)
    .map(([n, label]) => `${n} ${label}`)
    .join(" · ");
  const next = automations
    .map((automation) => ({ automation, at: nextAt(automation) }))
    .filter((entry): entry is { automation: Automation; at: number } => entry.at !== undefined)
    .sort((a, b) => a.at - b.at)[0];

  return (
    <section aria-label="Last 24 hours" className="flex flex-col gap-1">
      <div className="flex flex-wrap items-baseline gap-x-2 text-xs">
        <span className="font-medium text-muted-foreground">Last 24 hours</span>
        <span className="text-muted-foreground">{summary || "No runs"}</span>
        <span className="ml-auto text-muted-foreground">
          {next ? (
            <>
              Next:{" "}
              <button
                type="button"
                className="text-foreground underline-offset-2 hover:underline"
                onClick={() => onSelect(next.automation.id)}
              >
                {next.automation.name}
              </button>
              , {countdown(next.at, now)}
            </>
          ) : (
            "Nothing scheduled"
          )}
        </span>
      </div>
      <div className="relative h-5">
        <span aria-hidden className="absolute inset-x-0 top-1/2 h-px bg-border" />
        <span aria-hidden className="absolute top-1.5 left-1/4 h-2 w-px bg-border" />
        <span aria-hidden className="absolute top-1.5 left-1/2 h-2 w-px bg-border" />
        <span aria-hidden className="absolute top-1.5 left-3/4 h-2 w-px bg-border" />
        {recent.map(({ automation, run, at }) => (
          <button
            key={run.id}
            type="button"
            onClick={() => onSelect(automation.id)}
            title={`${automation.name} #${run.runNumber} · ${RUN_STATUS_META[run.status].label} · ${formatWhen(at, now)}`}
            aria-label={`${automation.name} run ${run.runNumber}, ${RUN_STATUS_META[run.status].label}`}
            className="absolute top-1/2 grid size-5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-background outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            style={{ left: `${Math.min(99, Math.max(1, ((at - (now - DAY)) / DAY) * 100))}%` }}
          >
            <RunDot status={run.status} />
          </button>
        ))}
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>24h ago</span>
        <span>Now</span>
      </div>
    </section>
  );
}
