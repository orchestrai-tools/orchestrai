import { daemon } from "@warpforge/daemon";
import type { FileDiff } from "@warpforge/protocol";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { create } from "zustand";
import { toUnifiedPatch } from "./file-patch";
import { useFolderPalette } from "./folder-palette";
import { reportGitFailure } from "./git-result";
import { targetKey, type RepoTarget } from "./repo-target";
import { commitPaletteActions } from "./commit-palette";
import { shelfEntryActions, type ShelfEntry } from "./shelf-entry";
import { useShell } from "./shell-store";
import type { PaletteAction } from "./task-palette";

type ChangesPane = "diff" | "shelf" | "stash" | "worktrees";

/** The Changes file menu opens its delete confirm for this untracked path. */
export const useDeleteFileAsk = create<{
  path: string | null;
  ask: (path: string) => void;
  clear: () => void;
}>((set) => ({
  path: null,
  ask: (path) => set({ path }),
  clear: () => set({ path: null }),
}));

/** Bumps when the palette asks the Changes diff to load again. */
export const useChangesRefresh = create<{ tick: number; refresh: () => void }>((set) => ({
  tick: 0,
  refresh: () => set((state) => ({ tick: state.tick + 1 })),
}));

/** Bumps after a git action on the Changes page, so other views re-read the branch. */
export const useCheckoutChanged = create<{ tick: number; bump: () => void }>((set) => ({
  tick: 0,
  bump: () => set((state) => ({ tick: state.tick + 1 })),
}));

/** The Changes page applies this layout. The palette sets it from any page. */
export const useDiffLayout = create<{
  view: "unified" | "split" | null;
  flat: boolean | null;
  stage: "all" | "none" | null;
  stageFile: { path: string; on: boolean } | null;
  armRollback: boolean;
  showView: (view: "unified" | "split") => void;
  showFlat: (flat: boolean) => void;
  showStage: (stage: "all" | "none") => void;
  showStageFile: (path: string, on: boolean) => void;
  armRollbackNow: () => void;
  clearView: () => void;
  clearFlat: () => void;
  clearStage: () => void;
  clearStageFile: () => void;
  clearArm: () => void;
}>((set) => ({
  view: null,
  flat: null,
  stage: null,
  stageFile: null,
  armRollback: false,
  showView: (view) => set({ view }),
  showFlat: (flat) => set({ flat }),
  showStage: (stage) => set({ stage }),
  showStageFile: (path, on) => set({ stageFile: { path, on } }),
  armRollbackNow: () => set({ armRollback: true }),
  clearView: () => set({ view: null }),
  clearFlat: () => set({ flat: null }),
  clearStage: () => set({ stage: null }),
  clearStageFile: () => set({ stageFile: null }),
  clearArm: () => set({ armRollback: false }),
}));

async function firstChange(target: RepoTarget): Promise<FileDiff | null> {
  const diff = (await daemon.request("diff.get", target)) as { files?: FileDiff[] };
  return diff.files?.[0] ?? null;
}

async function copyChange(target: RepoTarget, patch: boolean): Promise<void> {
  try {
    const file = await firstChange(target);
    if (!file) {
      toast.error("Open a changed file first");
      return;
    }
    const text = patch ? toUnifiedPatch(file) : file.path;
    try {
      await navigator.clipboard.writeText(text);
      toast.success(patch ? `Copied the patch for ${file.path}` : `Copied ${file.path}`);
    } catch {
      toast.info(patch ? `${file.path} patch` : file.path);
    }
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Could not copy the file");
  }
}

async function stageChange(target: RepoTarget, on: boolean): Promise<void> {
  useShell.getState().setPage("changes");
  useChangesPane.getState().show("diff");
  try {
    const file = await firstChange(target);
    if (!file) {
      toast.error("Open a changed file first");
      return;
    }
    useDiffLayout.getState().showStageFile(file.path, on);
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Could not stage the file");
  }
}

async function untrackedPath(target: RepoTarget): Promise<string | null> {
  const diff = (await daemon.request("diff.get", target)) as {
    files?: FileDiff[];
    untrackedPaths?: string[];
  };
  return (
    diff.untrackedPaths?.[0] ?? diff.files?.find((file) => file.status === "added")?.path ?? null
  );
}

async function deleteUntracked(target: RepoTarget): Promise<void> {
  useShell.getState().setPage("changes");
  useChangesPane.getState().show("diff");
  try {
    const path = await untrackedPath(target);
    if (!path) {
      toast.error("No untracked file to delete");
      return;
    }
    useDeleteFileAsk.getState().ask(path);
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Could not delete the file");
  }
}

