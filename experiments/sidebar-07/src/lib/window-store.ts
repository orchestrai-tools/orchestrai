import { create } from "zustand"
import { persist } from "zustand/middleware"

import { APP_IDS, findApp, type AppId } from "@/lib/apps"
import type { DrawerEdge } from "@/lib/layout-store"
import { PROJECT_IDS, type ProjectId } from "@/lib/projects"

export type PageId = "dashboard" | "chat" | "resizable" | "sheets"
export type RightPanelId = "contents" | "comments" | "activity"
export type WindowState = "normal" | "minimized" | "closed"
/** `zoomed` fills the desktop above the dock; `fullscreen` fills the whole screen. */
export type WindowZoom = "normal" | "zoomed" | "fullscreen"

export interface WindowRect {
  x: number
  y: number
  width: number
  height: number
}

/** One app's window and what it shows. */
export interface AppSession {
  /** Projects open as tabs, in tab order. The dropdown app keeps only its current project. */
  openProjects: ProjectId[]
  project: ProjectId
  /** Each project remembers its page, as each TradingView tab keeps its own chart. */
  pages: Partial<Record<ProjectId, PageId>>
  rightPanel: { open: boolean; active: RightPanelId }
  /** Null until the user moves or resizes the window; it then opens at a default spot. */
  rect: WindowRect | null
  zoom: WindowZoom
  zoomBeforeFullscreen: Exclude<WindowZoom, "fullscreen">
  /** Not persisted: windows always open normally. */
  state: WindowState
  /** Not persisted: drawers always start closed. */
  openDrawer: DrawerEdge | null
}

interface WindowStore {
  sessions: Record<AppId, AppSession>
  /** Back to front: the last app is the frontmost window. */
  order: AppId[]
  focusApp: (app: AppId) => void
  /** Opens the project's tab if needed (the dropdown app just switches). */
  selectProject: (app: AppId, project: ProjectId) => void
  /** Closing the last tab closes the window, as in TradingView and on macOS. */
  closeProject: (app: AppId, project: ProjectId) => void
  /** Opens the first project that has no tab yet. */
  newProjectTab: (app: AppId) => void
  /** Steps through the open tabs (the dropdown app steps through every project), wrapping around. */
  cycleProject: (app: AppId, step: 1 | -1) => void
  setPage: (app: AppId, page: PageId) => void
  /** Opens the panel on `id`; selecting the panel that is already open closes it. */
  selectRightPanel: (app: AppId, id: RightPanelId) => void
  closeRightPanel: (app: AppId) => void
  setRect: (app: AppId, rect: WindowRect | null) => void
  setZoom: (app: AppId, zoom: WindowZoom) => void
  /** Leaving full screen returns to the zoom the window had before, as on macOS. */
  toggleFullscreenZoom: (app: AppId) => void
  exitFullscreenZoom: (app: AppId) => void
  /** Showing a window also brings it to the front. */
  setWindowState: (app: AppId, state: WindowState) => void
  setOpenDrawer: (app: AppId, edge: DrawerEdge | null) => void
  /** Back to the default size and spot for every window, with the right panel closed. */
  resetWindows: () => void
}

const CLOSED_PANEL: AppSession["rightPanel"] = { open: false, active: "contents" }

function newSession(openProjects: ProjectId[]): AppSession {
  return {
    openProjects,
    project: openProjects[0],
    pages: {},
    rightPanel: CLOSED_PANEL,
    rect: null,
    zoom: "normal",
    zoomBeforeFullscreen: "normal",
    state: "normal",
    openDrawer: null,
  }
}

const DEFAULT_SESSIONS: Record<AppId, AppSession> = {
  tabs: newSession(["a", "b", "c"]),
  switcher: newSession(["a"]),
}

const usesTabs = (app: AppId) => findApp(app).projectNav === "tabs"

const toFront = (order: AppId[], app: AppId) => [...order.filter((id) => id !== app), app]

export function selectPage(session: AppSession): PageId {
  return session.pages[session.project] ?? "dashboard"
}

/** The focused window: the frontmost one that is on screen. */
export function selectFrontApp({ order, sessions }: Pick<WindowStore, "order" | "sessions">) {
  return [...order].reverse().find((id) => sessions[id].state === "normal")
}

