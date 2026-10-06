const SAVED_KEY = "orc-shell-saved";
const HISTORY_KEY = "orc-shell-history";

function readAll(): Record<string, string[]> {
  try {
    const parsed = JSON.parse(localStorage.getItem(SAVED_KEY) ?? "{}") as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const saved: Record<string, string[]> = {};
    for (const [project, rows] of Object.entries(parsed)) {
      if (Array.isArray(rows)) saved[project] = rows.filter((item) => typeof item === "string");
    }
    return saved;
  } catch {
    return {};
  }
}

/** Commands pinned for one project, newest first. */
export function readSaved(project: string): string[] {
  return readAll()[project] ?? [];
}

/** Pin a command, or drop it when it is already pinned. */
export function toggleSaved(project: string, command: string): string[] {
  const text = command.trim();
  if (!text) return readSaved(project);
  const current = readSaved(project);
  const next = current.includes(text)
    ? current.filter((item) => item !== text)
    : [text, ...current].slice(0, 20);
  const all = readAll();
  all[project] = next;
  localStorage.setItem(SAVED_KEY, JSON.stringify(all));
  return next;
}

function strings(rows: unknown): string[] {
  return Array.isArray(rows) ? rows.filter((item) => typeof item === "string") : [];
}

/** Recent commands for one project. An older unscoped list belongs to the project that next runs one. */
export function readHistory(project: string): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]") as unknown;
    if (Array.isArray(parsed)) return strings(parsed);
    if (!parsed || typeof parsed !== "object") return [];
    return strings((parsed as Record<string, unknown>)[project]);
  } catch {
    return [];
  }
}

export function writeHistory(project: string, commands: string[]): string[] {
  const next = commands.slice(0, 20);
  let all: Record<string, string[]> = {};
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "{}") as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      for (const [name, rows] of Object.entries(parsed)) all[name] = strings(rows);
    }
  } catch {
    all = {};
  }
  all[project] = next;
  localStorage.setItem(HISTORY_KEY, JSON.stringify(all));
  return next;
}

/** Drop the commands saved for a project that was removed. */
export function dropProjectCommands(project: string): void {
  const saved = readAll();
  if (project in saved) {
    delete saved[project];
    localStorage.setItem(SAVED_KEY, JSON.stringify(saved));
  }
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "{}") as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return;
    const history = { ...(parsed as Record<string, unknown>) };
    delete history[project];
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    // A corrupt history list is left untouched.
  }
}
