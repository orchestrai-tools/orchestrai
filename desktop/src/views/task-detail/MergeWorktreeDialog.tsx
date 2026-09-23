import { ArrowRight, GitBranch, Loader2, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { TaskInfo } from "@/protocol";

import { daemon } from "../../daemon";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: TaskInfo;
  /** Called after a successful merge so the caller can refresh task state. */
  onMerged?: () => void;
}

/**
 * Merge a task's worktree branch into its base branch without disturbing the
 * user's own checkout. The dialog owns the in-flight and error state: a
 * conflict or refusal keeps it open and shows git's reason, because a failed
 * merge must not look like one that worked.
 */
export function MergeWorktreeDialog({ open, onOpenChange, task, onMerged }: Props) {
  const [removeWorktree, setRemoveWorktree] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const base = task.baseBranch ?? "the base branch";
  const branch = `warpforge/task/${task.id}`;

  const close = (next: boolean) => {
    if (busy) return;
    if (!next) setError(null);
    onOpenChange(next);
  };

  const merge = async () => {
    setBusy(true);
    setError(null);
    try {
      const message = await daemon.mergeWorktree(task.id, removeWorktree);
      toast.success(message);
      onMerged?.();
      setBusy(false);
      onOpenChange(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Merge into {base}?</DialogTitle>
          <DialogDescription>
            The task branch is merged into its base branch. Your own checkout is only touched when
            the base branch is already checked out there, and then only if it is clean.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 font-mono text-[13px]">
          <GitBranch className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{branch}</span>
          <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate text-primary">{base}</span>
        </div>

        <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <input
            type="checkbox"
            checked={removeWorktree}
            onChange={(event) => setRemoveWorktree(event.target.checked)}
            disabled={busy}
            className="size-3.5 accent-[hsl(var(--primary))]"
          />
          Remove the worktree after merging
        </label>

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-[13px] text-destructive"
          >
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            <span className="whitespace-pre-wrap">{error}</span>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" disabled={busy} onClick={() => close(false)}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={() => void merge()}>
            {busy ? (
              <>
                <Loader2 className="mr-1 size-3.5 animate-spin" />
                Merging…
              </>
            ) : (
              "Merge"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
