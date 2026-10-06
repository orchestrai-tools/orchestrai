import { create } from "zustand";
import { useShell } from "../lib/shell-store";
import type { PaletteAction } from "../lib/task-palette";

/** Whether the Changes page is listing ignored paths. */
export const useIgnoredFiles = create<{
  open: boolean;
  show: () => void;
  hide: () => void;
}>((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}));

export function ignoredPaletteAction(open: boolean): PaletteAction {
  return {
    id: "ignored-files",
    label: open ? "Hide ignored files" : "Show ignored files",
    run: () => {
      useShell.getState().setPage("changes");
      if (open) useIgnoredFiles.getState().hide();
      else useIgnoredFiles.getState().show();
    },
  };
}
