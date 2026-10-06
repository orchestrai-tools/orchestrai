export interface DiffNote {
  id: string;
  path: string;
  snippet: string[];
  body: string;
  startLine: number;
  endLine: number;
}

export interface NoteAnchor {
  startLine: number;
  endLine: number;
  outdated: boolean;
}

const KEY = "wf-diff-notes";
const LEGACY_KEY = "orc-diff-notes";
const TASK_LIMIT = 200;

function sameLine(a: string, b: string): boolean {
  return a.trimEnd() === b.trimEnd();
}

function matchesAt(lines: readonly string[], snippet: readonly string[], index: number): boolean {
  if (index < 0 || index + snippet.length > lines.length) return false;
  return snippet.every((line, offset) => sameLine(lines[index + offset], line));
}

/** Find a note's quoted lines in the current hunk, nearest to where they were. */
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

function isNote(value: unknown): value is DiffNote {
  if (!value || typeof value !== "object") return false;
  const note = value as Partial<DiffNote>;
  return (
    typeof note.id === "string" && typeof note.path === "string" && typeof note.body === "string"
  );
}

/** Notes stored by the previous app (`{ state: { byTask } }`) or as a plain map. */
export function notesFromStore(raw: unknown): Record<string, DiffNote[]> {
  if (!raw || typeof raw !== "object") return {};
  const record = raw as Record<string, unknown>;
  const state = record.state;
  const body =
    state && typeof state === "object"
      ? (state as Record<string, unknown>).byTask
      : (record.byTask ?? record);
  if (!body || typeof body !== "object") return {};
  const notes: Record<string, DiffNote[]> = {};
  for (const [taskId, value] of Object.entries(body as Record<string, unknown>)) {
    if (!Array.isArray(value)) continue;
    const rows = value.filter(isNote);
    if (rows.length > 0) notes[taskId] = rows;
  }
  return notes;
}

function capTasks(byTask: Record<string, DiffNote[]>): Record<string, DiffNote[]> {
  const keys = Object.keys(byTask);
  if (keys.length <= TASK_LIMIT) return byTask;
  const next = { ...byTask };
  for (const key of keys.slice(0, keys.length - TASK_LIMIT)) delete next[key];
  return next;
}

function readStored(key: string): Record<string, DiffNote[]> {
  try {
    return notesFromStore(JSON.parse(localStorage.getItem(key) ?? "null"));
  } catch {
    return {};
  }
}

function readAll(): Record<string, DiffNote[]> {
  const current = readStored(KEY);
  const legacy = readStored(LEGACY_KEY);
  const merged = { ...legacy, ...current };
  if (Object.keys(legacy).length > 0) {
    localStorage.setItem(KEY, JSON.stringify({ state: { byTask: capTasks(merged) }, version: 1 }));
    localStorage.removeItem(LEGACY_KEY);
  }
  return merged;
}

export function loadNotes(taskId: string): DiffNote[] {
  return readAll()[taskId] ?? [];
}

export function saveNote(taskId: string, note: DiffNote) {
  const all = readAll();
  const next = { ...all };
  delete next[taskId];
  next[taskId] = [...(all[taskId] ?? []), note];
  localStorage.setItem(KEY, JSON.stringify({ state: { byTask: capTasks(next) }, version: 1 }));
}
