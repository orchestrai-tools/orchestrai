import { useEffect } from "react";
import { toast } from "sonner";
import { create } from "zustand";
import { useShell } from "./shell-store";
import type { PaletteAction } from "./task-palette";

/** Bumps when the palette asks the memory list to load again. */
export const useMemoryRefresh = create<{ tick: number; refresh: () => void }>((set) => ({
  tick: 0,
  refresh: () => set((state) => ({ tick: state.tick + 1 })),
}));

type MemoryActions = {
  save: () => void;
  askDelete: () => void;
};

let actions: MemoryActions | null = null;

/** The open memory registers save and delete so the palette can run them. */
export function useMemoryActions(next: MemoryActions): void {
  useEffect(() => {
    actions = next;
    return () => {
      actions = null;
    };
  }, [next]);
}

function requireMemory(run: (current: MemoryActions) => void): void {
  useShell.getState().setPage("memory");
  if (!actions) {
    toast.error("Open a memory first");
    return;
  }
  run(actions);
}

/** Refresh the list, or save and delete the memory that is open. */
export function memoryPaletteActions(project: string | null): PaletteAction[] {
  if (!project) return [];
  return [
    {
      id: "refresh-memories",
      label: "Refresh memories",
      run: () => {
        useShell.getState().setPage("memory");
        useMemoryRefresh.getState().refresh();
      },
    },
    {
      id: "save-memory",
      label: "Save memory",
      run: () => requireMemory((current) => current.save()),
    },
    {
      id: "delete-memory",
      label: "Delete memory",
      run: () => requireMemory((current) => current.askDelete()),
    },
  ];
}
