import { useEffect } from "react"

import { useAppActions, useAppSession, useIsFrontApp } from "@/lib/app-instance"
import { PROJECT_IDS } from "@/lib/projects"

/**
 * Cycles Home and the projects from the keyboard in the focused window:
 * ⌃⇥ / ⌃⇧⇥ as in TradingView, ⌘⇧] / ⌘⇧[ as in macOS tabbed apps, and ⌃1–9
 * to jump, where ⌃1 is the pinned Home tab. A browser may keep some of these
 * for its own tabs; a desktop shell gets all.
 */
export function useProjectShortcuts() {
  const front = useIsFrontApp()
  const usesTabs = useAppSession((session) => session.projectNav === "tabs")
  const openProjects = useAppSession((session) => session.openProjects)
  const { cycleProject, selectProject, openHome } = useAppActions()

  useEffect(() => {
    if (!front) return
    const onKeyDown = (event: KeyboardEvent) => {
      const bracket = event.metaKey && event.shiftKey && /^Bracket(Left|Right)$/.test(event.code)
      if ((event.ctrlKey && event.key === "Tab") || bracket) {
        event.preventDefault()
        const back = bracket ? event.code === "BracketLeft" : event.shiftKey
        cycleProject(back ? -1 : 1)
        return
      }
      const digit = /^Digit([1-9])$/.exec(event.code)
      if (digit && event.ctrlKey && !event.metaKey && !event.altKey) {
        const position = Number(digit[1])
        if (position === 1) {
          event.preventDefault()
          openHome()
          return
        }
        const target = (usesTabs ? openProjects : PROJECT_IDS)[position - 2]
        if (!target) return
        event.preventDefault()
        selectProject(target)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [front, usesTabs, openProjects, cycleProject, selectProject, openHome])
}
