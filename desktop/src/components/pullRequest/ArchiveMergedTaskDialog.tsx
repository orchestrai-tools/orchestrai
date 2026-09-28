import { toast } from "sonner";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { daemon } from "@/daemon";
import { taskLabel } from "@/lib/taskLabel";
import type { TaskInfo, TaskPullRequest } from "@/protocol";

/** Confirm archiving a task whose pull request merged, removing its worktree. */
export function ArchiveMergedTaskDialog({
  task,
  pr,
  open,
  onOpenChange,
}: {
  task: TaskInfo;
  pr: TaskPullRequest;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <ConfirmDialog
      open={open}
      title="Archive task and remove its worktree?"
      description={
        <>
          Pull request #{pr.number} is merged. “{taskLabel(task)}” moves to history and its worktree
          folder and local branch are deleted. The conversation stays, and the merged work is safe
          on GitHub.
        </>
      }
      confirmLabel="Archive and remove"
      busyLabel="Removing…"
      onCancel={() => onOpenChange(false)}
      onConfirm={async () => {
        await daemon.archiveTask(task.id, true);
        onOpenChange(false);
        toast.success("Task archived and worktree removed");
      }}
    />
  );
}
