import { create } from "zustand"
import { persist } from "zustand/middleware"

/** `full` spans the window above both sidebars; `inset` sits beside the left sidebar. */
export type HeaderSpan = "full" | "inset"
export type HeaderContent = "breadcrumbs" | "menubar"
export type DrawerEdge = "right" | "bottom" | "top"

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
  /** Non-modal drawers leave the page interactive and stay open on outside clicks. */
  drawersModal: boolean
  setDrawersModal: (modal: boolean) => void
  /** Bottom and top drawers snap to preset heights while dragged (Base UI supports vertical drawers only). */
  drawerSnapPoints: boolean
  setDrawerSnapPoints: (enabled: boolean) => void
  /** Desktop-style close, minimize, and zoom buttons. */
  windowControls: boolean
  setWindowControls: (enabled: boolean) => void
  /** Runs the apps as macOS windows on a desktop; otherwise the front app fills the page. */
  appFrame: boolean
  setAppFrame: (enabled: boolean) => void
}

type LayoutSettings = Pick<
  LayoutState,
  "header" | "drawersModal" | "drawerSnapPoints" | "windowControls" | "appFrame"
>

const DEFAULT_LAYOUT: LayoutSettings = {
  header: { visible: true, span: "inset", content: "breadcrumbs" },
  drawersModal: true,
  drawerSnapPoints: false,
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
      setDrawersModal: (modal) => set({ drawersModal: modal }),
      setDrawerSnapPoints: (enabled) => set({ drawerSnapPoints: enabled }),
      setWindowControls: (enabled) => set({ windowControls: enabled }),
      setAppFrame: (enabled) => set({ appFrame: enabled }),
    }),
    {
      name: "experiments.sidebar-07.layout",
      partialize: (state): LayoutSettings => ({
        header: state.header,
        drawersModal: state.drawersModal,
        drawerSnapPoints: state.drawerSnapPoints,
        windowControls: state.windowControls,
        appFrame: state.appFrame,
      }),
    }
  )
)
