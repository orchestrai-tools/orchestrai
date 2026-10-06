import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { findAgent } from "@/data/agents"
import { MEMORY_SETTINGS, type DreamProposal, type MemoryEntry, type ProposalType } from "@/data/memory"
import { useAppActions } from "@/lib/app-instance"
import { cn } from "@/lib/utils"
import { InlineText } from "@/pages/memory/inline-text"
import { proposalEffect } from "@/pages/memory/proposal-effect"

const TYPE_LABEL: Record<ProposalType, string> = {
  duplicate: "Duplicate",
  contradiction: "Contradiction",
  stale: "Stale",
  merge: "Merge",
  superseded_by: "Superseded",
  delete: "Delete",
}

function ProposalRow({
  proposal,
  entries,
  onResolve,
  onOpen,
}: {
  proposal: DreamProposal
  entries: readonly MemoryEntry[]
  onResolve: (approve: boolean) => void
  onOpen: (id: string) => void
}) {
  const targets = proposal.targets.map((id) => ({ id, entry: entries.find((entry) => entry.id === id) }))
  const effect = proposalEffect(proposal)
  const open = proposal.status === "pending"
  return (
    <li className={cn("flex flex-col gap-2", !open && "opacity-60")}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {open && <span aria-hidden className="size-1.5 rounded-full bg-amber-500" />}
        <span className="text-sm font-medium">{TYPE_LABEL[proposal.type]}</span>
        <span className="text-xs text-muted-foreground">
          {proposal.by === "heuristic" ? "Found by the heuristic pass" : `${findAgent(proposal.by).name} checked it against the code`} ·{" "}
          {proposal.created}
        </span>
        {open ? (
          <span className="ml-auto flex gap-2">
            <Button size="sm" variant="outline" onClick={() => onResolve(false)}>
              Reject
            </Button>
            <Button size="sm" onClick={() => onResolve(true)}>
              {effect.applies ? "Approve" : "Mark done"}
            </Button>
          </span>
        ) : (
          <span className="ml-auto text-xs text-muted-foreground">
            {proposal.status === "rejected" ? "Rejected" : effect.applies ? "Approved" : "Marked done"}
          </span>
        )}
      </div>
      <p className="text-sm">{proposal.reason}</p>
      {open && <p className="text-xs text-muted-foreground">{effect.text}</p>}
      <ul className="flex flex-col gap-1">
        {targets.map(({ id, entry }, index) => (
          <li key={id}>
            {entry ? (
              <button type="button" onClick={() => onOpen(id)} className="flex w-full gap-2 rounded-md px-2 py-(--row-py) text-left text-sm hover:bg-muted">
                <span className="w-10 shrink-0 text-xs text-muted-foreground">{proposal.type === "duplicate" && index === 0 ? "Kept" : ""}</span>
                <span className="line-clamp-2 min-w-0">
                  <InlineText text={entry.content} />
                </span>
              </button>
            ) : (
              <p className="px-2 text-xs text-muted-foreground">That memory is gone already.</p>
            )}
          </li>
        ))}
      </ul>
    </li>
  )
}

/** Dreaming proposes; a person decides. An agent may record a decision, but only a person applies a deletion. */
export function Proposals({
  proposals,
  entries,
  note,
  onResolve,
  onOpen,
  onDream,
}: {
  proposals: readonly DreamProposal[]
  entries: readonly MemoryEntry[]
  note: string | undefined
  onResolve: (proposal: DreamProposal, approve: boolean) => void
  onOpen: (id: string) => void
  onDream: (dryRun: boolean) => void
}) {
  const { setPage } = useAppActions()
  const [showResolved, setShowResolved] = useState(false)
  const pending = proposals.filter((proposal) => proposal.status === "pending")
  const resolved = proposals.length - pending.length
  const visible = showResolved ? proposals : pending
  const { dreaming } = MEMORY_SETTINGS

  return (
    <section aria-label="Dreaming proposals" className="flex max-w-3xl flex-col gap-5">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm">
            <span className="font-medium">Dreaming</span>
            <span className="text-muted-foreground">
              {" "}
              · {dreaming.schedule} with {findAgent(dreaming.agent).name} · last ran {dreaming.lastRun} and found {dreaming.found}
            </span>
          </p>
          <span className="ml-auto flex gap-2">
            <Button size="sm" variant="outline" onClick={() => onDream(true)}>
              Dry run
            </Button>
            <Button size="sm" variant="outline" onClick={() => onDream(false)}>
              Dream now
            </Button>
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          It reads the least-used memories first and flags ones that look duplicated, contradicted, or stale. Each proposal says what
          approving does before you press it.{" "}
          <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={() => setPage("settings")}>
            Change the schedule
          </button>
        </p>
        {note && (
          <p className="flex items-start gap-2 text-xs">
            <span aria-hidden className="mt-1 size-1.5 shrink-0 rounded-full bg-emerald-500" />
            {note}
          </p>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing to review. When dreaming finds something, it waits here for your decision.</p>
      ) : (
        <ol className="flex flex-col gap-6">
          {visible.map((proposal) => (
            <ProposalRow
              key={proposal.id}
              proposal={proposal}
              entries={entries}
              onResolve={(approve) => onResolve(proposal, approve)}
              onOpen={onOpen}
            />
          ))}
        </ol>
      )}
      {resolved > 0 && (
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Checkbox checked={showResolved} onCheckedChange={(checked) => setShowResolved(checked === true)} />
          Show {resolved} resolved
        </label>
      )}
    </section>
  )
}
