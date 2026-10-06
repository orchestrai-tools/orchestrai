import { ensureTask, loadTask, setTaskDiff } from "@warpforge/core/sessionStore";
import { daemon } from "@warpforge/daemon";
import { Button } from "@warpforge/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@warpforge/ui/components/dropdown-menu";
import { ToggleGroup, ToggleGroupItem } from "@warpforge/ui/components/toggle-group";
import { ChevronsDownUpIcon, ChevronsUpDownIcon, EllipsisIcon, FileCheck2Icon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import type { ConfirmRequest } from "../../components/common/confirm-dialog";
import { attachFileDiff } from "../../lib/composer-chips";
import { loadNotes, saveNote, type DiffNote } from "../../lib/diff-notes";
import { collapsedAfterToggle, useDiffScroll } from "../../lib/diff-session";
import { toUnifiedPatch } from "../../lib/file-patch";
import { useShell } from "../../lib/shell-store";
import { diffLines, hunkHeader, noteSnippet } from "./diff-lines";
import { DiffView } from "./diff-view";
import { copyText, discardRequest, resolveHunk } from "./file-ops";
import { splitPath, STATUS_WORD, type ChangedFile } from "./tree";
import type { RepoTarget } from "../../lib/repo-target";
import type { BundleMode, DiffMode } from "./use-changes";

interface Props {
  target: RepoTarget;
  /** The open task, for diff notes and the saved scroll; empty on the project checkout. */
  taskId: string;
  project: string;
  worktree?: string;
  file?: ChangedFile;
  branch?: string | null;
  mode: DiffMode;
  setMode: (mode: DiffMode) => void;
  onConfirm: (request: ConfirmRequest) => void;
  onBundle?: (mode: BundleMode, paths: string[]) => void;
  onRefresh: () => void;
}

/** The selected file's diff, with the notes bar above it when the file has notes for the agent. */
export function DiffPane({
  target,
  taskId,
  project,
  worktree,
  file,
  branch,
  mode,
  setMode,
  onConfirm,
  onBundle,
  onRefresh,
}: Props) {
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const [notes, setNotes] = useState<DiffNote[]>([]);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  useDiffScroll(taskId, project, worktree, scroller);

  useEffect(() => {
    let cancel = false;
    void loadTask(taskId, project, worktree).then((session) => {
      if (!cancel) setCollapsed(session.diff.collapsedFiles);
    });
    return () => {
      cancel = true;
    };
  }, [taskId, project, worktree]);

  const path = file?.path;
  useEffect(() => {
    setNotes(path ? loadNotes(taskId).filter((note) => note.path === path) : []);
  }, [taskId, path]);

  if (!file) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
        <FileCheck2Icon className="size-5 text-muted-foreground" />
        <p className="text-sm font-medium">Nothing to commit</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          {branch
            ? `${branch} has no uncommitted changes.`
            : "This worktree has no uncommitted changes."}
        </p>
      </div>
    );
  }

  const { dir, name } = splitPath(file.path);
  const open = !collapsed.includes(file.path);
  const toggleOpen = () => {
    const next = collapsedAfterToggle(
      ensureTask(taskId, project, worktree).diff.collapsedFiles,
      file.path,
      !open,
    );
    setCollapsed(next);
    setTaskDiff(taskId, project, { collapsedFiles: next }, worktree);
  };

  async function sendNote(hunkIndex: number, lineIndex: number, body: string) {
    const noted = file!;
    const hunk = noted.diff.hunks[hunkIndex]!;
    const anchor = noteSnippet(hunk.lines, lineIndex);
    const line = diffLines(hunk).find((entry) => entry.index === lineIndex);
    const at = line?.newNo ?? line?.oldNo;
    try {
      await daemon.request("session.prompt", {
        task_id: taskId,
        attachments: [],
        text: `Note on ${noted.path}${at ? `:${at}` : ""}:\n${body}\n\n${anchor.snippet.join("\n")}`,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send the note");
      return false;
    }
    saveNote(taskId, { id: `${Date.now()}`, path: noted.path, body, ...anchor });
    setNotes(loadNotes(taskId).filter((note) => note.path === noted.path));
    toast.success("Sent the note");
    return true;
  }

  const rejectHunk = (index: number) => {
    const hunk = file.diff.hunks[index]!;
    onConfirm({
      title: `Reject this change in ${name}?`,
      description:
        "Only these lines go back to the last commit; the rest of the file keeps your edits.",
      items: [hunkHeader(hunk)],
      confirmLabel: "Reject change",
      destructive: true,
      onConfirm: () => void resolveHunk(target, file.path, index, "reject", onRefresh),
    });
  };

  return (
    <article className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-10 items-center gap-3 border-b px-4">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="shrink-0 text-xs text-muted-foreground">{STATUS_WORD[file.status]}</span>
          <span className="truncate font-mono text-sm" title={file.path}>
            <span className="text-muted-foreground">{dir}</span>
            {name}
          </span>
          {file.diff.oldPath && file.diff.oldPath !== file.path && (
            <span className="truncate text-xs text-muted-foreground">from {file.diff.oldPath}</span>
          )}
        </div>
        <span className="ml-auto shrink-0 font-mono text-xs tabular-nums">
          <span className="text-emerald-600 dark:text-emerald-400">+{file.additions}</span>{" "}
          <span className="text-red-600 dark:text-red-400">−{file.deletions}</span>
        </span>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          spacing={0}
          value={mode}
          onValueChange={(next) => next && setMode(next as DiffMode)}
          aria-label="Diff layout"
        >
          <ToggleGroupItem value="unified" className="px-3 text-xs">
            Unified
          </ToggleGroupItem>
          <ToggleGroupItem value="split" className="px-3 text-xs">
            Split
          </ToggleGroupItem>
        </ToggleGroup>
        <Button variant="outline" size="sm" onClick={() => attachFileDiff(project, file.diff)}>
          Add to chat
        </Button>
        <Button variant="ghost" size="icon-sm" aria-expanded={open} onClick={toggleOpen}>
          {open ? <ChevronsDownUpIcon /> : <ChevronsUpDownIcon />}
          <span className="sr-only">{open ? "Collapse" : "Expand"}</span>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`More for ${name}`}>
              <EllipsisIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuItem
              onSelect={() => useShell.getState().setFileJump({ path: file.path, line: 0 })}
            >
              Jump to source
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => copyText(file.path, "path")}>
              Copy path
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => copyText(toUnifiedPatch(file.diff), "patch")}>
              Copy as patch
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {onBundle && (
              <>
                <DropdownMenuItem onSelect={() => onBundle("shelf", [file.path])}>
                  Shelve…
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onBundle("stash", [file.path])}>
                  Stash…
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => onConfirm(discardRequest(target, [file], onRefresh))}
            >
              {file.untracked ? "Delete file…" : "Discard changes…"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {notes.length > 0 && (
        <div className="flex items-center gap-3 border-b bg-muted/30 px-4 py-1.5 text-xs">
          <span className="min-w-0 truncate text-muted-foreground">
            {notes.length} {notes.length === 1 ? "note" : "notes"} sent on this file
          </span>
          <Button
            size="xs"
            variant="outline"
            className="ml-auto"
            onClick={() =>
              copyText(notes.map((note) => `${note.path} — ${note.body}`).join("\n"), "notes")
            }
          >
            Copy as a prompt
          </Button>
        </div>
      )}
      <div ref={setScroller} className="min-h-0 flex-1 overflow-auto">
        {open ? (
          <DiffView
            key={file.path}
            file={file}
            mode={mode}
            notes={notes}
            onNote={sendNote}
            onAccept={(index) => void resolveHunk(target, file.path, index, "accept", onRefresh)}
            onReject={rejectHunk}
          />
        ) : (
          <p className="p-4 text-xs text-muted-foreground">The diff is collapsed.</p>
        )}
      </div>
    </article>
  );
}
