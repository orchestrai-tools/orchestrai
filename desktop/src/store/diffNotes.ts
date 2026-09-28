import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { DiffNote } from "@/lib/diffNotes";

/** Tasks that keep notes; writing to one more drops the least recently written. */
const TASK_LIMIT = 200;

interface DiffNotesState {
  /** Review notes per task id. */
  byTask: Record<string, DiffNote[]>;
  add: (taskId: string, note: DiffNote) => void;
  update: (taskId: string, updates: ReadonlyMap<string, Partial<DiffNote>>) => void;
  remove: (taskId: string, ids: readonly string[]) => void;
}

function write(
  byTask: Record<string, DiffNote[]>,
  taskId: string,
  notes: DiffNote[],
): Record<string, DiffNote[]> {
  const next = { ...byTask };
  delete next[taskId];
  if (notes.length > 0) next[taskId] = notes;
  const keys = Object.keys(next);
  for (const key of keys.slice(0, Math.max(0, keys.length - TASK_LIMIT))) delete next[key];
  return next;
}

export const useDiffNotesStore = create<DiffNotesState>()(
  persist(
    (set) => ({
      byTask: {},
      add: (taskId, note) =>
        set((state) => ({
          byTask: write(state.byTask, taskId, [...(state.byTask[taskId] ?? []), note]),
        })),
      update: (taskId, updates) =>
        set((state) => ({
          byTask: write(
            state.byTask,
            taskId,
            (state.byTask[taskId] ?? []).map((note) => {
              const patch = updates.get(note.id);
              return patch ? { ...note, ...patch } : note;
            }),
          ),
        })),
      remove: (taskId, ids) =>
        set((state) => ({
          byTask: write(
            state.byTask,
            taskId,
            (state.byTask[taskId] ?? []).filter((note) => !ids.includes(note.id)),
          ),
        })),
    }),
    { name: "wf-diff-notes", partialize: (state) => ({ byTask: state.byTask }), version: 1 },
  ),
);
