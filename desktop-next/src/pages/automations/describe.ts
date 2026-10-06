import type { Automation, AutomationRun } from "@warpforge/protocol";
import { countdown, describeCron, formatInZone, localZone } from "./schedule";

export const zoneOf = (automation: Automation) => automation.timezone || localZone();

export const triggerLine = (automation: Automation) => describeCron(automation.trigger.cron);

/** Next-run times arrive from the daemon in epoch seconds. */
export const nextAt = (automation: Automation) =>
  automation.enabled && automation.nextRunAt ? automation.nextRunAt * 1000 : undefined;

export function nextLabel(automation: Automation): string {
  if (!automation.enabled) return "Paused";
  const at = nextAt(automation);
  return at ? countdown(at) : "Not scheduled";
}

export function nextDetail(automation: Automation): string {
  if (!automation.enabled) return "Paused. It keeps its history and never fires until you resume it.";
  const at = nextAt(automation);
  if (!at) return "No next run scheduled.";
  return `Next run ${formatInZone(at, zoneOf(automation))} (${zoneOf(automation)}), ${countdown(at)}`;
}

export function runsGoTo(automation: Automation): string {
  const where = !automation.worktree
    ? "the project checkout"
    : automation.worktreeBase?.kind === "origin"
      ? "an isolated worktree from the latest on origin"
      : automation.worktreeBase?.kind === "branch"
        ? `an isolated worktree from ${automation.worktreeBase.name}`
        : "an isolated worktree from the current branch";
  return automation.reuseSession ? `One task, continued every run, in ${where}` : `A new task each run, in ${where}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Every run of the last day, oldest first, with the instant (ms) it belongs to. */
export function recentRuns(automations: readonly Automation[], runsOf: (automation: Automation) => AutomationRun[], now = Date.now()) {
  return automations
    .flatMap((automation) =>
      runsOf(automation).map((run) => ({ automation, run, at: (run.startedAt || run.scheduledFor) * 1000 })),
    )
    .filter((entry) => entry.at > now - DAY_MS && entry.at <= now)
    .sort((a, b) => a.at - b.at);
}
