import type { ReactNode } from "react"
import { MoreHorizontalIcon } from "lucide-react"

import { SectionLabel } from "@/components/common/page-toolbar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { findAgent } from "@/data/agents"
import { OUTCOME, type Automation, type AutomationRun } from "@/data/automations"
import { findTask } from "@/data/tasks"
import { useAppActions } from "@/lib/app-instance"
import { nextDetail, runsGoTo, triggerDetail, triggerLine } from "@/pages/automations/describe"
import { RunDot } from "@/pages/automations/run-dot"
import { formatWhen, parseLocal } from "@/pages/automations/schedule"

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="contents">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  )
}

function RunRow({ run }: { run: AutomationRun }) {
  const { select } = useAppActions()
  const task = findTask(run.task)
  const by = run.by === "event" ? run.cause : run.by === "manual" ? "By hand" : "Scheduled"
  return (
    <li className="group/row flex items-start gap-3 rounded-md px-2 py-(--row-py) hover:bg-muted">
      <span className="mt-1.5">
        <RunDot status={run.status} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="text-muted-foreground tabular-nums">#{run.number}</span>
          <span className="font-medium">{OUTCOME[run.status].label}</span>
          <span className="text-xs text-muted-foreground">
            {by} · {formatWhen(parseLocal(run.at))}
            {run.duration && ` · ${run.duration}`}
          </span>
        </div>
        <p className={run.error ? "text-xs" : "text-xs text-muted-foreground"}>{run.error ?? run.output ?? OUTCOME[run.status].hint}</p>
      </div>
      {task ? (
        <Button
          size="xs"
          variant="ghost"
          onClick={() => select("task", task.id, "task")}
          className="opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100"
        >
          Open task
        </Button>
      ) : (
        run.task && <span className="shrink-0 font-mono text-xs text-muted-foreground" title="Archived after the run">{run.task}</span>
      )}
    </li>
  )
}

export function AutomationDetail({
  automation,
  runs,
  onRunNow,
  onToggle,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  automation: Automation
  runs: AutomationRun[]
  onRunNow: () => void
  onToggle: (enabled: boolean) => void
  onEdit: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const { setPage } = useAppActions()
  const agent = findAgent(automation.agent)
  const schedule = automation.trigger.kind === "schedule"
  const running = schedule && runs.some((run) => run.status === "running" || run.status === "pending")

  return (
    <article className="flex min-w-0 flex-col gap-6">
      <header className="flex flex-col gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{automation.name}</h2>
          <p className="text-sm text-muted-foreground">
            {triggerLine(automation.trigger)} · {triggerDetail(automation.trigger)}
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
            title={running ? "One run at a time: the last run has not finished" : schedule ? "Runs once now and skips the precheck" : "Runs once now, on the last matching event"}
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
              <DropdownMenuItem onSelect={() => setPage("workflows")}>Open workflows</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                Delete…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <dl className="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
        <Fact label="Starts a task that runs">
          {automation.workflow === "No workflow" ? (
            "No workflow: one agent, one session"
          ) : (
            <button type="button" className="underline-offset-2 hover:underline" onClick={() => setPage("workflows")}>
              {automation.workflow}
            </button>
          )}
        </Fact>
        <Fact label="Goal">
          <span className="whitespace-pre-wrap">{automation.goal}</span>
        </Fact>
        {automation.params && (
          <Fact label="Parameters">
            {Object.entries(automation.params).map(([key, value]) => (
              <span key={key} className="mr-3 font-mono text-xs">
                {key} = {value}
              </span>
            ))}
          </Fact>
        )}
        <Fact label="Lead agent">
          {agent.name} <span className="text-muted-foreground">· {automation.model ?? "agent default"}</span>
        </Fact>
        <Fact label="Stops for you at">{automation.stops.length ? automation.stops.join(", ") : "Nowhere; it runs to the end"}</Fact>
        <Fact label="Runs go to">{runsGoTo(automation)}</Fact>
        <Fact label="Draft PR">{automation.openPr ? "Opens one when the run succeeds" : "No; nothing is committed"}</Fact>
        {schedule && (
          <>
            <Fact label="Precheck">
              {automation.precheck ? (
                <>
                  <code className="font-mono text-xs break-words">{automation.precheck}</code>
                  <span className="block text-xs text-muted-foreground">Runs in the project folder first; anything but exit 0 skips the run. Run now skips it.</span>
                </>
              ) : (
                "None"
              )}
            </Fact>
            <Fact label="Missed-run grace">
              {automation.graceMinutes} minutes
              <span className="block text-xs text-muted-foreground">A run that came due while OrchestrAI was closed still runs if it is less late than this.</span>
            </Fact>
          </>
        )}
        <Fact label="Created">{automation.created}</Fact>
      </dl>

      <section className="flex flex-col gap-1">
        <SectionLabel className="pb-1">Run history</SectionLabel>
        {runs.length === 0 ? (
          <p className="text-xs text-muted-foreground">No runs yet. Run now starts one without touching the schedule.</p>
        ) : (
          <ol className="-mx-2 flex flex-col">
            {runs.map((run) => (
              <RunRow key={run.number} run={run} />
            ))}
          </ol>
        )}
        <p className="pt-1 text-xs text-muted-foreground">
          {schedule
            ? "One run at a time: an occurrence that comes due while the last run is still going is skipped, and says so."
            : "Each matching event starts its own task; the issue or review text reaches the agent marked as untrusted."}{" "}
          Every run is a real task with its own transcript and diff.
        </p>
      </section>
    </article>
  )
}
