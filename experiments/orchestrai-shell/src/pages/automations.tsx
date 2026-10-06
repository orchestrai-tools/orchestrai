import { useState } from "react"

import { PageToolbar } from "@/components/common/page-toolbar"
import { Button } from "@/components/ui/button"
import { automationsFor, type Automation, type AutomationRun } from "@/data/automations"
import { useAppActions, useAppSession } from "@/lib/app-instance"
import { selectSelection } from "@/lib/window-store"
import { findProject, type ProjectId } from "@/lib/projects"
import { AutomationDetail } from "@/pages/automations/automation-detail"
import { AutomationDialog } from "@/pages/automations/automation-dialog"
import { AutomationFilters } from "@/pages/automations/automation-filters"
import { AutomationList } from "@/pages/automations/automation-list"
import { ConfirmDialog } from "@/components/common/confirm-dialog"
import { DayStrip } from "@/pages/automations/day-strip"
import { matchesFilters, type OutcomeFilter, type StateFilter } from "@/pages/automations/describe"

const NOW_ISO = "2026-10-01T15:56"

function blankAutomation(project: ProjectId, id: string): Automation {
  return {
    id,
    project,
    name: "",
    trigger: { kind: "schedule", preset: "weekdays", cron: "0 9 * * MON-FRI", timezone: "America/New_York" },
    workflow: "No workflow",
    goal: "",
    agent: "claude",
    model: "claude-sonnet-5.5",
    stops: [],
    graceMinutes: 720,
    reuseTask: false,
    worktree: true,
    base: "origin",
    openPr: false,
    enabled: true,
    created: "Just now",
    runs: [],
  }
}

/** Triggers that start tasks. The automation is the trigger; each run is a real task on the board. */
export function AutomationsPage() {
  const project = useAppSession((session) => session.project)
  const [edits, setEdits] = useState<Record<string, Automation>>({})
  const [created, setCreated] = useState<Automation[]>([])
  const [deleted, setDeleted] = useState<string[]>([])
  const [extraRuns, setExtraRuns] = useState<Record<string, AutomationRun[]>>({})
  const selectedId = useAppSession((session) => selectSelection(session, "automation"))
  const { select } = useAppActions()
  const setSelectedId = (id: string) => select("automation", id)
  const [editing, setEditing] = useState<Automation | null>(null)
  const [blank, setBlank] = useState<Automation | null>(null)
  const [deleting, setDeleting] = useState<Automation | null>(null)
  const [search, setSearch] = useState("")
  const [state, setState] = useState<StateFilter>("all")
  const [outcome, setOutcome] = useState<OutcomeFilter>("all")

  const automations = [...automationsFor(project), ...created.filter((automation) => automation.project === project)]
    .filter((automation) => !deleted.includes(automation.id))
    .map((automation) => edits[automation.id] ?? automation)
  const runsOf = (automation: Automation) => [...(extraRuns[automation.id] ?? []), ...automation.runs]
  const visible = automations.filter((automation) => matchesFilters(automation, runsOf(automation)[0], { search, state, outcome }))
  const selected = visible.find((automation) => automation.id === selectedId) ?? visible[0]
  const on = automations.filter((automation) => automation.enabled).length
  const clearFilters = () => {
    setSearch("")
    setState("all")
    setOutcome("all")
  }

  const update = (automation: Automation) => setEdits((current) => ({ ...current, [automation.id]: automation }))
  const toggle = (automation: Automation, enabled: boolean) =>
    update({ ...automation, enabled, pausedNote: enabled ? undefined : "Paused just now by you" })

  const runNow = (automation: Automation) => {
    const number = (runsOf(automation)[0]?.number ?? 0) + 1
    const run: AutomationRun = {
      number,
      by: "manual",
      status: "running",
      at: NOW_ISO,
      output: automation.trigger.kind === "schedule" ? "Started a task. The next scheduled run is unchanged." : "Started a task on the last matching event.",
    }
    setExtraRuns((current) => ({ ...current, [automation.id]: [run, ...(current[automation.id] ?? [])] }))
  }

  const save = (automation: Automation, run: boolean) => {
    if (editing) update(automation)
    else {
      setCreated((current) => [...current, automation])
      setSelectedId(automation.id)
    }
    if (run) runNow(automation)
    setEditing(null)
    setBlank(null)
  }

  const duplicate = (automation: Automation) => {
    const copy: Automation = {
      ...automation,
      id: `${automation.id}-copy-${created.length + 1}`,
      name: `${automation.name} (copy)`,
      enabled: false,
      pausedNote: "A copy starts paused, so it never fires twice by accident",
      created: "Just now",
      runs: [],
    }
    setCreated((current) => [...current, copy])
    setSelectedId(copy.id)
  }

  const openNew = () => setBlank(blankAutomation(project, `new-${project}-${created.length + 1}`))

  return (
    <div className="@container flex flex-col gap-5 p-4">
      <PageToolbar title="Automations" meta={automations.length ? `${automations.length} · ${on} on` : undefined}>
        {automations.length > 0 && (
          <AutomationFilters search={search} onSearch={setSearch} state={state} onState={setState} outcome={outcome} onOutcome={setOutcome} />
        )}
        <Button size="sm" variant="outline" onClick={openNew}>
          New automation
        </Button>
      </PageToolbar>

      {automations.length === 0 ? (
        <div className="flex flex-col items-start gap-3 py-8">
          <p className="max-w-prose text-sm text-muted-foreground">
            No automations in {findProject(project).name}. An automation is a trigger that starts a task: a schedule, a new issue, a label,
            or a review that asks for changes.
          </p>
          <Button size="sm" onClick={openNew}>
            New automation
          </Button>
        </div>
      ) : (
        <>
          <DayStrip
            automations={automations}
            runsOf={runsOf}
            onSelect={(id) => {
              clearFilters()
              setSelectedId(id)
            }}
          />
          {visible.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No automation matches.{" "}
              <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={clearFilters}>
                Clear the search and filters
              </button>
            </p>
          )}
          <div className="grid gap-6 @3xl:grid-cols-[20rem_minmax(0,1fr)]">
            <AutomationList
              automations={visible}
              runsOf={runsOf}
              selectedId={selected?.id}
              onSelect={setSelectedId}
              onToggle={toggle}
              className="@3xl:sticky @3xl:top-4 @3xl:self-start"
            />
            {selected && (
              <AutomationDetail
                automation={selected}
                runs={runsOf(selected)}
                onRunNow={() => runNow(selected)}
                onToggle={(enabled) => toggle(selected, enabled)}
                onEdit={() => setEditing(selected)}
                onDuplicate={() => duplicate(selected)}
                onDelete={() => setDeleting(selected)}
              />
            )}
          </div>
        </>
      )}

      <AutomationDialog
        editing={editing}
        blank={blank}
        onClose={() => {
          setEditing(null)
          setBlank(null)
        }}
        onSave={save}
      />
      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${deleting?.name ?? "automation"}?`}
        description="The trigger and its run history go away, and a run in flight is cancelled. Tasks its runs created stay on the board."
        confirmLabel="Delete"
        onOpenChange={(open) => !open && setDeleting(null)}
        onConfirm={() => {
          if (deleting) setDeleted((current) => [...current, deleting.id])
          setDeleting(null)
        }}
      />
    </div>
  )
}
