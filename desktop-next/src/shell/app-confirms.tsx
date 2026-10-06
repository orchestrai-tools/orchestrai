import { daemon } from "@warpforge/daemon";
import { toast } from "sonner";
import { ConfirmDialog } from "../components/common/confirm-dialog";
import { useShell } from "../lib/shell-store";
import { useArchiveWorktree, useDeleteTask } from "../lib/task-palette";
import { useDaemon } from "../lib/use-daemon";

function report(message: string) {
  return (error: unknown) => toast.error(error instanceof Error ? error.message : message);
}

/** The window-wide confirmations that palette actions and shortcuts open. */
export function AppConfirms() {
  const shell = useShell();
  const pulls = useDaemon().taskPullRequests;
  const archiveTaskId = useArchiveWorktree((state) => state.taskId);
  const deleteTaskId = useDeleteTask((state) => state.taskId);
  const project = shell.project;
  const merged = archiveTaskId ? pulls?.[archiveTaskId] : undefined;

  return (
    <>
      <ConfirmDialog
        open={Boolean(shell.deleteDone && project)}
        onOpenChange={(open) => !open && shell.deleteDone && shell.toggle("deleteDone")}
        title="Delete finished tasks?"
        description={`Delete the finished tasks in ${project}? Tasks whose worktrees still have changes are kept.`}
        confirmLabel="Delete"
        onConfirm={() => {
          if (!project) return;
          void daemon.deleteSettledTasks(project).then((result) => {
            const kept =
              result.kept > 0 ? ` ${result.kept} kept because their worktrees still have changes.` : "";
            toast.success(`Deleted ${result.deleted} finished.${kept}`);
          }, report("Could not delete the finished tasks"));
        }}
      />
      <ConfirmDialog
        open={Boolean(shell.stopFactory && project)}
        onOpenChange={(open) => !open && shell.stopFactory && shell.toggle("stopFactory")}
        title="Stop all Factory tasks?"
        description="Running Factory tasks in this project stop, and queued ones are removed. Their work so far stays where it is."
        confirmLabel="Stop all"
        onConfirm={() => {
          if (!project) return;
          void daemon
            .runnerStop(project)
            .then(() => toast.success("Stopped Factory tasks"), report("Could not stop Factory tasks"));
        }}
      />
      <ConfirmDialog
        open={archiveTaskId !== null}
        onOpenChange={(open) => !open && useArchiveWorktree.getState().clear()}
        title="Archive task and remove its worktree?"
        description={
          merged?.state === "merged"
            ? `Pull request #${merged.number} is merged. The task moves to history and its worktree folder and local branch are deleted. The conversation stays.`
            : "The task moves to history and its worktree folder and local branch are deleted. The conversation stays."
        }
        confirmLabel="Archive and remove"
        onConfirm={() => {
          if (!archiveTaskId) return;
          void daemon
            .archiveTask(archiveTaskId, true)
            .then(() => toast.success("Task archived and worktree removed"), report("Could not archive the task"));
        }}
      />
      <ConfirmDialog
        open={deleteTaskId !== null}
        onOpenChange={(open) => !open && useDeleteTask.getState().clear()}
        title="Delete this task?"
        description="The conversation is removed. A worktree stays on disk unless you archived it."
        confirmLabel="Delete"
        onConfirm={() => {
          if (!deleteTaskId) return;
          void daemon
            .deleteTask(deleteTaskId)
            .then(() => toast.success("Deleted the task"), report("Could not delete the task"));
        }}
      />
    </>
  );
}
