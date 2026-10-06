import { useState } from "react"

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
import { AGENTS, type AgentId } from "@/data/agents"
import type { Stage } from "@/data/tasks"
import { say } from "@/pages/changes/toast-store"
import { useGithubStore } from "@/pages/github/github-store"

/** Where a task comes from: an issue, a backlog item, or a pull request's review. */
export interface StartRequest {
  /** Key in the started-task store, so every page that shows the source shows the task. */
  source: string
  /** How the source is named: `#218`, `ORC-15`, `WEB-142`. */
  label: string
  goal: string
  taskId: string
  /** The line the pull request carries, so merging it closes or links the source. */
  closes: string
}

const WORKFLOWS = ["Plan → Implement → Review", "Implement → Verify"]
const STOPS: readonly { id: Stage; label: string }[] = [
  { id: "requirements", label: "Requirements" },
  { id: "plan", label: "Plan" },
  { id: "merge", label: "Merge" },
]

/** The goal comes from the source, and the source learns the task's id: the link goes both ways. */
export function StartTaskDialog({ request, onClose, onStarted }: { request: StartRequest | null; onClose: () => void; onStarted?: (request: StartRequest) => void }) {
  const [goal, setGoal] = useState("")
  const [agent, setAgent] = useState<AgentId>("claude")
  const [workflow, setWorkflow] = useState(WORKFLOWS[0])
  const [stops, setStops] = useState<Stage[]>(["plan", "merge"])
  const [opened, setOpened] = useState<string>()
  const startTask = useGithubStore((store) => store.startTask)

  if (request && request.source !== opened) {
    setOpened(request.source)
    setGoal(request.goal)
  }

  const start = () => {
    if (!request || !goal.trim()) return
    startTask(request.source, { id: request.taskId, title: goal.split("\n")[0], agent, workflow, closes: request.closes })
    say(`Started ${request.taskId} from ${request.label} · waiting for a free worker`)
    onStarted?.(request)
    setOpened(undefined)
    onClose()
  }

  return (
    <Dialog open={request !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Start a task from {request?.label}</DialogTitle>
          <DialogDescription>Runs in its own worktree. It shows on the board as {request?.taskId}, and {request?.label} shows the task.</DialogDescription>
        </DialogHeader>
        <FieldGroup className="gap-4">
          <Field>
            <FieldLabel htmlFor="start-goal">Goal</FieldLabel>
            <Textarea
              id="start-goal"
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && (event.metaKey || event.ctrlKey) && start()}
              className="max-h-48 text-sm"
            />
            <FieldDescription className="text-xs">Text from a tracker reaches the agent marked as untrusted data, never as instructions.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel>Agent</FieldLabel>
            <ToggleGroup type="single" variant="outline" size="sm" spacing={0} value={agent} onValueChange={(next) => next && setAgent(next as AgentId)} className="w-full">
              {AGENTS.filter((entry) => entry.status !== "missing").map((entry) => (
                <ToggleGroupItem key={entry.id} value={entry.id} disabled={entry.status !== "ready"} className="flex-1 text-xs">
                  {entry.name}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Field>
          <Field>
            <FieldLabel>Workflow</FieldLabel>
            <ToggleGroup type="single" variant="outline" size="sm" spacing={0} value={workflow} onValueChange={(next) => next && setWorkflow(next)} className="w-full">
              {WORKFLOWS.map((entry) => (
                <ToggleGroupItem key={entry} value={entry} className="flex-1 text-xs">
                  {entry}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
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
            <FieldDescription className="text-xs">
              After the last stop it pushes, watches CI, fixes up to 3 times, and opens a draft PR that says “{request?.closes}”.
            </FieldDescription>
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!goal.trim()} onClick={start}>
            Start task <Kbd className="border-primary-foreground/20 bg-primary-foreground/10 text-primary-foreground">⌘↵</Kbd>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
