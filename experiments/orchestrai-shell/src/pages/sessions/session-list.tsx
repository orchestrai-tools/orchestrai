import { useState } from "react"
import { ChevronDownIcon, MoreHorizontalIcon } from "lucide-react"
import { useShallow } from "zustand/react/shallow"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { findAgent, type AgentId } from "@/data/agents"
import type { AgentSession } from "@/data/sessions"
import { useAppActions } from "@/lib/app-instance"
import type { ProjectId } from "@/lib/projects"
import { cn } from "@/lib/utils"
import { canContinue, canFork, isLive, isOutside, ORIGIN_LABEL } from "@/pages/sessions/session-meta"
import { SessionStatusMark } from "@/pages/sessions/session-status"
import { useSessionsStore } from "@/pages/sessions/sessions-store"

type OriginFilter = "all" | "here" | "outside"

interface RowActions {
  onOpen: (session: AgentSession) => void
  onContinue: (session: AgentSession) => void
  onFork: (session: AgentSession) => void
}

const COLUMNS = "grid grid-cols-[minmax(15rem,1fr)_9rem_minmax(8rem,10rem)_3.5rem_5rem_5.5rem_9.5rem] items-center gap-3"

function AgentFilter({ present, value, onChange }: { present: AgentId[]; value: AgentId[]; onChange: (next: AgentId[]) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="xs" className="text-muted-foreground">
          {value.length === 0 ? "All agents" : value.map((id) => findAgent(id).name).join(", ")}
          <ChevronDownIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-48">
        {present.map((id) => (
          <DropdownMenuCheckboxItem
            key={id}
            checked={value.includes(id)}
            onSelect={(event) => event.preventDefault()}
            onCheckedChange={(checked) => onChange(checked ? [...value, id] : value.filter((entry) => entry !== id))}
          >
            {findAgent(id).name}
          </DropdownMenuCheckboxItem>
        ))}
        {value.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onChange([])}>Show all agents</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function RowMenu({ session, onOpen }: { session: AgentSession; onOpen: () => void }) {
  const pinned = useSessionsStore((state) => state.pinned[session.project].includes(session.id))
  const { pin, unpin, hide, stop } = useSessionsStore(
    useShallow((state) => ({ pin: state.pin, unpin: state.unpin, hide: state.hide, stop: state.stop }))
  )
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`More for ${session.title}`}
          className="opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
        >
          <MoreHorizontalIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onSelect={onOpen}>{session.task ? `Open task ${session.task}` : "Open in the grid"}</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => (pinned ? unpin(session.project, [session.id]) : pin(session.project, session.id))}>
          {pinned ? "Remove from the grid" : "Add to the grid"}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void navigator.clipboard?.writeText(session.id)}>Copy session id</DropdownMenuItem>
        {session.status === "running" && <DropdownMenuItem onSelect={() => stop(session.id)}>Stop the turn</DropdownMenuItem>}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => hide(session.id)}>Hide from this list</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function Row({ session, selected, onOpen, onContinue, onFork }: RowActions & { session: AgentSession; selected: boolean }) {
  const agent = findAgent(session.agent)
  const { select } = useAppActions()
  const open = () => onOpen(session)
  const task = session.task

  return (
    <div
      role="row"
      onClick={open}
      className={cn(COLUMNS, "group/row cursor-default border-b px-3 py-(--row-py) last:border-b-0 hover:bg-muted/60", selected && "bg-muted")}
    >
      <div role="cell" className="min-w-0">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            open()
          }}
          className="block w-full truncate text-left font-medium outline-none focus-visible:underline"
        >
          {session.title}
        </button>
        <span className="block truncate text-xs text-muted-foreground" title={session.source}>
          {ORIGIN_LABEL[session.origin]} · {session.source}
        </span>
      </div>
      <div role="cell" className="min-w-0 text-xs">
        <span className="block truncate">{agent.name}</span>
        <span className="block truncate text-muted-foreground">{[session.model, session.account].filter(Boolean).join(" · ")}</span>
      </div>
      <div role="cell" className="min-w-0">
        <SessionStatusMark status={session.status} />
        {session.activity && (
          <span className="block truncate text-xs text-muted-foreground" title={session.activity}>
            {session.activity}
          </span>
        )}
      </div>
      <div
        role="cell"
        className="text-right text-xs tabular-nums"
        title={session.turns === null ? "This agent's session store keeps no turn count" : undefined}
      >
        {session.turns ?? "—"}
      </div>
      <div role="cell" className="text-xs">
        {task ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              select("task", task, "task")
            }}
            className="font-mono hover:underline"
          >
            {task}
          </button>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </div>
      <div role="cell" className="text-right text-xs text-muted-foreground">
        {session.updated}
      </div>
      <div role="cell" className="flex items-center justify-end gap-1" onClick={(event) => event.stopPropagation()}>
        <div className="flex gap-1 opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100">
          {canContinue(session) && (
            <Button size="xs" variant="outline" onClick={() => onContinue(session)}>
              Continue
            </Button>
          )}
          {canFork(session) && (
            <Button size="xs" variant="outline" onClick={() => onFork(session)}>
              Fork
            </Button>
          )}
        </div>
        <RowMenu session={session} onOpen={open} />
      </div>
    </div>
  )
}

