import { useEffect, useRef } from "react"

import { Checkbox } from "@/components/ui/checkbox"
import { findAgent } from "@/data/agents"
import type { AgentSession, SessionLine, ToolState } from "@/data/sessions"
import { useAppActions } from "@/lib/app-instance"
import { cn } from "@/lib/utils"
import { InlineText } from "@/pages/channel/inline-text"
import { isOutside, ORIGIN_LABEL, usageText } from "@/pages/sessions/session-meta"
import { SessionStatusDot, SessionStatusMark } from "@/pages/sessions/session-status"

const TOOL_STATE: Record<Exclude<ToolState, "waiting">, string> = { ok: "done", failed: "failed", running: "running" }

function Line({ line, size, onInbox }: { line: SessionLine; size: string; onInbox: () => void }) {
  switch (line.kind) {
    case "user":
      return (
        <li className={cn(size, "font-medium")}>
          <InlineText text={line.text} />
        </li>
      )
    case "agent":
      return (
        <li className={cn(size, "leading-relaxed")}>
          <InlineText text={line.text} />
        </li>
      )
    case "thought":
      return <li className="text-xs text-muted-foreground italic">{line.text}</li>
    case "note":
      return <li className="text-xs text-muted-foreground">{line.text}</li>
    case "tool":
      return (
        <li
          className={cn(
            "flex items-center gap-2 rounded-sm px-1.5 py-0.5 font-mono text-xs text-muted-foreground",
            line.state === "waiting" && "bg-amber-500/10 text-foreground",
            line.state === "failed" && "bg-red-500/10 text-foreground"
          )}
        >
          <span className="min-w-0 flex-1 truncate" title={line.text}>
            {line.text}
          </span>
          {line.state === "waiting" ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                onInbox()
              }}
              className="shrink-0 font-sans underline-offset-2 hover:underline"
            >
              Answer in Inbox
            </button>
          ) : (
            <span className={cn("shrink-0 font-sans", line.state === "running" && "animate-pulse")}>{TOOL_STATE[line.state]}</span>
          )}
        </li>
      )
  }
}

/**
 * One live session in the grid: a mini transcript and its reported status.
 * No controls of its own; the one toolbar above the grid acts on the selection.
 */
export function SessionPanel({
  session,
  selected,
  maximized,
  onSelect,
}: {
  session: AgentSession
  selected: boolean
  maximized: boolean
  onSelect: (additive: boolean) => void
}) {
  const agent = findAgent(session.agent)
  const { setPage } = useAppActions()
  const body = useRef<HTMLOListElement>(null)
  const size = maximized ? "text-sm" : "text-xs"
  const usage = usageText(session)

  useEffect(() => {
    const element = body.current
    if (element) element.scrollTop = element.scrollHeight
  }, [session.transcript.length])

  return (
    <section
      aria-label={session.title}
      tabIndex={0}
      onClick={(event) => onSelect(event.metaKey || event.ctrlKey || event.shiftKey)}
      className={cn(
        "group/panel flex min-h-0 min-w-0 flex-col rounded-md border bg-background outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected ? "border-foreground/40 ring-1 ring-foreground/15" : "hover:border-foreground/25"
      )}
    >
      <header className="flex items-center gap-2 border-b px-3 py-1.5">
        <Checkbox
          checked={selected}
          onClick={(event) => event.stopPropagation()}
          onCheckedChange={() => onSelect(true)}
          aria-label={`Select ${session.title}`}
          className={cn(!selected && "opacity-0 group-hover/panel:opacity-100 focus-visible:opacity-100")}
        />
        <SessionStatusDot status={session.status} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium" title={session.title}>
          {session.title}
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {agent.name} · {session.updated}
        </span>
      </header>
      <ol ref={body} className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-3 py-2">
        {session.transcript.map((line, index) => (
          <Line key={index} line={line} size={size} onInbox={() => setPage("inbox")} />
        ))}
        {session.status === "running" && (
          <li className="flex items-center gap-2 text-xs text-muted-foreground">
            <span aria-hidden className="inline-block h-3 w-1.5 animate-pulse bg-foreground/60" />
            {session.activity}
          </li>
        )}
      </ol>
      <footer className="flex min-w-0 items-center gap-3 px-3 pb-1.5 text-xs text-muted-foreground">
        <SessionStatusMark status={session.status} />
        {session.task && <span className="font-mono">{session.task}</span>}
        {isOutside(session.origin) && <span className="truncate">{ORIGIN_LABEL[session.origin]}</span>}
        {usage && <span className="ml-auto shrink-0 tabular-nums">{usage}</span>}
      </footer>
    </section>
  )
}
