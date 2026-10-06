import { daemon } from "@warpforge/daemon";
import { Button } from "@warpforge/ui/components/button";
import { useEffect } from "react";
import { toast } from "sonner";

import type { ConfirmRequest } from "../../components/common/confirm-dialog";
import { reportGitFailure } from "../../lib/git-result";
import type { RepoTarget } from "../../lib/repo-target";
import { useShelfAsk } from "../../lib/shelf-entry";
import { BundleList } from "./bundle-list";
import { RowSkeletons } from "./row-skeletons";
import { plural } from "./tree";
import type { Bundle, Bundles } from "./use-bundles";
import type { BundleMode } from "./use-changes";

interface Props {
  target: RepoTarget;
  bundles: Bundles;
  onConfirm: (request: ConfirmRequest) => void;
  onChanged: () => void;
}

function useActions(target: RepoTarget, kind: BundleMode, bundles: Bundles, onChanged: () => void) {
  const run = async (work: () => Promise<unknown>, done: string) => {
    try {
      await work();
      toast.success(done);
    } catch (err) {
      reportGitFailure(
        kind === "shelf" ? "Could not update the shelf" : "Could not update the stash",
        err,
      );
    } finally {
      bundles.reload();
      onChanged();
    }
  };
  const apply = (entry: Bundle, drop: boolean) =>
    run(
      () =>
        kind === "shelf"
          ? daemon.request("shelf.apply", { ...target, drop, id: entry.id })
          : daemon.request("stash.apply", { ...target, id: entry.id, pop: drop }),
      drop ? (kind === "shelf" ? "Applied and dropped" : "Popped") : "Applied",
    );
  const drop = (entry: Bundle) =>
    run(
      () =>
        daemon.request(kind === "shelf" ? "shelf.drop" : "stash.drop", {
          ...target,
          id: entry.id,
        }),
      kind === "shelf" ? "Deleted the shelf entry" : "Dropped the stash entry",
    );
  const restore = (entry: Bundle, path: string) =>
    run(
      () => daemon.request("stash.file", { ...target, id: entry.id, paths: [path] }),
      `Restored ${path}`,
    );
  return { apply, drop, restore };
}

function confirms(kind: BundleMode, actions: ReturnType<typeof useActions>) {
  const name = (entry: Bundle) => (kind === "shelf" ? `“${entry.title}”` : entry.id);
  return {
    applyDrop: (entry: Bundle): ConfirmRequest => ({
      title: kind === "shelf" ? `Apply and drop ${name(entry)}?` : `Pop ${name(entry)}?`,
      description:
        kind === "shelf"
          ? `${plural(entry.files.length, "file")} go back into the worktree, then the shelf entry is deleted.`
          : `${plural(entry.files.length, "file")} go back into this worktree, then ${entry.id} is dropped from the stash.`,
      items: entry.files,
      confirmLabel: kind === "shelf" ? "Apply and drop" : "Pop",
      onConfirm: () => void actions.apply(entry, true),
    }),
    drop: (entry: Bundle): ConfirmRequest => ({
      title: kind === "shelf" ? `Delete ${name(entry)}?` : `Drop ${name(entry)}?`,
      description: `The worktree is untouched, but the ${kind === "shelf" ? "shelved" : "stashed"} changes are gone for good.`,
      items: entry.files,
      confirmLabel: kind === "shelf" ? "Delete entry" : "Drop entry",
      destructive: true,
      onConfirm: () => void actions.drop(entry),
    }),
  };
}

/** The palette's apply-and-drop or drop for one entry opens the same confirm as the buttons. */
function useAsked(
  kind: BundleMode,
  bundles: Bundles,
  ask: ReturnType<typeof confirms>,
  onConfirm: Props["onConfirm"],
) {
  const asked = useShelfAsk((state) => state.pending);
  useEffect(() => {
    if (!asked || asked.kind !== kind || bundles.loading) return;
    const entry = bundles.entries.find((item) => item.id === asked.id);
    useShelfAsk.getState().clear();
    if (!entry) {
      toast.error("That entry is gone");
      return;
    }
    onConfirm(asked.action === "apply-drop" ? ask.applyDrop(entry) : ask.drop(entry));
  }, [asked, kind, bundles, ask, onConfirm]);
}

function Status({ bundles }: { bundles: Bundles }) {
  if (bundles.error)
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-xs text-red-600 dark:text-red-400">
        <span className="min-w-0 flex-1">{bundles.error}</span>
        <Button variant="outline" size="xs" disabled={bundles.loading} onClick={bundles.reload}>
          {bundles.loading ? "Retrying…" : "Retry"}
        </Button>
      </div>
    );
  if (bundles.loading && bundles.entries.length === 0)
    return <RowSkeletons label="Loading entries" rows={3} className="px-3 py-2" />;
  return null;
}

/** Named bundles of uncommitted work kept outside the repository, one shelf per worktree. */
export function ShelfPanel({ target, bundles, onConfirm, onChanged }: Props) {
  const actions = useActions(target, "shelf", bundles, onChanged);
  const ask = confirms("shelf", actions);
  useAsked("shelf", bundles, ask, onConfirm);
  return (
    <>
      <Status bundles={bundles} />
      <BundleList
        target={target}
        kind="shelf"
        entries={bundles.entries}
        empty="Nothing on the shelf. Right-click files in Commit and choose Shelve…"
        labels={{ apply: "Apply", applyDrop: "Apply and drop", drop: "Delete…" }}
        onApply={(entry) => void actions.apply(entry, false)}
        onApplyDrop={(entry) => onConfirm(ask.applyDrop(entry))}
        onDrop={(entry) => onConfirm(ask.drop(entry))}
      />
    </>
  );
}

/** Git's own stash. It is one per repository, so entries from other worktrees show up here too. */
export function StashPanel({ target, bundles, onConfirm, onChanged }: Props) {
  const actions = useActions(target, "stash", bundles, onChanged);
  const ask = confirms("stash", actions);
  useAsked("stash", bundles, ask, onConfirm);
  return (
    <>
      <Status bundles={bundles} />
      <BundleList
        target={target}
        kind="stash"
        entries={bundles.entries}
        empty={
          'No stash entries. Stash files from Commit, or run git stash push -m "name" in a terminal.'
        }
        note="The stash is shared by every worktree of this repository."
        labels={{ apply: "Apply", applyDrop: "Pop", drop: "Drop…" }}
        onApply={(entry) => void actions.apply(entry, false)}
        onApplyDrop={(entry) => onConfirm(ask.applyDrop(entry))}
        onDrop={(entry) => onConfirm(ask.drop(entry))}
        onRestoreFile={(entry, path) => void actions.restore(entry, path)}
      />
    </>
  );
}
