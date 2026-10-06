import { SectionLabel } from "@/components/common/page-toolbar"
import { StatusDot } from "@/components/common/status-mark"
import { automationsFor, OUTCOME } from "@/data/automations"
import type { Workflow } from "@/data/workflows"
import { useAppActions } from "@/lib/app-instance"
import type { ProjectId } from "@/lib/projects"
import { RunDot } from "@/pages/automations/run-dot"
import { formatWhen, parseLocal } from "@/pages/automations/schedule"
import { runsOf } from "@/pages/workflows/model"

export function EndingSection({ workflow }: { workflow: Workflow }) {
  const { ending } = workflow
  return (
    <section className="flex flex-col gap-2">
      <SectionLabel>Ending</SectionLabel>
      <p className="text-sm">
        <span className="font-medium">{ending.mode === "goal" ? "Goal" : "Grind"}</span>
        <span className="text-muted-foreground">
          {ending.mode === "goal"
            ? ` — checks the result and stops when: ${ending.doneWhen.charAt(0).toLowerCase()}${ending.doneWhen.slice(1)}.`
            : ` — keeps going until ${ending.doneWhen}, or ${ending.turnCap} turns.`}
        </span>
      </p>
      {ending.atCap && <p className="text-xs text-muted-foreground">At the cap: {ending.atCap.charAt(0).toLowerCase() + ending.atCap.slice(1)}.</p>}
      <p className="text-xs text-muted-foreground">
        When the task opens a pull request, after its last stop it pushes, watches CI, fixes failures up to 3 times, then opens a
        draft PR whose body is the run's summary, with the last verification and the low findings Fix never saw; at the cap it stops
        and asks. Without a pull request nothing is committed, and the run ends in review for you.
      </p>
      <p className="text-xs text-muted-foreground">
        You can pause a run between steps; the running step finishes first. The daemon pauses it too, rather than failing it, when
        an agent's account is out of quota, an agent process dies, or the daemon restarts. Resume starts that step again.
      </p>
    </section>
  )
}

export function ParametersSection({ workflow }: { workflow: Workflow }) {
  if (!workflow.parameters.length) return null
  return (
    <section className="flex flex-col gap-2">
      <SectionLabel>Parameters</SectionLabel>
      <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs">
        {workflow.parameters.map((param) => (
          <div key={param.key} className="contents">
            <dt className="font-mono">{`{{${param.key}}}`}</dt>
            <dd className="min-w-0">
              {param.description}
              <span className="text-muted-foreground">
                {" "}
                · {param.type}, {param.requirement}
                {param.default && `, default ${param.default}`}
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

/** Which tasks ran this recipe: board tasks first, then tasks automations started. */
export function RecentRuns({ workflow, project }: { workflow: Workflow; project: ProjectId }) {
  const { select } = useAppActions()
  const runs = runsOf(workflow, project)
  const tasks = runs.tasks
  const startedBy = (taskId: string) =>
    automationsFor(project).find((automation) => automation.runs.some((run) => run.task === taskId))?.name
  const automated = [...runs.automated].sort((a, b) => parseLocal(b.run.at) - parseLocal(a.run.at)).slice(0, 4)

  return (
    <section className="flex flex-col gap-1">
      <SectionLabel className="pb-1">Recent runs</SectionLabel>
      {tasks.length === 0 && automated.length === 0 && (
        <p className="text-xs text-muted-foreground">No task in this project has run it yet.</p>
      )}
      <ul className="-mx-2 flex flex-col">
        {tasks.map((task) => (
          <li key={task.id}>
            <button
              type="button"
              onClick={() => select("task", task.id, "task")}
              className="flex w-full items-center gap-2 rounded-md px-2 py-(--row-py) text-left text-sm hover:bg-muted"
            >
              <StatusDot status={task.status} />
              <span className="min-w-0 flex-1 truncate">{task.title}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {startedBy(task.id) ? `${startedBy(task.id)} · ` : ""}
                {task.stage} · {task.updated}
              </span>
            </button>
          </li>
        ))}
        {automated.map(({ automation, run }) => (
          <li
            key={`${automation.id}-${run.number}`}
            title={run.task ? `Task ${run.task}, archived after the run` : OUTCOME[run.status].hint}
            className="flex items-center gap-2 px-2 py-(--row-py) text-sm"
          >
            <RunDot status={run.status} />
            <span className="min-w-0 flex-1 truncate">
              {automation.name} <span className="text-muted-foreground">#{run.number}</span>
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {OUTCOME[run.status].label} · {formatWhen(parseLocal(run.at))}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
