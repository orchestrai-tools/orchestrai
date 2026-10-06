import type { Memory } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import { Input } from "@warpforge/ui/components/input";
import { Skeleton } from "@warpforge/ui/components/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@warpforge/ui/components/toggle-group";
import { cn } from "@warpforge/ui/lib/utils";
import { SectionLabel } from "../../components/common/page-toolbar";
import { SelectMenu } from "../../components/common/select-menu";
import {
  collectTags,
  filterMemories,
  MEMORY_KINDS,
  scopeLabel,
  type ScopeFilter,
} from "../../lib/memory-labels";
import { InlineText, kindLabel, SnippetText } from "./inline-text";

const SCOPES: readonly { id: ScopeFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "project", label: "This project" },
  { id: "global", label: "Global" },
];

export interface MemoryFilters {
  query: string;
  scope: ScopeFilter;
  kind: string;
  tag: string;
}

function Row({
  memory,
  selected,
  onSelect,
}: {
  memory: Memory;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <li className={cn("rounded-md hover:bg-muted", selected && "bg-muted")}>
      <button
        type="button"
        aria-current={selected ? "true" : undefined}
        onClick={onSelect}
        className="flex w-full min-w-0 flex-col gap-0.5 rounded-md px-2 py-(--row-py) text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="line-clamp-2 text-sm">
          {memory.snippet ? (
            <SnippetText snippet={memory.snippet} />
          ) : (
            <InlineText text={memory.content} />
          )}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {kindLabel(memory.kind)} · {scopeLabel(memory)}
          {memory.tags.slice(0, 3).map((tag) => ` · #${tag}`)}
        </span>
      </button>
    </li>
  );
}

/** Search and filters over the loaded memories, grouped by scope, or ranked by the daemon while searching. */
export function MemoryList({
  rows,
  filters,
  onFilters,
  searchMode,
  loading,
  error,
  hasMore,
  onRetry,
  onMore,
  selectedId,
  onSelect,
  className,
}: {
  rows: readonly Memory[];
  filters: MemoryFilters;
  onFilters: (patch: Partial<MemoryFilters>) => void;
  searchMode: "hybrid" | "fts" | undefined;
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  onRetry: () => void;
  onMore: () => void;
  selectedId: string | undefined;
  onSelect: (id: string) => void;
  className?: string;
}) {
  const searching = filters.query.trim().length > 0;
  const tags = collectTags(rows);
  const shown = filterMemories(rows, { kind: filters.kind, tag: filters.tag, searching });
  const groups = searching
    ? [{ label: `${shown.length} ${shown.length === 1 ? "match" : "matches"}`, items: shown }]
    : [
        { label: "Project", items: shown.filter((row) => row.scope.startsWith("project:")) },
        { label: "Global", items: shown.filter((row) => !row.scope.startsWith("project:")) },
      ].filter((group) => group.items.length > 0);
  const filtered =
    searching || filters.scope !== "all" || filters.kind !== "all" || filters.tag !== "";

  return (
    <section aria-label="Memory entries" className={cn("flex min-w-0 flex-col gap-3", className)}>
      <div className="flex flex-col gap-2">
        <Input
          type="search"
          aria-label="Search memory"
          placeholder="Search memory"
          value={filters.query}
          onChange={(event) => onFilters({ query: event.target.value })}
        />
        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup
            type="single"
            size="sm"
            variant="outline"
            spacing={0}
            value={filters.scope}
            onValueChange={(next) => next && onFilters({ scope: next as ScopeFilter })}
            aria-label="Scope"
          >
            {SCOPES.map((item) => (
              <ToggleGroupItem key={item.id} value={item.id}>
                {item.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <SelectMenu
            label="Kind"
            value={filters.kind}
            className="h-7"
            options={[
              { value: "all", label: "Any kind" },
              ...MEMORY_KINDS.map((kind) => ({ value: kind, label: kindLabel(kind) })),
            ]}
            onChange={(kind) => onFilters({ kind })}
          />
          <SelectMenu
            label="Tag"
            value={filters.tag}
            className="h-7 max-w-40"
            options={[
              { value: "", label: "Any tag" },
              ...tags.map((name) => ({ value: name, label: `#${name}` })),
            ]}
            onChange={(tag) => onFilters({ tag })}
          />
        </div>
        {searchMode && (
          <p className="text-xs text-muted-foreground">
            {searchMode === "hybrid"
              ? "Search matches keywords and meaning."
              : "Search matches keywords."}
          </p>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}{" "}
          <button type="button" className="underline underline-offset-2" onClick={onRetry}>
            Retry
          </button>
        </p>
      )}
      {loading && rows.length === 0 && !error ? (
        <div aria-label="Loading memories" className="flex flex-col gap-2">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </div>
      ) : groups.length === 0 && !error ? (
        <p className="py-6 text-sm text-muted-foreground">
          {filtered
            ? "Nothing matches. Try another word, or clear a filter."
            : "Nothing in memory yet."}
        </p>
      ) : (
        groups.map((group) => (
          <div key={group.label}>
            <SectionLabel className="px-2 pb-1">{group.label}</SectionLabel>
            <ul className="flex flex-col">
              {group.items.map((row) => (
                <Row
                  key={row.id}
                  memory={row}
                  selected={row.id === selectedId}
                  onSelect={() => onSelect(row.id)}
                />
              ))}
            </ul>
          </div>
        ))
      )}
      {hasMore && !searching && (
        <Button variant="outline" size="sm" className="self-start text-xs" onClick={onMore}>
          Load more
        </Button>
      )}
    </section>
  );
}
