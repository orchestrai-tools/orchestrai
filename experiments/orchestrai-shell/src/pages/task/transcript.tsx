import { BookOpenIcon, FilePenIcon, GlobeIcon, SearchIcon, TerminalIcon, type LucideIcon } from "lucide-react"

import { MarkdownPage } from "@/components/common/markdown"
import type { TaskDetail, TranscriptEntry } from "@/data/task-detail"
import { cn } from "@/lib/utils"

const TOOL_ICON: Record<Extract<TranscriptEntry, { kind: "tool" }>["tool"], LucideIcon> = {
  edit: FilePenIcon,
  shell: TerminalIcon,
  read: BookOpenIcon,
  search: SearchIcon,
  browser: GlobeIcon,
}

/** A tool call is one quiet line with its result, not a block that interrupts reading. */
function ToolLine({ entry }: { entry: Extract<TranscriptEntry, { kind: "tool" }> }) {
  const Icon = TOOL_ICON[entry.tool]
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-sm px-2 py-1 font-mono text-xs text-muted-foreground",
        entry.status === "waiting" && "bg-amber-500/10 text-foreground",
        entry.status === "failed" && "bg-red-500/10 text-foreground"
      )}
    >
      <Icon className="size-3.5 shrink-0" />
      <span className="min-w-0 truncate">{entry.title}</span>
      <span className="ml-auto shrink-0 font-sans">{entry.detail}</span>
    </div>
  )
}

/**
 * The conversation as a reading surface: agent turns render as markdown,
 * tool calls collapse to single lines, and your messages are set apart by
 * space and weight rather than chat bubbles.
 */
export function Transcript({ detail }: { detail: TaskDetail }) {
  return (
    <ol className="flex flex-col gap-4">
      {detail.transcript.map((entry, index) => (
        <li key={index} className="flex gap-3">
          <span className="w-10 shrink-0 pt-0.5 text-right text-[11px] text-muted-foreground tabular-nums">{entry.time}</span>
          <div className="min-w-0 flex-1">
            {entry.kind === "user" && <p className="text-sm font-medium">{entry.text}</p>}
            {entry.kind === "agent" && <MarkdownPage markdown={entry.markdown} />}
            {entry.kind === "tool" && <ToolLine entry={entry} />}
          </div>
        </li>
      ))}
    </ol>
  )
}

const STEP_TONE = {
  done: "bg-foreground/50",
  running: "bg-emerald-500",
  pending: "bg-foreground/15",
  failed: "bg-red-500",
}

/** The step log: the plan's steps with where the run is now. */
export function StepLog({ detail }: { detail: TaskDetail }) {
  return (
    <ol className="flex flex-col">
      {detail.steps.map((step, index) => (
        <li key={step.label} className="flex items-center gap-3 py-(--row-py) text-sm">
          <span className="w-5 text-right text-xs text-muted-foreground tabular-nums">{index + 1}</span>
          <span aria-hidden className={cn("size-2 shrink-0 rounded-full", STEP_TONE[step.state])} />
          <span className={cn(step.state === "pending" && "text-muted-foreground")}>{step.label}</span>
          <span className="ml-auto text-xs text-muted-foreground">{step.state}</span>
        </li>
      ))}
    </ol>
  )
}
