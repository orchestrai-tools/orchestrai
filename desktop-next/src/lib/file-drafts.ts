import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export interface FileDraft {
  text: string;
  base: string;
}

export function draftScope(project: string, taskId: string, worktree?: string): string {
  return JSON.stringify([project, taskId, worktree ?? ""]);
}

interface DraftStore {
  scopes: Record<string, Record<string, FileDraft>>;
  edit: (scope: string, path: string, text: string, base: string) => void;
  saved: (scope: string, path: string, submitted: string) => void;
  forget: (scope: string, path: string) => void;
  rename: (scope: string, from: string, to: string) => void;
}

/** Unsaved text survives file/page switches and reloads within this browser session. */
export const useFileDrafts = create<DraftStore>()(
  persist(
    (set) => ({
      scopes: {},
      edit: (scope, path, text, base) =>
        set((state) => {
          const files = { ...state.scopes[scope] };
          if (text === base) delete files[path];
          else files[path] = { text, base };
          return { scopes: { ...state.scopes, [scope]: files } };
        }),
      saved: (scope, path, submitted) =>
        set((state) => {
          const files = { ...state.scopes[scope] };
          const current = files[path];
          if (!current || current.text === submitted) delete files[path];
          else files[path] = { ...current, base: submitted };
          return { scopes: { ...state.scopes, [scope]: files } };
        }),
      forget: (scope, path) =>
        set((state) => ({
          scopes: {
            ...state.scopes,
            [scope]: Object.fromEntries(
              Object.entries(state.scopes[scope] ?? {}).filter(
                ([file]) => file !== path && !file.startsWith(`${path}/`),
              ),
            ),
          },
        })),
      rename: (scope, from, to) =>
        set((state) => ({
          scopes: {
            ...state.scopes,
            [scope]: Object.fromEntries(
              Object.entries(state.scopes[scope] ?? {}).map(([path, draft]) => [
                path === from
                  ? to
                  : path.startsWith(`${from}/`)
                    ? `${to}${path.slice(from.length)}`
                    : path,
                draft,
              ]),
            ),
          },
        })),
    }),
    { name: "orchestrai-file-drafts", storage: createJSONStorage(() => sessionStorage) },
  ),
);
