import { useQueryClient } from "@tanstack/react-query";
import { Check, Moon, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { relativeTime } from "@/components/backlog/BacklogRow";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonBlock } from "@/components/ui/skeleton";
import { daemon } from "@/daemon";
import { cn } from "@/lib/utils";
import type { Memory, MemoryProposal } from "@/protocol";

import {
  awaitsApply,
  keptDuplicateId,
  PROPOSAL_LABEL,
  proposalEffect,
  proposalTargets,
} from "./labels";
import { useMemoryProposals } from "./queries";

const isPending = (proposal: MemoryProposal) => proposal.status === "pending";

/**
 * The dreaming review queue. Each card gives the daemon's reason and the
 * memories it points at; Approve applies the proposal where it can, Reject records the decision.
 *
 * @param props.index Every known memory by id.
 * @param props.onOpenMemory Called with a memory id to open it in the browser.
 */
export function Proposals({
  index,
  onOpenMemory,
}: {
  index: Map<string, Memory>;
  onOpenMemory: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const proposals = useMemoryProposals();
  const [showResolved, setShowResolved] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [confirming, setConfirming] = useState<MemoryProposal | null>(null);

  const resolve = async (proposal: MemoryProposal, approve: boolean) => {
    setBusyId(proposal.id);
    try {
      await daemon.resolveMemoryProposal(proposal.id, approve, true);
      await queryClient.invalidateQueries({ queryKey: ["memory"] });
    } catch (error) {
      toast.error(approve ? "Could not approve the proposal" : "Could not reject the proposal", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusyId(null);
    }
  };

  const approve = (proposal: MemoryProposal) =>
    proposalEffect(proposal).applies ? setConfirming(proposal) : void resolve(proposal, true);

  const all = proposals.data ?? [];
  const isOpen = (proposal: MemoryProposal) => isPending(proposal) || awaitsApply(proposal, index);
  const visible = showResolved ? all : all.filter(isOpen);
  const resolvedCount = all.length - all.filter(isOpen).length;

  return (
    <section aria-label="Proposals" className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-[13px] text-muted-foreground">
          Dreaming flags memories that look duplicated, contradicted or stale. Each card says what
          approving does before you press it.
        </p>
        {resolvedCount > 0 && (
          <label className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
            <input
              type="checkbox"
              checked={showResolved}
              onChange={(event) => setShowResolved(event.target.checked)}
            />
            Show {resolvedCount} resolved
          </label>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pb-2">
        {proposals.isLoading ? (
          Array.from({ length: 3 }, (_, i) => <SkeletonBlock key={i} className="h-24 w-full" />)
        ) : proposals.error ? (
          <div className="flex flex-col items-center gap-2 p-6 text-center">
            <p role="alert" className="text-[13px] text-destructive">
              {proposals.error instanceof Error
                ? proposals.error.message
                : "Could not load proposals."}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void proposals.refetch()}
            >
              Retry
            </Button>
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={Moon}
            title="Nothing to review"
            hint="When dreaming finds duplicate, contradictory or stale memories, they wait here for your decision."
          />
        ) : (
          visible.map((proposal) => {
            const effect = proposalEffect(proposal);
            const kept = keptDuplicateId(proposal, index);
            const awaiting = awaitsApply(proposal, index);
            const open = isPending(proposal) || awaiting;
            return (
              <article
                key={proposal.id}
                className={cn("space-y-2 rounded-md border p-3", !open && "opacity-70")}
              >
                <header className="flex flex-wrap items-center gap-2">
                  <Badge>
                    {PROPOSAL_LABEL[proposal.proposal_type ?? ""] ??
                      proposal.proposal_type ??
                      "Proposal"}
                  </Badge>
                  {awaiting && <Badge variant="warn">Approved by an agent, not applied</Badge>}
                  {!open && (
                    <Badge variant={proposal.status === "rejected" ? "outline" : "ok"}>
                      {proposal.status === "rejected"
                        ? "Rejected"
                        : effect.applies
                          ? "Approved"
                          : "Marked done"}
                    </Badge>
                  )}
                  <span className="text-[12px] text-muted-foreground">
                    {relativeTime(proposal.created_at * 1000)}
                  </span>
                  {isPending(proposal) && (
                    <div className="ml-auto flex gap-1.5">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busyId === proposal.id}
                        onClick={() => void resolve(proposal, false)}
                      >
                        <X className="size-3.5" />
                        Reject
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={busyId === proposal.id}
                        onClick={() => approve(proposal)}
                      >
                        <Check className="size-3.5" />
                        {effect.applies ? "Approve" : "Mark done"}
                      </Button>
                    </div>
                  )}
                  {awaiting && (
                    <Button
                      type="button"
                      size="sm"
                      className="ml-auto"
                      disabled={busyId === proposal.id}
                      onClick={() => setConfirming(proposal)}
                    >
                      <Check className="size-3.5" />
                      Apply
                    </Button>
                  )}
                </header>
                {proposal.reason ? <p className="text-[13px]">{proposal.reason}</p> : null}
                {open && (
                  <p className="text-[12px] text-muted-foreground">
                    {awaiting ? effect.summary.replace("Approving", "Applying") : effect.summary}
                  </p>
                )}
                <ul className="space-y-1">
                  {proposalTargets(proposal).map((id) => {
                    const memory = index.get(id);
                    return (
                      <li key={id}>
                        {memory ? (
                          <button
                            type="button"
                            onClick={() => onOpenMemory(id)}
                            className="line-clamp-2 w-full rounded bg-secondary/40 px-2 py-1.5 text-left text-[13px] hover:bg-secondary"
                          >
                            {kept === id && open && (
                              <span className="mr-1.5 text-[11px] font-medium text-ok">Kept</span>
                            )}
                            {memory.content}
                          </button>
                        ) : (
                          <p className="rounded bg-secondary/40 px-2 py-1.5 text-[12px] text-muted-foreground">
                            Memory {id.slice(0, 8)} is no longer in the list.
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </article>
            );
          })
        )}
      </div>
      <ConfirmDialog
        open={confirming !== null}
        title={confirming?.status === "applied" ? "Apply this proposal?" : "Approve this proposal?"}
        description={confirming ? proposalEffect(confirming).summary : ""}
        confirmLabel={confirming?.status === "applied" ? "Apply" : "Approve"}
        busyLabel="Applying…"
        onCancel={() => setConfirming(null)}
        onConfirm={async () => {
          if (confirming) await resolve(confirming, true);
          setConfirming(null);
        }}
      />
    </section>
  );
}
