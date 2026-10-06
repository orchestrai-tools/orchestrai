import { daemon } from "@warpforge/daemon";

import type { ConfirmRequest } from "../../components/common/confirm-dialog";
import type { RepoTarget } from "../../lib/repo-target";
import { useShell } from "../../lib/shell-store";
import type { BranchRequest } from "./branch-dialogs";
import { copyText } from "./file-ops";
import { deleteBranch, switchBranch } from "./git-op";

export interface BranchAction {
  id: string;
  label: string;
  disabled?: boolean;
  destructive?: boolean;
  run: () => void;
}

export interface BranchContext {
  /** The task's worktree, or the project checkout when no task is open. */
  target: RepoTarget;
  current: string;
  /** Local branch names, so checking out a remote switches to its local match when there is one. */
  local: string[];
  /** The branch "onto main" actions use: the task's base, else `main` or `master`. */
  trunk: string;
  /** Branches checked out in the project's other worktrees: git allows one checkout per branch. */
  busyBranches: string[];
  /** The task's base branch, which is never offered for deletion. */
  base: string | null;
  onAsk: (request: BranchRequest) => void;
  onConfirm: (request: ConfirmRequest) => void;
  run: (done: string, pending: string, work: () => Promise<unknown>) => void;
}

export function trunkOf(base: string | null, local: string[]): string {
  if (base) return base;
  if (!local.includes("main") && local.includes("master")) return "master";
  return "main";
}

/** What the old branch list offered for one row: remote, current, or another local branch. */
export function branchActions(ctx: BranchContext, branch: string, remote: boolean): BranchAction[] {
  const copy: BranchAction = {
    id: "copy",
    label: "Copy branch name",
    run: () => copyText(branch, "branch name"),
  };
  const { current, trunk, onAsk, run } = ctx;
  const head = current || "current";

  if (remote) {
    const localName = branch.split("/").slice(1).join("/") || branch;
    const match = ctx.local.includes(localName);
    const taken = ctx.busyBranches.includes(localName);
    const checkout: BranchAction = match
      ? {
          id: "checkout-local-match",
          label:
            localName === current
              ? `${localName} is checked out`
              : taken
                ? `Check out ${localName} (open in another worktree)`
                : `Check out ${localName}`,
          disabled: localName === current || taken,
          run: () =>
            run(`Switched to ${localName}`, `Switching to ${localName}`, () =>
              switchBranch(ctx.target, localName),
            ),
        }
      : {
          id: "checkout-as-remote",
          label: "Check out as local…",
          run: () => onAsk({ kind: "create", subject: branch, name: localName }),
        };
    return [
      checkout,
      {
        id: "create",
        label: `New branch from ${branch}…`,
        run: () => onAsk({ kind: "create", subject: branch }),
      },
      {
        id: "rebase-remote",
        label: `Rebase ${head} onto ${branch}…`,
        disabled: !current,
        run: () => onAsk({ kind: "rebase", subject: current, target: branch }),
      },
      {
        id: "merge-remote",
        label: `Merge ${branch} into ${head}…`,
        disabled: !current,
        run: () => onAsk({ kind: "merge", subject: current, target: branch }),
      },
      {
        id: "pull-rebase",
        label: `Pull into ${head} using rebase…`,
        disabled: !current,
        run: () => onAsk({ kind: "rebase", subject: current, target: branch }),
      },
      {
        id: "pull-merge",
        label: `Pull into ${head} using merge…`,
        disabled: !current,
        run: () => onAsk({ kind: "merge", subject: current, target: branch }),
      },
      copy,
    ];
  }

  if (branch === current) {
    return [
      {
        id: "update",
        label: "Update from upstream",
        run: () =>
          run("Updated", `Updating ${branch}`, () =>
            daemon.request("git.update", ctx.target),
          ),
      },
      {
        id: "rebase-main",
        label: `Rebase onto ${trunk}…`,
        disabled: trunk === branch,
        run: () => onAsk({ kind: "rebase", subject: branch, target: trunk }),
      },
      {
        id: "rebase",
        label: "Rebase onto…",
        run: () => onAsk({ kind: "rebase", subject: branch }),
      },
      {
        id: "merge-main",
        label: `Merge ${trunk} into ${branch}…`,
        disabled: trunk === branch,
        run: () => onAsk({ kind: "merge", subject: branch, target: trunk }),
      },
      {
        id: "merge",
        label: "Merge a branch into this…",
        run: () => onAsk({ kind: "merge", subject: branch }),
      },
      {
        id: "create",
        label: `New branch from ${branch}…`,
        run: () => onAsk({ kind: "create", subject: branch }),
      },
      { id: "push", label: "Push…", run: () => useShell.getState().toggle("push") },
      { id: "rename", label: "Rename…", run: () => onAsk({ kind: "rename", subject: branch }) },
      copy,
    ];
  }

  const taken = ctx.busyBranches.includes(branch);
  return [
    {
      id: "checkout",
      label: taken ? "Check out (open in another worktree)" : "Check out",
      disabled: taken,
      run: () =>
        run(`Switched to ${branch}`, `Switching to ${branch}`, () =>
          switchBranch(ctx.target, branch),
        ),
    },
    {
      id: "checkout-update",
      label: "Check out and update…",
      disabled: taken,
      run: () => onAsk({ kind: "checkout-update", subject: current, target: branch }),
    },
    {
      id: "create",
      label: `New branch from ${branch}…`,
      run: () => onAsk({ kind: "create", subject: branch }),
    },
    {
      id: "rebase-main",
      label: `Rebase ${branch} onto ${trunk}…`,
      disabled: taken || trunk === branch,
      run: () => onAsk({ kind: "rebase", subject: branch, target: trunk }),
    },
    {
      id: "rebase",
      label: `Rebase ${branch} onto…`,
      disabled: taken,
      run: () => onAsk({ kind: "rebase", subject: branch }),
    },
    { id: "rename", label: "Rename…", run: () => onAsk({ kind: "rename", subject: branch }) },
    copy,
    {
      id: "delete",
      label: "Delete…",
      destructive: true,
      disabled: taken || branch === ctx.base,
      run: () =>
        ctx.onConfirm({
          title: `Delete ${branch}?`,
          description:
            "The local branch is deleted with git branch -D. Commits that no other branch or remote holds are lost.",
          items: [branch],
          confirmLabel: "Delete branch",
          destructive: true,
          onConfirm: () =>
            run(`Deleted ${branch}`, `Deleting ${branch}`, () => deleteBranch(ctx.target, branch)),
        }),
    },
  ];
}
