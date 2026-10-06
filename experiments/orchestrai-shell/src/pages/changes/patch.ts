import type { ChangedFile, DiffLine, Hunk } from "@/data/git"
import { countLines } from "@/data/git-diffs"

export function hunkHeader(entry: Hunk) {
  const oldCount = entry.lines.filter((line) => line.kind !== "add").length
  const newCount = entry.lines.filter((line) => line.kind !== "del").length
  return `@@ -${entry.oldStart},${oldCount} +${entry.newStart},${newCount} @@`
}

/** Where a hunk ends in the old file, to say how many unchanged lines sit before the next one. */
export function oldEnd(entry: Hunk) {
  return entry.oldStart + entry.lines.filter((line) => line.kind !== "add").length - 1
}

/** The file as `git diff` prints it, for Copy as patch. */
export function patchText(entry: ChangedFile) {
  const from = entry.status === "U" || entry.status === "A" ? "/dev/null" : `a/${entry.from ?? entry.path}`
  const to = entry.status === "D" ? "/dev/null" : `b/${entry.path}`
  const body = entry.hunks.flatMap((part) => [
    `${hunkHeader(part)} ${part.section}`.trimEnd(),
    ...part.lines.map((line) => (line.kind === "add" ? "+" : line.kind === "del" ? "-" : " ") + line.text),
  ])
  return [`diff --git a/${entry.from ?? entry.path} b/${entry.path}`, `--- ${from}`, `+++ ${to}`, ...body].join("\n")
}

/** Lines the hunks leave out of a large change, so a preview never pretends to be the whole file. */
export function hiddenLines(entry: ChangedFile) {
  const shown = countLines(entry.hunks)
  return { additions: Math.max(0, entry.additions - shown.additions), deletions: Math.max(0, entry.deletions - shown.deletions) }
}

export interface SplitRow {
  left?: DiffLine
  right?: DiffLine
}

/** Split view pairs a run of removed lines with the added lines that follow it, from the same hunk. */
export function pairLines(lines: DiffLine[]): SplitRow[] {
  const rows: SplitRow[] = []
  let index = 0
  while (index < lines.length) {
    if (lines[index].kind === "context") {
      rows.push({ left: lines[index], right: lines[index] })
      index++
      continue
    }
    const removed: DiffLine[] = []
    const added: DiffLine[] = []
    while (index < lines.length && lines[index].kind === "del") removed.push(lines[index++])
    while (index < lines.length && lines[index].kind === "add") added.push(lines[index++])
    for (let row = 0; row < Math.max(removed.length, added.length); row++) rows.push({ left: removed[row], right: added[row] })
  }
  return rows
}

/** The side a note on this line is addressed to: the new file for kept and added lines, the old one for removed lines. */
export function noteKey(line: DiffLine) {
  return line.kind === "del" ? `old:${line.oldNo}` : `new:${line.newNo}`
}
