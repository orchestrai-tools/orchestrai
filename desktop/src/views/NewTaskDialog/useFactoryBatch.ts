import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import type { WorkItem, WorkItemSource, WorkItemStatus } from "@/components/backlog/types";
import { daemon } from "@/daemon";

/**
 * Backlog items the New Task dialog starts in Factory in one go: several
 * picked items, or the batch form's filter over the whole backlog.
 */
export type FactorySeed =
  | { kind: "items"; items: WorkItem[] }
  | { kind: "batch"; selected: WorkItem[] };

export interface BatchFilter {
  status: WorkItemStatus | "all";
  source: WorkItemSource | "all";
  search: string;
}

const PAGE = 100;

function query(project: string, filter: BatchFilter, page: number, pageSize: number) {
  return daemon.listBacklog({
    page,
    pageSize,
    project,
    search: filter.search.trim(),
    sortBy: "priority",
    sortDesc: true,
    source: filter.source === "all" ? undefined : filter.source,
    status: filter.status === "all" ? undefined : filter.status,
  });
}

/**
 * Which backlog items a Factory batch covers, and how many.
 * @param seed What the dialog was opened with.
 * @param project The items' project.
 * @returns The scope, the filter and its setters, the count, and a function
 *   that lists every covered item id when the batch is confirmed.
 */
export function useFactoryBatch(seed: FactorySeed, project: string) {
  const selected = seed.kind === "items" ? seed.items : seed.selected;
  const [scope, setScope] = useState<"filter" | "selected">(
    seed.kind === "items" ? "selected" : "filter",
  );
  const [filter, setFilter] = useState<BatchFilter>({ search: "", source: "all", status: "todo" });
  const matching = useQuery({
    enabled: scope === "filter",
    queryFn: () => query(project, filter, 0, 1),
    queryKey: ["backlog", project, "factory-batch", filter],
  });
  const count = scope === "selected" ? selected.length : (matching.data?.total ?? null);

  const resolveIds = async (): Promise<string[]> => {
    if (scope === "selected") return selected.map((item) => item.id);
    const ids: string[] = [];
    for (let page = 0; ; page += 1) {
      // oxlint-disable-next-line no-await-in-loop -- each page says whether another follows
      const result = await query(project, filter, page, PAGE);
      ids.push(...result.items.map((item) => item.id));
      if (!result.hasNextPage) return ids;
    }
  };

  return {
    count,
    filter,
    patchFilter: (next: Partial<BatchFilter>) => setFilter((current) => ({ ...current, ...next })),
    resolveIds,
    scope,
    selected,
    setScope,
  };
}

export type FactoryBatch = ReturnType<typeof useFactoryBatch>;
