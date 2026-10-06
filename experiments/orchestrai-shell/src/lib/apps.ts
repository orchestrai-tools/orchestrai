import { ChevronsUpDownIcon, PanelsTopLeftIcon, type LucideIcon } from "lucide-react"

export type AppId = "tabs" | "switcher"
export type ProjectNav = "tabs" | "dropdown"

export interface AppInfo {
  id: AppId
  name: string
  /** How the window's title bar first switches projects; Appearance changes it per window. */
  projectNav: ProjectNav
  icon: LucideIcon
  /** Colours of the app's dock tile. */
  tile: string
}

/** Two variants of the same app, side by side on the desktop. */
export const APPS: readonly AppInfo[] = [
  {
    id: "tabs",
    name: "OrchestrAI Tabs",
    projectNav: "tabs",
    icon: PanelsTopLeftIcon,
    tile: "bg-sidebar-primary text-sidebar-primary-foreground",
  },
  {
    id: "switcher",
    name: "OrchestrAI Switcher",
    projectNav: "dropdown",
    icon: ChevronsUpDownIcon,
    tile: "bg-indigo-600 text-white",
  },
]

export const APP_IDS: readonly AppId[] = APPS.map((app) => app.id)

export const PROJECT_NAVS: readonly { value: ProjectNav; label: string }[] = [
  { value: "tabs", label: "Tabs" },
  { value: "dropdown", label: "Dropdown" },
]

export function findApp(id: AppId): AppInfo {
  return APPS.find((app) => app.id === id) ?? APPS[0]
}
