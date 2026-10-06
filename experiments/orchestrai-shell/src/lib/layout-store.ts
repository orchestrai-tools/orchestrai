import { create } from "zustand"
import { persist } from "zustand/middleware"

/** `full` spans the window above both sidebars; `inset` sits beside the left sidebar. */
export type HeaderSpan = "full" | "inset"
export type HeaderContent = "breadcrumbs" | "menubar"
export type Theme = "light" | "dark"
/** One density for the whole product, never per page (Cloudscape, SAP Fiori). */
export type Density = "comfortable" | "compact"
/** Corner radius is one token that every component reads (SHARP-EDGES.md). */
export type Radius = "none" | "small" | "medium"

interface HeaderSettings {
  visible: boolean
  span: HeaderSpan
  content: HeaderContent
}

/** Preferences shared by both apps. Each window's own state lives in the window store. */
interface LayoutState {
  header: HeaderSettings
  setHeader: (patch: Partial<HeaderSettings>) => void
  resetLayout: () => void
  theme: Theme
  setTheme: (theme: Theme) => void
  density: Density
  setDensity: (density: Density) => void
  radius: Radius
  setRadius: (radius: Radius) => void
  /** Desktop-style close, minimize, and zoom buttons. */
  windowControls: boolean
  setWindowControls: (enabled: boolean) => void
  /** Runs the apps as macOS windows on a desktop; otherwise the front app fills the page. */
  appFrame: boolean
  setAppFrame: (enabled: boolean) => void
}

type LayoutSettings = Pick<
  LayoutState,
  "header" | "theme" | "density" | "radius" | "windowControls" | "appFrame"
>

const DEFAULT_LAYOUT: LayoutSettings = {
  header: { visible: true, span: "inset", content: "breadcrumbs" },
  theme: "light",
  density: "comfortable",
  radius: "small",
  windowControls: true,
  appFrame: true,
}

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set) => ({
      ...DEFAULT_LAYOUT,
      setHeader: (patch) =>
        set(({ header }) => ({ header: { ...header, ...patch } })),
      resetLayout: () => set(DEFAULT_LAYOUT),
      setTheme: (theme) => set({ theme }),
      setDensity: (density) => set({ density }),
      setRadius: (radius) => set({ radius }),
      setWindowControls: (enabled) => set({ windowControls: enabled }),
      setAppFrame: (enabled) => set({ appFrame: enabled }),
    }),
    {
      name: "experiments.orchestrai-shell.layout",
      partialize: (state): LayoutSettings => ({
        header: state.header,
        theme: state.theme,
        density: state.density,
        radius: state.radius,
        windowControls: state.windowControls,
        appFrame: state.appFrame,
      }),
    }
  )
)
