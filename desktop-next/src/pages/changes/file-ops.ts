import { daemon } from "@warpforge/daemon";
import { toast } from "sonner";
import type { ConfirmRequest } from "../../components/common/confirm-dialog";
import { reportGitFailure } from "../../lib/git-result";
import type { RepoTarget } from "../../lib/repo-target";
import { rollbackHunkIndexes } from "../../lib/rollback-files";
import { plural, type ChangedFile } from "./tree";

export function copyText(text: string, what: string) {
  void navigator.clipboard.writeText(text).then(
    () => toast.success(`Copied ${what}`),
    () => toast.error(`Could not copy the ${what}`),
  );
}

/** Rejecting every hunk puts a tracked file back to the last commit; untracked files are deleted. */
async function discardOne(target: RepoTarget, entry: ChangedFile) {
  if (entry.untracked) {
    await daemon.request("file.delete", { ...target, path: entry.path });
    return;
  }
  for (const hunkIndex of rollbackHunkIndexes(entry.diff)) {
    await daemon.request("diff.resolveHunk", {
      ...target,
      file: entry.path,
      hunk_index: hunkIndex,
      resolution: "reject",
    });
  }
}

/** The confirm for discarding files; it names each one and what happens to untracked files. */
export function discardRequest(target: RepoTarget, entries: ChangedFile[], onDone: () => void): ConfirmRequest {
  const untracked = entries.filter((entry) => entry.untracked).length;
  const only = entries.length === 1 ? entries[0] : undefined;
  return {
    title: only
      ? `${only.untracked ? "Delete" : "Discard changes in"} ${only.path.split("/").at(-1)}?`
      : `Discard changes in ${plural(entries.length, "file")}?`,
    description: untracked
      ? `The edits are lost and ${plural(untracked, "untracked file")} ${untracked === 1 ? "is" : "are"} deleted from disk. This cannot be undone.`
      : "The files go back to the last commit. Your edits to them are lost; this cannot be undone.",
    items: entries.map((entry) => entry.path),
    confirmLabel: only ? (only.untracked ? "Delete file" : "Discard changes") : `Discard ${plural(entries.length, "file")}`,
    destructive: true,
    onConfirm: () =>
      void (async () => {
        try {
          for (const entry of entries) await discardOne(target, entry);
          toast.success(only ? `Discarded ${only.path}` : `Discarded ${plural(entries.length, "file")}`);
        } catch (err) {
          reportGitFailure("Could not discard the changes", err);
        } finally {
          onDone();
        }
      })(),
  };
}

/** `git add` or a `.gitignore` entry for untracked paths. */
export async function trackPaths(target: RepoTarget, paths: string[], method: "git.add" | "git.ignore", onDone: () => void) {
  try {
    await daemon.request(method, { ...target, paths });
    toast.success(method === "git.add" ? `Added ${plural(paths.length, "file")} to git` : "Updated .gitignore");
    onDone();
  } catch (err) {
    reportGitFailure(method === "git.add" ? "Could not add the files" : "Could not update .gitignore", err);
  }
}

export async function resolveHunk(
  target: RepoTarget,
  path: string,
  hunkIndex: number,
  resolution: "accept" | "reject",
  onDone: () => void,
) {
  try {
    await daemon.request("diff.resolveHunk", { ...target, file: path, hunk_index: hunkIndex, resolution });
    onDone();
  } catch (err) {
    reportGitFailure(resolution === "accept" ? "Could not accept the change" : "Could not revert the change", err);
  }
}
