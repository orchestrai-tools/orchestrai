import { create } from "zustand"
import { persist } from "zustand/middleware"

import type { ProjectId } from "@/lib/projects"

export type SectionId =
  | "general"
  | "workspace"
  | "tasks"
  | "agents"
  | "instructions"
  | "integrations"
  | "notifications"
  | "data"
  | "app-agents"
  | "appearance"
  | "remote"
  | "connections"
  | "plugins"
  | "history"
  | "memory"
  | "editor"
  | "advanced"
  | "help"

/** Each project reopens settings where it was left, as each project tab keeps its own page. */
export const useSettingsNav = create<{
  sections: Partial<Record<ProjectId, SectionId>>
  open: (project: ProjectId, section: SectionId) => void
}>()(
  persist(
    (set) => ({
      sections: {},
      open: (project, section) => set(({ sections }) => ({ sections: { ...sections, [project]: section } })),
    }),
    { name: "experiments.orchestrai-shell.settings-nav" }
  )
)

/** For links from other pages: pick the section, then the caller opens the settings page. */
export function openSettingsSection(project: ProjectId, section: SectionId) {
  useSettingsNav.getState().open(project, section)
}
