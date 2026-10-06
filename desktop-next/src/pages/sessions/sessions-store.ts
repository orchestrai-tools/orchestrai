import { create } from "zustand";
import { persist } from "zustand/middleware";

export type GridLayout = "1" | "2" | "4";
export type SessionsView = "list" | "grid";

interface SessionsLayout {
  view: SessionsView;
  layout: GridLayout;
  setView: (view: SessionsView) => void;
  setLayout: (layout: GridLayout) => void;
}

/** How the Sessions page was last arranged. The grid's contents are the shell's pins. */
export const useSessionsLayout = create<SessionsLayout>()(
  persist(
    (set) => ({
      view: "list",
      layout: "2",
      setView: (view) => set({ view }),
      setLayout: (layout) => set({ layout }),
    }),
    { name: "orc-sessions-layout" },
  ),
);
