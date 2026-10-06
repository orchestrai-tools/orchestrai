import { useId, useState, type ReactNode } from "react"

import { SectionLabel } from "@/components/common/page-toolbar"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { AGENTS, findAgent, type AgentId } from "@/data/agents"
import type { Automation } from "@/data/automations"
import type { Stage } from "@/data/tasks"
import { workflowsFor } from "@/data/workflows"
import { useAppSession } from "@/lib/app-instance"
import { findProject } from "@/lib/projects"
import { parseCron } from "@/pages/automations/schedule"
import { SelectMenu } from "@/components/common/select-menu"
import { TriggerFields, type ScheduleTime } from "@/pages/automations/trigger-fields"

const STOPS: readonly { id: Stage; label: string }[] = [
  { id: "requirements", label: "Requirements" },
  { id: "plan", label: "Plan" },
  { id: "merge", label: "Merge" },
]

function timeOf(automation: Automation): ScheduleTime {
  if (automation.trigger.kind !== "schedule") return { hour: 9, minute: 0, weekday: 1 }
  const [minute, hour, , , weekday] = automation.trigger.cron.split(" ")
  const day = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].indexOf(weekday?.split("-")[0] ?? "")
  return { hour: Number(hour) || 0, minute: Number(minute) || 0, weekday: day >= 0 ? day : 1 }
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-start gap-3">
      <Switch checked={checked} onCheckedChange={onChange} className="mt-0.5" />
      <span className="flex flex-col">
        <span className="text-sm">{label}</span>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </span>
    </label>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <SectionLabel>{title}</SectionLabel>
      {children}
    </section>
  )
}

