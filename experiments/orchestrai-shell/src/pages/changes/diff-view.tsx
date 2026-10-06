import { Fragment, useState, type ReactNode } from "react"
import { PlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import type { ChangedFile, DiffLine, Hunk } from "@/data/git"
import { cn } from "@/lib/utils"
import type { DiffMode, DiffNote } from "@/pages/changes/git-store"
import { hiddenLines, hunkHeader, noteKey, oldEnd, pairLines } from "@/pages/changes/patch"

interface Props {
  file: ChangedFile
  mode: DiffMode
  notes: DiffNote[]
  onAddNote: (line: string, body: string) => void
  onRemoveNote: (id: string) => void
  onDiscardHunk: (index: number) => void
}

const TINT = { add: "bg-emerald-500/10", del: "bg-red-500/10", context: "" } as const
const MARK = { add: "+", del: "−", context: "" } as const
const MARK_TONE = { add: "text-emerald-600 dark:text-emerald-400", del: "text-red-600 dark:text-red-400", context: "" } as const
const NUMBER = "select-none pr-2 text-right text-muted-foreground/70 tabular-nums"
const CODE = "min-w-0 pr-4 whitespace-pre-wrap [overflow-wrap:anywhere]"

/**
 * One file's hunks, unified or side by side, with unchanged stretches folded.
 * Hover a line to leave a note on it for the agent; notes go out together
 * from the bar above, as one message.
 */
export function DiffView({ file, mode, notes, onAddNote, onRemoveNote, onDiscardHunk }: Props) {
  const [composing, setComposing] = useState<string>()
  const hidden = hiddenLines(file)

  const lineExtras = (key: string): ReactNode => {
    const here = notes.filter((note) => note.path === file.path && note.line === key)
    if (!here.length && composing !== key) return null
    return (
      <div className={cn("flex flex-col gap-1.5 py-1.5 pr-4 font-sans", mode === "unified" ? "pl-[7.25rem]" : "pl-12")}>
        {here.map((note) => (
          <div key={note.id} className="flex max-w-[72ch] flex-col gap-1 rounded-md border bg-background p-2">
            <p className="text-sm whitespace-pre-wrap">{note.body}</p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{note.sent ? "Sent to the agent" : "Not sent yet"}</span>
              <Button variant="ghost" size="xs" className="ml-auto" onClick={() => onRemoveNote(note.id)}>
                {note.sent ? "Resolve" : "Delete"}
              </Button>
            </div>
          </div>
        ))}
        {composing === key && (
          <NoteComposer
            onCancel={() => setComposing(undefined)}
            onSave={(body) => {
              onAddNote(key, body)
              setComposing(undefined)
            }}
          />
        )}
      </div>
    )
  }

  return (
    <div className="font-mono text-xs leading-5 [tab-size:4]">
      {file.hunks.map((part, index) => {
        const gap = index === 0 ? part.oldStart - 1 : part.oldStart - oldEnd(file.hunks[index - 1]) - 1
        return (
          <section key={`${part.oldStart}-${part.newStart}`} aria-label={hunkHeader(part)}>
            {gap > 0 && <Fold>{gap} unchanged {gap === 1 ? "line" : "lines"}</Fold>}
            <HunkBar part={part} onDiscard={() => onDiscardHunk(index)} />
            {mode === "unified"
              ? part.lines.map((line, row) => (
                  <Fragment key={row}>
                    <UnifiedLine line={line} onNote={() => setComposing(noteKey(line))} />
                    {lineExtras(noteKey(line))}
                  </Fragment>
                ))
              : pairLines(part.lines).map((pair, row) => (
                  <Fragment key={row}>
                    <div className="grid grid-cols-2">
                      <SplitSide line={pair.left} side="old" onNote={(line) => setComposing(noteKey(line))} />
                      <SplitSide line={pair.right} side="new" onNote={(line) => setComposing(noteKey(line))} />
                    </div>
                    {pair.left && pair.left.kind === "del" && lineExtras(noteKey(pair.left))}
                    {pair.right && lineExtras(noteKey(pair.right))}
                  </Fragment>
                ))}
          </section>
        )
      })}
      {(hidden.additions > 0 || hidden.deletions > 0) && (
        <Fold>
          {file.status === "A" || file.status === "U"
            ? `${hidden.additions} more lines of this new file are not shown in the preview`
            : `+${hidden.additions} −${hidden.deletions} more in this file, not shown in the preview`}
        </Fold>
      )}
    </div>
  )
}

function Fold({ children }: { children: ReactNode }) {
  return <div className="bg-muted/40 px-3 py-0.5 font-sans text-muted-foreground">⋯ {children}</div>
}

function HunkBar({ part, onDiscard }: { part: Hunk; onDiscard: () => void }) {
  return (
    <div className="group/hunk flex items-center gap-2 bg-muted/70 px-3 text-muted-foreground">
      <span className="truncate">
        {hunkHeader(part)} <span className="text-foreground/70">{part.section}</span>
      </span>
      <Button
        variant="ghost"
        size="xs"
        className="ml-auto font-sans opacity-0 group-hover/hunk:opacity-100 focus-visible:opacity-100"
        onClick={onDiscard}
      >
        Discard hunk…
      </Button>
    </div>
  )
}

function NoteButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="Add a note on this line"
      onClick={onClick}
      className="absolute top-0.5 left-0.5 flex size-4 items-center justify-center rounded-sm border bg-background text-foreground opacity-0 group-hover/line:opacity-100 focus-visible:opacity-100"
    >
      <PlusIcon className="size-3" />
    </button>
  )
}

