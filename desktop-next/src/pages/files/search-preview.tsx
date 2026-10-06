import { daemon } from "@warpforge/daemon";
import type { FileDoc, SymbolMatch } from "@warpforge/protocol";
import { cn } from "@warpforge/ui/lib/utils";
import { useEffect, useRef, useState } from "react";
import { highlightSegments, previewWindow } from "../../lib/file-search";

/** `text` with every occurrence of `query` marked. */
export function Highlight({ text, query }: { text: string; query: string }) {
  return highlightSegments(text, query).map((segment) =>
    segment.hit ? (
      <mark key={segment.start} className="rounded-xs bg-amber-200 text-foreground dark:bg-amber-500/40">
        {segment.text}
      </mark>
    ) : (
      <span key={segment.start}>{segment.text}</span>
    ),
  );
}

/** The lines around the selected find-in-files hit. */
export function SearchPreview({
  match,
  query,
  project,
  taskId,
}: {
  match: SymbolMatch | null;
  query: string;
  project: string;
  taskId: string;
}) {
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const cache = useRef(new Map<string, string>());
  const path = match?.path ?? null;

  useEffect(() => {
    if (!path || !project) {
      setText(null);
      return;
    }
    const cached = cache.current.get(path);
    if (cached !== undefined) {
      setText(cached);
      setFailed(false);
      return;
    }
    let cancelled = false;
    void daemon
      .request("file.contents", { project, path, task_id: taskId })
      .then((result) => {
        const next = (result as FileDoc).newText ?? "";
        cache.current.set(path, next);
        if (!cancelled) {
          setText(next);
          setFailed(false);
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [path, project, taskId]);

  if (!match) return null;
  const window = text === null ? null : previewWindow(text, match.line);
  return (
    <div aria-label="Search preview" className="border-t bg-muted/30 px-1.5 py-2">
      {failed && <p className="px-1.5 text-xs text-muted-foreground">No preview for {match.path}</p>}
      {window && (
        <pre className="overflow-x-auto font-mono text-xs leading-5">
          {window.lines.map((line, index) => {
            const number = window.firstLine + index;
            return (
              <div key={number} className={cn("flex gap-2 rounded-sm px-1.5", number === match.line && "bg-muted")}>
                <span className="w-8 shrink-0 text-right text-muted-foreground tabular-nums">{number}</span>
                <span>
                  <Highlight text={line} query={query} />
                </span>
              </div>
            );
          })}
        </pre>
      )}
    </div>
  );
}