function Group({ label, sessions, selectedId, ...actions }: RowActions & { label: string; sessions: AgentSession[]; selectedId?: string }) {
  if (sessions.length === 0) return null
  return (
    <div role="rowgroup">
      <div role="row" className="flex items-baseline gap-2 border-b px-3 pt-3 pb-1.5 text-xs font-medium">
        {label}
        <span className="font-normal text-muted-foreground tabular-nums">{sessions.length}</span>
      </div>
      {sessions.map((session) => (
        <Row key={session.id} session={session} selected={session.id === selectedId} {...actions} />
      ))}
    </div>
  )
}

/** Every session in the project, live ones first, each group newest first. */
export function SessionList({
  project,
  sessions,
  selectedId,
  notice,
  ...actions
}: RowActions & { project: ProjectId; sessions: AgentSession[]; selectedId?: string; notice?: string }) {
  const [origin, setOrigin] = useState<OriginFilter>("all")
  const [agents, setAgents] = useState<AgentId[]>([])
  const hiddenCount = useSessionsStore(
    (state) => state.hidden.filter((id) => state.sessions.find((session) => session.id === id)?.project === project).length
  )
  const unhideAll = useSessionsStore((state) => state.unhideAll)

  const shown = sessions.filter(
    (session) =>
      (origin === "all" || (origin === "outside") === isOutside(session.origin)) &&
      (agents.length === 0 || agents.includes(session.agent))
  )
  const present = [...new Set(sessions.map((session) => session.agent))]

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup type="single" size="sm" spacing={1} value={origin} onValueChange={(next) => next && setOrigin(next as OriginFilter)} aria-label="Where the session started">
          <ToggleGroupItem value="all" className="h-6 px-2 text-xs">All</ToggleGroupItem>
          <ToggleGroupItem value="here" className="h-6 px-2 text-xs">Started here</ToggleGroupItem>
          <ToggleGroupItem value="outside" className="h-6 px-2 text-xs">Outside the app</ToggleGroupItem>
        </ToggleGroup>
        <AgentFilter present={present} value={agents} onChange={setAgents} />
        {hiddenCount > 0 && (
          <Button variant="ghost" size="xs" className="text-muted-foreground" onClick={() => unhideAll(project)}>
            Show hidden
          </Button>
        )}
        {notice && (
          <p role="status" className="ml-auto truncate text-xs text-muted-foreground">
            {notice}
          </p>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <div role="table" aria-label="Sessions" className="min-w-[56rem] rounded-md border bg-background text-sm">
          <div role="row" className={cn(COLUMNS, "border-b px-3 py-2 text-xs text-muted-foreground")}>
            <span role="columnheader">Session</span>
            <span role="columnheader">Agent</span>
            <span role="columnheader">Status</span>
            <span role="columnheader" className="text-right">Turns</span>
            <span role="columnheader">Task</span>
            <span role="columnheader" className="text-right">Last activity</span>
            <span role="columnheader" className="sr-only">Actions</span>
          </div>
          <Group label="Live" sessions={shown.filter((session) => isLive(session.status))} selectedId={selectedId} {...actions} />
          <Group label="Idle and finished" sessions={shown.filter((session) => !isLive(session.status))} selectedId={selectedId} {...actions} />
          {shown.length === 0 && <p className="px-3 py-8 text-center text-xs text-muted-foreground">No sessions match these filters.</p>}
        </div>
      </div>
    </>
  )
}
