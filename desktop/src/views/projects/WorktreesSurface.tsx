import { useQuery, useQueryClient } from "@tanstack/react-query";
import { GitBranch } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { daemon } from "@/daemon";

import type { WorktreeRow } from "../../protocol";

type Pending = { kind: "reclaim" | "remove"; row: WorktreeRow };

/**
 * Formats a byte count for the size column.
 *
 * @param bytes Size in bytes, or absent when it could not be measured in time.
 * @returns A short human-readable size, or a dash when unknown.
 */
export function formatWorktreeSize(bytes: number | null | undefined): string {
  if (bytes == null) return "—";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KiB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(0)} MiB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GiB`;
}

/**
 * One project's task worktrees: branch, owner, disk size, and the two ways to
 * take space back. Both destructive actions ask first.
 *
 * @param props.project Name of the project whose worktrees are listed.
 */
export function WorktreesSurface({ project }: { project: string }) {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<Pending | null>(null);
  const [logTaskId, setLogTaskId] = useState<string | null>(null);
  const rows = useQuery({
    queryFn: () => daemon.listWorktreeRows(project),
    queryKey: ["worktrees", project],
  });
  const logQuery = useQuery({
    enabled: logTaskId !== null,
    queryFn: () => daemon.worktreeSetupLog(logTaskId ?? ""),
    queryKey: ["worktreeSetupLog", logTaskId],
  });

  const confirm = async () => {
    if (!pending) return;
    const { kind, row } = pending;
    if (kind === "reclaim") {
      const freed = await daemon.reclaimWorktree(project, row.path);
      toast.success(`Freed ${formatWorktreeSize(freed)}`);
    } else if (row.taskId) {
      await daemon.archiveTask(row.taskId, true);
    } else {
      await daemon.removeOrphanWorktree(project, row.path);
    }
    setPending(null);
    await queryClient.invalidateQueries({ queryKey: ["worktrees", project] });
  };

  const list = rows.data ?? [];
  if (rows.isSuccess && list.length === 0) {
    return (
      <EmptyState
        icon={GitBranch}
        title="No worktrees"
        hint="Tasks that run isolated get their own checkout, listed here."
      />
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      {rows.isError && <p className="px-3 py-2 text-sm text-destructive">{String(rows.error)}</p>}
      <ul className="divide-y divide-rule">
        {list.map((row) => (
          <li key={row.path} className="flex items-center gap-3 px-3 py-2 text-sm">
            <div className="min-w-0 flex-1">
              <div className="truncate font-mono text-xs">{row.branch ?? "(detached)"}</div>
              <div className="truncate text-xs text-muted-foreground" title={row.path}>
                {row.orphan ? "No task owns this worktree" : row.taskTitle}
              </div>
            </div>
            {row.orphan && <Badge variant="outline">orphan</Badge>}
            <span className="tnum w-20 shrink-0 text-right text-xs text-muted-foreground">
              {formatWorktreeSize(row.sizeBytes)}
            </span>
            {row.hasSetupLog && row.taskId && (
              <Button size="sm" variant="ghost" onClick={() => setLogTaskId(row.taskId ?? null)}>
                Setup log
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPending({ kind: "reclaim", row })}
            >
              Reclaim build artifacts
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setPending({ kind: "remove", row })}
            >
              Remove
            </Button>
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={pending !== null}
        title={pending?.kind === "reclaim" ? "Reclaim build artifacts?" : "Remove this worktree?"}
        description={
          pending?.kind === "reclaim"
            ? "This deletes node_modules, target and other build folders inside this worktree only. Source files stay; the next build recreates them."
            : pending?.row.taskId
              ? "This archives the task and deletes its checkout and branch. It is refused while the checkout has uncommitted or unpushed work."
              : "This deletes the checkout and its task branch. It is refused while the checkout has uncommitted or unpushed work."
        }
        confirmLabel={pending?.kind === "reclaim" ? "Reclaim" : "Remove"}
        onCancel={() => setPending(null)}
        onConfirm={confirm}
      />

      <Dialog open={logTaskId !== null} onOpenChange={(open) => !open && setLogTaskId(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Setup log</DialogTitle>
          </DialogHeader>
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap font-mono text-xs">
            {logQuery.data ?? ""}
          </pre>
        </DialogContent>
      </Dialog>
    </div>
  );
}
