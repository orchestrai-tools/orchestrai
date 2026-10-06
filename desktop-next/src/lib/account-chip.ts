import type { AccountInfo } from "@warpforge/protocol";

export function quotaLeft(usedPercent: number): number {
  return Math.max(0, Math.min(100, Math.round(100 - usedPercent)));
}

/** The chip names the login only when this agent has more than one. */
export function chipLabel(agentId: string, displayName: string, accounts: AccountInfo[]): string {
  const own = accounts.filter((account) => account.agentId === agentId);
  const active = own.find((account) => account.active);
  if (!active) return own.length > 0 ? "Select account" : displayName;
  if (own.length === 1) return displayName;
  return active.label || active.email || active.id;
}

export function accountsForMenu(agentId: string, accounts: AccountInfo[]): AccountInfo[] {
  const own = accounts.filter((account) => account.agentId === agentId);
  const rest = accounts.filter((account) => account.agentId !== agentId);
  return [...own, ...rest];
}
