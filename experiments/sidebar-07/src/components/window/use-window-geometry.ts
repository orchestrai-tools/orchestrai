import { useRef, useState, useSyncExternalStore, type MouseEvent, type PointerEvent } from "react"

import { useAppActions, useAppId, useAppSession } from "@/lib/app-instance"
import { APP_IDS } from "@/lib/apps"
import type { WindowRect } from "@/lib/window-store"

/** Space kept free at the bottom of the screen for the dock. */
export const DOCK_SPACE = 84
const ZOOM_MARGIN = 8
const MIN_WIDTH = 640
const MIN_HEIGHT = 420
const DEFAULT_WIDTH = 1200
const DEFAULT_HEIGHT = 800
/** Each app's default spot is offset from the previous one, as macOS cascades new windows. */
const CASCADE = { x: 64, y: 36 }

export type ResizeEdge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw"
type GestureKind = "move" | ResizeEdge

interface Bounds {
  width: number
  height: number
}

function subscribeResize(onChange: () => void) {
  window.addEventListener("resize", onChange)
  return () => window.removeEventListener("resize", onChange)
}

function useViewport(): Bounds {
  const width = useSyncExternalStore(subscribeResize, () => window.innerWidth)
  const height = useSyncExternalStore(subscribeResize, () => window.innerHeight)
  return { width, height }
}

/** Keeps the window on the desktop and at least the minimum size the desktop allows. */
function clampRect(rect: WindowRect, bounds: Bounds): WindowRect {
  const width = Math.min(Math.max(rect.width, Math.min(MIN_WIDTH, bounds.width)), bounds.width)
  const height = Math.min(Math.max(rect.height, Math.min(MIN_HEIGHT, bounds.height)), bounds.height)
  return {
    width,
    height,
    x: Math.min(Math.max(rect.x, 0), bounds.width - width),
    y: Math.min(Math.max(rect.y, 0), bounds.height - height),
  }
}

function defaultRect(bounds: Bounds, index: number): WindowRect {
  const width = Math.min(DEFAULT_WIDTH, bounds.width - 96 - CASCADE.x)
  const height = Math.min(DEFAULT_HEIGHT, bounds.height - 48 - CASCADE.y)
  const offset = index - (APP_IDS.length - 1) / 2
  return {
    x: (bounds.width - width) / 2 + offset * CASCADE.x,
    y: (bounds.height - height) / 2 + offset * CASCADE.y,
    width,
    height,
  }
}

/** Window controls, tabs, and menus in the title bar keep their own clicks and drags. */
function isControl(target: EventTarget) {
  return target instanceof Element && target.closest("button, [role=tab]") !== null
}

/** The edges named by `kind` follow the pointer; the opposite edges stay put. */
function applyGesture(kind: GestureKind, start: WindowRect, dx: number, dy: number, bounds: Bounds): WindowRect {
  if (kind === "move") return { ...start, x: start.x + dx, y: start.y + dy }
  let { x, y, width, height } = start
  if (kind.includes("e")) width = Math.min(bounds.width - start.x, start.width + dx)
  if (kind.includes("s")) height = Math.min(bounds.height - start.y, start.height + dy)
  if (kind.includes("w")) {
    width = Math.min(start.x + start.width, Math.max(MIN_WIDTH, start.width - dx))
    x = start.x + start.width - width
  }
  if (kind.includes("n")) {
    height = Math.min(start.y + start.height, Math.max(MIN_HEIGHT, start.height - dy))
    y = start.y + start.height - height
  }
  return { x, y, width, height }
}

/**
 * Geometry for this app's window: its rect for the current zoom, plus
 * pointer handlers to move it by the title bar and resize it by its edges.
 * Gestures update a local draft and save the final rect when they end.
 * With `fill` the window covers the page and cannot be moved or resized.
 */
export function useWindowGeometry({ fill = false }: { fill?: boolean } = {}) {
  const viewport = useViewport()
  const app = useAppId()
  const windowRect = useAppSession((session) => session.rect)
  const sessionZoom = useAppSession((session) => session.zoom)
  const { setRect, setZoom } = useAppActions()
  const windowZoom = fill ? "fullscreen" : sessionZoom
  const [draft, setDraft] = useState<WindowRect | null>(null)
  const draftRef = useRef<WindowRect | null>(null)
  const gesture = useRef<{ kind: GestureKind; x: number; y: number; start: WindowRect } | null>(null)

  const bounds = { width: viewport.width, height: Math.max(0, viewport.height - DOCK_SPACE) }
  const normalRect = clampRect(draft ?? windowRect ?? defaultRect(bounds, APP_IDS.indexOf(app)), bounds)

  const rect: WindowRect =
    windowZoom === "fullscreen"
      ? { x: 0, y: 0, width: viewport.width, height: viewport.height }
      : windowZoom === "zoomed"
        ? {
            x: ZOOM_MARGIN,
            y: ZOOM_MARGIN,
            width: bounds.width - ZOOM_MARGIN * 2,
            height: bounds.height - ZOOM_MARGIN * 2,
          }
        : normalRect

  const updateDraft = (next: WindowRect | null) => {
    draftRef.current = next
    setDraft(next)
  }

  const begin = (kind: GestureKind, event: PointerEvent<HTMLElement>) => {
    if (windowZoom !== "normal" || event.button !== 0) return
    // Buttons in the title bar (the window controls) keep their own clicks.
    if (kind === "move" && isControl(event.target)) return
    event.currentTarget.setPointerCapture(event.pointerId)
    gesture.current = { kind, x: event.clientX, y: event.clientY, start: normalRect }
    updateDraft(normalRect)
  }

  const move = (event: PointerEvent<HTMLElement>) => {
    const active = gesture.current
    if (!active) return
    updateDraft(applyGesture(active.kind, active.start, event.clientX - active.x, event.clientY - active.y, bounds))
  }

  const end = () => {
    if (!gesture.current) return
    gesture.current = null
    if (draftRef.current) setRect(clampRect(draftRef.current, bounds))
    updateDraft(null)
  }

  const toggleZoom = (event: MouseEvent<HTMLElement>) => {
    if (isControl(event.target) || windowZoom === "fullscreen") return
    setZoom(windowZoom === "zoomed" ? "normal" : "zoomed")
  }

  const handlers = (kind: GestureKind) => ({
    onPointerDown: (event: PointerEvent<HTMLElement>) => begin(kind, event),
    onPointerMove: move,
    onPointerUp: end,
    onPointerCancel: end,
  })

  return {
    rect,
    zoom: windowZoom,
    gesturing: draft !== null,
    resizable: windowZoom === "normal",
    titleBarProps: { ...handlers("move"), onDoubleClick: toggleZoom },
    resizeHandleProps: (edge: ResizeEdge) => handlers(edge),
  }
}
