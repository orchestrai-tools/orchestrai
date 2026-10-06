import { ChevronDownIcon, ChevronUpIcon, PlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { TERMINALS, type CommandBlock, type TerminalSession, type TerminalStatus } from "@/data/terminals"
import { useAppActions, useAppSession } from "@/lib/app-instance"
import { cn } from "@/lib/utils"

const TONE: Record<TerminalStatus, string> = {
  starting: "bg-amber-500",
  running: "bg-emerald-500",
  exited: "bg-muted-foreground/40",
}

function useTerminals() {
  const project = useAppSession((session) => session.project)
  const terminal = useAppSession((session) => session.terminal)
  const sessions = TERMINALS[project]
  const active = sessions.find((entry) => entry.id === terminal.active) ?? sessions[0]
  return { sessions, active, open: terminal.open }
}

function Block({ block, live }: { block: CommandBlock; live: boolean }) {
  return (
    <div className="border-b border-border/60 py-2 last:border-b-0">
      <div className="flex items-baseline gap-2">
        <span className="text-muted-foreground">❯</span>
        <span className="font-medium">{block.command}</span>
        <span className="ml-auto flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground">
          <span>{block.cwd}</span>
          {block.exit !== undefined && (
            <span className={cn(block.exit === 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
              exit {block.exit}
            </span>
          )}
          {block.duration && <span>{block.duration}</span>}
        </span>
      </div>
      {block.output.map((line, index) => (
        <div key={index} className="whitespace-pre-wrap text-muted-foreground">
          {line}
        </div>
      ))}
      {live && <span aria-hidden className="mt-1 inline-block h-3.5 w-1.5 animate-pulse bg-foreground/70" />}
    </div>
  )
}

/** The terminal itself, shown above the strip while the drawer is open. */
export function TerminalPanel() {
  const { active } = useTerminals()
  if (!active) return null
  return (
    <div className="flex h-full flex-col bg-background font-mono text-xs">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-1">
        {active.blocks.length === 0 ? (
          <p className="py-2 text-muted-foreground">Starting zsh in {active.title}…</p>
        ) : (
          active.blocks.map((block, index) => (
            <Block key={index} block={block} live={active.status === "running" && index === active.blocks.length - 1} />
          ))
        )}
      </div>
      <label className="flex h-8 shrink-0 items-center gap-2 border-t px-4">
        <span className="text-muted-foreground">❯</span>
        <input
          aria-label={`Type into ${active.title}`}
          placeholder={active.status === "running" ? "Writing into a running command asks first" : "Type a command"}
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:font-sans placeholder:text-muted-foreground"
        />
      </label>
    </div>
  )
}

function StripTab({ session, selected }: { session: TerminalSession; selected: boolean }) {
  const { selectTerminal, toggleTerminal } = useAppActions()
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={() => (selected ? toggleTerminal() : selectTerminal(session.id))}
      className={cn(
        "flex h-full max-w-48 items-center gap-1.5 border-r px-3 text-[11px] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        selected ? "bg-background text-foreground" : "text-muted-foreground hover:bg-foreground/5"
      )}
    >
      <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", TONE[session.status])} />
      <span className="truncate">{session.title}</span>
      <span className="text-muted-foreground">
        {session.status === "exited" ? `exit ${session.exit ?? 0}` : session.status}
      </span>
    </button>
  )
}

/**
 * Sinew's drawer strip: about 28 px, one tab per terminal with its status,
 * always visible at the bottom so a running server is a mark at the edge.
 */
export function TerminalStrip() {
  const { sessions, active, open } = useTerminals()
  const { toggleTerminal } = useAppActions()
  const running = sessions.filter((session) => session.status === "running").length

  return (
    <div role="tablist" aria-label="Terminals" className="flex h-7 shrink-0 items-stretch border-t bg-muted/50">
      {sessions.map((session) => (
        <StripTab key={session.id} session={session} selected={open && session.id === active?.id} />
      ))}
      <Button variant="ghost" size="icon-xs" aria-label="New terminal" className="m-auto mx-1 rounded-sm">
        <PlusIcon />
      </Button>
      <span className="ml-auto flex items-center px-2 text-[11px] text-muted-foreground">
        {running ? `${running} running` : "Nothing running"}
      </span>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={open ? "Close terminal drawer" : "Open terminal drawer"}
        title="Toggle terminal drawer (⌃`)"
        onClick={() => toggleTerminal()}
        className="m-auto mr-1 rounded-sm"
      >
        {open ? <ChevronDownIcon /> : <ChevronUpIcon />}
      </Button>
    </div>
  )
}
