import { relativeTime } from "@/components/backlog/BacklogRow";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Memory } from "@/protocol";

import { scopeLabel, splitSnippet } from "./labels";

/**
 * One memory in the list: what it says (or the matching excerpt, for a search
 * hit), its kind, scope and tags.
 *
 * @param props.memory The memory to show.
 * @param props.selected Whether its detail is open.
 * @param props.onSelect Called with the memory id on click.
 */
export function MemoryRow({
  memory,
  selected,
  onSelect,
}: {
  memory: Memory;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      aria-current={selected ? "true" : undefined}
      onClick={() => onSelect(memory.id)}
      className={cn(
        "flex w-full flex-col gap-1.5 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        selected && "bg-secondary",
      )}
    >
      <p className="line-clamp-3 whitespace-pre-wrap break-words text-[13px] leading-snug">
        {memory.snippet
          ? splitSnippet(memory.snippet).map((run) =>
              run.match ? (
                <mark key={run.at} className="rounded-sm bg-primary/25 px-0.5 text-foreground">
                  {run.text}
                </mark>
              ) : (
                <span key={run.at}>{run.text}</span>
              ),
            )
          : memory.content}
      </p>
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
        <Badge variant="outline">{memory.kind}</Badge>
        <span className="truncate">{scopeLabel(memory)}</span>
        {memory.tags.slice(0, 3).map((tag) => (
          <span key={tag} className="truncate text-muted-foreground/80">
            #{tag}
          </span>
        ))}
        <span className="ml-auto shrink-0 tabular-nums">
          {relativeTime(memory.updatedAt * 1000)}
        </span>
      </div>
    </button>
  );
}
