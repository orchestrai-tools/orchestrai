import { useId, useState } from "react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Kbd } from "@/components/ui/kbd"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { AGENTS } from "@/data/agents"
import type { Autonomy, Stage } from "@/data/tasks"
import { stageChain, workflowsFor } from "@/data/workflows"
import { useAppActions, useAppSession } from "@/lib/app-instance"
import { useDialog } from "@/lib/dialog-store"
import { findProject, PROJECTS, type ProjectId } from "@/lib/projects"
import { SelectMenu, type SelectOption } from "@/components/common/select-menu"

export function useNewTask() {
  const { open } = useDialog()
  return () => open("new-task")
}

const NO_WORKFLOW = "none"
const STOPS: readonly { id: Stage; label: string }[] = [
  { id: "requirements", label: "Requirements" },
  { id: "plan", label: "Plan" },
  { id: "merge", label: "Merge" },
]
const AUTONOMY: readonly { id: Autonomy; label: string; hint: string }[] = [
  { id: "suggest", label: "Suggest", hint: "Proposes; you apply" },
  { id: "draft", label: "Draft", hint: "Writes; asks before risky steps" },
  { id: "execute", label: "Execute", hint: "Runs to the next stop on its own" },
]

const firstWorkflow = (project: ProjectId) => workflowsFor(project).find((entry) => !entry.error)?.id ?? NO_WORKFLOW

const PROJECT_OPTIONS: readonly SelectOption[] = PROJECTS.map((entry) => ({
  value: entry.id,
  label: entry.name,
  hint: entry.repo,
}))

/**
 * A task is one run: a goal, an agent, a workflow, and where it stops for
 * you. It gets its own worktree. Risky steps still ask, whatever the dial says.
 */
export function NewTaskDialog() {
  const { current, close } = useDialog()
  return (
    <Dialog open={current === "new-task"} onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-lg">
        <NewTaskForm onClose={close} />
      </DialogContent>
    </Dialog>
  )
}

/** Mounted only while the dialog is open, so every new task starts from fresh defaults. */
function NewTaskForm({ onClose }: { onClose: () => void }) {
  const home = useAppSession((session) => session.home)
  const [target, setTarget] = useState<ProjectId>(useAppSession((session) => session.project))
  const project = findProject(target)
  const { setPage, selectProject } = useAppActions()
  const [agent, setAgent] = useState("claude")
  const workflows = workflowsFor(project.id)
  const [workflow, setWorkflow] = useState(firstWorkflow(target))
  const workflowOptions: SelectOption[] = [
    ...workflows.map((entry) => ({
      value: entry.id,
      label: entry.name,
      hint: entry.error ? `Does not load: ${entry.error}` : stageChain(entry),
      disabled: Boolean(entry.error),
    })),
    { value: NO_WORKFLOW, label: "No workflow", hint: "One agent session, no stages" },
  ]
  const [autonomy, setAutonomy] = useState<Autonomy>("draft")
  const [stops, setStops] = useState<Stage[]>(["plan", "merge"])
  const goalId = useId()

  const start = () => {
    onClose()
    if (home) selectProject(target)
    setPage("board")
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{home ? "New task" : `New task in ${project.name}`}</DialogTitle>
        <DialogDescription>Runs in its own worktree off {project.branch}.</DialogDescription>
      </DialogHeader>
      <FieldGroup className="gap-5">
        {home && (
          <Field>
            <FieldLabel>Project</FieldLabel>
            <SelectMenu
              label="Project"
              value={target}
              options={PROJECT_OPTIONS}
              onChange={(next) => {
                setTarget(next as ProjectId)
                setWorkflow(firstWorkflow(next as ProjectId))
              }}
              className="w-full"
            />
          </Field>
        )}
        <Field>
          <FieldLabel htmlFor={goalId}>Goal</FieldLabel>
          <Textarea
            id={goalId}
            autoFocus
            placeholder="What should be true when this is done?"
            onKeyDown={(event) => event.key === "Enter" && event.metaKey && start()}
          />
        </Field>
        <Field>
          <FieldLabel>Agent</FieldLabel>
          <ToggleGroup
            type="single"
            variant="outline"
            spacing={0}
            value={agent}
            onValueChange={(next) => next && setAgent(next)}
            className="w-full"
          >
            {AGENTS.filter((entry) => entry.status !== "missing").map((entry) => (
              <ToggleGroupItem key={entry.id} value={entry.id} className="flex-1" disabled={entry.status !== "ready"}>
                {entry.name}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Field>
        <Field>
          <FieldLabel>Workflow</FieldLabel>
          <SelectMenu
            label="Workflow"
            value={workflow}
            options={workflowOptions}
            onChange={setWorkflow}
            className="w-full"
          />
        </Field>
        <Field>
          <FieldLabel>Stop for me at</FieldLabel>
          <div className="flex gap-4">
            {STOPS.map((stop) => (
              <label key={stop.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={stops.includes(stop.id)}
                  onCheckedChange={(checked) =>
                    setStops((current) => (checked ? [...current, stop.id] : current.filter((id) => id !== stop.id)))
                  }
                />
                {stop.label}
              </label>
            ))}
          </div>
          <FieldDescription>
            After the last stop it pushes, watches CI, fixes up to 3 times, and opens a draft PR.
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel>Autonomy</FieldLabel>
          <ToggleGroup
            type="single"
            variant="outline"
            spacing={0}
            value={autonomy}
            onValueChange={(next) => next && setAutonomy(next as Autonomy)}
            className="w-full"
          >
            {AUTONOMY.map((entry) => (
              <ToggleGroupItem key={entry.id} value={entry.id} className="flex-1">
                {entry.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <FieldDescription>{AUTONOMY.find((entry) => entry.id === autonomy)?.hint}</FieldDescription>
        </Field>
      </FieldGroup>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={start}>
          Start task{" "}
          <Kbd className="border-primary-foreground/20 bg-primary-foreground/10 text-primary-foreground">⌘↵</Kbd>
        </Button>
      </DialogFooter>
    </>
  )
}
