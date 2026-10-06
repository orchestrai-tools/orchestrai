import type { PullComment } from "@warpforge/protocol";

/**
 * A GitHub unified patch, split into files and lines. The split view pairs
 * those lines; it does not fetch both revisions.
 */

export type PatchLineKind = "add" | "del" | "context" | "meta";

export interface PatchLine {
  /** Stable within the parsed patch — the renderer's row key. */
  id: string;
  kind: PatchLineKind;
  text: string;
  oldNumber?: number;
  newNumber?: number;
}

export interface PatchHunk {
  /** Stable within the parsed patch — the renderer's block key. */
  id: string;
  /** The `@@ -a,b +c,d @@ …` header, verbatim. */
  header: string;
  oldStart: number;
  newStart: number;
  lines: PatchLine[];
}

export interface PatchFileBlock {
  path: string;
  /** Path on the removed side, when it differs (rename/deletion). */
  oldPath?: string;
  binary: boolean;
  hunks: PatchHunk[];
}

const NO_NEWLINE = "\\ No newline at end of file";
const DEV_NULL = "/dev/null";

/** Parse the whole patch. Unrecognizable content degrades to a single meta
 *  block rather than throwing — a truncated tail must still render. */
export function parseUnifiedPatch(patch: string): PatchFileBlock[] {
  const blocks: PatchFileBlock[] = [];
  const lines = patch.split("\n");
  let current: PatchFileBlock | null = null;
  let hunk: PatchHunk | null = null;
  let oldNumber = 0;
  let newNumber = 0;

  let seq = 0;

  const pushMetaLine = (text: string) => {
    if (!current) {
      current = { path: "", binary: false, hunks: [] };
      blocks.push(current);
    }
    current.hunks[0] ??= { id: `h${seq++}`, header: "", oldStart: 0, newStart: 0, lines: [] };
    current.hunks[0].lines.push({ id: `l${seq++}`, kind: "meta", text });
  };

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      // Binary files carry no `+++` line, so the `diff --git` pair is the
      // fallback identity of the block; the +++/--- lines overwrite it.
      const fallback = /^diff --git (?:"?a\/(.*)"?) (?:"?b\/(.*)"?)$/.exec(line);
      current = {
        path: fallback?.[2] ?? "",
        oldPath: fallback?.[1],
        binary: false,
        hunks: [],
      };
      blocks.push(current);
      hunk = null;
      continue;
    }
    if (!current) {
      if (line.trim().length > 0) pushMetaLine(line);
      continue;
    }
    // `/dev/null` is git saying the file does not exist on that side — an
    // addition or a deletion. Taking it as a path put "/dev/null → x" in the
    // file header, and worse, made a deleted file render as a file called
    // "null" in a folder called "dev".
    if (line.startsWith("--- ")) {
      const from = stripAOrB(line.slice(4));
      if (from !== DEV_NULL) current.oldPath = from;
      continue;
    }
    if (line.startsWith("+++ ")) {
      const to = stripAOrB(line.slice(4));
      if (to !== DEV_NULL) current.path = to;
      continue;
    }
    if (line.startsWith("new file mode") || line.startsWith("deleted file mode")) {
      // The +++/--- pair above (or below) carries the path; nothing to keep.
      continue;
    }
    if (line.startsWith("Binary files ")) {
      current.binary = true;
      continue;
    }
    if (line.startsWith("@@ ")) {
      const parsed = parseHunkHeader(line);
      hunk = {
        id: `h${seq++}`,
        header: line,
        oldStart: 0,
        newStart: 0,
        lines: [],
        ...parsed,
      };
      oldNumber = hunk.oldStart;
      newNumber = hunk.newStart;
      current.hunks.push(hunk);
      continue;
    }
    if (line === NO_NEWLINE) continue;
    if (!hunk) {
      // Everything else before the first hunk (index lines, mode lines) is
      // context GitHub does not render either.
      continue;
    }
    const tag = line.charAt(0);
    if (tag === "+") {
      hunk.lines.push({
        id: `l${seq++}`,
        kind: "add",
        text: line.slice(1),
        newNumber: newNumber++,
      });
    } else if (tag === "-") {
      hunk.lines.push({
        id: `l${seq++}`,
        kind: "del",
        text: line.slice(1),
        oldNumber: oldNumber++,
      });
    } else if (tag === " " || line === "") {
      hunk.lines.push({
        id: `l${seq++}`,
        kind: "context",
        text: line === "" ? "" : line.slice(1),
        oldNumber: oldNumber++,
        newNumber: newNumber++,
      });
    } else {
      hunk.lines.push({ id: `l${seq++}`, kind: "meta", text: line });
    }
  }
  return blocks.filter((block) => block.path || block.hunks.length > 0 || block.binary);
}

function stripAOrB(value: string): string {
  let path = value.trim();
  if (path.startsWith("a/") || path.startsWith("b/")) path = path.slice(2);
  if (path.startsWith('"') && path.endsWith('"')) path = path.slice(1, -1);
  return path.replace(/\t.*$/, "");
}

/** Parse one `@@` header. The `id` is filled in by the parser, which owns the
 *  numbering; `lines` starts empty here and accumulates in the caller. */
