import { Maximize2Icon, Minimize2Icon, MinusIcon, XIcon, type LucideIcon } from "lucide-react"

import { useFullscreen, useWindowFocused } from "@/hooks/use-window-chrome"
import { useAppActions, useAppSession, useIsFrontApp } from "@/lib/app-instance"
import { useLayoutStore } from "@/lib/layout-store"
import { cn } from "@/lib/utils"

/** Coloured while the window is focused or the controls are hovered, grey otherwise (as on macOS). */
const LIGHTS = {
  close:
    "group-data-[focused=true]/window-controls:bg-[#ff5f57] group-data-[focused=true]/window-controls:ring-[#e0443e] group-hover/window-controls:bg-[#ff5f57] group-hover/window-controls:ring-[#e0443e]",
  minimize:
    "group-data-[focused=true]/window-controls:bg-[#febc2e] group-data-[focused=true]/window-controls:ring-[#dea123] group-hover/window-controls:bg-[#febc2e] group-hover/window-controls:ring-[#dea123]",
  zoom:
    "group-data-[focused=true]/window-controls:bg-[#28c840] group-data-[focused=true]/window-controls:ring-[#1aab29] group-hover/window-controls:bg-[#28c840] group-hover/window-controls:ring-[#1aab29]",
} as const

function TrafficLight({
  tone,
  label,
  icon: Icon,
  onClick,
}: {
  tone: keyof typeof LIGHTS
  label: string
  icon: LucideIcon
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "flex size-3 items-center justify-center rounded-full bg-muted-foreground/25 ring-[0.5px] ring-muted-foreground/30 ring-inset outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        LIGHTS[tone]
      )}
    >
      <Icon
        aria-hidden
        strokeWidth={3}
        className="size-2 text-black/60 opacity-0 transition-opacity group-hover/window-controls:opacity-100"
      />
    </button>
  )
}

/**
 * macOS-style close, minimize, and zoom buttons for this app's window.
 * Glyphs show on hover; the lights grey out while the window is in the
 * background or the browser is unfocused, as macOS does for inactive windows.
 */
export function WindowControls({ className }: { className?: string }) {
  const appFrame = useLayoutStore((state) => state.appFrame)
  const windowZoom = useAppSession((session) => session.zoom)
  const { setWindowState, toggleFullscreenZoom } = useAppActions()
  const browserFocused = useWindowFocused()
  const front = useIsFrontApp()
  const focused = browserFocused && front
  const browser = useFullscreen()

  // In the app frame, full screen is the window filling the screen (and the browser too, where allowed).
  const fullscreen = appFrame ? windowZoom === "fullscreen" : browser.fullscreen
  const toggleFullscreen = () => {
    if (appFrame) toggleFullscreenZoom()
    if (browser.fullscreen === fullscreen) browser.toggle()
  }

  return (
    <div
      role="group"
      aria-label="Window controls"
      data-focused={focused}
      className={cn("group/window-controls flex shrink-0 items-center gap-2", className)}
    >
      <TrafficLight tone="close" label="Close window" icon={XIcon} onClick={() => setWindowState("closed")} />
      <TrafficLight
        tone="minimize"
        label="Minimize window"
        icon={MinusIcon}
        onClick={() => setWindowState("minimized")}
      />
      <TrafficLight
        tone="zoom"
        label={fullscreen ? "Exit full screen" : "Enter full screen"}
        icon={fullscreen ? Minimize2Icon : Maximize2Icon}
        onClick={toggleFullscreen}
      />
    </div>
  )
}
