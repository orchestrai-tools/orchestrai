import { ChevronsUpDownIcon, PanelsTopLeftIcon, type LucideIcon } from "lucide-react"

export type AppId = "tabs" | "switcher"

export interface AppInfo {
  id: AppId
  name: string
  /** How the window's title bar switches projects. */
  projectNav: "tabs" | "dropdown"
  icon: LucideIcon
  /** Colours of the app's dock tile. */
  tile: string
}

/** Two variants of the same app, side by side on the desktop. */
export const APPS: readonly AppInfo[] = [
  {
    id: "tabs",
    name: "Acme Tabs",
    projectNav: "tabs",
    icon: PanelsTopLeftIcon,
    tile: "bg-sidebar-primary text-sidebar-primary-foreground",
  },
  {
    id: "switcher",
    name: "Acme Switcher",
    projectNav: "dropdown",
    icon: ChevronsUpDownIcon,
    tile: "bg-indigo-600 text-white",
  },
]

export const APP_IDS: readonly AppId[] = APPS.map((app) => app.id)

export function findApp(id: AppId): AppInfo {
  return APPS.find((app) => app.id === id) ?? APPS[0]
}
