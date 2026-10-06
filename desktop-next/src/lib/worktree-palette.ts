import { daemon } from "@warpforge/daemon";
import type { WorktreeRow } from "@warpforge/protocol";
import { useEffect, useState } from "react";
import { create } from "zustand";
import { useChangesPane } from "./shelf-palette";
import { useShell } from "./shell-store";
import type { PaletteAction } from "./task-palette";

type Pending = { kind: "reclaim" | "remove"; row: WorktreeRow };

/** The worktrees pane shows this task's setup log. The palette sets it from any page. */
export const useSetupLogAsk = create<{
  taskId: string | null;
  ask: (taskId: string) => void;
  clear: () => void;
}>((set) => ({
  taskId: null,
  ask: (taskId) => set({ taskId }),
  clear: () => set({ taskId: null }),
}));

/** The worktrees pane opens this confirm. The palette sets it from any page. */
export const useWorktreeAsk = create<{
  pending: Pending | null;
  ask: (pending: Pending) => void;
  clear: () => void;
}>((set) => ({
  pending: null,
  ask: (pending) => set({ pending }),
  clear: () => set({ pending: null }),
}));

function askWorktree(kind: "reclaim" | "remove", row: WorktreeRow) {
  useShell.getState().setPage("changes");
  useChangesPane.getState().show("worktrees");
  useWorktreeAsk.getState().ask({ kind, row });
}

/** Reclaim and remove, each still asking in the worktrees confirm. */
export function useWorktreePalette(project: string | null, open: boolean): PaletteAction[] {
  const [rows, setRows] = useState<WorktreeRow[]>([]);
  useEffect(() => {
    if (!open || !project) {
      setRows([]);
      return;
    }
    let cancelled = false;
    void daemon
      .listWorktreeRows(project)
      .then((next) => {
        if (!cancelled) setRows(next);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, project]);
  if (!project) return [];
  return rows.flatMap((row) => {
    const name = row.branch || "(detached)";
    return [
      {
        id: `reclaim:${row.path}`,
        label: `Reclaim build artifacts on ${name}`,
        run: () => askWorktree("reclaim", row),
      },
      {
        id: `remove-worktree:${row.path}`,
        label: `Remove worktree ${name}`,
        run: () => askWorktree("remove", row),
      },
      ...(row.hasSetupLog && row.taskId
        ? [
            {
              id: `setup-log:${row.path}`,
              label: `Setup log for ${name}`,
              run: () => {
                useShell.getState().setPage("changes");
                useChangesPane.getState().show("worktrees");
                useSetupLogAsk.getState().ask(row.taskId!);
              },
            },
          ]
        : []),
    ];
  });
}
