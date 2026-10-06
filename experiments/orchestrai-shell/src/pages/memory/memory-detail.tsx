import { useState, type ReactNode } from "react"
import { MoreHorizontalIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Textarea } from "@/components/ui/textarea"
import { tokensOf, type MemoryEntry, type MemoryRelation } from "@/data/memory"
import { findTask } from "@/data/tasks"
import { useAppActions } from "@/lib/app-instance"
import { cn } from "@/lib/utils"
import { SelectMenu } from "@/components/common/select-menu"
import { InlineText } from "@/pages/memory/inline-text"
import { KIND_LABEL, SCOPE_LABEL, sliceStatus, type nextSlice } from "@/pages/memory/rank"

const RELATIONS: readonly MemoryRelation[] = ["related", "supports", "contradicts", "supersedes"]

const INVERSE: Record<MemoryRelation, string> = {
  related: "related to",
  supports: "supported by",
  contradicts: "contradicted by",
  supersedes: "superseded by",
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="contents">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  )
}

export function MemoryDetail({
  entry,
  all,
  slice,
  onSelect,
  onSave,
  onTogglePin,
  onForget,
  onAddLink,
  className,
}: {
  entry: MemoryEntry
  all: readonly MemoryEntry[]
  slice: ReturnType<typeof nextSlice>
  onSelect: (id: string) => void
  onSave: (content: string) => void
  onTogglePin: () => void
  onForget: () => void
  onAddLink: (to: string, relation: MemoryRelation) => void
  className?: string
}) {
  const { select } = useAppActions()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(entry.content)
  const [linking, setLinking] = useState(false)
  const [relation, setRelation] = useState<MemoryRelation>("related")
  const [target, setTarget] = useState("")
  const others = all.filter((other) => other.id !== entry.id && !(entry.links ?? []).some((link) => link.to === other.id))
  const { source } = entry
  const task = source.kind === "you" ? undefined : findTask(source.task)
  const held = source.kind === "held"
  const links = [
    ...(entry.links ?? []).map((link) => ({ id: link.to, label: link.relation })),
    ...all.flatMap((other) => (other.links ?? []).filter((link) => link.to === entry.id).map((link) => ({ id: other.id, label: INVERSE[link.relation] }))),
  ]
    .map((link) => ({ ...link, entry: all.find((candidate) => candidate.id === link.id) }))
    .filter((link) => link.entry)

  return (
    <article aria-label="Memory entry" className={cn("flex min-w-0 flex-col gap-4", className)}>
      <header className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{KIND_LABEL[entry.kind]}</span> · {SCOPE_LABEL[entry.scope]}
          {entry.pinned && " · Pinned"}
        </p>
        <Button size="sm" variant="outline" disabled={editing} onClick={() => setEditing(true)}>
          Edit
        </Button>
        {!held && (
          <Button size="sm" variant="outline" onClick={onTogglePin}>
            {entry.pinned ? "Unpin" : "Pin"}
          </Button>
        )}
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button size="icon-sm" variant="ghost" aria-label="More actions for this memory">
              <MoreHorizontalIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onSelect={() => void navigator.clipboard?.writeText(entry.content)}>Copy text</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setLinking(true)}>Link to another memory…</DropdownMenuItem>
            {task && <DropdownMenuItem onSelect={() => select("task", task.id, "task")}>Open {task.id}</DropdownMenuItem>}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onForget}>
              Forget…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {editing ? (
        <div className="flex flex-col gap-2">
          <Textarea aria-label="Memory text" autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} className="min-h-28 text-sm" />
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              disabled={!draft.trim() || draft === entry.content}
              onClick={() => {
                onSave(draft.trim())
                setEditing(false)
              }}
            >
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setDraft(entry.content)
                setEditing(false)
              }}
            >
              Cancel
            </Button>
            <span className="text-xs text-muted-foreground">Agents see the new text from their next search or run.</span>
          </div>
        </div>
      ) : (
        <p className="text-sm leading-relaxed">
          <InlineText text={entry.content} />
        </p>
      )}

      {source.kind === "held" && (
        <p className="flex items-start gap-2 text-xs">
          <span aria-hidden className="mt-1 size-1.5 shrink-0 rounded-full bg-amber-500" />
          <span>
            Held until #{source.pr} merges; then it becomes project memory. If {source.task} is abandoned, it is dropped and the project
            memory stays as it was.
          </span>
        </p>
      )}

      <dl className="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs">
        <Fact label="Source">
          {source.kind === "you" ? (
            (source.note ?? "Written by you")
          ) : (
            <>
              {source.kind === "merged" ? `Merged PR #${source.pr}` : `Draft PR #${source.pr}`}
              {source.task &&
                (task ? (
                  <>
                    {" · "}
                    <button type="button" className="underline-offset-2 hover:underline" onClick={() => select("task", task.id, "task")}>
                      {task.title}
                    </button>
                  </>
                ) : (
                  ` · ${source.task}`
                ))}
            </>
          )}
        </Fact>
        <Fact label="Written">
          {entry.written}
          {source.kind === "merged" && ", after the merge"}
        </Fact>
        {entry.edited && <Fact label="Edited">{entry.edited}</Fact>}
        <Fact label="Injected">
          {entry.injected ? `Into ${entry.injected} run${entry.injected === 1 ? "" : "s"}` : "Not yet"}
          {entry.lastInjected && <span className="text-muted-foreground"> · last {entry.lastInjected}</span>}
        </Fact>
        <Fact label="Last used">{entry.lastUsed}</Fact>
        <Fact label="Next run">
          {sliceStatus(entry, slice)} <span className="text-muted-foreground">· {tokensOf(entry)} tokens</span>
        </Fact>
        {entry.tags.length > 0 && <Fact label="Tags">{entry.tags.map((tag) => `#${tag}`).join("  ")}</Fact>}
        {links.map((link, index) => (
          <Fact key={`${link.id}-${link.label}`} label={index === 0 ? "Links" : ""}>
            <button type="button" onClick={() => onSelect(link.id)} className="line-clamp-2 text-left hover:underline">
              <span className="text-muted-foreground">{link.label} </span>
              {link.entry && <InlineText text={link.entry.content} />}
            </button>
          </Fact>
        ))}
      </dl>

      {linking && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">This memory is the source; the link reads the other way from the other end.</p>
          <div className="flex flex-wrap items-center gap-2">
            <SelectMenu label="Relation" value={relation} className="h-7" options={RELATIONS.map((value) => ({ value, label: value }))} onChange={(value) => setRelation(value as MemoryRelation)} />
            <SelectMenu
              label="Memory"
              value={target}
              className="h-7 max-w-56"
              options={[{ value: "", label: "Choose a memory" }, ...others.map((other) => ({ value: other.id, label: other.content.replaceAll("`", "").slice(0, 56) }))]}
              onChange={setTarget}
            />
            <Button
              size="sm"
              disabled={!target}
              onClick={() => {
                onAddLink(target, relation)
                setLinking(false)
                setTarget("")
              }}
            >
              Link
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setLinking(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </article>
  )
}
