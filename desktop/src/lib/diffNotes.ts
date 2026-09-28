import { formatRemarkList } from "@/lib/inboxTaskPrompt";

/**
 * A review note on lines of the task diff, kept on this device until resolved.
 * Lines are 1-based on the working-tree side and are the last place the
 * snippet was found; `snippet` is what the lines read when the note was written.
 */
export interface DiffNote {
  id: string;
  path: string;
  startLine: number;
  endLine: number;
  snippet: string[];
  body: string;
  createdAt: number;
  /** When the note last went to the agent; unset while it is a draft. */
  sentAt?: number;
  /** The snippet is no longer anywhere in the file. */
  outdated?: boolean;
}

/** Where a note sits in the current text of its file. */
export interface NoteAnchor {
  startLine: number;
  endLine: number;
  outdated: boolean;
}

/** Quoted lines shown per note in the prompt; the rest is counted. */
const QUOTE_LIMIT = 12;

/**
 * Split file text into lines the way the editor numbers them.
 * @param text File contents.
 * @returns One entry per line, without line terminators.
 */
export function splitLines(text: string): string[] {
  return text.split(/\r?\n/);
}

/**
 * The inclusive, ordered line span between a drag's first and current line.
 * @param from Line the drag started on.
 * @param to Line the pointer is on now.
 * @returns The span, start never after end.
 */
export function orderedRange(from: number, to: number): { start: number; end: number } {
  return from <= to ? { end: to, start: from } : { end: from, start: to };
}

function sameLine(a: string, b: string): boolean {
  return a.trimEnd() === b.trimEnd();
}

function matchesAt(lines: readonly string[], snippet: readonly string[], index: number): boolean {
  if (index < 0 || index + snippet.length > lines.length) return false;
  return snippet.every((line, offset) => sameLine(lines[index + offset], line));
}

/**
 * Find a note's lines in the current text of its file.
 *
 * The snippet is matched where the note last was, then at the occurrence
 * nearest to it, so an edit above the note moves it instead of stranding it.
 * With no occurrence left the note is outdated and keeps its old span.
 * @param note The note's last known span and its quoted lines.
 * @param lines Current lines of the file.
 * @returns The span to show the note at, and whether its snippet is gone.
 */
export function anchorNote(
  note: Pick<DiffNote, "startLine" | "endLine" | "snippet">,
  lines: readonly string[],
): NoteAnchor {
  const span = Math.max(0, note.endLine - note.startLine);
  const at = note.startLine - 1;
  if (note.snippet.length > 0 && !matchesAt(lines, note.snippet, at)) {
    let best = -1;
    for (let index = 0; index + note.snippet.length <= lines.length; index += 1) {
      if (!matchesAt(lines, note.snippet, index)) continue;
      if (best < 0 || Math.abs(index - at) < Math.abs(best - at)) best = index;
    }
    if (best < 0) {
      const last = Math.max(1, lines.length);
      const startLine = Math.min(Math.max(1, note.startLine), last);
      return { endLine: Math.min(startLine + span, last), outdated: true, startLine };
    }
    return { endLine: best + 1 + span, outdated: false, startLine: best + 1 };
  }
  return { endLine: note.endLine, outdated: false, startLine: note.startLine };
}

/**
 * Human label for a note's span, e.g. `12` or `12–14`.
 * @param note The note's span.
 * @returns The label.
 */
export function lineLabel(note: Pick<DiffNote, "startLine" | "endLine">): string {
  return note.startLine === note.endLine
    ? `${note.startLine}`
    : `${note.startLine}–${note.endLine}`;
}

function quoteSnippet(snippet: readonly string[]): string {
  const shown = snippet.slice(0, QUOTE_LIMIT).map((line) => `> ${line}`.trimEnd());
  if (snippet.length > shown.length) {
    shown.push(`> … (${snippet.length - shown.length} more lines)`);
  }
  return shown.join("\n");
}

/**
 * Order notes the way a reader walks the diff: by file, then by line.
 * @param notes Notes in any order.
 * @returns A sorted copy.
 */
export function sortNotes(notes: readonly DiffNote[]): DiffNote[] {
  return [...notes].sort(
    (a, b) =>
      a.path.localeCompare(b.path) || a.startLine - b.startLine || a.createdAt - b.createdAt,
  );
}

/**
 * One prompt carrying every note: where it points, the lines it quotes, and
 * what the reviewer wrote.
 * @param notes The notes to deliver.
 * @returns Prompt text for the agent.
 */
export function formatDiffNotesPrompt(notes: readonly DiffNote[]): string {
  const count = notes.length;
  const intro = `Review notes on your changes (${count} ${count === 1 ? "note" : "notes"}). Address each one. Where a note is wrong, leave the code as it is and say why.`;
  const list = formatRemarkList(
    sortNotes(notes).map((note) => ({
      body: [note.snippet.length > 0 ? quoteSnippet(note.snippet) : "", note.body.trim()]
        .filter(Boolean)
        .join("\n"),
      heading: `${note.path}:${note.startLine === note.endLine ? note.startLine : `${note.startLine}-${note.endLine}`}${
        note.outdated ? " (outdated: the quoted lines are no longer in the file)" : ""
      }`,
    })),
  );
  return `${intro}\n\n${list}\n`;
}
