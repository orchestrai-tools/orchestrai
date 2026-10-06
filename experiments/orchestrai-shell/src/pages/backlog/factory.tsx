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
import { Input } from "@/components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { AGENTS } from "@/data/agents"
import type { FactoryEntry, FactorySettings, WorkItem } from "@/data/backlog"
import type { ProjectId } from "@/lib/projects"
import { factoryActions, useBacklogStore, useFactory } from "@/pages/backlog/backlog-store"
import { say } from "@/pages/changes/toast-store"

const WORKFLOWS = ["Plan → Implement → Review", "Implement → Verify"]
const LOCATIONS: { value: FactorySettings["location"]; label: string; hint: string }[] = [
  { value: "auto", label: "Automatic", hint: "Your project folder when the workflow tests the running app, a background copy otherwise." },
  { value: "worktree", label: "Background copy", hint: "Each task gets its own worktree; several can run at once." },
  { value: "checkout", label: "Your project folder", hint: "One at a time, so the running dev services serve the change. Only on a clean tree." },
]

const LIMITS: { key: "maxConcurrent" | "maxOpenPrs" | "maxPerDay" | "minFreeGb" | "headroomPct"; label: string; hint: string }[] = [
  { key: "maxConcurrent", label: "Tasks at the same time", hint: "Only one of them runs in your project folder." },
  { key: "maxOpenPrs", label: "Pause at open draft PRs", hint: "Review is the real limit; new tasks wait while this many are open." },
  { key: "maxPerDay", label: "New tasks per 24 hours", hint: "A rolling day, counted from when each started." },
  { key: "minFreeGb", label: "Keep at least (GB free)", hint: "A built worktree of this repository takes about 15 GB." },
  { key: "headroomPct", label: "Pause when quota use passes (%)", hint: "Out of quota always waits. Never holds back a stage of a task already running." },
]

/** One line under the toolbar while the Factory holds work: how much, and why the next one is not starting. */
export function FactoryStrip({ project, onSettings }: { project: ProjectId; onSettings: () => void }) {
  const { entries, hold } = useFactory(project)
  if (!entries.length) return null
  const count = (state: FactoryEntry["state"]) => entries.filter((entry) => entry.state === state).length
  const parts = [count("running") && `${count("running")} running`, count("delivered") && `${count("delivered")} delivered`, count("queued") && `${count("queued")} queued`].filter(Boolean)
  return (
    <p className="flex items-center gap-2 px-4 pb-2 text-xs text-muted-foreground">
      <span className="font-medium text-foreground">Factory</span>
      <span>{parts.join(" · ")}</span>
      {hold && <span className="truncate">· Waiting: {hold}</span>}
      <Button variant="link" size="xs" className="h-auto px-0 text-xs" onClick={onSettings}>
        Factory settings
      </Button>
    </p>
  )
}

