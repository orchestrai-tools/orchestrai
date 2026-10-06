import { create } from "zustand";
import { persist } from "zustand/middleware";

export type SectionId =
  | "general"
  | "workspace"
  | "tasks"
  | "tracker"
  | "data"
  | "appearance"
  | "agents"
  | "integrations"
  | "history"
  | "memory"
  | "advanced"
  | "help";

/** Key used while no project is open. */
export const NO_PROJECT = "";

/** Each project reopens settings where it was left, as each project keeps its own page. */
export const useSettingsNav = create<{
  sections: Record<string, SectionId>;
  open: (project: string, section: SectionId) => void;
}>()(
  persist(
    (set) => ({
      sections: {},
      open: (project, section) =>
        set(({ sections }) => ({ sections: { ...sections, [project]: section } })),
    }),
    { name: "orc-settings-nav" },
  ),
);

/** For links from other pages: pick the section, then the caller opens the settings page. */
export function openSettingsSection(project: string | null, section: SectionId) {
  useSettingsNav.getState().open(project ?? NO_PROJECT, section);
}
