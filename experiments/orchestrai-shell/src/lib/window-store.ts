import { create } from "zustand"
import { persist } from "zustand/middleware"

import { APP_IDS, findApp, type AppId, type ProjectNav } from "@/lib/apps"
import { PROJECT_IDS, type ProjectId } from "@/lib/projects"

/** Every place inside a project. The project is the namespace; these are its pages. */
export type PageId =
  | "board"
  | "task"
  | "inbox"
  | "sessions"
  | "channel"
  | "docs"
  | "memory"
  | "changes"
  | "github"
  | "backlog"
  | "workflows"
  | "automations"
  | "services"
  | "agents"
  | "settings"
export type InspectorId = "details" | "changes" | "checks" | "context" | "activity"
/** What a page has selected, remembered per project. */
export type SelectionKey =
  | "task"
  | "doc"
  | "session"
  | "file"
  | "worktree"
  | "inbox"
  | "service"
  | "workflow"
  | "automation"
  | "memory"
  /** Changes or Worktrees on the Changes page. */
  | "changes-view"
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
  /** Tabs show every open project with its status; the dropdown names only the current one. */
  projectNav: ProjectNav
  /** Projects open as tabs, in tab order. The dropdown keeps adding to it, so tabs come back with them. */
  openProjects: ProjectId[]
  /** The last project shown; it stays set while Home is open so the tab can return to it. */
  project: ProjectId
  /** The pinned Home tab: every project's tasks on one board. Opening a project leaves it. */
  home: boolean
  /** Each project remembers its page, as each TradingView tab keeps its own chart. */
  pages: Partial<Record<ProjectId, PageId>>
  selection: Partial<Record<ProjectId, Partial<Record<SelectionKey, string>>>>
  inspector: { open: boolean; active: InspectorId }
  /** The bottom terminal drawer: its tab strip always shows; the panel opens above it. */
  terminal: { open: boolean; active: string }
  /** Not persisted: focus mode hides the chrome until it is left again. */
  focus: boolean
  /** Null until the user moves or resizes the window; it then opens at a default spot. */
  rect: WindowRect | null
  zoom: WindowZoom
  zoomBeforeFullscreen: Exclude<WindowZoom, "fullscreen">
  /** Not persisted: windows always open normally. */
  state: WindowState
}

interface WindowStore {
  sessions: Record<AppId, AppSession>
  /** Back to front: the last app is the frontmost window. */
  order: AppId[]
  focusApp: (app: AppId) => void
  setProjectNav: (app: AppId, nav: ProjectNav) => void
  /** Opens the project's tab if needed. */
  selectProject: (app: AppId, project: ProjectId) => void
  openHome: (app: AppId) => void
  /** Home is pinned, so closing the last project tab lands on Home instead of closing the window. */
  closeProject: (app: AppId, project: ProjectId) => void
  /** Opens the first project that has no tab yet. */
  newProjectTab: (app: AppId) => void
  /** Steps through Home and the open tabs (the dropdown steps through every project), wrapping around. */
  cycleProject: (app: AppId, step: 1 | -1) => void
  setPage: (app: AppId, page: PageId) => void
  /** Selects an item in the current project, optionally opening the page that shows it. */
  select: (app: AppId, key: SelectionKey, id: string, page?: PageId) => void
  /** Opens the inspector on `id`; selecting the panel that is already open closes it. */
  selectInspector: (app: AppId, id: InspectorId) => void
  closeInspector: (app: AppId) => void
  toggleTerminal: (app: AppId, open?: boolean) => void
  selectTerminal: (app: AppId, id: string) => void
  toggleFocus: (app: AppId, focus?: boolean) => void
  setRect: (app: AppId, rect: WindowRect | null) => void
  setZoom: (app: AppId, zoom: WindowZoom) => void
  /** Leaving full screen returns to the zoom the window had before, as on macOS. */
  toggleFullscreenZoom: (app: AppId) => void
  exitFullscreenZoom: (app: AppId) => void
  /** Showing a window also brings it to the front. */
  setWindowState: (app: AppId, state: WindowState) => void
  /** Back to the default size and spot for every window, with the side panels closed. */
  resetWindows: () => void
}

const CLOSED_INSPECTOR: AppSession["inspector"] = { open: false, active: "details" }

