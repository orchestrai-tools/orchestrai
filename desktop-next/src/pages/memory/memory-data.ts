import { daemon } from "@warpforge/daemon";
import type { Memory, MemoryProposal, MemoryStats } from "@warpforge/protocol";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { proposalEffect } from "../../lib/memory-labels";
import { useMemoryRefresh } from "../../lib/memory-palette";
import type { MemoryFilters } from "./memory-list";

const PAGE = 50;

const message = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);

/** Counts and dreaming proposals, reloaded when the palette asks. */
export function useMemoryStats() {
  const tick = useMemoryRefresh((state) => state.tick);
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [proposals, setProposals] = useState<MemoryProposal[]>([]);
  const [proposalError, setProposalError] = useState<string | null>(null);

  const load = useCallback(() => {
    void daemon
      .memoryStats()
      .then((next) => {
        setStats(next);
        setStatsError(null);
      })
      .catch((err: unknown) => setStatsError(message(err, "Could not load memory counts")));
    void daemon
      .listMemoryProposals()
      .then((next) => {
        if (!Array.isArray(next)) throw new Error("Could not load proposals");
        setProposals(next);
        setProposalError(null);
      })
      .catch((err: unknown) => setProposalError(message(err, "Could not load proposals")));
  }, []);

  useEffect(() => load(), [load, tick]);

  return { stats, statsError, proposals, proposalError, reload: load };
}

/** The memory list for the current filters: a page at a time, or the daemon's ranked hits while searching. */
export function useMemoryRows(filters: MemoryFilters) {
  const tick = useMemoryRefresh((state) => state.tick);
  const [rows, setRows] = useState<Memory[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const query = filters.query.trim();
  const scope = filters.scope === "all" ? undefined : filters.scope;
  const kind = filters.kind === "all" ? undefined : filters.kind;

  const load = useCallback(() => {
    const work = query
      ? daemon.searchMemories({ query, scope, limit: 100 })
      : daemon.listMemories({ scope, kind, limit: PAGE, offset: 0 });
    setLoading(true);
    work
      .then((page) => {
        if (!Array.isArray(page)) throw new Error("Could not load memory");
        setRows(page);
        setHasMore(!query && page.length === PAGE);
        setError(null);
      })
      .catch((err: unknown) => setError(message(err, "Could not load memory")))
      .finally(() => setLoading(false));
  }, [query, scope, kind]);

  useEffect(() => load(), [load, tick]);

  const more = () => {
    void daemon
      .listMemories({ scope, kind, limit: PAGE, offset: rows.length })
      .then((page) => {
        if (!Array.isArray(page)) throw new Error("Could not load more");
        setRows((current) => [...current, ...page]);
        setHasMore(page.length === PAGE);
      })
      .catch((err: unknown) => toast.error(message(err, "Could not load more")));
  };

  return { rows, error, loading, hasMore, reload: load, more };
}

export async function resolveProposal(
  proposal: MemoryProposal,
  approve: boolean,
): Promise<boolean> {
  try {
    await daemon.resolveMemoryProposal(
      proposal.id,
      approve,
      approve ? proposalEffect(proposal).applies : false,
    );
    return true;
  } catch (err) {
    toast.error(
      message(err, approve ? "Could not approve the proposal" : "Could not reject the proposal"),
    );
    return false;
  }
}

export async function forgetMemory(id: string): Promise<boolean> {
  try {
    await daemon.deleteMemory(id);
    toast.success("Deleted the memory");
    return true;
  } catch (err) {
    toast.error(message(err, "Could not delete the memory"));
    return false;
  }
}
