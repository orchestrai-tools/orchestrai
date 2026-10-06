import type { AgentAccountLimits, AgentLimitWindow } from "@warpforge/protocol";

/** The most-used window, or null when there are none. */
export function worstWindow(windows: AgentLimitWindow[]): AgentLimitWindow | null {
  let worst: AgentLimitWindow | null = null;
  for (const window of windows) {
    if (!worst || window.usedPercent > worst.usedPercent) worst = window;
  }
  return worst;
}

/** The account a task's agent currently runs on. The live account id wins over a stale limits flag. */
export function activeAccountForAgent(
  accounts: AgentAccountLimits[],
  agentId: string,
  activeAccountId?: string | null,
): AgentAccountLimits | null {
  const forAgent = accounts.filter((account) => account.agentId === agentId);
  if (activeAccountId) {
    const exact = forAgent.find((account) => account.accountId === activeAccountId);
    if (exact) return exact;
  }
  return forAgent.find((account) => account.active) ?? null;
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  if (hours < 24) return remMinutes > 0 ? `${hours}h ${remMinutes}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`;
}

/** A snapshot older than one poll plus five minutes should not be trusted as live. */
const LIMITS_OUTDATED_AFTER_SEC = 25 * 60;

export function isSnapshotOutdated(
  fetchedAt: number,
  nowSec = Math.floor(Date.now() / 1000),
): boolean {
  return Math.max(0, Math.round(nowSec - fetchedAt)) > LIMITS_OUTDATED_AFTER_SEC;
}

/** Tooltip for an outdated quota snapshot. */
export function lastUpdatedSentence(
  fetchedAt: number,
  nowSec = Math.floor(Date.now() / 1000),
): string {
  const age = Math.max(0, Math.round(nowSec - fetchedAt));
  if (age < 60) return "Last updated just now";
  return `Last updated ${formatDuration(age)} ago`;
}

/** "resets in 2h 14m". `resetsAt` is unix seconds. */
export function formatResetRelative(
  resetsAt: number,
  nowSec = Math.floor(Date.now() / 1000),
): string {
  const duration = formatDuration(Math.round(resetsAt - nowSec));
  return duration === "now" ? "resets now" : `resets in ${duration}`;
}
