import { daemon } from "@warpforge/daemon";
import type { FileDiff } from "@warpforge/protocol";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { create } from "zustand";
import { groupFilesByDirectory } from "./git-roots";
import { reportGitFailure } from "./git-result";
import { targetKey, type RepoTarget } from "./repo-target";
import { useAsideAsk, useChangesPane, useChangesRefresh } from "./shelf-palette";
import { useShell } from "./shell-store";
import type { PaletteAction } from "./task-palette";

/** The Changes page stages or unstages every file in a folder. */
export const useFolderStage = create<{
  pending: { paths: string[]; on: boolean } | null;
  ask: (paths: string[], on: boolean) => void;
  clear: () => void;
}>((set) => ({
  pending: null,
  ask: (paths, on) => set({ pending: { paths, on } }),
  clear: () => set({ pending: null }),
}));

function stageFolder(directory: string, paths: string[], on: boolean): void {
  useShell.getState().setPage("changes");
  useChangesPane.getState().show("diff");
  useFolderStage.getState().ask(paths, on);
  toast.success(`${on ? "Staged" : "Unstaged"} ${directory}`);
}

function asideFolder(kind: "shelf" | "stash", paths: string[]): void {
  useShell.getState().setPage("changes");
  useChangesPane.getState().show("diff");
  useAsideAsk.getState().open(kind, paths);
}

function copyFolder(directory: string): void {
  void navigator.clipboard.writeText(directory).then(
    () => toast.success(`Copied ${directory}`),
    () => toast.info(directory),
  );
}

function refreshFolder(): void {
  useShell.getState().setPage("changes");
  useChangesPane.getState().show("diff");
  useChangesRefresh.getState().refresh();
  toast.success("Refreshed");
}

async function changeFolder(
  target: RepoTarget,
  directory: string,
  paths: string[],
  method: "git.add" | "git.ignore",
): Promise<void> {
  useShell.getState().setPage("changes");
  useChangesPane.getState().show("diff");
  try {
    await daemon.request(method, { paths, ...target });
    useChangesRefresh.getState().refresh();
    toast.success(method === "git.add" ? `Added ${directory}` : `Ignored ${directory}`);
  } catch (err) {
    reportGitFailure(
      method === "git.add" ? "Could not add the folder" : "Could not update .gitignore",
      err,
    );
  }
}

/** Stage or unstage each directory in the open diff. */
export function useFolderPalette(target: RepoTarget | null, open: boolean): PaletteAction[] {
  const key = target ? targetKey(target) : "";
  const [groups, setGroups] = useState<
    { directory: string; paths: string[]; untracked: boolean }[]
  >([]);
  useEffect(() => {
    if (!open || !target) {
      setGroups([]);
      return;
    }
    let cancelled = false;
    void daemon
      .request("diff.get", target)
      .then((result) => {
        if (cancelled) return;
        const diff = result as { files?: FileDiff[]; untrackedPaths?: string[] };
        const files = diff.files ?? [];
        const untracked = new Set(diff.untrackedPaths ?? []);
        setGroups(
          groupFilesByDirectory(files)
            .filter((group) => group.directory !== "")
            .map((group) => ({
              directory: group.directory,
              paths: group.files.map((file) => file.path),
              untracked: group.files.every((file) => untracked.has(file.path)),
            })),
        );
      })
      .catch(() => {
        if (!cancelled) setGroups([]);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, key]);
  if (!target) return [];
  return groups.flatMap((group) => [
    {
      id: `stage-folder-${group.directory}`,
      label: `Stage folder ${group.directory}`,
      run: () => stageFolder(group.directory, group.paths, true),
    },
    {
      id: `unstage-folder-${group.directory}`,
      label: `Unstage folder ${group.directory}`,
      run: () => stageFolder(group.directory, group.paths, false),
    },
    {
      id: `shelve-folder-${group.directory}`,
      label: `Shelve folder ${group.directory}`,
      run: () => asideFolder("shelf", group.paths),
    },
    {
      id: `stash-folder-${group.directory}`,
      label: `Stash folder ${group.directory}`,
      run: () => asideFolder("stash", group.paths),
    },
    {
      id: `copy-folder-${group.directory}`,
      label: `Copy folder path ${group.directory}`,
      run: () => copyFolder(group.directory),
    },
    {
      id: `refresh-folder-${group.directory}`,
      label: `Refresh folder ${group.directory}`,
      run: () => refreshFolder(),
    },
    ...(group.untracked
      ? [
          {
            id: `add-folder-${group.directory}`,
            label: `Add folder to VCS ${group.directory}`,
            run: () => void changeFolder(target, group.directory, group.paths, "git.add"),
          },
          {
            id: `ignore-folder-${group.directory}`,
            label: `Ignore folder ${group.directory}`,
            run: () => void changeFolder(target, group.directory, group.paths, "git.ignore"),
          },
        ]
      : []),
  ]);
}
