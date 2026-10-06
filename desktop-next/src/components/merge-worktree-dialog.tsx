import { daemon } from "@warpforge/daemon";
import { Button } from "@warpforge/ui/components/button";
import { Checkbox } from "@warpforge/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@warpforge/ui/components/dialog";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { create } from "zustand";
import { useDaemon } from "../lib/use-daemon";

export const useMergeWorktree = create<{
  taskId: string | null;
  ask: (taskId: string) => void;
  clear: () => void;
}>((set) => ({
  taskId: null,
  ask: (taskId) => set({ taskId }),
  clear: () => set({ taskId: null }),
}));

/** Merge a task branch into its base, and optionally remove the worktree. A conflict stays in the dialog. */
export function MergeWorktreeDialog() {
  const taskId = useMergeWorktree((state) => state.taskId);
  const task = useDaemon().snapshot.tasks.find((item) => item.id === taskId);
  const project = task?.project;
  const [branch, setBranch] = useState<string | null>(null);
  const [removeWorktree, setRemoveWorktree] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setBranch(null);
    if (!taskId) return;
    setRemoveWorktree(true);
    setBusy(false);
    setError(null);
    if (!project) return;
    let live = true;
    void daemon.listWorktreeRows(project).then(
      (rows) => live && setBranch(rows.find((row) => row.taskId === taskId)?.branch ?? null),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [taskId, project]);

  const base = task?.baseBranch || "the base branch";

  function close() {
    if (busy) return;
    setError(null);
    useMergeWorktree.getState().clear();
  }

  async function merge() {
    if (!taskId) return;
    setBusy(true);
    setError(null);
    try {
      const message = await daemon.mergeWorktree(taskId, removeWorktree);
      toast.success(message);
      setBusy(false);
      useMergeWorktree.getState().clear();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not merge the worktree");
      setBusy(false);
    }
  }

  return (
    <Dialog open={taskId !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Merge into {base}?</DialogTitle>
          <DialogDescription>
            The task branch is merged into {base}. Your own checkout is touched only when {base} is checked out there,
            and then only if it is clean.
          </DialogDescription>
        </DialogHeader>
        <p className="rounded-md bg-muted/60 px-3 py-2 font-mono text-xs">
          {branch ?? task?.title ?? taskId} → {base}
        </p>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={removeWorktree}
            disabled={busy}
            onCheckedChange={(value) => setRemoveWorktree(value === true)}
          />
          Remove the worktree after merging
        </label>
        {error && (
          <p role="alert" className="text-sm whitespace-pre-wrap text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={close}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={() => void merge()}>
            {busy ? "Merging…" : "Merge"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
