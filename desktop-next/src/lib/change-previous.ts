import { computeGutterChanges } from "./change-gutter";

function textLines(text: string): string[] {
  if (text.length === 0) return [];
  const parts = text.split("\n");
  if (text.endsWith("\n")) parts.pop();
  return parts;
}

/** The committed text a selected gutter line replaced, when there is any. */
export function previousChangeText(oldText: string, next: string, line: number): string | null {
  const changes = computeGutterChanges(oldText, next);
  const block = changes.blocks.find((item) => line >= item.from && line <= item.to);
  const deleted = changes.deleted.find((item) => item.line === line);
  const fromDiff = (block?.oldText || deleted?.oldText || "").replace(/\n$/, "");
  if (fromDiff.length > 0) return fromDiff;
  const committed = textLines(oldText)[line - 1];
  const current = textLines(next)[line - 1];
  if (committed && committed !== current) return committed;
  return null;
}
