import { daemon } from "@warpforge/daemon";
import type { FileDiff, ShelfDiff, StashDiff } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import { cn } from "@warpforge/ui/lib/utils";
import { useEffect, useState } from "react";

import { targetKey, type RepoTarget } from "../../lib/repo-target";
import { STATUS_TONE, plural, statusLetter } from "./tree";
import type { Bundle } from "./use-bundles";
import type { BundleMode } from "./use-changes";

/** Entries on the left of the rail, the selected one's files and a read-only preview under it. */
export function BundleList({
  target,
  kind,
  entries,
  empty,
  note,
  labels,
  onApply,
  onApplyDrop,
  onDrop,
  onRestoreFile,
}: {
  target: RepoTarget;
  kind: BundleMode;
  entries: Bundle[];
  empty: string;
  note?: string;
  labels: { apply: string; applyDrop: string; drop: string };
  onApply: (entry: Bundle) => void;
  onApplyDrop: (entry: Bundle) => void;
  onDrop: (entry: Bundle) => void;
  onRestoreFile?: (entry: Bundle, path: string) => void;
}) {
  const [selectedId, setSelectedId] = useState<string>();
  const [previewPath, setPreviewPath] = useState<string>();
  const [diffs, setDiffs] = useState<FileDiff[]>([]);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const selected = entries.find((entry) => entry.id === selectedId) ?? entries[0];
  const preview = diffs.find((file) => file.path === previewPath) ?? diffs[0];

  useEffect(() => {
    setDiffs([]);
    setPreviewError(null);
    if (!selected) return;
    let cancel = false;
    void daemon
      .request(kind === "shelf" ? "shelf.get" : "stash.get", { ...target, id: selected.id })
      .then((result) => {
        if (!cancel) setDiffs((result as ShelfDiff | StashDiff).files ?? []);
      })
      .catch((err: unknown) => {
        if (!cancel)
          setPreviewError(err instanceof Error ? err.message : "Could not load the preview");
      });
    return () => {
      cancel = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, kind, targetKey(target)]);

  if (!entries.length) return <p className="px-3 py-2 text-xs text-muted-foreground">{empty}</p>;

  const status = (path: string) => {
    const diff = diffs.find((file) => file.path === path);
    return diff ? statusLetter(diff.status) : null;
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-1.5 pb-2">
      <ul>
        {entries.map((entry) => (
          <li key={entry.id}>
            <button
              type="button"
              onClick={() => {
                setSelectedId(entry.id);
                setPreviewPath(undefined);
              }}
              className={cn(
                "flex w-full flex-col rounded-sm px-2 py-(--row-py) text-left",
                entry === selected ? "bg-muted" : "hover:bg-muted/50",
              )}
            >
              <span className="truncate text-sm font-medium">{entry.title || entry.id}</span>
              <span className="truncate text-xs text-muted-foreground">
                {[
                  kind === "stash" ? entry.id : null,
                  new Date(entry.createdAt * 1000).toLocaleString(),
                  entry.branch,
                  plural(entry.files.length, "file"),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {selected && (
        <div className="mt-2 flex flex-col gap-2 border-t px-2 pt-2">
          <div className="flex flex-wrap gap-1">
            <Button size="xs" variant="outline" onClick={() => onApply(selected)}>
              {labels.apply}
            </Button>
            <Button size="xs" variant="outline" onClick={() => onApplyDrop(selected)}>
              {labels.applyDrop}
            </Button>
            <Button
              size="xs"
              variant="ghost"
              className="ml-auto text-red-600 dark:text-red-400"
              onClick={() => onDrop(selected)}
            >
              {labels.drop}
            </Button>
          </div>
          <ul>
            {selected.files.map((path) => {
              const letter = status(path);
              return (
                <li key={path} className="group/row flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPreviewPath(path)}
                    className={cn(
                      "flex min-w-0 flex-1 items-center gap-1.5 rounded-sm px-1 py-0.5 text-left text-xs",
                      path === preview?.path ? "bg-muted" : "hover:bg-muted/50",
                    )}
                  >
                    <span className={cn("w-3 shrink-0 font-mono", letter && STATUS_TONE[letter])}>
                      {letter ?? ""}
                    </span>
                    <span className="truncate font-mono">{path}</span>
                  </button>
                  {onRestoreFile && (
                    <Button
                      size="xs"
                      variant="ghost"
                      className="opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100"
                      onClick={() => onRestoreFile(selected, path)}
                    >
                      Restore
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
          {selected.deletedFiles.length > 0 && (
            <div className="flex flex-col gap-0.5">
              <p className="text-xs font-medium text-muted-foreground">Recently deleted</p>
              {selected.deletedFiles.map((path) => (
                <span
                  key={path}
                  className="truncate px-1 font-mono text-xs text-muted-foreground line-through"
                >
                  {path}
                </span>
              ))}
            </div>
          )}
          {previewError && <p className="text-xs text-red-600 dark:text-red-400">{previewError}</p>}
          {preview && <MiniDiff file={preview} />}
        </div>
      )}
      {note && <p className="mt-auto px-2 pt-3 text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}

/** A read-only preview: what applying this entry would put back. */
function MiniDiff({ file }: { file: FileDiff }) {
  const lines = file.hunks.flatMap((hunk) => hunk.lines);
  if (lines.length === 0)
    return <p className="text-xs text-muted-foreground">No text changes in this file.</p>;
  return (
    <div className="max-h-64 overflow-auto rounded-sm bg-muted/40 py-1 font-mono text-xs leading-4">
      {lines.map((line, index) => (
        <div
          key={index}
          className={cn(
            "px-2 whitespace-pre",
            line.startsWith("+") && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
            line.startsWith("-") && "bg-red-500/10 text-red-700 dark:text-red-300",
          )}
        >
          {line.startsWith("-") ? `−${line.slice(1)}` : line}
        </div>
      ))}
    </div>
  );
}
