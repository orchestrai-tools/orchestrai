import { daemon } from "@warpforge/daemon";
import { create } from "zustand";
import { toast } from "sonner";
import { describeGitResult, isGitOpResult, reportGitFailure } from "./git-result";
import { useShell } from "./shell-store";
import type { PaletteAction } from "./task-palette";

export type BranchAsk = "rename" | "delete" | "rebase" | "merge" | "checkout-update";

/** The Changes branch bar opens this dialog. The palette sets it from any page. */
export const useBranchAsk = create<{
  kind: BranchAsk | null;
  ask: (kind: BranchAsk) => void;
  clear: () => void;
}>((set) => ({
  kind: null,
  ask: (kind) => set({ kind }),
  clear: () => set({ kind: null }),
}));

export function branchPaletteActions(): PaletteAction[] {
  function open(kind: BranchAsk, label: string): PaletteAction {
    return {
      id: `branch-${kind}`,
      label,
      run: () => {
        useShell.getState().setPage("changes");
        useBranchAsk.getState().ask(kind);
      },
    };
  }
  return [
    open("rename", "Rename branch…"),
    open("delete", "Delete branch…"),
    open("rebase", "Rebase…"),
    open("merge", "Merge…"),
    open("checkout-update", "Checkout and update…"),
  ];
}

/** Open a pull request for the task the branch bar is acting on. */
export function openPrPaletteAction(taskId: string, title: string): PaletteAction {
  return {
    id: "open-pr",
    label: "Open pull request",
    run: () => {
      useShell.getState().setPage("changes");
      void daemon
        .request("git.createPr", { task_id: taskId, title: title || "Changes" })
        .then((result) => {
          if (isGitOpResult(result)) {
            const described = describeGitResult(result);
            if (described.level === "success")
              toast.success(described.message || "Opened a pull request");
            else if (described.level === "info") toast.info(described.message);
            else toast.error(described.message, { description: described.detail });
            return;
          }
          toast.success("Opened a pull request");
        })
        .catch((err: unknown) => reportGitFailure("Could not open the pull request", err));
    },
  };
}