function parseHunkHeader(line: string): Omit<PatchHunk, "id"> | null {
  const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
  if (!match) return null;
  return {
    header: line,
    oldStart: Number(match[1]),
    newStart: Number(match[3]),
    lines: [],
  };
}

/**
 * One row of the side-by-side view: the removed line on the left, the added
 * one on the right. Either side is null where the change has no counterpart
 * (a pure insertion, a pure deletion). Context lines carry the same line on
 * both sides, which is what makes them read as unchanged.
 */
export interface SplitRow {
  id: string;
  left: PatchLine | null;
  right: PatchLine | null;
}

/**
 * Pair one hunk's lines into side-by-side rows.
 *
 * Consecutive deletions and the additions that follow them are the same edit
 * seen from two sides, so they zip together row by row; whichever run is
 * longer spills into rows with an empty counterpart. This is a pure reshuffle
 * of the patch we already have — a split view costs no extra fetch, which is
 * the whole reason the inbox renders patches instead of documents.
 */
export function pairHunkLines(lines: readonly PatchLine[]): SplitRow[] {
  const rows: SplitRow[] = [];
  let dels: PatchLine[] = [];
  let adds: PatchLine[] = [];

  const flush = () => {
    for (let index = 0; index < Math.max(dels.length, adds.length); index += 1) {
      const left = dels[index] ?? null;
      const right = adds[index] ?? null;
      rows.push({ id: `${left?.id ?? "_"}:${right?.id ?? "_"}`, left, right });
    }
    dels = [];
    adds = [];
  };

  for (const line of lines) {
    if (line.kind === "del") {
      dels.push(line);
      continue;
    }
    if (line.kind === "add") {
      adds.push(line);
      continue;
    }
    flush();
    // A context line is unchanged by definition, so both sides show it. Meta
    // lines belong to no side and render across the row.
    rows.push({
      id: line.id,
      left: line,
      right: line.kind === "context" ? line : null,
    });
  }
  flush();
  return rows;
}

/** Added and deleted lines in one file of a patch. */
export function patchCounts(block: PatchFileBlock): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const hunk of block.hunks) {
    for (const line of hunk.lines) {
      if (line.kind === "add") additions += 1;
      else if (line.kind === "del") deletions += 1;
    }
  }
  return { additions, deletions };
}

/** The file name on a diff, including a rename when the path changed. */
export function patchFileLabel(block: PatchFileBlock): string {
  if (!block.path) return "patch";
  if (block.oldPath && block.oldPath !== block.path) return `${block.oldPath} → ${block.path}`;
  return block.path;
}

/** Inline review threads keyed by file path, then post-image line. */
export function reviewThreadsByLine(
  comments: readonly PullComment[],
): Map<string, Map<number, PullComment[]>> {
  const index = new Map<string, Map<number, PullComment[]>>();
  for (const comment of comments) {
    if (comment.kind !== "review_comment" || !comment.path || !comment.line) continue;
    const perFile = index.get(comment.path) ?? new Map<number, PullComment[]>();
    perFile.set(comment.line, [...(perFile.get(comment.line) ?? []), comment]);
    index.set(comment.path, perFile);
  }
  return index;
}

const SUGGESTION_FENCE = "```suggestion";

/** A comment covering one line, or a span measured from the first click. */
export interface LineDraft {
  path: string;
  side: "LEFT" | "RIGHT";
  anchor: number;
  startLine: number;
  line: number;
  body: string;
}

/** A plain click starts over. Shift-click grows the span from the first line. */
export function commentSpan(
  current: LineDraft | null,
  next: { path: string; side: "LEFT" | "RIGHT"; line: number },
  extend: boolean,
): LineDraft {
  if (extend && current && current.path === next.path && current.side === next.side) {
    return {
      ...current,
      line: Math.max(current.anchor, next.line),
      startLine: Math.min(current.anchor, next.line),
    };
  }
  return {
    anchor: next.line,
    body: "",
    line: next.line,
    path: next.path,
    side: next.side,
    startLine: next.line,
  };
}

/** The current text of a line or span, which a suggestion block starts from. */
export function suggestionSeed(
  block: PatchFileBlock,
  side: "LEFT" | "RIGHT",
  start: number,
  end = start,
): string[] {
  const from = Math.min(start, end);
  const to = Math.max(start, end);
  const out: string[] = [];
  for (const hunk of block.hunks) {
    for (const row of hunk.lines) {
      if (row.kind === "meta") continue;
      if (side === "RIGHT" && row.kind === "del") continue;
      if (side === "LEFT" && row.kind === "add") continue;
      const number = side === "RIGHT" ? row.newNumber : row.oldNumber;
      if (number === undefined || number < from || number > to) continue;
      out.push(row.text);
    }
  }
  return out;
}

/** A GitHub suggestion fence seeded with the lines as they stand. */
export function appendSuggestion(body: string, seed: readonly string[]): string {
  const block = [SUGGESTION_FENCE, ...seed, "```"].join("\n");
  const trimmed = body.trimEnd();
  return trimmed ? `${trimmed}\n\n${block}` : block;
}
