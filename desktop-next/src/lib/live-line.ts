import { coalesceTailUpdates } from "@warpforge/core/sessionStream";
import { toolDisplayTitle } from "@warpforge/core/toolDisplay";
import type { SessionUpdate } from "@warpforge/protocol";
import { sessionActivity, type SessionActivity } from "./session-activity";

export interface LiveLine {
  elapsed: string;
  tools: number;
  preview: string | null;
  activity: SessionActivity | null;
}

/** How long since the task changed, how many recent tool calls, and the latest line. */
export function liveLine(
  updates: SessionUpdate[] | undefined,
  updatedAt: number,
  nowSec: number,
  status?: string,
): LiveLine {
  const tail = coalesceTailUpdates(updates ?? [], 300);
  return {
    elapsed: formatElapsed(updatedAt, nowSec),
    tools: tail.filter((update) => update.kind === "tool_call").length,
    preview: latestLine(tail),
    activity: status === "running" ? sessionActivity(tail) : null,
  };
}

export function formatElapsed(sinceUnix: number, nowSec: number): string {
  const seconds = Math.max(0, nowSec - sinceUnix);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

function latestLine(updates: SessionUpdate[]): string | null {
  for (let index = updates.length - 1; index >= 0; index -= 1) {
    const update = updates[index];
    if (update.kind === "agent_text" && update.text.trim()) return clip(update.text);
    if (update.kind === "tool_call") return clip(toolDisplayTitle(update));
  }
  return null;
}

function clip(text: string): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  return cleaned.length > 80 ? `${cleaned.slice(0, 77)}…` : cleaned;
}
