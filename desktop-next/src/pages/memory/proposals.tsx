import type { Memory, MemoryProposal } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import { Checkbox } from "@warpforge/ui/components/checkbox";
import { cn } from "@warpforge/ui/lib/utils";
import { useState } from "react";
import { PROPOSAL_LABEL, proposalEffect, proposalTargets } from "../../lib/memory-labels";
import { InlineText, when } from "./inline-text";

function statusText(proposal: MemoryProposal, applies: boolean): string {
  if (proposal.status === "rejected") return "Rejected";
  return applies ? "Approved" : "Marked done";
}

function ProposalRow({
  proposal,
  index,
  onResolve,
  onOpen,
}: {
  proposal: MemoryProposal;
  index: Map<string, Memory>;
  onResolve: (approve: boolean) => void;
  onOpen: (id: string) => void;
}) {
  const type = proposal.proposal_type ?? "";
  const targets = proposalTargets(proposal).map((id) => ({ id, entry: index.get(id) }));
  const effect = proposalEffect(proposal);
  const open = proposal.status === "pending";
  return (
    <li className={cn("flex flex-col gap-2", !open && "opacity-60")}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {open && <span aria-hidden className="size-1.5 rounded-full bg-amber-500" />}
        <span className="text-sm font-medium">{PROPOSAL_LABEL[type] ?? (type || "Proposal")}</span>
        {proposal.created_at > 0 && (
          <span className="text-xs text-muted-foreground">{when(proposal.created_at)}</span>
        )}
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
            {statusText(proposal, effect.applies)}
          </span>
        )}
      </div>
      {proposal.reason && <p className="text-sm">{proposal.reason}</p>}
      {open && <p className="text-xs text-muted-foreground">{effect.summary}</p>}
      <ul className="flex flex-col gap-1">
        {targets.map(({ id, entry }, position) => (
          <li key={id}>
            {entry ? (
              <button
                type="button"
                onClick={() => onOpen(id)}
                className="flex w-full gap-2 rounded-md px-2 py-(--row-py) text-left text-sm hover:bg-muted"
              >
                <span className="w-10 shrink-0 text-xs text-muted-foreground">
                  {type === "duplicate" && position === 0 ? "Kept" : ""}
                </span>
                <span className="line-clamp-2 min-w-0">
                  <InlineText text={entry.content} />
                </span>
              </button>
            ) : (
              <p className="px-2 text-xs text-muted-foreground">
                <span className="font-mono">{id}</span> is not in the loaded list.
              </p>
            )}
          </li>
        ))}
      </ul>
    </li>
  );
}

/** Dreaming proposes; a person decides. Only a person applies a deletion. */
export function Proposals({
  proposals,
  index,
  error,
  onRetry,
  onResolve,
  onOpen,
  onDream,
}: {
  proposals: readonly MemoryProposal[];
  index: Map<string, Memory>;
  error: string | null;
  onRetry: () => void;
  onResolve: (proposal: MemoryProposal, approve: boolean) => void;
  onOpen: (id: string) => void;
  onDream: (dryRun: boolean) => void;
}) {
  const [showResolved, setShowResolved] = useState(false);
  const pending = proposals.filter((proposal) => proposal.status === "pending");
  const resolved = proposals.length - pending.length;
  const visible = showResolved ? proposals : pending;

  return (
    <section aria-label="Dreaming proposals" className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium">Dreaming</p>
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
          It flags memories that look duplicated, contradicted, or stale, then starts a task that
          checks each finding against the code. Each proposal says what approving does before you
          press it.
        </p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}{" "}
          <button type="button" className="underline underline-offset-2" onClick={onRetry}>
            Retry
          </button>
        </p>
      )}
      {!error && visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing to review. When dreaming finds something, it waits here for your decision.
        </p>
      ) : (
        <ol className="flex flex-col gap-6">
          {visible.map((proposal) => (
            <ProposalRow
              key={proposal.id}
              proposal={proposal}
              index={index}
              onResolve={(approve) => onResolve(proposal, approve)}
              onOpen={onOpen}
            />
          ))}
        </ol>
      )}
      {resolved > 0 && (
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Checkbox
            checked={showResolved}
            onCheckedChange={(checked) => setShowResolved(checked === true)}
          />
          Show {resolved} resolved
        </label>
      )}
    </section>
  );
}
