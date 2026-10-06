import type { SymbolMatch } from "@warpforge/protocol";

export interface FileMatchGroup {
  path: string;
  matches: SymbolMatch[];
}

/** Move through a result list, wrapping at either end. */
export function stepMatch(index: number, count: number, delta: number): number {
  if (count <= 0) return 0;
  return (index + delta + count) % count;
}

/** Group flat `file.search` hits by file, keeping both orders stable. */
export function groupMatchesByFile(matches: SymbolMatch[]): FileMatchGroup[] {
  const groups: FileMatchGroup[] = [];
  const byPath = new Map<string, FileMatchGroup>();
  for (const match of matches) {
    let group = byPath.get(match.path);
    if (!group) {
      group = { matches: [], path: match.path };
      byPath.set(match.path, group);
      groups.push(group);
    }
    group.matches.push(match);
  }
  return groups;
}

export interface HighlightSegment {
  text: string;
  hit: boolean;
  start: number;
}

/** Alternating plain and hit segments of `text` for a case-insensitive query. */
export function highlightSegments(text: string, query: string): HighlightSegment[] {
  if (query === "") return [{ hit: false, start: 0, text }];
  const haystack = text.toLowerCase();
  const needle = query.toLowerCase();
  const segments: HighlightSegment[] = [];
  let cursor = 0;
  for (;;) {
    const at = haystack.indexOf(needle, cursor);
    if (at === -1) break;
    if (at > cursor) segments.push({ hit: false, start: cursor, text: text.slice(cursor, at) });
    segments.push({ hit: true, start: at, text: text.slice(at, at + needle.length) });
    cursor = at + needle.length;
  }
  if (cursor < text.length) segments.push({ hit: false, start: cursor, text: text.slice(cursor) });
  return segments;
}

/** Lines around a 1-based match, plus the 1-based number of the first one. */
export function previewWindow(text: string, line: number, radius = 3): { firstLine: number; lines: string[] } {
  const all = text.split("\n");
  const firstLine = Math.max(1, line - radius);
  return { firstLine, lines: all.slice(firstLine - 1, line + radius) };
}
