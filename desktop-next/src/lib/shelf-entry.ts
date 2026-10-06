import { daemon } from "@warpforge/daemon";
import { toast } from "sonner";
import { create } from "zustand";
import { reportGitFailure } from "./git-result";
import type { RepoTarget } from "./repo-target";
import { useChangesPane } from "./shelf-palette";
import { useShell } from "./shell-store";
import type { PaletteAction } from "./task-palette";

export interface ShelfEntry {
  id: string;
  kind: "shelf" | "stash";
  label: string;
  files: string[];
}

/** The shelf or stash pane opens its confirm for this entry. */
export const useShelfAsk = create<{
  pending: { kind: "shelf" | "stash"; id: string; action: "apply-drop" | "drop" } | null;
  ask: (kind: "shelf" | "stash", id: string, action: "apply-drop" | "drop") => void;
  clear: () => void;
}>((set) => ({
  pending: null,
  ask: (kind, id, action) => set({ pending: { kind, id, action } }),
  clear: () => set({ pending: null }),
}));

function showEntry(entry: ShelfEntry): void {
  useShell.getState().setPage("changes");
  useChangesPane.getState().show(entry.kind);
}

function applyEntry(entry: ShelfEntry, target: RepoTarget): void {
  showEntry(entry);
  const work =
    entry.kind === "shelf"
      ? daemon.request("shelf.apply", { drop: false, id: entry.id, ...target })
      : daemon.request("stash.apply", { id: entry.id, pop: false, ...target });
  void work
    .then(() => toast.success("Applied"))
    .catch((err: unknown) => reportGitFailure("Could not update the shelf", err));
}

function restoreFile(entry: ShelfEntry, path: string, target: RepoTarget): void {
  showEntry(entry);
  void daemon
    .request("stash.file", { id: entry.id, paths: [path], ...target })
    .then(() => toast.success("Restored the file"))
    .catch((err: unknown) => reportGitFailure("Could not update the shelf", err));
}

/** Apply, apply and drop, drop, or restore a file from each shelf and stash entry. */
export function shelfEntryActions(entries: ShelfEntry[], target: RepoTarget): PaletteAction[] {
  return entries.flatMap((entry) => [
    {
      id: `apply-${entry.kind}-${entry.id}`,
      label: `Apply ${entry.label}`,
      run: () => applyEntry(entry, target),
    },
    {
      id: `apply-drop-${entry.kind}-${entry.id}`,
      label: `Apply and drop ${entry.label}`,
      run: () => {
        showEntry(entry);
        useShelfAsk.getState().ask(entry.kind, entry.id, "apply-drop");
      },
    },
    {
      id: `drop-${entry.kind}-${entry.id}`,
      label: `Drop ${entry.label}`,
      run: () => {
        showEntry(entry);
        useShelfAsk.getState().ask(entry.kind, entry.id, "drop");
      },
    },
    ...(entry.kind === "stash"
      ? entry.files.map((path) => ({
          id: `restore-${entry.id}-${path}`,
          label: `Restore ${path} from ${entry.label}`,
          run: () => restoreFile(entry, path, target),
        }))
      : []),
  ]);
}
