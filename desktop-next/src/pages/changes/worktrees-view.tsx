import { daemon } from "@warpforge/daemon";
import type { TaskInfo, WorktreeRow } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@warpforge/ui/components/dropdown-menu";
import { cn } from "@warpforge/ui/lib/utils";
import { EllipsisIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import type { ConfirmRequest } from "../../components/common/confirm-dialog";
import { runStatus, StatusMark } from "../../components/common/status-mark";
import { useMergeWorktree } from "../../components/merge-worktree-dialog";
import { useShell } from "../../lib/shell-store";
import { useDaemon } from "../../lib/use-daemon";
import { useSetupLogAsk, useWorktreeAsk } from "../../lib/worktree-palette";
import { copyText } from "./file-ops";
import { SetupLogDialog } from "./setup-log-dialog";
import { formatWorktreeSize, worktreeConfirm } from "./worktree-format";

const COLUMNS =
  "grid grid-cols-[minmax(0,1.5fr)_minmax(0,1.3fr)_8rem_4.5rem_4.5rem] items-center gap-3";

interface Props {
  project: string;
  rows: WorktreeRow[];
  error: string | null;
  retry: () => void;
  currentTaskId: string | null;
  onOpen: (taskId: string | null) => void;
  onConfirm: (request: ConfirmRequest) => void;
}

/** Every checkout of the project: the project folder and one per task. Reclaim and remove both ask first. */
export function WorktreesView({
  project,
  rows,
  error,
  retry,
  currentTaskId,
  onOpen,
  onConfirm,
}: Props) {
  const daemonState = useDaemon();
  const tasks = daemonState.snapshot.tasks;
  const pulls = daemonState.taskPullRequests ?? {};
  const [setupLog, setSetupLog] = useState<WorktreeRow | null>(null);

  async function act(kind: "reclaim" | "remove", row: WorktreeRow) {
    try {
      if (kind === "reclaim") {
        const freed = await daemon.reclaimWorktree(project, row.path);
        toast.success(`Freed ${formatWorktreeSize(freed)}`);
      } else if (row.taskId) {
        await daemon.archiveTask(row.taskId, true);
        toast.success(`Removed ${row.path}`);
      } else {
        await daemon.removeOrphanWorktree(project, row.path);
        toast.success(`Removed ${row.path}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the worktree");
    } finally {
      retry();
    }
  }

  const ask = (kind: "reclaim" | "remove", row: WorktreeRow) => {
    const copy = worktreeConfirm(kind, Boolean(row.taskId));
    onConfirm({
      title: copy.title,
      description: copy.body,
      items: [row.path, ...(row.branch && kind === "remove" ? [row.branch] : [])],
      confirmLabel: kind === "reclaim" ? copy.confirmLabel : "Remove worktree",
      destructive: kind === "remove",
      onConfirm: () => void act(kind, row),
    });
  };

  const asked = useWorktreeAsk((state) => state.pending);
  useEffect(() => {
    if (!asked) return;
    useWorktreeAsk.getState().clear();
    ask(asked.kind, asked.row);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asked]);

  const askedLog = useSetupLogAsk((state) => state.taskId);
  useEffect(() => {
    if (!askedLog) return;
    const row = rows.find((item) => item.taskId === askedLog);
    if (!row) return;
    useSetupLogAsk.getState().clear();
    setSetupLog(row);
  }, [askedLog, rows]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-4">
      {error && (
        <p className="flex items-center gap-2 py-2 text-sm text-red-600 dark:text-red-400">
          {error}
          <Button variant="link" size="xs" onClick={retry}>
            Retry
          </Button>
        </p>
      )}
      <div role="table" aria-label="Worktrees" className="text-sm">
        <div role="row" className={cn(COLUMNS, "border-b px-2 py-2 text-xs text-muted-foreground")}>
          <span>Branch</span>
          <span>Task</span>
          <span>Base</span>
          <span className="text-right">On disk</span>
          <span />
        </div>
        {!error && rows.length === 0 && (
          <p className="px-2 py-3 text-xs text-muted-foreground">No worktrees.</p>
        )}
        {rows.map((row) => (
          <Row
            key={row.path}
            row={row}
            task={tasks.find((task) => task.id === row.taskId)}
            hasPull={Boolean(row.taskId && pulls[row.taskId])}
            current={(row.taskId ?? null) === currentTaskId}
            onOpen={() => onOpen(row.taskId ?? null)}
            onSetupLog={() => setSetupLog(row)}
            onAsk={(kind) => ask(kind, row)}
          />
        ))}
      </div>
      <p className="mt-auto pt-4 text-xs text-muted-foreground">
        Reclaim build artifacts gives back the space of node_modules, target and other build folders
        without touching the source.
      </p>
      <SetupLogDialog row={setupLog} onClose={() => setSetupLog(null)} />
    </div>
  );
}

function Row({
  row,
  task,
  hasPull,
  current,
  onOpen,
  onSetupLog,
  onAsk,
}: {
  row: WorktreeRow;
  task?: TaskInfo;
  hasPull: boolean;
  current: boolean;
  onOpen: () => void;
  onSetupLog: () => void;
  onAsk: (kind: "reclaim" | "remove") => void;
}) {
  const base = task?.worktree ? task.baseBranch || "main" : null;
  const branch = row.branch || "(detached)";
  return (
    <div
      role="row"
      onDoubleClick={onOpen}
      className={cn(
        COLUMNS,
        "group/row rounded-sm px-2 py-(--row-py)",
        current ? "bg-muted/60" : "hover:bg-muted/40",
      )}
    >
      <span className="min-w-0">
        <span className="block truncate font-mono text-sm">{branch}</span>
        <span className="block truncate text-xs text-muted-foreground" title={row.path}>
          {row.path}
        </span>
      </span>
      <span className="min-w-0">
        {task ? (
          <button
            type="button"
            onClick={() => useShell.getState().openTask(task.id, task.project)}
            className="flex w-full min-w-0 items-center gap-2 text-left hover:underline"
          >
            <StatusMark status={runStatus(task, hasPull)} className="shrink-0" />
            <span className="truncate text-xs">{task.title || row.taskTitle}</span>
          </button>
        ) : (
          <span className="text-xs text-muted-foreground">
            {row.orphan ? "No task owns this worktree" : row.taskTitle || "Project checkout"}
          </span>
        )}
      </span>
      <span className="truncate text-xs text-muted-foreground">
        {base ? `Merges into ${base}` : "—"}
      </span>
      <span className="text-right text-xs text-muted-foreground tabular-nums">
        {formatWorktreeSize(row.sizeBytes)}
      </span>
      <span className="flex justify-end gap-0.5">
        <Button
          variant="ghost"
          size="xs"
          className="opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100"
          onClick={onOpen}
        >
          {current ? "Current" : "Open"}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-xs" aria-label={`More for ${branch}`}>
              <EllipsisIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onSelect={onOpen}>Open in Changes</DropdownMenuItem>
            {task && (
              <DropdownMenuItem
                onSelect={() => useShell.getState().openTask(task.id, task.project)}
              >
                Open task
              </DropdownMenuItem>
            )}
            {row.hasSetupLog && row.taskId && (
              <DropdownMenuItem onSelect={onSetupLog}>Setup log…</DropdownMenuItem>
            )}
            {base && row.taskId && (
              <DropdownMenuItem onSelect={() => useMergeWorktree.getState().ask(row.taskId!)}>
                Merge into {base}…
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={() => copyText(row.path, "path")}>
              Copy path
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onAsk("reclaim")}>
              Reclaim build artifacts…
            </DropdownMenuItem>
            {(row.taskId || row.orphan) && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => onAsk("remove")}>
                  Remove worktree…
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </span>
    </div>
  );
}