function AutomationForm({ initial, isNew, onClose, onSave }: { initial: Automation; isNew: boolean; onClose: () => void; onSave: (automation: Automation, runNow: boolean) => void }) {
  const project = findProject(useAppSession((session) => session.project))
  const [draft, setDraft] = useState(initial)
  const [time, setTime] = useState(() => timeOf(initial))
  const id = useId()
  const patch = (change: Partial<Automation>) => setDraft((current) => ({ ...current, ...change }))
  const agent = findAgent(draft.agent)
  const schedule = draft.trigger.kind === "schedule"

  const workflows = [
    { value: "No workflow", label: "No workflow", hint: "One agent, one session" },
    ...workflowsFor(project.id)
      .filter((workflow) => !workflow.error)
      .map((workflow) => ({ value: workflow.name, label: workflow.name, hint: workflow.source === "builtin" ? "Built in" : workflow.description })),
  ]
  const problems = [
    !draft.name.trim() && "Give it a name.",
    !draft.goal.trim() && "Say what each task should do.",
    draft.trigger.kind === "schedule" && !parseCron(draft.trigger.cron) && "Fix the cron.",
    schedule && !(draft.graceMinutes >= 1) && "The grace window is at least 1 minute; 0 would skip every run.",
  ].filter((problem): problem is string => Boolean(problem))

  const save = (runNow: boolean) => problems.length === 0 && onSave(draft, runNow)

  return (
    <>
      <DialogHeader>
        <DialogTitle>{isNew ? "New automation" : `Edit ${initial.name}`}</DialogTitle>
        <DialogDescription>A trigger that starts a task in {project.name}. It never talks to a model itself; the task it starts does.</DialogDescription>
      </DialogHeader>

      <Section title="What it starts">
        <Field>
          <FieldLabel htmlFor={`${id}-name`}>Name</FieldLabel>
          <Input id={`${id}-name`} autoFocus value={draft.name} placeholder="Nightly clippy sweep" onChange={(event) => patch({ name: event.target.value })} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel>Workflow</FieldLabel>
            <SelectMenu label="Workflow" value={draft.workflow} options={workflows} onChange={(workflow) => patch({ workflow })} />
          </Field>
          <Field>
            <FieldLabel>Lead agent</FieldLabel>
            <SelectMenu
              label="Lead agent"
              value={draft.agent}
              options={AGENTS.map((entry) => ({ value: entry.id, label: entry.name, hint: entry.status === "ready" ? entry.model : entry.status === "missing" ? "Not installed" : "Needs sign-in", disabled: entry.status !== "ready" }))}
              onChange={(value) => patch({ agent: value as AgentId, model: findAgent(value as AgentId).model })}
            />
            <FieldDescription className="text-xs">Model pinned to {draft.model ?? agent.model}, so no run drifts onto another one.</FieldDescription>
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor={`${id}-goal`}>Goal for each task</FieldLabel>
          <Textarea id={`${id}-goal`} value={draft.goal} rows={3} onChange={(event) => patch({ goal: event.target.value })} />
          {!schedule && <FieldDescription className="text-xs">Use {"{{issue.number}}, {{issue.title}}, {{issue.body}}, or {{pr.number}}"} to bring in the event.</FieldDescription>}
        </Field>
        <Field>
          <FieldLabel>Stop for me at</FieldLabel>
          <div className="flex gap-4">
            {STOPS.map((stop) => (
              <label key={stop.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={draft.stops.includes(stop.id)}
                  onCheckedChange={(checked) => patch({ stops: checked ? [...draft.stops, stop.id] : draft.stops.filter((entry) => entry !== stop.id) })}
                />
                {stop.label}
              </label>
            ))}
          </div>
        </Field>
      </Section>

      <Section title="When">
        <TriggerFields trigger={draft.trigger} time={time} repo={project.repo} onChange={(trigger) => patch({ trigger })} onTime={setTime} />
      </Section>

      <Section title="Where, and the guards around a run">
        <Toggle label="Same task every run" hint="Off: each run is a new task on the board. On: every run continues one task, so the board never fills up." checked={draft.reuseTask} onChange={(reuseTask) => patch({ reuseTask })} />
        <Toggle label="Isolated worktree" hint="Each new task codes in its own copy of the repo." checked={draft.worktree} onChange={(worktree) => patch({ worktree })} />
        {draft.worktree && (
          <Field className="w-64">
            <FieldLabel>Start each run from</FieldLabel>
            <SelectMenu
              label="Start each run from"
              value={typeof draft.base === "string" ? draft.base : draft.base.branch}
              options={[
                { value: "head", label: `Current branch (${project.branch})` },
                { value: "origin", label: "Latest from origin" },
                ...(typeof draft.base === "object" ? [{ value: draft.base.branch, label: draft.base.branch }] : []),
              ]}
              onChange={(value) => patch({ base: value === "head" || value === "origin" ? value : { branch: value } })}
            />
          </Field>
        )}
        <Toggle label="Open a draft PR when done" hint="After the last stop it pushes, watches CI, fixes up to 3 times, and opens a draft PR." checked={draft.openPr} onChange={(openPr) => patch({ openPr })} />
        {schedule && (
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
            <Field>
              <FieldLabel htmlFor={`${id}-precheck`}>Precheck</FieldLabel>
              <Input id={`${id}-precheck`} spellCheck={false} className="font-mono text-xs md:text-xs" placeholder="git fetch --quiet" value={draft.precheck ?? ""} onChange={(event) => patch({ precheck: event.target.value || undefined })} />
              <FieldDescription className="text-xs">Runs in the project folder before each scheduled run, for up to 2 minutes. Anything but exit 0 skips the run.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor={`${id}-grace`}>Missed-run grace</FieldLabel>
              <Input id={`${id}-grace`} inputMode="numeric" value={Number.isNaN(draft.graceMinutes) ? "" : draft.graceMinutes} onChange={(event) => patch({ graceMinutes: Number(event.target.value) })} />
              <FieldDescription className="text-xs">Minutes late a missed run may still start.</FieldDescription>
            </Field>
          </div>
        )}
        <Toggle label="On" hint="A paused automation keeps its history and never fires." checked={draft.enabled} onChange={(enabled) => patch({ enabled })} />
      </Section>

      <DialogFooter className="items-center">
        {problems.length > 0 && <p className="mr-auto text-xs text-muted-foreground">{problems[0]}</p>}
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="outline" disabled={problems.length > 0} onClick={() => save(true)} title="Saves, then runs once now; the schedule is untouched">
          {isNew ? "Create and run now" : "Save and run now"}
        </Button>
        <Button disabled={problems.length > 0} onClick={() => save(false)}>
          {isNew ? "Create automation" : "Save"}
        </Button>
      </DialogFooter>
    </>
  )
}

export function AutomationDialog({
  editing,
  blank,
  onClose,
  onSave,
}: {
  editing: Automation | null
  blank: Automation | null
  onClose: () => void
  onSave: (automation: Automation, runNow: boolean) => void
}) {
  const initial = editing ?? blank
  return (
    <Dialog open={initial !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(var(--app-dvh)-2rem)] gap-6 overflow-y-auto sm:max-w-xl">
        {initial && <AutomationForm key={initial.id} initial={initial} isNew={editing === null} onClose={onClose} onSave={onSave} />}
      </DialogContent>
    </Dialog>
  )
}
