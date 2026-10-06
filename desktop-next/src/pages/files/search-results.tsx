import { loadProject, loadTask, setProjectFind, setTaskFind } from "@warpforge/core/sessionStore";
import type { SymbolMatch } from "@warpforge/protocol";
import { cn } from "@warpforge/ui/lib/utils";
import { FileIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { findIndexToRestore } from "../../lib/file-tabs";
import { groupMatchesByFile, stepMatch } from "../../lib/file-search";
import { Highlight, SearchPreview } from "./search-preview";

/**
 * Find-in-files hits grouped by file. Arrow keys in the find field move the
 * selection, Return opens it, and the lines around it show underneath.
 */
export function SearchResults({
  query,
  matches,
  project,
  taskId,
  worktree,
  onPick,
}: {
  query: string;
  matches: SymbolMatch[];
  project: string;
  taskId: string;
  worktree: string | undefined;
  onPick: (match: SymbolMatch) => void;
}) {
  const groups = groupMatchesByFile(matches);
  const flat = groups.flatMap((group) => group.matches);
  const [active, setActive] = useState(0);
  const searched = useRef(query);
  const queryRef = useRef(query);
  const ready = useRef(false);
  queryRef.current = query;

  useEffect(() => {
    searched.current = queryRef.current;
    ready.current = false;
    let cancel = false;
    const loaded = taskId ? loadTask(taskId, project, worktree) : loadProject(project);
    void loaded.then((session) => {
      if (cancel) return;
      const stored = session.findInFiles;
      setActive(
        findIndexToRestore(stored?.activeIndex ?? 0, flat.length, !!stored && stored.query.trim() === query.trim()),
      );
      ready.current = true;
    });
    return () => {
      cancel = true;
    };
  }, [matches, query, taskId, project, worktree, flat.length]);

  useEffect(() => {
    if (!ready.current || !query.trim()) return;
    const find = { activeIndex: active, query, updatedAt: Date.now() };
    if (taskId) setTaskFind(taskId, project, find, worktree);
    else setProjectFind(project, find);
  }, [active, query, taskId, project, worktree]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const input = document.getElementById("file-find");
      if (document.activeElement !== input || flat.length === 0) return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        setActive((index) => stepMatch(index, flat.length, event.key === "ArrowDown" ? 1 : -1));
        return;
      }
      if (event.key !== "Enter" || !(input instanceof HTMLInputElement)) return;
      // Return before the new search lands would open a hit of the previous query.
      if (input.value.trim() !== searched.current.trim()) return;
      event.preventDefault();
      event.stopPropagation();
      const match = flat[active];
      if (match) onPick(match);
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [active, flat, onPick]);

  let index = -1;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <p className="px-3 pb-1.5 text-xs text-muted-foreground tabular-nums">
        {matches.length} {matches.length === 1 ? "result" : "results"} in {groups.length}{" "}
        {groups.length === 1 ? "file" : "files"}
      </p>
      <div aria-label="Search results" className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
        {groups.map((group) => (
          <section key={group.path} className="mb-1">
            <h3 className="flex items-center gap-1.5 px-1.5 py-(--row-py) text-sm" title={group.path}>
              <FileIcon className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{group.path}</span>
              <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">{group.matches.length}</span>
            </h3>
            {group.matches.map((match) => {
              index += 1;
              const current = index;
              return (
                <button
                  key={`${match.path}:${match.line}:${match.column}`}
                  type="button"
                  aria-current={current === active ? "true" : undefined}
                  onMouseEnter={() => setActive(current)}
                  onClick={() => onPick(match)}
                  className={cn(
                    "flex w-full items-baseline gap-2 rounded-sm py-(--row-py) pr-2 pl-7 text-left font-mono text-xs",
                    current === active ? "bg-muted" : "hover:bg-muted/50",
                  )}
                >
                  <span className="w-8 shrink-0 text-right text-muted-foreground tabular-nums">{match.line}</span>
                  <span className="truncate">
                    <Highlight text={match.text.trim()} query={query} />
                  </span>
                </button>
              );
            })}
          </section>
        ))}
      </div>
      <SearchPreview
        match={flat[Math.min(active, Math.max(flat.length - 1, 0))] ?? null}
        query={query}
        project={project}
        taskId={taskId}
      />
    </div>
  );
}
