/** A repo path mentioned in markdown, when it is a file we already know. */
export function resolveMention(
  value: string,
  known: ReadonlySet<string>,
  projectRoot = "",
): { path: string; line: number } | null {
  let path = value.trim().replace(/^['"`]+|['"`]+$/g, "");
  path = path.replace(/[),;]+$/, "");
  const lineMatch = path.match(/:(\d+)(?::\d+)?$/);
  let line = 0;
  if (lineMatch?.[1]) {
    line = Math.max(0, Number(lineMatch[1]) - 1);
    path = path.slice(0, -lineMatch[0].length);
  }
  path = path.replace(/^\.\/+/, "");
  if (projectRoot && path.startsWith(`${projectRoot}/`)) path = path.slice(projectRoot.length + 1);
  if (!known.has(path)) return null;
  return { path, line };
}

export const FILE_REF_MIME = "application/x-warpforge-file-ref";

/** An `@path` mention, with `#L2` or `#L2-4` when a line range is included. */
export function mentionToken(path: string, range?: { start: number; end: number }): string {
  const base = path.includes(" ") ? `@"${path}"` : `@${path}`;
  if (!range) return base;
  const suffix = range.start === range.end ? `#L${range.start}` : `#L${range.start}-${range.end}`;
  return `${base}${suffix}`;
}

/** Replace the in-progress `@query` with the chosen file. */
export function replaceMention(
  text: string,
  start: number,
  end: number,
  path: string,
): { value: string; caret: number } {
  const token = mentionToken(path);
  const value = `${text.slice(0, start)}${token} ${text.slice(end)}`;
  return { value, caret: start + token.length + 1 };
}

/** `@path#L2-4` splits into the path and an optional line range. */
export function splitFileReference(token: string): {
  path: string;
  range?: { start: number; end: number };
} {
  const match = token.match(/#L(\d+)(?:-(\d+))?$/);
  if (!match || match.index === undefined) return { path: token };
  const start = Number(match[1]);
  const end = match[2] !== undefined ? Number(match[2]) : start;
  return { path: token.slice(0, match.index), range: { start, end } };
}

/** File paths written as `@path` in a reply. */
export function extractFileReferences(text: string): string[] {
  const refs: string[] = [];
  const regex = /(?:^|\s)@(?:"([^"]+)"|([^\s@]+))/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text))) refs.push(match[1] ?? match[2] ?? "");
  return [...new Set(refs.filter(Boolean))];
}

/** The `@path` token a drag from the file tree inserts at the caret. */
export function insertFileRef(
  text: string,
  caret: number,
  path: string,
): { value: string; caret: number } {
  const token = path.includes(" ") ? `@"${path}"` : `@${path}`;
  const value = `${text.slice(0, caret)}${token} ${text.slice(caret)}`;
  return { value, caret: caret + token.length + 1 };
}
