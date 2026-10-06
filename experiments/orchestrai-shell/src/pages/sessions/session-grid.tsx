import { useState, type FormEvent, type KeyboardEvent } from "react"
import { useShallow } from "zustand/react/shallow"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Kbd } from "@/components/ui/kbd"
import { findAgent } from "@/data/agents"
import type { AgentSession } from "@/data/sessions"
import type { ProjectId } from "@/lib/projects"
import { cn } from "@/lib/utils"
import { canContinue, canFork } from "@/pages/sessions/session-meta"
import { SessionPanel } from "@/pages/sessions/session-panel"
import { SessionStatusDot } from "@/pages/sessions/session-status"
import { useSessionsStore, type BroadcastResult, type GridLayout } from "@/pages/sessions/sessions-store"

const GRID: Record<GridLayout, string> = {
  "1": "grid-cols-1 grid-rows-1",
  "2": "grid-cols-2 grid-rows-1",
  "4": "grid-cols-2 grid-rows-2",
}

interface Actions {
  onOpen: (session: AgentSession) => void
  onContinue: (session: AgentSession) => void
  onFork: (session: AgentSession) => void
}

function EmptyPanel({ candidates, onPick }: { candidates: AgentSession[]; onPick: (id: string) => void }) {
  return (
    <div className="dot-grid flex min-h-0 flex-col items-center justify-center gap-2 rounded-md border border-dashed text-xs text-muted-foreground">
      <span>Empty panel</span>
      {candidates.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="xs">Show a session</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-80">
            {candidates.map((session) => (
              <DropdownMenuItem key={session.id} onSelect={() => onPick(session.id)}>
                <SessionStatusDot status={session.status} />
                <span className="min-w-0 flex-1 truncate">{session.title}</span>
                <span className="text-xs text-muted-foreground">{findAgent(session.agent).name}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <span>Every session is already on the grid.</span>
      )}
    </div>
  )
}

function describe(result: BroadcastResult): string {
  const parts: string[] = []
  if (result.sent) parts.push(`Sent to ${result.sent}`)
  if (result.queued) parts.push(`${result.queued} queued behind a running turn`)
  if (result.skipped.length) parts.push(`skipped ${result.skipped.join(", ")}, which cannot load a session`)
  return parts.join(" · ")
}

/** Daintree's fleet broadcast: one prompt to every selected panel, from a single input bar. */
function BroadcastBar({ targets, onSend }: { targets: AgentSession[]; onSend: (text: string) => BroadcastResult }) {
  const [text, setText] = useState("")
  const [result, setResult] = useState<string>()
  const count = targets.length

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!text.trim() || count === 0) return
    setResult(describe(onSend(text.trim())))
    setText("")
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <Input
          value={text}
          onChange={(event) => {
            setText(event.target.value)
            setResult(undefined)
          }}
          disabled={count === 0}
          aria-label="Message the selected sessions"
          placeholder={count === 0 ? "Select panels to message them together" : count === 1 ? "Message the selected session" : `Message ${count} selected sessions at once`}
        />
        <Button type="submit" size="sm" disabled={!text.trim() || count === 0}>
          {count > 1 ? `Send to ${count}` : "Send"}
        </Button>
      </div>
      <p role="status" className="truncate text-xs text-muted-foreground">
        {result ??
          (count > 0
            ? `To ${targets.map((session) => `${findAgent(session.agent).name}${session.task ? ` · ${session.task}` : ""}`).join(", ")}`
            : "Each agent keeps its own prompt, slash commands, and history. This only sends the same message to several at once.")}
      </p>
    </form>
  )
}

/**
 * TradingView's multi-chart layout applied to agents (Daintree): preset
 * layouts, one toolbar acting on the selected panels, maximize and return.
 */
