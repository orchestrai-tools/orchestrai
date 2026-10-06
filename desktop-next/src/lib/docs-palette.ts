import { useEffect } from "react";
import { toast } from "sonner";
import { create } from "zustand";
import { useShell } from "./shell-store";
import type { PaletteAction } from "./task-palette";

/** Bumps when the palette asks the docs index to load again. */
export const useDocsRefresh = create<{ tick: number; refresh: () => void }>((set) => ({
  tick: 0,
  refresh: () => set((state) => ({ tick: state.tick + 1 })),
}));

let saveDoc: (() => void) | null = null;

/** The open doc page registers its save so the palette can run it. */
export function bindDocsSave(next: (() => void) | null): void {
  saveDoc = next;
}

export function useDocsSave(save: () => void): void {
  useEffect(() => {
    bindDocsSave(save);
    return () => bindDocsSave(null);
  }, [save]);
}

/** Refresh the index, or save the doc that is open. */
export function docsPaletteActions(project: string | null): PaletteAction[] {
  if (!project) return [];
  return [
    {
      id: "refresh-docs",
      label: "Refresh docs",
      run: () => {
        useShell.getState().setPage("docs");
        useDocsRefresh.getState().refresh();
      },
    },
    {
      id: "save-doc",
      label: "Save doc",
      run: () => {
        useShell.getState().setPage("docs");
        if (!saveDoc) {
          toast.error("Open a doc first");
          return;
        }
        saveDoc();
      },
    },
  ];
}
