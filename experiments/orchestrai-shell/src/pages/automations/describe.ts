import type { Automation, AutomationRun, AutomationTrigger } from "@/data/automations"
import { countdown, describeCron, formatInZone, MOCK_NOW, nextOccurrences, parseLocal } from "@/pages/automations/schedule"

export const BOTS_FILTER = "Opened by a person, not a bot"
export const ANYONE_FILTER = "Opened by anyone"

export function triggerOfKind(kind: AutomationTrigger["kind"], repo: string): AutomationTrigger {
  switch (kind) {
    case "schedule":
      return { kind, preset: "daily", cron: "0 9 * * *", timezone: "America/New_York" }
    case "issue":
      return { kind, repo, filter: BOTS_FILTER }
    case "label":
      return { kind, repo, label: "agent-ready" }
    case "review":
      return { kind, repo, filter: "Changes requested on a pull request labeled agent" }
  }
}

export function triggerLine(trigger: AutomationTrigger): string {
  switch (trigger.kind) {
    case "schedule":
      return describeCron(trigger.cron)
    case "issue":
      return "When an issue is opened"
    case "label":
      return `When an issue gets the ${trigger.label} label`
    case "review":
      return "When a review requests changes"
  }
}

export function triggerDetail(trigger: AutomationTrigger): string {
  switch (trigger.kind) {
    case "schedule":
      return trigger.timezone
    case "issue":
    case "review":
      return `${trigger.repo} · ${trigger.filter}`
    case "label":
      return trigger.repo
  }
}

export function nextRunAt(automation: Automation): number | undefined {
  if (automation.trigger.kind !== "schedule") return undefined
  return nextOccurrences(automation.trigger.cron, automation.trigger.timezone)[0]
}

/** What the row's right edge says about the future: a countdown, a watch, or why nothing will happen. */
export function nextLabel(automation: Automation): string {
  if (!automation.enabled) return "Paused"
  if (automation.trigger.kind !== "schedule") return `Watching · checked ${automation.lastPolled ?? "just now"}`
  const next = nextRunAt(automation)
  return next ? countdown(next) : "Not scheduled"
}

export function nextDetail(automation: Automation): string {
  if (!automation.enabled) return automation.pausedNote ?? "Paused: keeps its history, never fires"
  if (automation.trigger.kind !== "schedule") {
    return `Checks GitHub every minute; last checked ${automation.lastPolled ?? "just now"}`
  }
  const next = nextRunAt(automation)
  if (!next) return "No occurrence in the next year"
  return `Next ${formatInZone(next, automation.trigger.timezone)} (${countdown(next)}). Run now leaves it unchanged.`
}

export function baseLabel(base: Automation["base"]): string {
  if (base === "head") return "the current branch"
  if (base === "origin") return "a fresh fetch of origin"
  return base.branch
}

export function runsGoTo(automation: Automation): string {
  const where = automation.worktree ? `in its own worktree off ${baseLabel(automation.base)}` : "in the project folder"
  return automation.reuseTask ? `One task; every run continues it, ${where}` : `A new task each run, ${where}`
}

export type StateFilter = "all" | "on" | "paused"
export type OutcomeFilter = "all" | "completed" | "failed" | "skipped" | "never"

export function matchesFilters(
  automation: Automation,
  last: AutomationRun | undefined,
  { search, state, outcome }: { search: string; state: StateFilter; outcome: OutcomeFilter }
): boolean {
  const term = search.trim().toLowerCase()
  if (term && !`${automation.name}\n${automation.goal}`.toLowerCase().includes(term)) return false
  if (state === "on" && !automation.enabled) return false
  if (state === "paused" && automation.enabled) return false
  if (outcome === "never") return !last
  if (outcome === "skipped") return Boolean(last?.status.startsWith("skipped"))
  if (outcome !== "all") return last?.status === outcome
  return true
}

/** Runs in the last 24 hours of the mock's clock, oldest first. */
export function recentRuns(automations: readonly Automation[], runs: (automation: Automation) => AutomationRun[]) {
  const since = MOCK_NOW - 24 * 60 * 60 * 1000
  return automations
    .flatMap((automation) => runs(automation).map((run) => ({ automation, run, at: parseLocal(run.at) })))
    .filter((entry) => entry.at >= since && entry.at <= MOCK_NOW)
    .sort((a, b) => a.at - b.at)
}
