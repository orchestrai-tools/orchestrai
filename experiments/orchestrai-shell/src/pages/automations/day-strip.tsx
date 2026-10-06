import { OUTCOME, type Automation, type AutomationRun } from "@/data/automations"
import { nextRunAt, recentRuns } from "@/pages/automations/describe"
import { RunDot } from "@/pages/automations/run-dot"
import { countdown, formatWhen, MOCK_NOW } from "@/pages/automations/schedule"

const DAY = 24 * 60 * 60 * 1000

/** What ran overnight, as marks on a day: the marks are the summary, so there is nothing to read twice. */
export function DayStrip({
  automations,
  runsOf,
  onSelect,
}: {
  automations: readonly Automation[]
  runsOf: (automation: Automation) => AutomationRun[]
  onSelect: (id: string) => void
}) {
  const recent = recentRuns(automations, runsOf)
  const count = (match: (run: AutomationRun) => boolean) => recent.filter(({ run }) => match(run)).length
  const summary = [
    [count((run) => run.status === "completed"), "completed"],
    [count((run) => run.status === "running"), "running"],
    [count((run) => run.status === "failed"), "failed"],
    [count((run) => run.status.startsWith("skipped")), "skipped"],
  ]
    .filter(([n]) => Number(n) > 0)
    .map(([n, label]) => `${n} ${label}`)
    .join(" · ")
  const next = automations
    .filter((automation) => automation.enabled)
    .map((automation) => ({ automation, at: nextRunAt(automation) }))
    .filter((entry): entry is { automation: Automation; at: number } => entry.at !== undefined)
    .sort((a, b) => a.at - b.at)[0]

  return (
    <section aria-label="Last 24 hours" className="flex flex-col gap-1">
      <div className="flex flex-wrap items-baseline gap-x-2 text-xs">
        <span className="font-medium text-muted-foreground">Last 24 hours</span>
        <span className="text-muted-foreground">{summary || "No runs"}</span>
        <span className="ml-auto text-muted-foreground">
          {next ? (
            <>
              Next:{" "}
              <button type="button" className="text-foreground underline-offset-2 hover:underline" onClick={() => onSelect(next.automation.id)}>
                {next.automation.name}
              </button>
              , {countdown(next.at)}
            </>
          ) : (
            "Nothing scheduled"
          )}
        </span>
      </div>
      <div className="relative h-5">
        <span aria-hidden className="absolute inset-x-0 top-1/2 h-px bg-border" />
        {[0.25, 0.5, 0.75].map((at) => (
          <span key={at} aria-hidden className="absolute top-1.5 h-2 w-px bg-border" style={{ left: `${at * 100}%` }} />
        ))}
        {recent.map(({ automation, run, at }) => (
          <button
            key={`${automation.id}-${run.number}`}
            type="button"
            onClick={() => onSelect(automation.id)}
            title={`${automation.name} #${run.number} · ${OUTCOME[run.status].label} · ${formatWhen(at)}`}
            aria-label={`${automation.name} run ${run.number}, ${OUTCOME[run.status].label}`}
            className="absolute top-1/2 grid size-5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-background outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            style={{ left: `${Math.min(99, Math.max(1, ((at - (MOCK_NOW - DAY)) / DAY) * 100))}%` }}
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
  )
}
