import { daemon } from "@warpforge/daemon";
import type { ProjectFile, SymbolMatch } from "@warpforge/protocol";
import {
  CommandDialog,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@warpforge/ui/components/command";
import { Skeleton } from "@warpforge/ui/components/skeleton";
import { FileIcon, LoaderIcon, TextSearchIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { rankFiles } from "../../lib/file-rank";
import { highlightSegments } from "../../lib/file-search";
import { fileTaskId, useShell } from "../../lib/shell-store";
import { useDaemon } from "../../lib/use-daemon";

/** Lists the selected worktree's files while quick open is showing. */
function useFiles(open: boolean, project: string | null, taskId: string) {
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open || !project) {
      setFiles([]);
      setError(null);
      return;
    }
    let live = true;
    setLoading(true);
    void daemon
      .request("file.list", taskId ? { project, task_id: taskId } : { project })
      .then(
        (result) => {
          if (!live) return;
          setFiles(Array.isArray(result) ? (result as ProjectFile[]) : []);
          setError(null);
        },
        (err: unknown) => live && setError(err instanceof Error ? err.message : "Could not list files"),
      )
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [open, project, taskId]);
  return { files, error, loading };
}

/** Searches file contents once the query is three characters long. */
function useTextMatches(open: boolean, project: string | null, taskId: string, query: string) {
  const [matches, setMatches] = useState<SymbolMatch[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    if (!open || !project || query.trim().length < 3) {
      setMatches([]);
      setSearching(false);
      return;
    }
    let live = true;
    setSearching(true);
    const timer = window.setTimeout(() => {
      void daemon
        .request("file.search", { project, query, limit: 12, task_id: taskId })
        .then(
          (result) => {
            if (!live) return;
            if (!Array.isArray(result)) throw new Error("Could not search files");
            setMatches(result as SymbolMatch[]);
            setError(null);
          },
          (err: unknown) => live && setError(err instanceof Error ? err.message : "Could not search files"),
        )
        .finally(() => live && setSearching(false));
    }, 150);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [open, project, taskId, query]);
  return { matches, error, searching };
}

/** ⌘P: file names first, marking ones with uncommitted changes, then text hits under them. */
export function QuickOpen() {
  const shell = useShell();
  const tasks = useDaemon().snapshot.tasks;
  const open = shell.palette && shell.paletteMode === "files";
  const taskId = fileTaskId(shell, tasks);
  const [query, setQuery] = useState("");
  const files = useFiles(open, shell.project, taskId);
  const text = useTextMatches(open, shell.project, taskId, query);
  const close = () => useShell.setState({ palette: false });
  const named = query.trim() ? rankFiles(files.files, query.trim()).slice(0, 20) : files.files.slice(0, 12);

  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  const jump = (path: string, line: number) => {
    close();
    shell.setFileJump({ path, line });
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => !next && close()}
      title="Quick open"
      description="Open a file by name or by text in it."
      shouldFilter={false}
    >
      <CommandInput value={query} onValueChange={setQuery} placeholder="Open a file by name or text…" />
      <CommandList>
        {files.loading && (
          <div className="flex flex-col gap-2 p-3" aria-label="Loading files">
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="h-5 w-full" />
            ))}
          </div>
        )}
        {named.length > 0 && (
          <CommandGroup heading="Files">
            {named.map((file) => (
              <CommandItem key={file.path} value={`file:${file.path}`} onSelect={() => jump(file.path, 0)}>
                <FileIcon />
                <span className="truncate font-mono text-xs">{file.path}</span>
                {file.changed && (
                  <span className="ml-auto text-[11px] text-emerald-600 dark:text-emerald-400">changed</span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {text.matches.length > 0 && (
          <CommandGroup heading="Text">
            {text.matches.map((match) => (
              <CommandItem
                key={`${match.path}:${match.line}:${match.column}`}
                value={`match:${match.path}:${match.line}:${match.column}`}
                onSelect={() => jump(match.path, Math.max(0, match.line - 1))}
              >
                <TextSearchIcon />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-mono text-[11px] text-muted-foreground">
                    {match.path}:{match.line}
                  </span>
                  <span className="truncate font-mono text-xs">
                    {highlightSegments(match.text, query.trim()).map((segment) =>
                      segment.hit ? (
                        <mark key={segment.start} className="rounded-sm bg-amber-300/50 text-inherit">
                          {segment.text}
                        </mark>
                      ) : (
                        <span key={segment.start}>{segment.text}</span>
                      ),
                    )}
                  </span>
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {text.searching && text.matches.length === 0 && (
          <p className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
            <LoaderIcon className="size-3 animate-spin" />
            Searching text
          </p>
        )}
        {(files.error || text.error) && (
          <p className="px-3 py-2 text-xs text-destructive">{files.error ?? text.error}</p>
        )}
        {!files.loading && !text.searching && named.length === 0 && text.matches.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {shell.project ? "No files match." : "Open a project first."}
          </p>
        )}
      </CommandList>
    </CommandDialog>
  );
}