export function FactorySettingsDialog({ project, open, onClose }: { project: ProjectId; open: boolean; onClose: () => void }) {
  const { settings } = useFactory(project)
  const saveSettings = useBacklogStore((store) => store.saveSettings)
  const [draft, setDraft] = useState(settings)
  const [opened, setOpened] = useState(false)
  if (open !== opened) {
    setOpened(open)
    if (open) setDraft(settings)
  }
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Factory settings</DialogTitle>
          <DialogDescription>Limits hold back starting new Factory tasks, never a stage of one already running.</DialogDescription>
        </DialogHeader>
        <FieldGroup className="gap-3">
          {LIMITS.map((limit) => (
            <Field key={limit.key} orientation="horizontal" className="items-start">
              <div className="flex flex-1 flex-col">
                <FieldLabel htmlFor={`factory-${limit.key}`}>{limit.label}</FieldLabel>
                <FieldDescription className="text-xs">{limit.hint}</FieldDescription>
              </div>
              <Input
                id={`factory-${limit.key}`}
                type="number"
                min={limit.key === "minFreeGb" ? 0 : 1}
                value={draft[limit.key]}
                onChange={(event) => setDraft({ ...draft, [limit.key]: Number(event.target.value) })}
                className="h-7 w-20 text-right"
              />
            </Field>
          ))}
          <Field>
            <FieldLabel>New tasks run in</FieldLabel>
            <ToggleGroup type="single" variant="outline" size="sm" spacing={0} value={draft.location} onValueChange={(next) => next && setDraft({ ...draft, location: next as FactorySettings["location"] })} className="w-full">
              {LOCATIONS.map((location) => (
                <ToggleGroupItem key={location.value} value={location.value} className="flex-1 text-xs">{location.label}</ToggleGroupItem>
              ))}
            </ToggleGroup>
            <FieldDescription className="text-xs">{LOCATIONS.find((location) => location.value === draft.location)?.hint}</FieldDescription>
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => {
              saveSettings(project, draft)
              say("Factory settings saved")
              onClose()
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Starts Factory tasks for items: each runs a workflow, commits, and opens a draft PR, under the project's limits. */
export function RunInFactoryDialog({ project, items, onClose }: { project: ProjectId; items: WorkItem[] | null; onClose: () => void }) {
  const { entries, settings, hold } = useFactory(project)
  const [workflow, setWorkflow] = useState(settings.workflow)
  const [agent, setAgent] = useState(settings.agent)
  const [deliver, setDeliver] = useState(true)
  const list = items ?? []
  const skip = (item: WorkItem) =>
    entries.some((entry) => entry.item === item.id) ? "already in the Factory" : item.status === "done" || item.status === "cancelled" ? "closed" : item.task ? `has a task (${item.task})` : undefined
  const startable = list.filter((item) => !skip(item))

  return (
    <Dialog open={items !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{list.length === 1 ? `Start ${list[0].number} in the Factory` : `Start ${startable.length} Factory tasks`}</DialogTitle>
          <DialogDescription>
            {deliver
              ? hold
                ? `They queue by priority. Right now the Factory is waiting: ${hold}.`
                : "They queue by priority and start as slots free up."
              : "Without a pull request each one runs its workflow now, and nothing is committed or pushed."}
          </DialogDescription>
        </DialogHeader>
        <ul className="max-h-40 overflow-y-auto rounded-md bg-muted/40 px-3 py-2 text-xs">
          {list.map((item) => (
            <li key={item.id} className="flex items-center gap-2 py-0.5">
              <span className="w-16 shrink-0 font-mono text-muted-foreground">{item.number}</span>
              <span className="truncate">{item.title}</span>
              {skip(item) && <span className="ml-auto shrink-0 text-muted-foreground">skipped: {skip(item)}</span>}
            </li>
          ))}
        </ul>
        <FieldGroup className="gap-3">
          <Field>
            <FieldLabel>Workflow</FieldLabel>
            <ToggleGroup type="single" variant="outline" size="sm" spacing={0} value={workflow} onValueChange={(next) => next && setWorkflow(next)} className="w-full">
              {WORKFLOWS.map((entry) => (
                <ToggleGroupItem key={entry} value={entry} className="flex-1 text-xs">{entry}</ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Field>
          <Field>
            <FieldLabel>Lead agent</FieldLabel>
            <ToggleGroup type="single" variant="outline" size="sm" spacing={0} value={agent} onValueChange={(next) => next && setAgent(next)} className="w-full">
              {AGENTS.filter((entry) => entry.status !== "missing").map((entry) => (
                <ToggleGroupItem key={entry.id} value={entry.id} disabled={entry.status !== "ready"} className="flex-1 text-xs">{entry.name}</ToggleGroupItem>
              ))}
            </ToggleGroup>
            <FieldDescription className="text-xs">Stages the workflow pins to an agent keep their own.</FieldDescription>
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={deliver} onCheckedChange={(value) => setDeliver(value === true)} />
            Open a draft PR when done
          </label>
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!startable.length}
            onClick={() => {
              if (deliver) factoryActions(project).enqueue(startable)
              else say(`Started ${startable.length} ${startable.length === 1 ? "pipeline" : "pipelines"} with ${workflow}; nothing is committed or pushed`)
              onClose()
            }}
          >
            {deliver ? "Queue" : "Start"} {startable.length === 1 ? "1 task" : `${startable.length} tasks`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
