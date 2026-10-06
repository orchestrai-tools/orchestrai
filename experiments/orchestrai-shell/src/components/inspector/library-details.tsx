import type { ReactNode } from "react"

import { findAgent } from "@/data/agents"
import { OUTCOME, automationsFor, type Automation } from "@/data/automations"
import { memoriesFor, tokensOf } from "@/data/memory"
import { pinnedAgents, stageChain, workflowFile, workflowsFor } from "@/data/workflows"
import type { ProjectId } from "@/lib/projects"
import { describeCron, formatWhen, nextOccurrences } from "@/pages/automations/schedule"
import { KIND_LABEL, SCOPE_LABEL, nextSlice, sourceLabel } from "@/pages/memory/rank"

export type LibraryPage = "workflows" | "automations" | "memory"

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] gap-2 py-(--row-py) text-xs">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  )
}

function triggerText(automation: Automation): string {
  const { trigger } = automation
  if (trigger.kind === "schedule") return `${describeCron(trigger.cron)} · ${trigger.timezone}`
  if (trigger.kind === "label") return `Label “${trigger.label}” on ${trigger.repo}`
  if (trigger.kind === "issue") return `New issue on ${trigger.repo} · ${trigger.filter}`
  return `Changes requested on ${trigger.repo} · ${trigger.filter}`
}

/**
 * The selected workflow, automation, or memory entry, as the inspector shows
 * it. With nothing picked yet it follows the page and shows the first one.
 */
export function LibraryDetails({ project, page, selection }: { project: ProjectId; page: LibraryPage; selection?: string }) {
  if (page === "workflows") {
    const list = workflowsFor(project)
    const workflow = list.find((entry) => entry.id === selection) ?? list[0]
    if (!workflow) return null
    const pins = pinnedAgents(workflow)
    return (
      <dl className="px-4 py-2">
        <Row label="Workflow">{workflow.name}</Row>
        <Row label="Kept">{workflow.source === "builtin" ? "Built in" : "In this project"}</Row>
        <Row label="File"><span className="font-mono">{workflowFile(workflow)}</span></Row>
        <Row label="Stages">{stageChain(workflow)}</Row>
        <Row label="Stops for you">{workflow.stops.length ? workflow.stops.join(", ") : "Never"}</Row>
        <Row label="Agents">{pins.length ? pins.map((pin) => `${pin.step}: ${findAgent(pin.agent).name}`).join(", ") : "The task's agent runs every step"}</Row>
        <Row label="Ending">{workflow.ending.mode === "goal" ? `Goal: ${workflow.ending.doneWhen}` : `Grind to ${workflow.ending.turnCap ?? "the cap"} turns`}</Row>
        <Row label="Loads">{workflow.error ? `No: ${workflow.error}` : workflow.warnings?.length ? `Yes, ${workflow.warnings.length} warning` : "Yes"}</Row>
      </dl>
    )
  }

  if (page === "automations") {
    const list = automationsFor(project)
    const automation = list.find((entry) => entry.id === selection) ?? list[0]
    if (!automation) return null
    const next = automation.trigger.kind === "schedule" ? nextOccurrences(automation.trigger.cron, automation.trigger.timezone)[0] : undefined
    const last = automation.runs[0]
    return (
      <dl className="px-4 py-2">
        <Row label="Automation">{automation.name}</Row>
        <Row label="State">{automation.enabled ? "On" : `Paused${automation.pausedNote ? ` · ${automation.pausedNote}` : ""}`}</Row>
        <Row label="Trigger">{triggerText(automation)}</Row>
        {next && <Row label="Next run">{formatWhen(next)}</Row>}
        <Row label="Creates">A task running {automation.workflow}</Row>
        <Row label="Agent">{findAgent(automation.agent).name}{automation.model ? ` · ${automation.model}` : ""}</Row>
        {automation.precheck && <Row label="Precheck"><span className="font-mono">{automation.precheck}</span></Row>}
        <Row label="Runs in">{automation.reuseTask ? "The same task every run" : automation.worktree ? "A new worktree each run" : "The project checkout"}</Row>
        {last && <Row label="Last run">#{last.number} · {OUTCOME[last.status].label}</Row>}
      </dl>
    )
  }

  const entries = memoriesFor(project)
  const memory = entries.find((entry) => entry.id === selection) ?? nextSlice(entries).included[0]?.entry ?? entries[0]
  if (!memory) return null
  return (
    <dl className="px-4 py-2">
      <Row label="Kind">{KIND_LABEL[memory.kind]}</Row>
      <Row label="Scope">{SCOPE_LABEL[memory.scope]}</Row>
      <Row label="Source">{sourceLabel(memory)}</Row>
      <Row label="Written">{memory.written}</Row>
      <Row label="Last used">{memory.lastUsed}</Row>
      <Row label="Injected">{memory.injected} times{memory.pinned ? " · pinned" : ""}</Row>
      <Row label="Size">{tokensOf(memory)} tokens</Row>
      {memory.tags.length > 0 && <Row label="Tags">{memory.tags.join(", ")}</Row>}
      {memory.links?.length ? <Row label="Links">{memory.links.length}</Row> : null}
    </dl>
  )
}
