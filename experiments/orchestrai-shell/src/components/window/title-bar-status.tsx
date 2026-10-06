import { SearchIcon } from "lucide-react"

import { Kbd } from "@/components/ui/kbd"
import { INBOX } from "@/data/inbox"
import { useAppActions, useAppSession } from "@/lib/app-instance"
import { useDialog } from "@/lib/dialog-store"

/**
 * The right end of the title bar holds the two things that matter across
 * every project: search (⌘K) and a count of what needs you. Status stays at
 * the edge until it matters (calm technology).
 */
export function TitleBarStatus() {
  const dialog = useDialog()
  const project = useAppSession((session) => session.project)
  const { select, selectProject } = useAppActions()
  const waiting = INBOX.length
  const openInboxAll = () => {
    selectProject(project)
    select("inbox", "all", "inbox")
  }

  return (
    <div className="ml-auto flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => dialog.open("palette")}
        className="flex h-7 w-56 items-center gap-2 rounded-md border bg-background/70 px-2 text-xs text-muted-foreground hover:bg-background max-[900px]:w-auto"
      >
        <SearchIcon className="size-3.5" />
        <span className="max-[900px]:hidden">Search or run a command</span>
        <Kbd className="ml-auto">⌘K</Kbd>
      </button>
      {waiting > 0 && (
        <button
          type="button"
          onClick={openInboxAll}
          title={`${waiting} waiting for you across all projects`}
          className="flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
        >
          <span aria-hidden className="size-1.5 rounded-full bg-amber-500" />
          <span className="tabular-nums">{waiting}</span>
          <span className="max-[1100px]:hidden">need you</span>
        </button>
      )}
    </div>
  )
}