function newSession(app: AppId, openProjects: ProjectId[]): AppSession {
  return {
    projectNav: findApp(app).projectNav,
    openProjects,
    project: openProjects[0],
    home: true,
    pages: {},
    selection: {},
    inspector: CLOSED_INSPECTOR,
    terminal: { open: false, active: "dev" },
    focus: false,
    rect: null,
    zoom: "normal",
    zoomBeforeFullscreen: "normal",
    state: "normal",
  }
}

const DEFAULT_SESSIONS: Record<AppId, AppSession> = {
  tabs: newSession("tabs", ["orchestrai", "acme-web", "payments"]),
  switcher: newSession("switcher", ["orchestrai"]),
}

const toFront = (order: AppId[], app: AppId) => [...order.filter((id) => id !== app), app]

export function selectPage(session: AppSession): PageId {
  return session.pages[session.project] ?? "board"
}

export function selectSelection(session: AppSession, key: SelectionKey): string | undefined {
  return session.selection[session.project]?.[key]
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
        setProjectNav: (app, projectNav) => update(app, () => ({ projectNav })),
        selectProject: (app, project) =>
          update(app, ({ openProjects }) => ({
            project,
            home: false,
            openProjects: openProjects.includes(project) ? openProjects : [...openProjects, project],
          })),
        openHome: (app) => update(app, () => ({ home: true })),
        closeProject: (app, closing) =>
          update(app, ({ openProjects, project, home }) => {
            const index = openProjects.indexOf(closing)
            if (index === -1) return {}
            const remaining = openProjects.filter((id) => id !== closing)
            if (remaining.length === 0) return { openProjects: [], home: true }
            if (home || project !== closing) return { openProjects: remaining }
            return { openProjects: remaining, project: remaining[Math.min(index, remaining.length - 1)] }
          }),
        newProjectTab: (app) =>
          update(app, ({ openProjects }) => {
            const next = PROJECT_IDS.find((id) => !openProjects.includes(id))
            return next ? { openProjects: [...openProjects, next], project: next, home: false } : {}
          }),
        cycleProject: (app, step) =>
          update(app, ({ projectNav, openProjects, project, home }) => {
            const list: (ProjectId | "home")[] = ["home", ...(projectNav === "tabs" ? openProjects : PROJECT_IDS)]
            const next = list[(list.indexOf(home ? "home" : project) + step + list.length) % list.length]
            if (next === "home") return { home: true }
            return {
              project: next,
              home: false,
              openProjects: openProjects.includes(next) ? openProjects : [...openProjects, next],
            }
          }),
        setPage: (app, page) =>
          update(app, ({ pages, project }) => ({ pages: { ...pages, [project]: page } })),
        select: (app, key, id, page) =>
          update(app, ({ selection, pages, project }) => ({
            selection: { ...selection, [project]: { ...selection[project], [key]: id } },
            pages: page ? { ...pages, [project]: page } : pages,
          })),
        selectInspector: (app, id) =>
          update(app, ({ inspector }) => ({
            inspector:
              inspector.open && inspector.active === id
                ? { ...inspector, open: false }
                : { open: true, active: id },
          })),
        closeInspector: (app) =>
          update(app, ({ inspector }) => ({ inspector: { ...inspector, open: false } })),
        toggleTerminal: (app, open) =>
          update(app, ({ terminal }) => ({ terminal: { ...terminal, open: open ?? !terminal.open } })),
        selectTerminal: (app, active) => update(app, () => ({ terminal: { open: true, active } })),
        toggleFocus: (app, focus) => update(app, (session) => ({ focus: focus ?? !session.focus })),
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
          update(app, () => ({ state }))
          if (state === "normal") set(({ order }) => ({ order: toFront(order, app) }))
        },
        resetWindows: () =>
          set(({ sessions }) => ({
            sessions: Object.fromEntries(
              APP_IDS.map((id) => [
                id,
                { ...sessions[id], rect: null, zoom: "normal", inspector: CLOSED_INSPECTOR, focus: false },
              ])
            ) as Record<AppId, AppSession>,
          })),
      }
    },
    {
      name: "experiments.orchestrai-shell.windows",
      partialize: ({ sessions, order }) => ({
        order,
        sessions: Object.fromEntries(
          APP_IDS.map((id) => {
            const { state: _state, focus: _focus, ...saved } = sessions[id]
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
