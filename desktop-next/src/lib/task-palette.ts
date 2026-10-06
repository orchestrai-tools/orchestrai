import { daemon } from "@warpforge/daemon";
import { buildSnoozePresets } from "@warpforge/core/snooze";
import type { TaskInfo } from "@warpforge/protocol";
import { create } from "zustand";
import { toast } from "sonner";
import { canRunAgain, isSnoozed } from "../model/factory";
import { transcriptPath, transcriptToMarkdown } from "./transcript-doc";
import { browserPaletteActions } from "./browser-palette";
import { useShell } from "./shell-store";

export const useDeleteTask = create<{
  taskId: string | null;
  ask: (taskId: string) => void;
  clear: () => void;
}>((set) => ({
  taskId: null,
  ask: (taskId) => set({ taskId }),
  clear: () => set({ taskId: null }),
}));

/** The palette cannot show a dialog itself, so removing a worktree asks here. */
export const useArchiveWorktree = create<{
  taskId: string | null;
  ask: (taskId: string) => void;
  clear: () => void;
}>((set) => ({
  taskId: null,
  ask: (taskId) => set({ taskId }),
  clear: () => set({ taskId: null }),
}));

export interface PaletteAction {
  id: string;
  /** May end in its shortcut, as the palette prints it ("New task ⌘N"). */
  label: string;
  run: () => void;
  keywords?: string;
  /** Destructive: shown in red so it is never picked by accident. */
  danger?: boolean;
}

/** Task surfaces, so the palette can open the same places as the number keys. */
export function surfacePaletteActions(): PaletteAction[] {
  return [
    {
      id: "surface-conversation",
      label: "Conversation ⌘1",
      run: () => {
        const shell = useShell.getState();
        shell.setPage("task");
        shell.setTaskTab("conversation");
      },
    },
    { id: "surface-files", label: "Files ⌘2", run: () => useShell.getState().setPage("files") },
    {
      id: "surface-changes",
      label: "Changes ⌘3",
      run: () => useShell.getState().setPage("changes"),
    },
    {
      id: "surface-services",
      label: "Services ⌘4",
      run: () => useShell.getState().setPage("services"),
    },
    {
      id: "surface-terminal",
      label: "Terminal ⌘5",
      run: () => useShell.getState().toggle("terminal"),
    },
    {
      id: "surface-browser",
      label: "Browser ⌘6",
      run: () => {
        const shell = useShell.getState();
        shell.setPage("task");
        shell.setTaskTab("browser");
      },
    },
    {
      id: "surface-steps",
      label: "Steps ⌘7",
      run: () => {
        const shell = useShell.getState();
        shell.setPage("task");
        shell.setTaskTab("steps");
      },
    },
    ...browserPaletteActions(),
  ];
}

/** The open task's row actions, so the palette can run them too. */
export function taskPaletteActions(
  task: TaskInfo,
  pinned: boolean,
  now = Date.now(),
): PaletteAction[] {
  const actions: PaletteAction[] = [];
  if (isSnoozed(task, Math.floor(now / 1000))) {
    actions.push({
      id: "wake",
      label: "Wake now",
      run: () => void daemon.request("task.unsnooze", { task_id: task.id }),
    });
  } else if (task.settledOverride === true) {
    actions.push({
      id: "return",
      label: "Return to active",
      run: () => void daemon.request("task.unsettle", { task_id: task.id }),
    });
  } else {
    for (const preset of buildSnoozePresets(now)) {
      actions.push({
        id: `remind-${preset.id}`,
        label: `Remind later · ${preset.label}`,
        run: () => void daemon.request("task.snooze", { task_id: task.id, until: preset.until }),
      });
    }
    if (task.status !== "running") {
      actions.push({
        id: "handled",
        label: "Mark handled",
        run: () => void daemon.request("task.settle", { task_id: task.id }),
      });
    }
  }
  actions.push({
    id: "pin",
    label: pinned ? "Unpin from Home" : "Pin to Home",
    run: () => useShell.getState().togglePin(task.id, daemon.getState().snapshot.tasks),
  });
  if (canRunAgain(task)) {
    actions.push({
      id: "again",
      label: "Run again",
      run: () => void daemon.runnerRetry(task.project, task.id),
    });
  }
  actions.push({
    id: "archive",
    label: "Archive task",
    run: () => void daemon.archiveTask(task.id),
  });
  if (task.worktree) {
    actions.push({
      id: "archive-worktree",
      label: "Archive and remove worktree…",
      run: () => useArchiveWorktree.getState().ask(task.id),
    });
  }
  actions.push({
    id: "delete",
    label: "Delete task…",
    run: () => useDeleteTask.getState().ask(task.id),
  });
  actions.push({
    id: "save-doc",
    label: "Save as doc",
    run: () => {
      const updates = daemon.getState().sessionUpdates[task.id] ?? [];
      const path = transcriptPath(task.title || task.prompt, task.id);
      void daemon
        .request("docs.write", {
          project: task.project,
          path,
          content: transcriptToMarkdown(task.title || task.prompt, updates),
        })
        .then(() => {
          toast.success("Saved");
          useShell.getState().setPage("docs");
        })
        .catch((err: unknown) =>
          toast.error(err instanceof Error ? err.message : "Could not save"),
        );
    },
  });
  if (task.status === "running") {
    actions.push({
      id: "stop-turn",
      label: "Stop",
      run: () => {
        void daemon
          .request("task.cancel", { task_id: task.id })
          .catch((err: unknown) =>
            toast.error(err instanceof Error ? err.message : "Could not stop"),
          );
      },
    });
  }
  return actions;
}

/** Queue controls for a Factory task that is waiting its turn. */
export function queuePaletteActions(task: TaskInfo, order: string[]): PaletteAction[] {
  const index = order.indexOf(task.id);
  if (index < 0) return [];
  const actions: PaletteAction[] = [
    {
      id: "start-now",
      label: "Start now",
      run: () => void daemon.runnerStartNow(task.project, task.id),
    },
  ];
  if (index > 0) {
    actions.push({
      id: "move-up",
      label: "Move up",
      run: () => reorder(task, order, -1),
    });
  }
  if (index < order.length - 1) {
    actions.push({
      id: "move-down",
      label: "Move down",
      run: () => reorder(task, order, 1),
    });
  }
  actions.push({
    id: "dequeue",
    label: "Remove from queue",
    run: () => void daemon.runnerDequeue(task.project, task.id),
  });
  return actions;
}

function reorder(task: TaskInfo, order: string[], by: number) {
  const index = order.indexOf(task.id);
  const next = index + by;
  if (index < 0 || next < 0 || next >= order.length) return;
  const ids = [...order];
  ids.splice(index, 1);
  ids.splice(next, 0, task.id);
  void daemon.runnerReorder(task.project, ids);
}
