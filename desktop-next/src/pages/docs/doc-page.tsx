import { Button } from "@warpforge/ui/components/button";
import { ToggleGroup, ToggleGroupItem } from "@warpforge/ui/components/toggle-group";
import { cn } from "@warpforge/ui/lib/utils";
import { FileTextIcon } from "lucide-react";
import { useState } from "react";
import { CodeEditor } from "../../components/code-editor";
import { Markdown } from "../../components/markdown";
import { activeTheme, useAppearance } from "../../lib/appearance";
import { formatElapsed } from "../../lib/live-line";
import { useDocMode, type DocMode } from "./use-docs";

/**
 * One page: the rendered markdown, and its source one toggle away. People
 * here read more than they write, so the reading surface comes first.
 */
export function DocPage({
  path,
  updated,
  draft,
  loading,
  error,
  dirty,
  note,
  known,
  wroteIt,
  onDraft,
  onSave,
  onNavigate,
  onOpenLink,
  onOpenTask,
}: {
  path: string;
  updated?: number;
  draft: string;
  loading: boolean;
  error: string | null;
  dirty: boolean;
  note: string;
  known: ReadonlySet<string>;
  wroteIt: string | null;
  onDraft: (text: string) => void;
  onSave: (target: string) => void;
  onNavigate: (path: string) => void;
  onOpenLink: (path: string, line: number) => void;
  onOpenTask: (id: string) => void;
}) {
  const { mode, setMode } = useDocMode();
  const dark = useAppearance((state) => activeTheme(state.themeId).mode === "dark");
  const [pathDraft, setPathDraft] = useState(path);
  const [seenPath, setSeenPath] = useState(path);
  if (seenPath !== path) {
    setSeenPath(path);
    setPathDraft(path);
  }
  const target = pathDraft.trim() || path;
  const go = () => {
    const next = pathDraft.trim();
    if (next && next !== path) onNavigate(next);
  };
  const now = Math.floor(Date.now() / 1000);

  return (
    <div className="flex w-full flex-col gap-4 px-6 py-5">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <FileTextIcon className="size-3.5 shrink-0" />
        <input
          value={pathDraft}
          onChange={(event) => setPathDraft(event.target.value)}
          onBlur={go}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              go();
            }
            if (event.key === "Escape") setPathDraft(path);
          }}
          aria-label="Doc path"
          title="Type a path and press Return to open it, or to start a new page there"
          spellCheck={false}
          className="field-sizing-content min-w-40 max-w-full rounded-sm bg-transparent px-1 font-mono outline-none hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50"
        />
        {updated != null && updated > 0 && (
          <>
            <span aria-hidden>·</span>
            <span>Updated {formatElapsed(updated, now)} ago</span>
          </>
        )}
        {wroteIt && (
          <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => onOpenTask(wroteIt)}>
            Open the task that wrote it
          </Button>
        )}
        <span className="ml-auto flex items-center gap-2">
          {note && <span className={cn(note !== "Saved" && "text-red-600 dark:text-red-400")}>{note}</span>}
          {dirty && !note && <span>Unsaved changes</span>}
          <ToggleGroup
            type="single"
            size="sm"
            variant="outline"
            spacing={0}
            value={mode}
            onValueChange={(next) => next && setMode(next as DocMode)}
            aria-label="Doc view"
          >
            <ToggleGroupItem value="read" className="px-2.5 text-xs">
              Read
            </ToggleGroupItem>
            <ToggleGroupItem value="split" className="px-2.5 text-xs">
              Split
            </ToggleGroupItem>
            <ToggleGroupItem value="edit" className="px-2.5 text-xs">
              Edit
            </ToggleGroupItem>
          </ToggleGroup>
          <Button
            size="sm"
            disabled={loading || (!dirty && target === path)}
            onClick={() => onSave(target)}
            title={target !== path ? `Writes ${target}` : "Save (⌘S)"}
          >
            {target !== path ? "Save as" : "Save"}
          </Button>
        </span>
      </div>

      {error && (
        <p className="text-xs text-muted-foreground">
          {error}. Write below and save to create it.
        </p>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Opening {path}…</p>
      ) : (
        <div className={cn("grid min-h-0 gap-4", mode === "split" && "grid-cols-2")}>
          {mode !== "read" && (
            <CodeEditor
              path={path}
              text={draft}
              dark={dark}
              onChange={onDraft}
              onSave={() => onSave(target)}
              className="min-h-96 overflow-hidden rounded-md border text-sm [&_.cm-editor]:min-h-96 [&_.cm-editor]:outline-none"
            />
          )}
          {mode !== "edit" &&
            (draft.trim() ? (
              <Markdown allowHtml known={known} onOpenFile={onOpenLink} className="min-w-0">
                {draft}
              </Markdown>
            ) : (
              <button
                type="button"
                onClick={() => setMode("split")}
                className="text-left text-sm text-muted-foreground italic hover:text-foreground"
              >
                Nothing written yet. Start writing.
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