export const useWindowStore = create<WindowStore>()(
  persist(
    (set) => {
      const update = (app: AppId, patch: (session: AppSession) => Partial<AppSession>) =>
        set(({ sessions }) => ({
          sessions: { ...sessions, [app]: { ...sessions[app], ...patch(sessions[app]) } },
        }))

      return {
        sessions: DEFAULT_SESSIONS,
        order: [...APP_IDS],
        focusApp: (app) =>
          set(({ order }) => (order.at(-1) === app ? {} : { order: toFront(order, app) })),
        selectProject: (app, project) =>
          update(app, ({ openProjects }) => ({
            project,
            openProjects: !usesTabs(app)
              ? [project]
              : openProjects.includes(project)
                ? openProjects
                : [...openProjects, project],
          })),
        closeProject: (app, closing) =>
          update(app, ({ openProjects, project }) => {
            const index = openProjects.indexOf(closing)
            if (index === -1) return {}
            const remaining = openProjects.filter((id) => id !== closing)
            if (remaining.length === 0) return { state: "closed", openDrawer: null }
            return {
              openProjects: remaining,
              project:
                project === closing ? remaining[Math.min(index, remaining.length - 1)] : project,
            }
          }),
        newProjectTab: (app) =>
          update(app, ({ openProjects }) => {
            const next = PROJECT_IDS.find((id) => !openProjects.includes(id))
            return next ? { openProjects: [...openProjects, next], project: next } : {}
          }),
        cycleProject: (app, step) =>
          update(app, ({ openProjects, project }) => {
            const list = usesTabs(app) ? openProjects : PROJECT_IDS
            const next = list[(list.indexOf(project) + step + list.length) % list.length]
            return { project: next, openProjects: usesTabs(app) ? openProjects : [next] }
          }),
        setPage: (app, page) =>
          update(app, ({ pages, project }) => ({ pages: { ...pages, [project]: page } })),
        selectRightPanel: (app, id) =>
          update(app, ({ rightPanel }) => ({
            rightPanel:
              rightPanel.open && rightPanel.active === id
                ? { ...rightPanel, open: false }
                : { open: true, active: id },
          })),
        closeRightPanel: (app) =>
          update(app, ({ rightPanel }) => ({ rightPanel: { ...rightPanel, open: false } })),
        setRect: (app, rect) => update(app, () => ({ rect })),
        setZoom: (app, zoom) => update(app, () => ({ zoom })),
        toggleFullscreenZoom: (app) => {
          update(app, ({ zoom, zoomBeforeFullscreen }) =>
            zoom === "fullscreen"
              ? { zoom: zoomBeforeFullscreen }
              : { zoom: "fullscreen", zoomBeforeFullscreen: zoom }
          )
          set(({ order }) => ({ order: toFront(order, app) }))
        },
        exitFullscreenZoom: (app) =>
          update(app, ({ zoom, zoomBeforeFullscreen }) =>
            zoom === "fullscreen" ? { zoom: zoomBeforeFullscreen } : {}
          ),
        setWindowState: (app, state) => {
          update(app, () => (state === "normal" ? { state } : { state, openDrawer: null }))
          if (state === "normal") set(({ order }) => ({ order: toFront(order, app) }))
        },
        setOpenDrawer: (app, openDrawer) => update(app, () => ({ openDrawer })),
        resetWindows: () =>
          set(({ sessions }) => ({
            sessions: Object.fromEntries(
              APP_IDS.map((id) => [
                id,
                { ...sessions[id], rect: null, zoom: "normal", rightPanel: CLOSED_PANEL },
              ])
            ) as Record<AppId, AppSession>,
          })),
      }
    },
    {
      name: "experiments.sidebar-07.windows",
      partialize: ({ sessions, order }) => ({
        order,
        sessions: Object.fromEntries(
          APP_IDS.map((id) => {
            const { state: _state, openDrawer: _drawer, ...saved } = sessions[id]
            // Full screen is a transient mode; a reload returns to a normal or zoomed window.
            return [id, saved.zoom === "fullscreen" ? { ...saved, zoom: saved.zoomBeforeFullscreen } : saved]
          })
        ),
      }),
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<Pick<WindowStore, "order" | "sessions">>
        return {
          ...current,
          order: saved.order?.length === APP_IDS.length ? saved.order : current.order,
          sessions: Object.fromEntries(
            APP_IDS.map((id) => [id, { ...current.sessions[id], ...saved.sessions?.[id] }])
          ) as Record<AppId, AppSession>,
        }
      },
    }
  )
)
