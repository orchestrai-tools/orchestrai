import { useId } from "react"

import { Checkbox } from "@/components/ui/checkbox"
import { AGENTS } from "@/data/agents"
import type { Autonomy, Stage } from "@/data/tasks"
import type { Project } from "@/lib/projects"
import { Choice, Group, Row, SectionHeader, SelectMenu, Stepper, SwitchRow } from "@/pages/settings/primitives"
import { useProjectSetting } from "@/pages/settings/settings-store"

const WORKFLOWS = [
  { value: "plan-implement-review", label: "Plan → Implement → Review" },
  { value: "review-loop", label: "Implement + review loop" },
  { value: "implement-verify", label: "Implement → Verify" },
  { value: "draft-review", label: "Draft → Review" },
]

const AUTONOMY: readonly { value: Autonomy; label: string; description: string }[] = [
  { value: "suggest", label: "Suggest", description: "Proposes changes; you apply them." },
  { value: "draft", label: "Draft", description: "Writes in its worktree and stops for your review." },
  { value: "execute", label: "Execute", description: "Carries on until the next stop point." },
]

const STOPS: readonly { id: Stage; label: string; hint: string }[] = [
  { id: "requirements", label: "Requirements", hint: "before planning" },
  { id: "plan", label: "Plan", hint: "before code is written" },
  { id: "merge", label: "Merge", hint: "before the pull request merges" },
]

const LOCATIONS = [
  { value: "auto", label: "Automatic (recommended)" },
  { value: "worktree", label: "A background copy" },
  { value: "checkout", label: "Your project folder" },
]

const DEFAULT_STOPS: Stage[] = ["plan", "merge"]

function StopPoints({ value, onChange }: { value: Stage[]; onChange: (value: Stage[]) => void }) {
  const id = useId()
  return (
    <div className="flex flex-wrap gap-4">
      {STOPS.map((stop) => (
        <label key={stop.id} htmlFor={`${id}-${stop.id}`} className="flex items-center gap-2 text-xs">
          <Checkbox
            id={`${id}-${stop.id}`}
            checked={value.includes(stop.id)}
            onCheckedChange={(checked) => onChange(checked ? [...value, stop.id] : value.filter((entry) => entry !== stop.id))}
          />
          <span>
            <span className="font-medium">{stop.label}</span> <span className="text-muted-foreground">{stop.hint}</span>
          </span>
        </label>
      ))}
    </div>
  )
}

export function TasksSection({ project }: { project: Project }) {
  const id = project.id
  const [workflow, setWorkflow] = useProjectSetting(id, "tasks.workflow", "plan-implement-review")
  const [lead, setLead] = useProjectSetting(id, "tasks.lead", "claude")
  const [autonomy, setAutonomy] = useProjectSetting<Autonomy>(id, "tasks.autonomy", "draft")
  const [stops, setStops] = useProjectSetting(id, "tasks.stops", DEFAULT_STOPS)
  const [push, setPush] = useProjectSetting(id, "tasks.push", true)
  const [attempts, setAttempts] = useProjectSetting(id, "tasks.fixAttempts", 3)
  const [draft, setDraft] = useProjectSetting(id, "tasks.draftPr", true)
  const [concurrent, setConcurrent] = useProjectSetting(id, "factory.concurrent", 1)
  const [openPrs, setOpenPrs] = useProjectSetting(id, "factory.openPrs", 3)
  const [perDay, setPerDay] = useProjectSetting(id, "factory.perDay", 10)
  const [freeGb, setFreeGb] = useProjectSetting(id, "factory.freeGb", 25)
  const [headroom, setHeadroom] = useProjectSetting(id, "factory.headroom", 80)
  const [location, setLocation] = useProjectSetting(id, "factory.location", "auto")

  const ready = AGENTS.filter((agent) => agent.status === "ready")

  return (
    <>
      <SectionHeader title="Tasks" scope="What the New task dialog starts with here. Stored by OrchestrAI on this Mac, not in the repository." />

      <Group title="New tasks">
        <Row title="Workflow" description="The recipe a task runs. Templates live in .warpforge/workflows." control={<SelectMenu label="Workflow" value={workflow} onChange={setWorkflow} options={WORKFLOWS} />} />
        <Row
          title="Lead agent"
          description="Runs every stage the workflow does not pin to another agent."
          control={<SelectMenu label="Lead agent" value={lead} onChange={setLead} options={ready.map((agent) => ({ value: agent.id, label: `${agent.name} · ${agent.model}` }))} />}
        />
        <Row
          title="Autonomy"
          description={AUTONOMY.find((entry) => entry.value === autonomy)?.description}
          control={<Choice label="Autonomy" value={autonomy} onChange={setAutonomy} options={AUTONOMY} />}
        />
        <Row title="Stop points" description="Where a task hands over to you, with what it was about to do and why it stopped.">
          <StopPoints value={stops} onChange={setStops} />
        </Row>
      </Group>

      <Group title="When a task finishes" note="Project memory is written only after a pull request merges; the next task gets a short, ranked slice of it.">
        <SwitchRow title="Push the branch" description="After the last stop point, push the task's branch." checked={push} onChange={setPush} />
        <Row
          title="Fix failing CI"
          description="Watch the checks and let the agent fix failures this many times, then stop and ask."
          control={<Stepper label="fix attempts" value={attempts} min={0} max={5} onChange={setAttempts} suffix=" tries" />}
        />
        <SwitchRow title="Open a draft pull request" description={`Once checks pass, against ${project.branch}.`} checked={draft} onChange={setDraft} />
      </Group>

      <Group title="Factory" note="Limits only hold back starting new Factory tasks and backlog batches, never a stage of a task already running.">
        <Row title="Tasks at the same time" description="Only one of them runs in your project folder." control={<Stepper label="tasks at once" value={concurrent} min={1} max={8} onChange={setConcurrent} />} />
        <Row title="Pause at open draft PRs" description="New tasks wait while this many of their draft PRs are open." control={<Stepper label="open draft PRs" value={openPrs} min={1} max={50} onChange={setOpenPrs} />} />
        <Row title="New tasks per 24 hours" description="Factory tasks started in any 24 hours." control={<Stepper label="tasks per day" value={perDay} min={1} max={200} onChange={setPerDay} />} />
        <Row title="Keep disk free" description="New tasks wait below this much free space. 0 turns it off." control={<Stepper label="free disk" value={freeGb} min={0} max={500} step={5} onChange={setFreeGb} suffix=" GB" />} />
        <Row
          title="Pause near quota"
          description="New tasks wait while an agent's quota use is above this. Out of quota always waits."
          control={<Stepper label="quota use" value={headroom} min={5} max={100} step={5} onChange={setHeadroom} suffix="%" />}
        />
        <Row
          title="Where it runs"
          description="Automatic uses your project folder when the task tests the running app, a background copy otherwise."
          control={<SelectMenu label="Where Factory tasks run" value={location} onChange={setLocation} options={LOCATIONS} />}
        />
      </Group>
    </>
  )
}
