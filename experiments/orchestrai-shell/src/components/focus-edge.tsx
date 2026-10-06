import { INBOX, inboxFor } from "@/data/inbox"
import { useAppActions, useAppSession } from "@/lib/app-instance"

/**
 * In focus mode, anything that genuinely needs the person still gets through
 * as a quiet mark at the edge, not a dialog (DESIGN-PHILOSOPHY §1a rule 4).
 */
export function FocusEdge() {
  const project = useAppSession((session) => session.project)
  const home = useAppSession((session) => session.home)
  const { toggleFocus, setPage, selectProject, select } = useAppActions()
  const waiting = home ? INBOX.length : inboxFor(project).length
  const openWaiting = () => {
    toggleFocus(false)
    if (!home) return setPage("inbox")
    selectProject(project)
    select("inbox", "all", "inbox")
  }

  return (
    <div className="pointer-events-none absolute right-3 bottom-3 z-20 flex items-center gap-2 text-[11px] text-muted-foreground">
      {waiting > 0 && (
        <button
          type="button"
          onClick={openWaiting}
          className="pointer-events-auto flex items-center gap-1.5 rounded-full border bg-background/90 px-2 py-0.5 shadow-xs hover:text-foreground"
        >
          <span aria-hidden className="size-1.5 rounded-full bg-amber-500" />
          {waiting} need you
        </button>
      )}
      <button
        type="button"
        onClick={() => toggleFocus(false)}
        className="pointer-events-auto rounded-full border bg-background/90 px-2 py-0.5 shadow-xs hover:text-foreground"
      >
        Focus · esc
      </button>
    </div>
  )
}
