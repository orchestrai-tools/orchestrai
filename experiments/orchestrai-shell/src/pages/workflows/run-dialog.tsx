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
import { Input } from "@/components/ui/input"
import { Kbd } from "@/components/ui/kbd"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { AGENTS, findAgent, type AgentId } from "@/data/agents"
import type { Stage } from "@/data/tasks"
import { blockedPins, pinnedAgents, type Workflow } from "@/data/workflows"
import { useAppActions, useAppSession } from "@/lib/app-instance"
import { findProject } from "@/lib/projects"

type Location = "auto" | "worktree" | "checkout"

const LOCATIONS: readonly { id: Location; label: string; hint: string }[] = [
  { id: "auto", label: "Automatic", hint: "A background copy, or your project folder when the workflow tests the running app." },
  { id: "worktree", label: "Background copy", hint: "Its own worktree, so your checkout is never touched." },
  { id: "checkout", label: "Project folder", hint: "Your checkout, one task at a time. It switches to a task branch and back, only on a clean tree." },
]

const STOPS: readonly { id: Stage; label: string }[] = [
  { id: "requirements", label: "Requirements" },
  { id: "plan", label: "Plan" },
  { id: "merge", label: "Merge" },
]

function RunForm({ workflow, onClose }: { workflow: Workflow; onClose: () => void }) {
  const project = findProject(useAppSession((session) => session.project))
  const { setPage } = useAppActions()
  const [agent, setAgent] = useState<AgentId>("claude")
  const [stops, setStops] = useState<Stage[]>(workflow.stops)
  const [location, setLocation] = useState<Location>("auto")
  const [openPr, setOpenPr] = useState(true)
  const [values, setValues] = useState<Record<string, string>>({})
  const goalId = useId()

  const verifyRequired = workflow.steps.some((step) => step.verify?.required)
  const resolved = location === "auto" ? (verifyRequired ? "checkout" : "worktree") : location
  const pins = pinnedAgents(workflow)
  const blocked = blockedPins(workflow)
  const missing = workflow.parameters.filter((param) => param.requirement === "required" && !values[param.key]?.trim())

  const start = () => {
    if (missing.length) return
    onClose()
    setPage("board")
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Run {workflow.name}</DialogTitle>
        <DialogDescription>
          Starts one task in {project.name} that runs this workflow, off {project.branch}.
        </DialogDescription>
      </DialogHeader>
      <FieldGroup className="gap-5">
        <Field>
          <FieldLabel htmlFor={goalId}>Goal</FieldLabel>
          <Textarea
            id={goalId}
            autoFocus
            placeholder="What should be true when this is done?"
            onKeyDown={(event) => event.key === "Enter" && event.metaKey && start()}
          />
        </Field>
        {workflow.parameters.map((param) => (
          <Field key={param.key}>
            <FieldLabel htmlFor={`${goalId}-${param.key}`}>
              {param.key}
              <span className="font-normal text-muted-foreground">{param.requirement === "required" ? "required" : "optional"}</span>
            </FieldLabel>
            <Input
              id={`${goalId}-${param.key}`}
              inputMode={param.type === "number" ? "numeric" : undefined}
              placeholder={param.default}
              value={values[param.key] ?? ""}
              onChange={(event) => setValues((current) => ({ ...current, [param.key]: event.target.value }))}
            />
            <FieldDescription className="text-xs">{param.description}</FieldDescription>
          </Field>
        ))}
        <Field>
          <FieldLabel>Lead agent</FieldLabel>
          <ToggleGroup type="single" variant="outline" spacing={0} value={agent} onValueChange={(next) => next && setAgent(next as AgentId)} className="w-full">
            {AGENTS.filter((entry) => entry.status !== "missing").map((entry) => (
              <ToggleGroupItem key={entry.id} value={entry.id} className="flex-1" disabled={entry.status !== "ready"}>
                {entry.name}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <FieldDescription className="text-xs">
            {pins.length
              ? `Pinned by the workflow: ${pins.map((pin) => `${pin.step} → ${findAgent(pin.agent).name}`).join(", ")}. The lead agent runs every other step.`
              : "Runs every step; this workflow pins no agent."}
          </FieldDescription>
          {blocked.map((pin) => (
            <p key={`${pin.step}-${pin.agent}`} className="flex items-start gap-2 text-xs">
              <span aria-hidden className="mt-1 size-1.5 shrink-0 rounded-full bg-amber-500" />
              {pin.step} pins {pin.info.name}, which is {pin.info.status === "missing" ? "not installed" : "not signed in"}. The run would stop at
              that step until it is.
            </p>
          ))}
        </Field>
        <Field>
          <FieldLabel>Stop for me at</FieldLabel>
          <div className="flex gap-4">
            {STOPS.map((stop) => (
              <label key={stop.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={stops.includes(stop.id)}
                  onCheckedChange={(checked) => setStops((current) => (checked ? [...current, stop.id] : current.filter((id) => id !== stop.id)))}
                />
                {stop.label}
              </label>
            ))}
          </div>
        </Field>
        <Field>
          <FieldLabel>Where it runs</FieldLabel>
          <ToggleGroup type="single" variant="outline" spacing={0} value={location} onValueChange={(next) => next && setLocation(next as Location)} className="w-full">
            {LOCATIONS.map((entry) => (
              <ToggleGroupItem key={entry.id} value={entry.id} className="flex-1">
                {entry.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <FieldDescription className="text-xs">{LOCATIONS.find((entry) => entry.id === location)?.hint}</FieldDescription>
          {verifyRequired && resolved === "worktree" && (
            <p className="flex items-start gap-2 text-xs">
              <span aria-hidden className="mt-1 size-1.5 shrink-0 rounded-full bg-amber-500" />
              This workflow tests the running app, which only works in your project folder. In a background copy it stops at the test and
              waits for you.
            </p>
          )}
        </Field>
        <Field>
          <label className="flex items-center gap-2 text-sm font-medium">
            <Checkbox checked={openPr} onCheckedChange={(checked) => setOpenPr(checked === true)} />
            Open a draft PR when done
          </label>
          <FieldDescription className="text-xs">
            {openPr
              ? "After the last stop it pushes, watches CI, fixes up to 3 times, and opens a draft PR. It waits its turn: 1 task at a time, at most 3 open drafts, 10 a day."
              : "Nothing is committed or pushed; the finished run waits in review for you."}
          </FieldDescription>
        </Field>
      </FieldGroup>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={start} disabled={missing.length > 0} title={missing.length ? `Fill in ${missing.map((param) => param.key).join(", ")}` : undefined}>
          Start task <Kbd className="border-primary-foreground/20 bg-primary-foreground/10 text-primary-foreground">⌘↵</Kbd>
        </Button>
      </DialogFooter>
    </>
  )
}

/** A task is one run of a workflow: the recipe stays as it is, the task gets its own goal, copy, and stops. */
export function RunWorkflowDialog({ workflow, onClose }: { workflow: Workflow | null; onClose: () => void }) {
  return (
    <Dialog open={workflow !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(var(--app-dvh)-2rem)] overflow-y-auto sm:max-w-lg">
        {workflow && <RunForm key={workflow.id} workflow={workflow} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  )
}