async function changeUntracked(target: RepoTarget, method: "git.add" | "git.ignore"): Promise<void> {
  useShell.getState().setPage("changes");
  useChangesPane.getState().show("diff");
  try {
    const path = await untrackedPath(target);
    if (!path) {
      toast.error("No untracked file");
      return;
    }
    await daemon.request(method, { paths: [path], ...target });
    useChangesRefresh.getState().refresh();
    toast.success(method === "git.add" ? `Added ${path}` : `Ignored ${path}`);
  } catch (err) {
    reportGitFailure(
      method === "git.add" ? "Could not add the file" : "Could not update .gitignore",
      err,
    );
  }
}

async function rollbackFile(target: RepoTarget): Promise<void> {
  useShell.getState().setPage("changes");
  useChangesPane.getState().show("diff");
  try {
    const file = await firstChange(target);
    if (!file) {
      toast.error("Open a changed file first");
      return;
    }
    const indices = file.status === "added" ? [0] : file.hunks.map((_, index) => index).reverse();
    await Promise.all(
      indices.map((hunkIndex) =>
        daemon.request("diff.resolveHunk", {
          file: file.path,
          hunk_index: hunkIndex,
          resolution: "reject",
          ...target,
        }),
      ),
    );
    useChangesRefresh.getState().refresh();
    toast.success(`Rolled back ${file.path}`);
  } catch (err) {
    reportGitFailure("Could not roll the file back", err);
  }
}

async function jumpToSource(target: RepoTarget): Promise<void> {
  try {
    const diff = (await daemon.request("diff.get", target)) as {
      files?: { path: string }[];
    };
    const path = diff.files?.[0]?.path;
    if (!path) {
      toast.error("Open a changed file first");
      return;
    }
    useShell.getState().setFileJump({ path, line: 0 });
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Could not open the file");
  }
}

function showDiff(run: () => void): void {
  useShell.getState().setPage("changes");
  useChangesPane.getState().show("diff");
  run();
}

/** Split or unified diff, and a flat or directory file list. */
export function diffLayoutActions(): PaletteAction[] {
  return [
    {
      id: "unified-diff",
      label: "Unified diff",
      run: () => showDiff(() => useDiffLayout.getState().showView("unified")),
    },
    {
      id: "split-diff",
      label: "Split diff",
      run: () => showDiff(() => useDiffLayout.getState().showView("split")),
    },
    {
      id: "group-files",
      label: "Group files by directory",
      run: () => showDiff(() => useDiffLayout.getState().showFlat(false)),
    },
    {
      id: "flat-files",
      label: "List files flat",
      run: () => showDiff(() => useDiffLayout.getState().showFlat(true)),
    },
    {
      id: "stage-all",
      label: "Stage all files",
      run: () => showDiff(() => useDiffLayout.getState().showStage("all")),
    },
    {
      id: "unstage-all",
      label: "Unstage all files",
      run: () => showDiff(() => useDiffLayout.getState().showStage("none")),
    },
    {
      id: "rollback-checked",
      label: "Rollback checked files",
      run: () => showDiff(() => useDiffLayout.getState().armRollbackNow()),
    },
    {
      id: "add-file-chat",
      label: "Add file to chat",
      run: () =>
        showDiff(() => {
          const button = [...document.querySelectorAll("button")].find(
            (item) => item.textContent?.trim() === "Add to chat",
          );
          if (!(button instanceof HTMLButtonElement)) {
            toast.error("Open a changed file first");
            return;
          }
          button.click();
        }),
    },
    {
      id: "collapse-file",
      label: "Collapse file",
      run: () => toggleFile("Collapse"),
    },
    {
      id: "expand-file",
      label: "Expand file",
      run: () => toggleFile("Expand"),
    },
    {
      id: "send-hunk-note",
      label: "Send hunk note",
      run: sendHunkNote,
    },
    { id: "accept-change", label: "Accept change", run: () => decideHunk("Accept") },
    { id: "reject-change", label: "Reject change", run: () => decideHunk("Reject") },
  ];
}

function decideHunk(label: "Accept" | "Reject"): void {
  showDiff(() => {
    const button = [...document.querySelectorAll("article button")].find(
      (item) => item.textContent?.trim() === label,
    );
    if (!(button instanceof HTMLButtonElement)) {
      toast.error("Open a change first");
      return;
    }
    button.click();
  });
}

function sendHunkNote(): void {
  showDiff(() => {
    const fields = [...document.querySelectorAll('[aria-label="Diff note"]')];
    const filled = fields.find(
      (item): item is HTMLInputElement | HTMLTextAreaElement =>
        (item instanceof HTMLInputElement || item instanceof HTMLTextAreaElement) &&
        item.value.trim() !== "",
    );
    if (!filled) {
      const empty = fields.find((item) => item instanceof HTMLElement);
      if (empty instanceof HTMLElement) empty.focus();
      toast.info("Write a note first");
      return;
    }
    const button = filled.closest("form")?.querySelector('button[type="submit"]');
    if (!(button instanceof HTMLButtonElement)) {
      toast.error("Open a change first");
      return;
    }
    button.click();
  });
}

