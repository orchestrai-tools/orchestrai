import type { BacklogItem, RunnerEntry } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import { Skeleton } from "@warpforge/ui/components/skeleton";
import { useEffect, useRef, type KeyboardEvent } from "react";
import { BacklogRow, type LinkedTask } from "./backlog-row";

interface Props {
  rows: BacklogItem[];
  total: number;
  hasMore: boolean;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onLoadMore: () => void;
  entryOf: (item: BacklogItem) => RunnerEntry | undefined;
  taskOf: (item: BacklogItem) => LinkedTask | undefined;
  selectedId?: string;
  checked: ReadonlySet<string>;
  onSelect: (id: string) => void;
  onCheck: (id: string, on: boolean) => void;
  onPriority: (item: BacklogItem, priority: string) => void;
  onStart: (item: BacklogItem) => void;
  onOpenTask: (id: string) => void;
  empty: string;
}

/** Rows arrive by scrolling, a page at a time: there is no page to be on, so no pager can disagree with the rows. */
export function BacklogList({
  rows,
  total,
  hasMore,
  loading,
  error,
  onRetry,
  onLoadMore,
  entryOf,
  taskOf,
  selectedId,
  checked,
  onSelect,
  onCheck,
  onPriority,
  onStart,
  onOpenTask,
  empty,
}: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasMore || loading) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) onLoadMore();
      },
      { root: scroller.current, rootMargin: "120px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loading, onLoadMore]);

  const move = (event: KeyboardEvent) => {
    const step =
      event.key === "j" || event.key === "ArrowDown" ? 1 : event.key === "k" || event.key === "ArrowUp" ? -1 : 0;
    if (!step || !rows.length || (event.target as HTMLElement).closest("[role=menu]")) return;
    event.preventDefault();
    const index = rows.findIndex((item) => item.id === selectedId);
    const next = rows[Math.min(rows.length - 1, Math.max(0, index + step))];
    if (next) onSelect(next.id);
  };

  return (
    <div
      ref={scroller}
      role="list"
      aria-label="Work items, J and K move"
      tabIndex={0}
      onKeyDown={move}
      className="@container min-h-0 flex-1 overflow-y-auto px-2 pb-4 outline-none"
    >
      {error && (
        <p className="flex items-center gap-2 px-2 py-3 text-sm text-red-600 dark:text-red-400">
          {error}
          <Button variant="outline" size="xs" onClick={onRetry}>
            Retry
          </Button>
        </p>
      )}
      {loading && rows.length === 0 && !error && (
        <div className="flex flex-col gap-2 px-2 py-2" aria-label="Loading work items">
          {[0, 1, 2, 3, 4].map((index) => (
            <Skeleton key={index} className="h-5 w-full" />
          ))}
        </div>
      )}
      {!loading && rows.length === 0 && !error && (
        <p className="px-2 py-8 text-center text-sm text-muted-foreground">{empty}</p>
      )}
      {rows.map((item) => (
        <BacklogRow
          key={item.id}
          item={item}
          entry={entryOf(item)}
          task={taskOf(item)}
          selected={item.id === selectedId}
          checked={checked.has(item.id)}
          selecting={checked.size > 0}
          onSelect={() => onSelect(item.id)}
          onCheck={(on) => onCheck(item.id, on)}
          onPriority={(priority) => onPriority(item, priority)}
          onStart={() => onStart(item)}
          onOpenTask={onOpenTask}
        />
      ))}
      {hasMore && (
        <div ref={sentinel} className="flex flex-col gap-2 px-2 py-2" aria-label="Loading more">
          {loading && [0, 1, 2].map((index) => <Skeleton key={index} className="h-5 w-full" />)}
        </div>
      )}
      {!hasMore && rows.length > 0 && total > 50 && (
        <p className="py-3 text-center text-xs text-muted-foreground">End of backlog · {total} items</p>
      )}
    </div>
  );
}