function UnifiedLine({ line, onNote }: { line: DiffLine; onNote: () => void }) {
  return (
    <div className={cn("group/line relative grid grid-cols-[3rem_3rem_1.25rem_minmax(0,1fr)]", TINT[line.kind])}>
      <NoteButton onClick={onNote} />
      <span className={NUMBER}>{line.oldNo ?? ""}</span>
      <span className={NUMBER}>{line.newNo ?? ""}</span>
      <span className={cn("select-none text-center", MARK_TONE[line.kind])}>{MARK[line.kind]}</span>
      <span className={CODE}>{line.text || " "}</span>
    </div>
  )
}

function SplitSide({ line, side, onNote }: { line?: DiffLine; side: "old" | "new"; onNote: (line: DiffLine) => void }) {
  const edge = side === "old" && "border-r"
  if (!line) return <span aria-hidden className={cn("bg-muted/30", edge)} />
  const notable = side === "new" || line.kind === "del"
  return (
    <div className={cn("group/line relative grid grid-cols-[3rem_minmax(0,1fr)]", TINT[line.kind], edge)}>
      {notable && <NoteButton onClick={() => onNote(line)} />}
      <span className={NUMBER}>{side === "old" ? line.oldNo : line.newNo}</span>
      <span className={CODE}>
        <span className={cn("inline-block w-4 select-none", MARK_TONE[line.kind])}>{MARK[line.kind]}</span>
        {line.text || " "}
      </span>
    </div>
  )
}

function NoteComposer({ onSave, onCancel }: { onSave: (body: string) => void; onCancel: () => void }) {
  const [body, setBody] = useState("")
  return (
    <div className="flex max-w-[72ch] flex-col gap-1.5 rounded-md border bg-background p-2">
      <Textarea
        autoFocus
        value={body}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") onCancel()
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && body.trim()) onSave(body.trim())
        }}
        placeholder="What should the agent change here? ⌘↵ to save"
        aria-label="Note on this line"
        className="min-h-14 text-sm"
      />
      <div className="flex justify-end gap-1.5">
        <Button variant="ghost" size="xs" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="xs" disabled={!body.trim()} onClick={() => onSave(body.trim())}>
          Add note
        </Button>
      </div>
    </div>
  )
}