function toggleFile(label: "Collapse" | "Expand"): void {
  showDiff(() => {
    const button = [...document.querySelectorAll("article button")].find(
      (item) => item.textContent?.trim() === label,
    );
    if (!(button instanceof HTMLButtonElement)) {
      toast.error(
        label === "Collapse" ? "That file is already collapsed" : "Open a changed file first",
      );
      return;
    }
    button.click();
  });
}

/** The Changes page opens a shelf or stash dialog for these paths. */
export const useAsideAsk = create<{
  pending: { kind: "shelf" | "stash"; paths: string[] } | null;
  open: (kind: "shelf" | "stash", paths: string[]) => void;
  clear: () => void;
}>((set) => ({
  pending: null,
  open: (kind, paths) => set({ pending: { kind, paths } }),
  clear: () => set({ pending: null }),
}));

async function askAside(target: RepoTarget, kind: "shelf" | "stash"): Promise<void> {
  useShell.getState().setPage("changes");
  useChangesPane.getState().show("diff");
  try {
    const diff = (await daemon.request("diff.get", target)) as {
      files?: { path: string }[];
    };
    const path = diff.files?.[0]?.path;
    if (!path) {
      toast.error("Open a changed file first");
      return;
    }
    useAsideAsk.getState().open(kind, [path]);
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Could not shelve the file");
  }
}

/** The Changes page opens this pane. The palette sets it from any page. */
export const useChangesPane = create<{
  pane: ChangesPane | null;
  show: (pane: ChangesPane) => void;
  clear: () => void;
}>((set) => ({
  pane: null,
  show: (pane) => set({ pane }),
  clear: () => set({ pane: null }),
}));

type Listed = ShelfEntry;

/** Apply a shelf or stash entry, the same as the button on that pane. */
export function useShelfPalette(target: RepoTarget | null, open: boolean): PaletteAction[] {
  const key = target ? targetKey(target) : "";
  const [entries, setEntries] = useState<Listed[]>([]);
  useEffect(() => {
    if (!open || !target) {
      setEntries([]);
      return;
    }
    let cancelled = false;
    void Promise.all([
      daemon.request("shelf.list", target),
      daemon.request("stash.list", target),
    ])
      .then(([shelf, stash]) => {
        if (cancelled) return;
        const shelved =
          (shelf as { entries?: { id: string; name: string; files?: string[] }[] }).entries ?? [];
        const stashed =
          (stash as { entries?: { id: string; message: string; files?: string[] }[] }).entries ??
          [];
        setEntries([
          ...shelved.map((entry) => ({
            id: entry.id,
            kind: "shelf" as const,
            label: entry.name,
            files: entry.files ?? [],
          })),
          ...stashed.map((entry) => ({
            id: entry.id,
            kind: "stash" as const,
            label: entry.message,
            files: entry.files ?? [],
          })),
        ]);
      })
      .catch(() => {
        if (!cancelled) setEntries([]);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, key]);
  const folderActions = useFolderPalette(target, open);
  if (!target) return [];
  return [
    ...diffLayoutActions(),
    ...commitPaletteActions(),
    ...folderActions,
    {
      id: "jump-to-source",
      label: "Jump to source",
      run: () => void jumpToSource(target),
    },
    {
      id: "copy-change-path",
      label: "Copy path",
      run: () => void copyChange(target, false),
    },
    {
      id: "copy-change-patch",
      label: "Copy as patch",
      run: () => void copyChange(target, true),
    },
    {
      id: "stage-file",
      label: "Stage file",
      run: () => void stageChange(target, true),
    },
    {
      id: "unstage-file",
      label: "Unstage file",
      run: () => void stageChange(target, false),
    },
    {
      id: "rollback-file",
      label: "Rollback file",
      run: () => void rollbackFile(target),
    },
    {
      id: "delete-untracked",
      label: "Delete untracked file",
      run: () => void deleteUntracked(target),
    },
    {
      id: "add-to-vcs",
      label: "Add to VCS",
      run: () => void changeUntracked(target, "git.add"),
    },
    {
      id: "ignore-file",
      label: "Add to .gitignore",
      run: () => void changeUntracked(target, "git.ignore"),
    },
    {
      id: "refresh-changes",
      label: "Refresh changes",
      run: () => {
        useShell.getState().setPage("changes");
        useChangesPane.getState().show("diff");
        useChangesRefresh.getState().refresh();
        toast.success("Refreshed");
      },
    },
    {
      id: "shelve-file",
      label: "Shelve file",
      run: () => void askAside(target, "shelf"),
    },
    {
      id: "stash-file",
      label: "Stash file",
      run: () => void askAside(target, "stash"),
    },
    ...shelfEntryActions(entries, target),
  ];
}
