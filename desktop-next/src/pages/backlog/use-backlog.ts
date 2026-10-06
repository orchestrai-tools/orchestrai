import { daemon } from "@warpforge/daemon";
import type { BacklogItem, ItemRun, ProjectSources, RunnerStatus } from "@warpforge/protocol";
import { useCallback, useEffect, useRef, useState } from "react";
import type { BacklogView } from "../../lib/migrate-warpforge";
import { TRACKER_SYNCED_EVENT } from "../../lib/tracker-sync";
import { useDaemon } from "../../lib/use-daemon";

export type SortKey = "updated" | "priority" | "status" | "number" | "title";

/** Empty strings mean "any": the daemon filters and sorts, a page at a time. */
export interface BacklogFilters {
  query: string;
  status: string;
  priority: string;
  source: string;
  assignee: string;
  sort: SortKey;
  descending: boolean;
}

export const IDLE_FILTERS: BacklogFilters = {
  query: "",
  status: "",
  priority: "",
  source: "",
  assignee: "",
  sort: "updated",
  descending: true,
};

export const SORT_LABEL: Record<SortKey, string> = {
  updated: "Updated",
  priority: "Priority",
  status: "Status",
  number: "Number",
  title: "Title",
};

export function isNarrowed(filters: BacklogFilters) {
  return Boolean(filters.query || filters.status || filters.priority || filters.source || filters.assignee);
}

export function filtersFromView(view: BacklogView | undefined): BacklogFilters {
  if (!view) return IDLE_FILTERS;
  const sort = (view.sortBy in SORT_LABEL ? view.sortBy : "updated") as SortKey;
  return {
    query: view.search ?? "",
    status: view.status === "open" ? "" : (view.status ?? ""),
    priority: view.priority ?? "",
    source: view.source ?? "",
    assignee: view.assignee ?? "",
    sort,
    descending: view.sortDesc ?? true,
  };
}

export function viewFromFilters(filters: BacklogFilters): BacklogView {
  return {
    search: filters.query,
    status: filters.status,
    priority: filters.priority,
    source: filters.source,
    assignee: filters.assignee,
    sortBy: filters.sort,
    sortDesc: filters.descending,
  };
}

const PAGE_SIZE = 50;

const message = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);

/** One project's backlog under the given filters: rows arrive a page at a time as the list scrolls. */
export function useBacklogItems(project: string, filters: BacklogFilters) {
  const [items, setItems] = useState<BacklogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assignees, setAssignees] = useState<string[]>([]);
  const [query, setQuery] = useState(filters.query);
  const generation = useRef(0);
  const page = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(filters.query), 250);
    return () => clearTimeout(timer);
  }, [filters.query]);

  const fetchPage = useCallback(
    (next: number) => {
      const run = ++generation.current;
      setLoading(true);
      daemon
        .listBacklog({
          project,
          page: next,
          pageSize: PAGE_SIZE,
          search: query || undefined,
          status: filters.status || undefined,
          priority: filters.priority || undefined,
          source: filters.source || undefined,
          assignee: filters.assignee || undefined,
          sortBy: filters.sort,
          sortDesc: filters.descending,
        })
        .then((result) => {
          if (run !== generation.current) return;
          const rows = Array.isArray(result.items) ? result.items : [];
          page.current = next;
          setItems((current) => (next === 0 ? rows : [...current, ...rows.filter((row) => !current.some((item) => item.id === row.id))]));
          setTotal(result.total ?? rows.length);
          setHasMore(Boolean(result.hasNextPage));
          setAssignees((current) => {
            const names = new Set(current);
            for (const item of rows) if (item.assignee) names.add(item.assignee);
            return [...names].sort((a, b) => a.localeCompare(b));
          });
          setError(null);
        })
        .catch((err: unknown) => {
          if (run === generation.current) setError(message(err, "Could not load the backlog"));
        })
        .finally(() => {
          if (run === generation.current) setLoading(false);
        });
    },
    [project, query, filters.status, filters.priority, filters.source, filters.assignee, filters.sort, filters.descending],
  );

  useEffect(() => {
    fetchPage(0);
  }, [fetchPage]);

  useEffect(() => {
    const onSynced = (event: Event) => {
      if ((event as CustomEvent<string>).detail === project) fetchPage(0);
    };
    window.addEventListener(TRACKER_SYNCED_EVENT, onSynced);
    return () => window.removeEventListener(TRACKER_SYNCED_EVENT, onSynced);
  }, [fetchPage, project]);

  const reload = useCallback(() => fetchPage(0), [fetchPage]);
  const loadMore = useCallback(() => {
    if (hasMore && !loading) fetchPage(page.current + 1);
  }, [fetchPage, hasMore, loading]);
  const replace = useCallback((item: BacklogItem) => {
    setItems((current) => current.map((row) => (row.id === item.id ? item : row)));
  }, []);

  return { items, total, hasMore, loading, error, assignees, reload, loadMore, replace };
}

/**
 * Which trackers this project can read and write. Linear counts only once a
 * team is mapped to the project, GitHub only once its folder resolves to a
 * repository. `undefined` while loading or when the daemon cannot say.
 */
export function useProjectSources(project: string) {
  const [sources, setSources] = useState<ProjectSources>();
  useEffect(() => {
    let live = true;
    setSources(undefined);
    daemon
      .trackerProjectSources(project)
      .then((next) => live && setSources(next))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [project]);
  return sources;
}

/** The project's Factory: the queue, why it waits, and the finished runs. */
export function useFactory(project: string) {
  const [status, setStatus] = useState<RunnerStatus | null>(null);
  const [runs, setRuns] = useState<ItemRun[]>([]);
  const [error, setError] = useState<string | null>(null);
  const tasks = useDaemon().snapshot.tasks;
  const pulse = tasks
    .filter((task) => task.project === project && task.tags.includes("runner"))
    .map((task) => `${task.id}:${task.status}:${task.workflowRun?.stage ?? ""}`)
    .join(",");

  const reload = useCallback(() => {
    void Promise.all([daemon.runnerStatus(project), daemon.runnerRuns(project)])
      .then(([next, finished]) => {
        setStatus(next);
        setRuns(finished);
        setError(null);
      })
      .catch((err: unknown) => setError(message(err, "Could not load the Factory")));
  }, [project]);

  useEffect(() => {
    reload();
  }, [reload, pulse]);

  return { status, entries: status?.entries ?? [], runs, error, reload, setStatus };
}

export type Factory = ReturnType<typeof useFactory>;
