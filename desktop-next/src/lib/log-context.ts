import type { LogEntry } from "@warpforge/daemon/types";

export type LogSourceKind = "service" | "portforward";

/** How many lines "Send last failure" attaches. */
export const FAILURE_LINES = 50;

/** Lines of context an agent is pointed at on each side of the attached range. */
const HINT_CONTEXT_LINES = 20;

const utc = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace("T", " ");

function seqRange(first: number, last: number) {
  return first === last ? `seq ${first}` : `seq ${first}–${last}`;
}

function utcRange(first: number, last: number) {
  if (!first || !last) return "";
  const from = utc(first);
  const to = utc(last);
  if (from === to) return `${from} UTC`;
  const sameDay = from.slice(0, 10) === to.slice(0, 10);
  return `${from}–${sameDay ? to.slice(11) : to} UTC`;
}

/**
 * Turn a contiguous run of log lines into text a new task can start from.
 * The label names the source and seq range. The body carries the lines plus
 * a hint for reading the surrounding lines.
 */
/** Log lines whose text appears, in order, inside a selection from the viewer. */
export function entriesMatchingSelection(entries: LogEntry[], selected: string): LogEntry[] {
  const wanted = selected.split("\n").map((line) => line.trim()).filter(Boolean);
  const matched: LogEntry[] = [];
  let cursor = 0;
  for (const line of wanted) {
    const index = entries.findIndex((entry, entryIndex) => entryIndex >= cursor && entry.line.trim() === line);
    if (index < 0) continue;
    matched.push(entries[index]);
    cursor = index + 1;
  }
  return matched;
}

export function logContextChip(kind: LogSourceKind, name: string, entries: LogEntry[]) {
  const first = entries[0];
  const last = entries[entries.length - 1];
  if (!first || !last) throw new Error("log context needs at least one line");
  const source = `${kind}:${name}`;
  const label = `${source} ${seqRange(first.seq, last.seq)}`;
  const when = utcRange(first.at, last.at);
  const tool =
    kind === "service"
      ? `read_service_logs(service: ${JSON.stringify(name)}`
      : `read_portforward_logs(name: ${JSON.stringify(name)}`;
  const after = Math.max(first.seq - HINT_CONTEXT_LINES, 0);
  const before = last.seq + 1 + HINT_CONTEXT_LINES;
  const body = [
    when ? `${label} (${when})` : label,
    "```",
    ...entries.map((entry) => entry.line),
    "```",
    `Surrounding lines: ${tool}, after: ${after}, before: ${before})`,
  ].join("\n");
  return { body, label };
}
