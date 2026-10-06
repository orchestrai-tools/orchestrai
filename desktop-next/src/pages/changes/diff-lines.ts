import type { Hunk } from "@warpforge/protocol";

export interface DiffLine {
  kind: "add" | "del" | "context";
  oldNo?: number;
  newNo?: number;
  text: string;
  /** Position in `hunk.lines`, which is what notes anchor to. */
  index: number;
}

/** Hunk lines with their old and new line numbers; `\ No newline` markers are dropped. */
export function diffLines(hunk: Hunk): DiffLine[] {
  let oldNo = hunk.oldStart;
  let newNo = hunk.newStart;
  const out: DiffLine[] = [];
  hunk.lines.forEach((raw, index) => {
    if (raw.startsWith("\\")) return;
    const text = raw.slice(1);
    if (raw.startsWith("+")) out.push({ kind: "add", newNo: newNo++, text, index });
    else if (raw.startsWith("-")) out.push({ kind: "del", oldNo: oldNo++, text, index });
    else out.push({ kind: "context", oldNo: oldNo++, newNo: newNo++, text, index });
  });
  return out;
}

/** A note quotes its line and the two before it, so it can find its place again after edits. */
export function noteSnippet(lines: readonly string[], index: number) {
  const start = Math.max(0, index - 2);
  const snippet = lines.slice(start, index + 1);
  return { snippet, startLine: start + 1, endLine: start + snippet.length };
}

/** Side-by-side rows: a run of deletions lines up with the additions that follow it. */
export function pairLines(lines: DiffLine[]): { left?: DiffLine; right?: DiffLine }[] {
  const rows: { left?: DiffLine; right?: DiffLine }[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index]!;
    if (line.kind === "context") {
      rows.push({ left: line, right: line });
      index += 1;
      continue;
    }
    const dels: DiffLine[] = [];
    const adds: DiffLine[] = [];
    while (lines[index]?.kind === "del") dels.push(lines[index++]!);
    while (lines[index]?.kind === "add") adds.push(lines[index++]!);
    for (let row = 0; row < Math.max(dels.length, adds.length); row += 1) {
      rows.push({ left: dels[row], right: adds[row] });
    }
  }
  return rows;
}

export function hunkHeader(hunk: Hunk): string {
  return `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`;
}

/** Unchanged lines between the previous hunk (or the top of the file) and this one. */
export function gapBefore(hunks: Hunk[], index: number): number {
  const hunk = hunks[index]!;
  if (index === 0) return Math.max(hunk.oldStart - 1, 0);
  const previous = hunks[index - 1]!;
  return Math.max(hunk.oldStart - (previous.oldStart + previous.oldLines), 0);
}
