import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { daemon } from "@/daemon";
import type { Memory } from "@/protocol";

import type { ScopeFilter } from "./labels";

export const PAGE_SIZE = 50;
/** The most the daemon returns for one search or one list call. */
export const SEARCH_LIMIT = 100;
export const INDEX_LIMIT = 1000;

const scopeParam = (scope: ScopeFilter) => (scope === "all" ? undefined : scope);
const kindParam = (kind: string) => (kind === "all" ? undefined : kind);

/**
 * The browse list, fetched a page at a time as the user scrolls.
 *
 * @param scope Which memories to include.
 * @param kind A memory kind, or "all".
 * @returns The infinite query; each page is one `memory.list` call.
 */
export function useMemoryPages(scope: ScopeFilter, kind: string) {
  return useInfiniteQuery({
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      daemon.listMemories({
        kind: kindParam(kind),
        limit: PAGE_SIZE,
        offset: pageParam,
        scope: scopeParam(scope),
      }),
    getNextPageParam: (last, pages) =>
      last.length < PAGE_SIZE ? undefined : pages.reduce((n, page) => n + page.length, 0),
    queryKey: ["memory", "list", scope, kind],
  });
}

/**
 * Full-text search; idle while `term` is blank.
 *
 * @param term The raw text from the search box.
 * @param scope Which memories to search.
 * @param hybrid Whether the daemon has embeddings on, so ranking can use them.
 * @returns The search query.
 */
export function useMemorySearch(term: string, scope: ScopeFilter, hybrid: boolean) {
  return useQuery({
    enabled: term.length > 0,
    queryFn: () =>
      daemon.searchMemories({
        limit: SEARCH_LIMIT,
        mode: hybrid ? "hybrid" : undefined,
        query: term,
        scope: scopeParam(scope),
      }),
    queryKey: ["memory", "search", term, scope, hybrid],
  });
}

/**
 * Every memory the daemon will list in one call, keyed by id. Resolves the ids
 * that edges and proposals refer to without a fetch per id.
 *
 * @param enabled Whether anything on screen needs it yet.
 * @returns A lookup from memory id to memory.
 */
export function useMemoryIndex(enabled: boolean): Map<string, Memory> {
  const query = useQuery({
    enabled,
    queryFn: () => daemon.listMemories({ limit: INDEX_LIMIT }),
    queryKey: ["memory", "index"],
  });
  return useMemo(
    () => new Map((query.data ?? []).map((memory) => [memory.id, memory])),
    [query.data],
  );
}

/**
 * The links touching one memory, in either direction.
 *
 * @param id The memory id.
 * @returns The edges query.
 */
export function useMemoryEdges(id: string) {
  return useQuery({ queryFn: () => daemon.memoryEdges(id), queryKey: ["memory", "edges", id] });
}

/**
 * Dreaming proposals of every status, newest first.
 *
 * @returns The proposals query.
 */
export function useMemoryProposals() {
  return useQuery({
    queryFn: () => daemon.listMemoryProposals(),
    queryKey: ["memory", "proposals"],
  });
}
