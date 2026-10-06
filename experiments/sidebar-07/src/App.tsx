import { AppShell } from "@/components/app-shell"
import { AppWindow } from "@/components/window/app-window"
import { Desktop } from "@/components/window/desktop"
import { AppInstanceProvider } from "@/lib/app-instance"
import { APPS } from "@/lib/apps"
import { useLayoutStore } from "@/lib/layout-store"
import { useWindowStore } from "@/lib/window-store"

/**
 * Both apps as windows on the desktop, or with the frame off, the most
 * recently focused app filling the page (the dock appears once it is away).
 */
export default function App() {
  const appFrame = useLayoutStore((state) => state.appFrame)
  const anyFullscreen = useWindowStore((state) =>
    APPS.some(({ id }) => state.sessions[id].state === "normal" && state.sessions[id].zoom === "fullscreen")
  )
  const lastFocused = useWindowStore((state) => state.order.at(-1) ?? APPS[0].id)
  const lastFocusedAway = useWindowStore((state) => state.sessions[lastFocused].state !== "normal")

  if (!appFrame) {
    return (
      <>
        {lastFocusedAway && <Desktop />}
        <AppInstanceProvider key={lastFocused} app={lastFocused}>
          <AppWindow fill>
            <AppShell />
          </AppWindow>
        </AppInstanceProvider>
      </>
    )
  }

  return (
    <>
      <Desktop dock={!anyFullscreen} />
      {APPS.map(({ id }) => (
        <AppInstanceProvider key={id} app={id}>
          <AppWindow>
            <AppShell />
          </AppWindow>
        </AppInstanceProvider>
      ))}
    </>
  )
}
