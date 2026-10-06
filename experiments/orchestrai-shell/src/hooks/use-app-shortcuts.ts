import { useEffect, useLayoutEffect, useRef } from "react"

import { useActionContext } from "@/hooks/use-action-context"
import { useAppSession, useIsFrontApp } from "@/lib/app-instance"
import { useDialog } from "@/lib/dialog-store"
import type { PageId } from "@/lib/window-store"
import { PAGES } from "@/pages"

/** `G` then a letter jumps to a page, as the palette shows next to each page. */
const GO_TO: Record<string, PageId> = Object.fromEntries(
  PAGES.flatMap((page) => (page.shortcut?.startsWith("G ") ? [[page.shortcut.slice(2).toLowerCase(), page.id]] : []))
)

function isTyping(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
}

/**
 * Window-level shortcuts, answered only by the focused window. Warpforge's
 * existing bindings keep their meaning (⌘\ sidebar, ⌘N new task, ⌘P quick
 * open, now the palette). Focus mode is one key in and the same key (or
 * Escape) out (DESIGN-PHILOSOPHY §1a).
 */
export function useAppShortcuts() {
  const front = useIsFrontApp()
  const focus = useAppSession((session) => session.focus)
  const dialog = useDialog()
  const ctx = useActionContext()
  const latest = useRef({ ctx, dialog, focus })
  useLayoutEffect(() => {
    latest.current = { ctx, dialog, focus }
  })

  useEffect(() => {
    if (!front) return
    let goPending = 0
    const onKeyDown = (event: KeyboardEvent) => {
      const { ctx, dialog, focus } = latest.current
      const meta = event.metaKey || event.ctrlKey
      const plain = !meta && !event.altKey && !isTyping(event.target) && !dialog.current
      if (plain && goPending > Date.now() && GO_TO[event.key.toLowerCase()]) {
        event.preventDefault()
        goPending = 0
        ctx.setPage(GO_TO[event.key.toLowerCase()])
        return
      }
      goPending = plain && event.key.toLowerCase() === "g" ? Date.now() + 1200 : 0
      if (meta && !event.shiftKey && /^[kp]$/.test(event.key.toLowerCase())) {
        event.preventDefault()
        dialog.toggle("palette")
      } else if (event.metaKey && event.key.toLowerCase() === "n") {
        event.preventDefault()
        ctx.openDialog("new-task")
      } else if (event.metaKey && event.key.toLowerCase() === "o") {
        event.preventDefault()
        ctx.openDialog("open-project")
      } else if (event.metaKey && event.code === "Backslash") {
        event.preventDefault()
        if (event.shiftKey) ctx.toggleFocus()
        else ctx.toggleSidebar()
      } else if (event.ctrlKey && event.code === "Backquote") {
        event.preventDefault()
        ctx.toggleTerminal()
      } else if (event.metaKey && event.altKey && event.code === "KeyI") {
        event.preventDefault()
        ctx.toggleInspector()
      } else if (event.metaKey && event.key === ",") {
        event.preventDefault()
        ctx.setPage("settings")
      } else if (event.key === "Escape" && focus && !dialog.current) {
        ctx.toggleFocus()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [front])
}
