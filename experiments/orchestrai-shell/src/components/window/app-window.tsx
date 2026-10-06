import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"

import { useWindowGeometry, type ResizeEdge } from "@/components/window/use-window-geometry"
import { WindowTitleBar } from "@/components/window/window-title-bar"
import { useFullscreen } from "@/hooks/use-window-chrome"
import { useAppActions, useAppId, useAppSession } from "@/lib/app-instance"
import { findApp } from "@/lib/apps"
import { PortalContainerProvider } from "@/lib/portal-container"
import { cn } from "@/lib/utils"
import { useWindowStore, type WindowState } from "@/lib/window-store"

const AWAY: Record<WindowState, string | false> = {
  normal: false,
  minimized: "pointer-events-none translate-y-[60vh] scale-[0.1] opacity-0",
  closed: "pointer-events-none scale-95 opacity-0",
}

const HANDLES: readonly { edge: ResizeEdge; className: string }[] = [
  { edge: "n", className: "inset-x-2 -top-1 h-2 cursor-ns-resize" },
  { edge: "s", className: "inset-x-2 -bottom-1 h-2 cursor-ns-resize" },
  { edge: "e", className: "inset-y-2 -right-1 w-2 cursor-ew-resize" },
  { edge: "w", className: "inset-y-2 -left-1 w-2 cursor-ew-resize" },
  { edge: "ne", className: "-top-1 -right-1 size-3 cursor-nesw-resize" },
  { edge: "nw", className: "-top-1 -left-1 size-3 cursor-nwse-resize" },
  { edge: "se", className: "-right-1 -bottom-1 size-3 cursor-nwse-resize" },
  { edge: "sw", className: "-bottom-1 -left-1 size-3 cursor-nesw-resize" },
]

/** Height of an element, kept current as it resizes. */
function useElementHeight(element: HTMLElement | null) {
  const [height, setHeight] = useState(0)
  useEffect(() => {
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setHeight(entry.contentRect.height))
    observer.observe(element)
    return () => observer.disconnect()
  }, [element])
  return height
}

/** Leaving browser full screen (Esc) also leaves the window's full-screen mode. */
function useExitFullscreenWithBrowser() {
  const { fullscreen } = useFullscreen()
  const { exitFullscreenZoom } = useAppActions()
  const wasFullscreen = useRef(fullscreen)
  useEffect(() => {
    if (wasFullscreen.current && !fullscreen) exitFullscreenZoom()
    wasFullscreen.current = fullscreen
  }, [fullscreen, exitFullscreenZoom])
}

/**
 * One app as a macOS window: a unified title bar and a content area that
 * contains everything inside it. CSS containment makes the content the
 * containing block for the app's fixed sidebars and overlays, and overlays
 * portal into it, so nothing spills onto the desktop or the other window.
 * Pressing anywhere in the window brings it to the front. With `fill` the
 * window covers the page instead (the frame turned off).
 */
export function AppWindow({ fill = false, children }: { fill?: boolean; children: ReactNode }) {
  const app = useAppId()
  const geometry = useWindowGeometry({ fill })
  const windowState = useAppSession((session) => session.state)
  const stack = useWindowStore((state) => state.order.indexOf(app))
  const { focusApp } = useAppActions()
  const [frame, setFrame] = useState<HTMLElement | null>(null)
  const [content, setContent] = useState<HTMLDivElement | null>(null)
  const contentHeight = useElementHeight(content)
  const edgeToEdge = geometry.zoom === "fullscreen"
  useExitFullscreenWithBrowser()

  return (
    <section
      ref={setFrame}
      aria-label={`${findApp(app).name} window`}
      inert={windowState !== "normal"}
      data-gesture={geometry.gesturing || undefined}
      onPointerDownCapture={focusApp}
      style={{
        left: geometry.rect.x,
        top: geometry.rect.y,
        width: geometry.rect.width,
        height: geometry.rect.height,
        zIndex: 10 + stack,
      }}
      className={cn(
        "fixed flex origin-bottom flex-col bg-background transition-[left,top,width,height,border-radius,opacity,scale,translate] duration-300 ease-out data-gesture:transition-none",
        edgeToEdge ? "rounded-none" : "rounded-[10px] shadow-2xl ring-1 ring-black/15 dark:ring-white/15",
        AWAY[windowState]
      )}
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[inherit]">
        {/* Title-bar menus open over the content, so they portal into the window itself. */}
        <PortalContainerProvider value={frame}>
          <WindowTitleBar {...geometry.titleBarProps} />
        </PortalContainerProvider>
        <div
          ref={setContent}
          style={{ "--app-dvh": `${contentHeight}px` } as CSSProperties}
          className="relative min-h-0 flex-1 overflow-hidden [contain:layout_paint]"
        >
          <PortalContainerProvider value={content}>{children}</PortalContainerProvider>
        </div>
      </div>
      {geometry.resizable &&
        HANDLES.map(({ edge, className }) => (
          <div
            key={edge}
            aria-hidden
            {...geometry.resizeHandleProps(edge)}
            className={cn("absolute z-20 touch-none", className)}
          />
        ))}
    </section>
  )
}
