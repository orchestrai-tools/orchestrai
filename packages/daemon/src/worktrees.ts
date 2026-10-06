import type { WorktreeRow } from "@warpforge/protocol";
import type { CoreClient } from "./client";
import type { Constructor } from "./types";

export function WorktreeMethods<TBase extends Constructor<CoreClient>>(Base: TBase) {
  return class extends Base {
    /** Every task worktree of a project, with owner and disk size. */
    async listWorktreeRows(project: string): Promise<WorktreeRow[]> {
      const result = (await this.request("worktree.list", { project })) as {
        worktrees?: WorktreeRow[];
      } | null;
      return result?.worktrees ?? [];
    }

    /** Delete build artifact folders inside one worktree; resolves to the bytes freed. */
    async reclaimWorktree(project: string, path: string): Promise<number> {
      const result = (await this.request("worktree.reclaim", { path, project })) as {
        freedBytes?: number;
      } | null;
      return result?.freedBytes ?? 0;
    }

    /** Remove a worktree no task owns; rejects while it holds unsaved or unpushed work. */
    async removeOrphanWorktree(project: string, path: string) {
      await this.request("worktree.removeOrphan", { path, project });
    }

    /** The output of the task's worktree setup command. */
    async worktreeSetupLog(taskId: string): Promise<string> {
      const result = (await this.request("worktree.setupLog", { task_id: taskId })) as {
        log?: string;
      } | null;
      return result?.log ?? "";
    }
  };
}
