import { daemon } from "@warpforge/daemon";
import type { Memory, MemoryProposal, MemoryStats } from "@warpforge/protocol";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { proposalEffect } from "../../lib/memory-labels";
import { useMemoryRefresh } from "../../lib/memory-palette";
import { type RequestGate, useRequestGate } from "../../lib/request-gate";
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
  const gate = useRequestGate("memory-stats");

  const load = useCallback(() => {
    const current = gate.begin();
    void daemon
      .memoryStats()
      .then((next) => {
        if (!current()) return;
        setStats(next);
        setStatsError(null);
      })
      .catch((err: unknown) => {
        if (current()) setStatsError(message(err, "Could not load memory counts"));
      });
    void daemon
      .listMemoryProposals()
      .then((next) => {
        if (!current()) return;
        if (!Array.isArray(next)) throw new Error("Could not load proposals");
        setProposals(next);
        setProposalError(null);
      })
      .catch((err: unknown) => {
        if (current()) setProposalError(message(err, "Could not load proposals"));
      });
  }, [gate]);

  useEffect(() => load(), [load, tick]);

  return { stats, statsError, proposals, proposalError, reload: load };
}

interface MemoryRowsState {
  key: string;
  rows: Memory[];
  error: string | null;
  loading: boolean;
  hasMore: boolean;
}

const emptyRows = (key: string): MemoryRowsState => ({
  key,
  rows: [],
  error: null,
  loading: true,
  hasMore: false,
});

/** The memory list for the current filters: a page at a time, or the daemon's ranked hits while searching. */
export function useMemoryRows(filters: MemoryFilters) {
  const tick = useMemoryRefresh((state) => state.tick);
  const query = filters.query.trim();
  const scope = filters.scope === "all" ? undefined : filters.scope;
  const kind = filters.kind === "all" ? undefined : filters.kind;
  const key = JSON.stringify([query, scope, kind]);
  const gate = useRequestGate(key);
  const [result, setResult] = useState<MemoryRowsState>(() => emptyRows(key));
  const state = result.key === key ? result : emptyRows(key);
  const cursor = useRef<{ gate: RequestGate; offset: number; hasMore: boolean } | null>(null);
  const pendingPage = useRef<(() => boolean) | null>(null);

  const load = useCallback(() => {
    const current = gate.begin();
    cursor.current = null;
    setResult((previous) => ({
      ...emptyRows(key),
      rows: previous.key === key ? previous.rows : [],
    }));
    const work = query
      ? daemon.searchMemories({ query, scope, limit: 100 })
      : daemon.listMemories({ scope, kind, limit: PAGE, offset: 0 });
    work
      .then((page) => {
        if (!current()) return;
        if (!Array.isArray(page)) throw new Error("Could not load memory");
        const hasMore = !query && page.length === PAGE;
        cursor.current = { gate, offset: page.length, hasMore };
        setResult({ key, rows: page, hasMore, error: null, loading: false });
      })
      .catch((err: unknown) => {
        if (current())
          setResult((previous) => ({
            ...previous,
            error: message(err, "Could not load memory"),
            loading: false,
          }));
      });
  }, [query, scope, kind, key, gate]);

  useEffect(() => load(), [load, tick]);

  const more = () => {
    const next = cursor.current;
    if (query || !next || next.gate !== gate || !next.hasMore || pendingPage.current?.()) return;
    const current = gate.begin();
    pendingPage.current = current;
    void daemon
      .listMemories({ scope, kind, limit: PAGE, offset: next.offset })
      .then((page) => {
        if (!current()) return;
        if (!Array.isArray(page)) throw new Error("Could not load more");
        const hasMore = page.length === PAGE;
        cursor.current = { gate, offset: next.offset + page.length, hasMore };
        setResult((previous) => ({ ...previous, rows: [...previous.rows, ...page], hasMore }));
      })
      .catch((err: unknown) => {
        if (current()) toast.error(message(err, "Could not load more"));
      })
      .finally(() => {
        if (pendingPage.current === current) pendingPage.current = null;
      });
  };

  return {
    rows: state.rows,
    error: state.error,
    loading: state.loading,
    hasMore: state.hasMore,
    reload: load,
    more,
  };
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
