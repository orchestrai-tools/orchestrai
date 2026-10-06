import { create } from "zustand";

const KEY = "orc-hidden-sessions";

/** Bumps when a session is hidden or shown, so open lists refresh. */
export const useHiddenSessions = create<{ tick: number }>(() => ({ tick: 0 }));

function bumpHidden() {
  useHiddenSessions.setState((state) => ({ tick: state.tick + 1 }));
}

type Store = Record<string, string[]>;

function read(): Store {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "{}") as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const store: Store = {};
    for (const [project, ids] of Object.entries(parsed)) {
      if (Array.isArray(ids)) store[project] = ids.filter((id) => typeof id === "string");
    }
    return store;
  } catch {
    return {};
  }
}

function write(store: Store) {
  localStorage.setItem(KEY, JSON.stringify(store));
}

/** Sessions a person hid from this project's list. */
export function hiddenSessionIds(project: string): string[] {
  return read()[project] ?? [];
}

export function hideSession(project: string, id: string): string[] {
  const store = read();
  const current = store[project] ?? [];
  if (!current.includes(id)) store[project] = [...current, id];
  write(store);
  bumpHidden();
  return store[project] ?? [];
}

export function unhideSession(project: string, id: string): string[] {
  const store = read();
  store[project] = (store[project] ?? []).filter((entry) => entry !== id);
  write(store);
  bumpHidden();
  return store[project] ?? [];
}

/** Drop the hidden list for a project that was removed. */
export function dropHiddenSessions(project: string): void {
  const store = read();
  delete store[project];
  write(store);
}
