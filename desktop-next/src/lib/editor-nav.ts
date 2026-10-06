/** A location from `textDocument/definition`, which may be one result or a list. */
export function locationFromDefinition(
  result: unknown,
): { uri: string; line: number; character: number } | null {
  const loc = Array.isArray(result) ? result[0] : result;
  if (!loc || typeof loc !== "object") return null;
  const row = loc as {
    uri?: string;
    targetUri?: string;
    range?: { start?: { line?: number; character?: number } };
    targetSelectionRange?: { start?: { line?: number; character?: number } };
  };
  const uri = row.uri || row.targetUri;
  const start = row.range?.start ?? row.targetSelectionRange?.start;
  if (!uri || start?.line == null) return null;
  return { uri, line: start.line, character: start.character ?? 0 };
}

/** The project-relative path of a `file://` URI. */
export function pathFromFileUri(uri: string, root: string): string {
  const file = decodeURIComponent(uri.replace(/^file:\/\//, ""));
  const base = root.endsWith("/") ? root : `${root}/`;
  return file.startsWith(base) ? file.slice(base.length) : file;
}

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.isContentEditable
  );
}

/** Editor lines are 0-based. A diff hunk's `newStart` is 1-based. */
export function editLine(hunks: { newStart: number }[] | undefined): number {
  const start = hunks?.[0]?.newStart ?? 1;
  return Math.max(0, start - 1);
}

/** j and ArrowDown move down. k and ArrowUp move up. */
export function listStep(key: string): 1 | -1 | 0 {
  if (key === "j" || key === "ArrowDown") return 1;
  if (key === "k" || key === "ArrowUp") return -1;
  return 0;
}
