import { createContext, useContext, useMemo, type ReactNode } from "react"

import type { AppId } from "@/lib/apps"
import { selectFrontApp, useWindowStore, type AppSession } from "@/lib/window-store"

const AppIdContext = createContext<AppId | null>(null)

/** Scopes everything inside to one app's window, so two apps can run side by side. */
export function AppInstanceProvider({ app, children }: { app: AppId; children: ReactNode }) {
  return <AppIdContext value={app}>{children}</AppIdContext>
}

export function useAppId(): AppId {
  const app = useContext(AppIdContext)
  if (!app) throw new Error("useAppId must be used inside AppInstanceProvider")
  return app
}

/** Reads this app's session. Wrap object selectors in useShallow. */
export function useAppSession<T>(selector: (session: AppSession) => T): T {
  const app = useAppId()
  return useWindowStore((state) => selector(state.sessions[app]))
}

/** Whether this app's window is the focused (frontmost visible) one. */
export function useIsFrontApp(): boolean {
  const app = useAppId()
  return useWindowStore((state) => selectFrontApp(state) === app)
}

const ACTIONS = [
  "focusApp",
  "setProjectNav",
  "selectProject",
  "openHome",
  "closeProject",
  "newProjectTab",
  "cycleProject",
  "setPage",
  "select",
  "selectInspector",
  "closeInspector",
  "toggleTerminal",
  "selectTerminal",
  "toggleFocus",
  "setRect",
  "setZoom",
  "toggleFullscreenZoom",
  "exitFullscreenZoom",
  "setWindowState",
] as const

type Store = ReturnType<typeof useWindowStore.getState>
type BoundActions = {
  [K in (typeof ACTIONS)[number]]: Store[K] extends (app: AppId, ...rest: infer Rest) => void
    ? (...rest: Rest) => void
    : never
}

/** The window store's per-app actions, bound to this app. */
export function useAppActions(): BoundActions {
  const app = useAppId()
  return useMemo(
    () =>
      Object.fromEntries(
        ACTIONS.map((name) => [
          name,
          (...rest: unknown[]) =>
            (useWindowStore.getState()[name] as (app: AppId, ...rest: unknown[]) => void)(app, ...rest),
        ])
      ) as BoundActions,
    [app]
  )
}