export function SessionGrid({
  project,
  sessions,
  notice,
  maximized,
  onMaximize,
  onOpen,
  onContinue,
  onFork,
}: Actions & {
  project: ProjectId
  sessions: AgentSession[]
  notice?: string
  maximized: string | null
  onMaximize: (id: string | null) => void
}) {
  const pinned = useSessionsStore((state) => state.pinned[project])
  const layout = useSessionsStore((state) => state.layout)
  const { pin, unpin, broadcast } = useSessionsStore(useShallow((state) => ({ pin: state.pin, unpin: state.unpin, broadcast: state.broadcast })))
  const [selected, setSelected] = useState<string[]>(() => (maximized ? [maximized] : pinned.slice(0, 1)))

  const byId = new Map(sessions.map((session) => [session.id, session]))
  const slots = maximized ? [byId.get(maximized)] : Array.from({ length: Number(layout) }, (_, index) => byId.get(pinned[index] ?? ""))
  const visible = slots.filter((session): session is AgentSession => session !== undefined)
  const chosen = visible.filter((session) => selected.includes(session.id))
  const single = chosen.length === 1 ? chosen[0] : undefined
  const candidates = sessions.filter((session) => !pinned.includes(session.id))

  const choose = (id: string, additive: boolean) =>
    setSelected((current) => (additive ? (current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]) : [id]))
  const toggleMaximize = () => {
    if (maximized) onMaximize(null)
    else if (single) onMaximize(single.id)
  }
  const remove = () => {
    unpin(project, chosen.map((session) => session.id))
    if (maximized && chosen.some((session) => session.id === maximized)) onMaximize(null)
    setSelected([])
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" && event.altKey) {
      event.preventDefault()
      toggleMaximize()
    } else if (event.key === "Escape" && maximized) {
      onMaximize(null)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2" onKeyDown={onKeyDown}>
      <div role="toolbar" aria-label="Selected panels" className="flex min-h-7 flex-wrap items-center gap-1">
        <span className="mr-2 max-w-[40%] min-w-0 truncate text-xs text-muted-foreground">
          {single
            ? `${findAgent(single.agent).name} · ${single.title}`
            : chosen.length > 1
              ? `${chosen.length} panels selected`
              : "Select a panel. ⌘-click to add more."}
        </span>
        <Button size="xs" variant="ghost" disabled={!single} onClick={() => single && onOpen(single)}>
          Open
        </Button>
        <Button size="xs" variant="ghost" disabled={!single && !maximized} onClick={toggleMaximize}>
          {maximized ? "Back to grid" : "Maximize"}
          <Kbd>⌥↵</Kbd>
        </Button>
        <Button size="xs" variant="ghost" disabled={chosen.length === 0} onClick={remove}>
          Remove from grid
        </Button>
        {single && canContinue(single) && (
          <Button size="xs" variant="ghost" onClick={() => onContinue(single)}>
            Continue…
          </Button>
        )}
        {single && canFork(single) && (
          <Button size="xs" variant="ghost" onClick={() => onFork(single)}>
            Fork
          </Button>
        )}
        {notice && (
          <p role="status" className="ml-2 min-w-0 flex-1 truncate text-xs text-muted-foreground" title={notice}>
            {notice}
          </p>
        )}
        <Button
          size="xs"
          variant="ghost"
          className="ml-auto"
          disabled={visible.length === 0}
          onClick={() => setSelected(chosen.length === visible.length ? [] : visible.map((session) => session.id))}
        >
          {chosen.length === visible.length && visible.length > 0 ? "Clear selection" : "Select all"}
        </Button>
      </div>

      <div className={cn("grid min-h-0 flex-1 gap-2", GRID[maximized ? "1" : layout])}>
        {slots.map((session, index) =>
          session ? (
            <SessionPanel
              key={session.id}
              session={session}
              selected={selected.includes(session.id)}
              maximized={maximized !== null || layout === "1"}
              onSelect={(additive) => choose(session.id, additive)}
            />
          ) : (
            <EmptyPanel key={`empty-${index}`} candidates={candidates} onPick={(id) => pin(project, id)} />
          )
        )}
      </div>

      <BroadcastBar targets={chosen} onSend={(text) => broadcast(chosen.map((session) => session.id), text)} />
    </div>
  )
}
