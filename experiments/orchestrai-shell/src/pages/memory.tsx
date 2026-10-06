import { useState } from "react"

import { PageToolbar } from "@/components/common/page-toolbar"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { findAgent } from "@/data/agents"
import { MEMORY_SETTINGS, memoriesFor, proposalsFor, type DreamProposal, type MemoryEntry } from "@/data/memory"
import { useAppActions, useAppSession } from "@/lib/app-instance"
import { selectSelection } from "@/lib/window-store"
import { ConfirmDialog } from "@/components/common/confirm-dialog"
import { MemoryDetail } from "@/pages/memory/memory-detail"
import { MemoryList, type KindFilter, type ScopeFilter } from "@/pages/memory/memory-list"
import { proposalEffect } from "@/pages/memory/proposal-effect"
import { Proposals } from "@/pages/memory/proposals"
import { nextSlice } from "@/pages/memory/rank"
import { SliceBand } from "@/pages/memory/slice-band"

type View = "entries" | "proposals"

/** What agents remember across runs, where each memory came from, and exactly what the next run will be handed. */
export function MemoryPage() {
  const project = useAppSession((session) => session.project)
  const [view, setView] = useState<View>("entries")
  const [query, setQuery] = useState("")
  const [scope, setScope] = useState<ScopeFilter>("all")
  const [kind, setKind] = useState<KindFilter>("all")
  const [tag, setTag] = useState("")
  const selectedId = useAppSession((session) => selectSelection(session, "memory"))
  const { select } = useAppActions()
  const setSelectedId = (id: string) => select("memory", id)
  const [edits, setEdits] = useState<Record<string, Partial<MemoryEntry>>>({})
  const [forgotten, setForgotten] = useState<string[]>([])
  const [resolved, setResolved] = useState<Record<number, DreamProposal["status"]>>({})
  const [forgetting, setForgetting] = useState<MemoryEntry | null>(null)
  const [approving, setApproving] = useState<DreamProposal | null>(null)
  const [note, setNote] = useState<string>()

  const entries = memoriesFor(project)
    .filter((entry) => !forgotten.includes(entry.id))
    .map((entry) => ({ ...entry, ...edits[entry.id] }))
  const slice = nextSlice(entries)
  const proposals = proposalsFor(project).map((proposal) => ({ ...proposal, status: resolved[proposal.id] ?? proposal.status }))
  const pending = proposals.filter((proposal) => proposal.status === "pending").length
  const held = entries.filter((entry) => entry.scope === "task").length
  const selected = entries.find((entry) => entry.id === selectedId) ?? slice.included[0]?.entry ?? entries[0]

  const edit = (entry: MemoryEntry, change: Partial<MemoryEntry>) =>
    setEdits((current) => ({ ...current, [entry.id]: { ...current[entry.id], ...change } }))

  const resolve = (proposal: DreamProposal, approve: boolean) => {
    setResolved((current) => ({ ...current, [proposal.id]: approve ? "applied" : "rejected" }))
    if (approve) setForgotten((current) => [...current, ...proposalEffect(proposal).deletes])
    setApproving(null)
  }

  const open = (id: string) => {
    setSelectedId(id)
    setView("entries")
    setQuery("")
    setScope("all")
    setKind("all")
    setTag("")
  }

  const dream = (dryRun: boolean) =>
    setNote(
      dryRun
        ? "Dry run: 1 duplicate and 1 stale memory would be proposed. Nothing was written."
        : `Dreaming started. A ${findAgent(MEMORY_SETTINGS.dreaming.agent).name} task checks each proposal against the code; new ones land here and nothing is applied without you.`
    )

  return (
    <div className="@container flex flex-col gap-5 p-4">
      <PageToolbar title="Memory" meta={`${entries.length} entries${held ? ` · ${held} held until merge` : ""}`}>
        <ToggleGroup type="single" size="sm" variant="outline" spacing={0} value={view} onValueChange={(next) => next && setView(next as View)} aria-label="Show">
          <ToggleGroupItem value="entries">Entries</ToggleGroupItem>
          <ToggleGroupItem value="proposals">
            Proposals
            {pending > 0 && (
              <>
                <span aria-hidden className="size-1.5 rounded-full bg-amber-500" />
                <span className="text-muted-foreground tabular-nums">{pending}</span>
              </>
            )}
          </ToggleGroupItem>
        </ToggleGroup>
      </PageToolbar>

      {view === "entries" ? (
        <>
          <SliceBand project={project} slice={slice} onSelect={(entry) => open(entry.id)} />
          <div className="grid gap-6 @3xl:grid-cols-[minmax(0,1fr)_18rem] @5xl:grid-cols-[minmax(0,1fr)_22rem]">
            <MemoryList
              entries={entries}
              query={query}
              onQueryChange={setQuery}
              scope={scope}
              onScopeChange={setScope}
              kind={kind}
              onKindChange={setKind}
              tag={tag}
              onTagChange={setTag}
              selectedId={selected?.id}
              onSelect={setSelectedId}
              onTogglePin={(entry) => edit(entry, { pinned: !entry.pinned })}
            />
            {selected && (
              <MemoryDetail
                key={`${selected.id}:${selected.edited ?? ""}`}
                entry={selected}
                all={entries}
                slice={slice}
                onSelect={open}
                onSave={(content) => edit(selected, { content, edited: "Just now, by you" })}
                onTogglePin={() => edit(selected, { pinned: !selected.pinned })}
                onForget={() => setForgetting(selected)}
                onAddLink={(to, relation) => edit(selected, { links: [...(selected.links ?? []), { to, relation }] })}
                className="@3xl:sticky @3xl:top-4 @3xl:self-start"
              />
            )}
          </div>
        </>
      ) : (
        <Proposals
          proposals={proposals}
          entries={entries}
          note={note}
          onResolve={(proposal, approve) => (approve && proposalEffect(proposal).applies ? setApproving(proposal) : resolve(proposal, approve))}
          onOpen={open}
          onDream={dream}
        />
      )}

      <ConfirmDialog
        open={forgetting !== null}
        title="Forget this memory?"
        description="Agents stop seeing it from their next search or run, and its links go with it. This cannot be undone."
        confirmLabel="Forget"
        onOpenChange={(open) => !open && setForgetting(null)}
        onConfirm={() => {
          if (forgetting) setForgotten((current) => [...current, forgetting.id])
          setForgetting(null)
        }}
      />
      <ConfirmDialog
        open={approving !== null}
        title="Approve this proposal?"
        description={approving ? proposalEffect(approving).text : ""}
        confirmLabel="Approve and delete"
        onOpenChange={(open) => !open && setApproving(null)}
        onConfirm={() => approving && resolve(approving, true)}
      />
    </div>
  )
}
