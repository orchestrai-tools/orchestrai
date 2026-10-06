import { useEffect, useState } from "react"
import { useShallow } from "zustand/react/shallow"

import { PageToolbar } from "@/components/common/page-toolbar"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { AgentSession } from "@/data/sessions"
import { useAppActions, useAppSession } from "@/lib/app-instance"
import type { ProjectId } from "@/lib/projects"
import { selectSelection } from "@/lib/window-store"
import { ContinueDialog } from "@/pages/sessions/continue-dialog"
import { SessionGrid } from "@/pages/sessions/session-grid"
import { SessionList } from "@/pages/sessions/session-list"
import { isLive, isOutside } from "@/pages/sessions/session-meta"
import { useSessionsStore, type GridLayout } from "@/pages/sessions/sessions-store"
import { UsageLine } from "@/pages/sessions/usage-line"

type View = "list" | "grid"

const LAYOUTS: readonly { id: GridLayout; label: string; name: string }[] = [
  { id: "1", label: "1", name: "One panel" },
  { id: "2", label: "2", name: "Two columns" },
  { id: "4", label: "2×2", name: "Two by two" },
]

function SessionsRoom({ project }: { project: ProjectId }) {
  const selectedId = useAppSession((session) => selectSelection(session, "session"))
  const { select } = useAppActions()
  const sessions = useSessionsStore(
    useShallow((state) => state.sessions.filter((session) => session.project === project && !state.hidden.includes(session.id)))
  )
  const layout = useSessionsStore((state) => state.layout)
  const { setLayout, tick, pin, pinAfter, fork, continueSession } = useSessionsStore(
    useShallow((state) => ({
      setLayout: state.setLayout,
      tick: state.tick,
      pin: state.pin,
      pinAfter: state.pinAfter,
      fork: state.fork,
      continueSession: state.continueSession,
    }))
  )
  const [view, setView] = useState<View>("list")
  const [maximized, setMaximized] = useState<string | null>(null)
  const [continuing, setContinuing] = useState<AgentSession | null>(null)
  const [notice, setNotice] = useState<string>()

  useEffect(() => {
    const timer = window.setInterval(() => tick(project), 3500)
    return () => window.clearInterval(timer)
  }, [project, tick])

  const open = (session: AgentSession) => {
    select("session", session.id)
    if (session.task) {
      select("task", session.task, "task")
      return
    }
    pin(project, session.id)
    setMaximized(session.id)
    setView("grid")
  }
  const forkSession = (session: AgentSession) => {
    const id = fork(session.id)
    if (!id) return
    select("session", id)
    if (view === "grid") pinAfter(project, id, session.id)
    setNotice(`Forked “${session.title}” as ${id}. Its later turns leave the original as it was.`)
  }
  const confirmContinue = (session: AgentSession) => {
    continueSession(session.id)
    select("session", session.id)
    setNotice(`${session.title}: loaded with session/load and running here.`)
  }

  const live = sessions.filter((session) => isLive(session.status)).length
  const outside = sessions.filter((session) => isOutside(session.origin)).length

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-4">
      <PageToolbar title="Sessions" meta={`${sessions.length} sessions · ${live} live · ${outside} from outside the app`}>
        {view === "grid" && (
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            spacing={0}
            value={layout}
            onValueChange={(next) => {
              if (!next) return
              setLayout(next as GridLayout)
              setMaximized(null)
            }}
            aria-label="Layout"
          >
            {LAYOUTS.map((entry) => (
              <ToggleGroupItem key={entry.id} value={entry.id} aria-label={entry.name} title={entry.name} className="px-2.5 text-xs">
                {entry.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}
        <ToggleGroup type="single" variant="outline" size="sm" spacing={0} value={view} onValueChange={(next) => next && setView(next as View)} aria-label="View">
          <ToggleGroupItem value="list" className="px-3 text-xs">List</ToggleGroupItem>
          <ToggleGroupItem value="grid" className="px-3 text-xs">Grid</ToggleGroupItem>
        </ToggleGroup>
      </PageToolbar>

      {view === "list" ? (
        <SessionList
          project={project}
          sessions={sessions}
          selectedId={selectedId}
          notice={notice}
          onOpen={open}
          onContinue={setContinuing}
          onFork={forkSession}
        />
      ) : (
        <SessionGrid
          project={project}
          sessions={sessions}
          notice={notice}
          maximized={maximized}
          onMaximize={setMaximized}
          onOpen={open}
          onContinue={setContinuing}
          onFork={forkSession}
        />
      )}

      <UsageLine />
      <ContinueDialog session={continuing} onOpenChange={(open) => !open && setContinuing(null)} onConfirm={confirmContinue} />
    </div>
  )
}

/**
 * KLIDE's Mission Control for this project: every ACP session from every
 * agent, including ones started outside the app. Continue and fork appear
 * only where the agent advertises them; the grid is Daintree's panel wall.
 */
export function SessionsPage() {
  const project = useAppSession((session) => session.project)
  return <SessionsRoom key={project} project={project} />
}
