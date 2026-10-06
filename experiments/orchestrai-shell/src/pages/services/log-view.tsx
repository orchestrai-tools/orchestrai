import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { ArrowDownIcon, ChevronDownIcon, SearchIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Toggle } from "@/components/ui/toggle"
import type { LogLine } from "@/data/services"
import { tasksFor } from "@/data/tasks"
import { useAppActions, useAppSession } from "@/lib/app-instance"
import { useDialog } from "@/lib/dialog-store"
import { cn } from "@/lib/utils"

/** The daemon keeps 2,000 lines per service and 500 per port-forward; the view shows the newest 500. */
const DISPLAY_CAP = 500
const FOLLOW_THRESHOLD_PX = 40

function tone(text: string): string {
  if (text.startsWith("[service failed") || text.startsWith("✗")) return "text-red-600 dark:text-red-400"
  if (text.startsWith("[service running]") || text.startsWith("[service ready]") || text.startsWith("✓")) {
    return "text-emerald-700 dark:text-emerald-400"
  }
  if (text.startsWith("[service") || text.startsWith("[warn]")) return "text-muted-foreground"
  return ""
}

function LineText({ text }: { text: string }) {
  if (!text.startsWith("[err] ")) return <span className={tone(text)}>{text}</span>
  return (
    <span>
      <span className="select-none text-muted-foreground" title="Written to stderr">err </span>
      {text.slice(6)}
    </span>
  )
}

/** Hands a range of lines to a task, the way "Add to chat" attaches them with their seq range. */
function AttachMenu({ count }: { count: number }) {
  const project = useAppSession((session) => session.project)
  const { select } = useAppActions()
  const dialog = useDialog()
  const tasks = tasksFor(project).filter((task) => task.status !== "done")
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="xs" className="text-xs">
          Add to task
          <ChevronDownIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>Attach {count} lines with their seq range</DropdownMenuLabel>
        {tasks.map((task) => (
          <DropdownMenuItem key={task.id} onSelect={() => select("task", task.id, "task")} className="text-xs">
            <span className="truncate">{task.title}</span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => dialog.open("new-task")} className="text-xs">
          New task with these lines…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function LogView({ name, lines }: { name: string; lines: LogLine[] }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const following = useRef(true)
  const [behind, setBehind] = useState(false)
  const [filter, setFilter] = useState("")
  const [timestamps, setTimestamps] = useState(true)
  const [range, setRange] = useState<{ anchor: number; from: number; to: number } | null>(null)
  const [copied, setCopied] = useState(false)

  const needle = filter.trim().toLowerCase()
  const kept = lines.slice(-DISPLAY_CAP)
  const shown = needle ? kept.filter((line) => line.text.toLowerCase().includes(needle)) : kept
  const picked = range ? kept.filter((line) => line.seq >= range.from && line.seq <= range.to) : []

  useLayoutEffect(() => {
    const element = scrollRef.current
    if (element && following.current) element.scrollTop = element.scrollHeight
  }, [shown.length])

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(timer)
  }, [copied])

  const onScroll = () => {
    const element = scrollRef.current
    if (!element) return
    const atBottom = element.scrollHeight - element.clientHeight - element.scrollTop <= FOLLOW_THRESHOLD_PX
    following.current = atBottom
    setBehind(!atBottom)
  }

  const jump = () => {
    following.current = true
    setBehind(false)
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }

  const pick = (seq: number, extend: boolean) =>
    setRange((current) =>
      extend && current
        ? { anchor: current.anchor, from: Math.min(current.anchor, seq), to: Math.max(current.anchor, seq) }
        : { anchor: seq, from: seq, to: seq }
    )

  const copy = () => {
    void navigator.clipboard?.writeText(picked.map((line) => line.text).join("\n"))
    setCopied(true)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-2 px-4">
        <label className="flex h-7 w-56 items-center gap-1.5 rounded-md border bg-background px-2 text-xs focus-within:ring-2 focus-within:ring-ring/50">
          <SearchIcon className="size-3.5 text-muted-foreground" />
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter lines"
            aria-label={`Filter ${name} logs`}
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
          />
        </label>
        <Toggle size="sm" pressed={timestamps} onPressedChange={setTimestamps} className="h-7 px-2 text-xs" aria-label="Show timestamps">
          Time
        </Toggle>
        <span className="text-xs text-muted-foreground tabular-nums" title="The daemon keeps the last 2,000 lines per service and 500 per port-forward.">
          {needle ? `${shown.length} of ${kept.length} lines` : `${kept.length} lines`}
        </span>
        {range && (
          <span className="ml-auto flex items-center gap-1">
            <span className="text-xs text-muted-foreground tabular-nums">
              {range.from === range.to ? `Line ${range.from}` : `Lines ${range.from}–${range.to}`}
            </span>
            <Button variant="ghost" size="xs" className="text-xs" onClick={copy}>
              {copied ? "Copied" : "Copy"}
            </Button>
            <AttachMenu count={picked.length} />
            <Button variant="ghost" size="icon-xs" aria-label="Clear selection" onClick={() => setRange(null)}>
              <XIcon />
            </Button>
          </span>
        )}
      </div>

      <div className="relative min-h-0 flex-1">
        <div ref={scrollRef} onScroll={onScroll} className="h-full overflow-y-auto px-4 pb-3 font-mono text-xs leading-relaxed">
          {shown.length === 0 ? (
            <p className="py-2 font-sans text-muted-foreground">
              {needle ? `No line contains “${filter}”.` : `No logs yet. They appear here as soon as ${name} starts.`}
            </p>
          ) : (
            shown.map((line) => {
              const inRange = range !== null && line.seq >= range.from && line.seq <= range.to
              return (
                <div key={line.seq} className={cn("flex gap-3 rounded-sm", inRange && "bg-muted")}>
                  <button
                    type="button"
                    onClick={(event) => pick(line.seq, event.shiftKey)}
                    title="Select this line; Shift-click to extend"
                    className="w-10 shrink-0 select-none text-right text-muted-foreground/70 tabular-nums hover:text-foreground"
                  >
                    {line.seq}
                  </button>
                  {timestamps && <span className="w-16 shrink-0 select-none text-muted-foreground tabular-nums">{line.at}</span>}
                  <span className="min-w-0 flex-1 whitespace-pre-wrap break-all">
                    <LineText text={line.text} />
                  </span>
                </div>
              )
            })
          )}
        </div>
        {behind && (
          <Button variant="outline" size="xs" onClick={jump} className="absolute right-4 bottom-3 text-xs shadow-sm">
            <ArrowDownIcon />
            Jump to latest
          </Button>
        )}
      </div>
    </div>
  )
}
