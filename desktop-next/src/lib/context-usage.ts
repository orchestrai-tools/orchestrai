import type { SessionUpdate } from "@warpforge/protocol";

export type ContextUsage = Extract<SessionUpdate, { kind: "usage" }>;

export function latestContextUsage(updates: SessionUpdate[]): ContextUsage | undefined {
  for (let index = updates.length - 1; index >= 0; index -= 1) {
    const update = updates[index];
    if (update?.kind === "usage") return update;
  }
  return undefined;
}

export function contextPercent(used: number, size: number): number {
  const window = Math.max(1, size);
  return Math.min(100, Math.round((Math.max(0, used) / window) * 100));
}

export function compactTokenCount(value: number): string {
  const amount = Math.max(0, value);
  if (amount >= 1_000_000) return `${trimDecimal(amount / 1_000_000)}M`;
  if (amount >= 1_000) return `${trimDecimal(amount / 1_000)}K`;
  return Math.round(amount).toString();
}

function trimDecimal(value: number): string {
  return value.toFixed(value >= 100 ? 0 : 1).replace(/\.0$/, "");
}
