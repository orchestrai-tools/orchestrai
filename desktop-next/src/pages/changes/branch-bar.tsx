import { daemon } from "@warpforge/daemon";
import type { TaskInfo, TaskPullRequest } from "@warpforge/protocol";
import { Button } from "@warpforge/ui/components/button";
import { cn } from "@warpforge/ui/lib/utils";

import type { ConfirmRequest } from "../../components/common/confirm-dialog";
import { runStatus, StatusMark } from "../../components/common/status-mark";
import { useMergeWorktree } from "../../components/merge-worktree-dialog";
import { openExternalLink } from "../../lib/external-link";
import type { RepoTarget } from "../../lib/repo-target";
import { useShell } from "../../lib/shell-store";
import { trunkOf, type BranchAction, type BranchContext } from "./branch-actions";
import type { BranchRequest } from "./branch-dialogs";
import { BranchPicker } from "./branch-picker";
import { copyText } from "./file-ops";
import { gitOp, useGitOpPending } from "./git-op";
import type { BranchInfo } from "./use-branch-info";

const CHECKS_TONE = {
  passing: "bg-emerald-500",
  failing: "bg-red-500",
  pending: "bg-amber-500",
  none: "bg-muted-foreground/40",
} as const;

interface Props {
  target: RepoTarget;
  /** The open task; absent on the project checkout. */
  task?: TaskInfo;
  branch: string;
  info: BranchInfo;
  pull?: TaskPullRequest;
  /** Branches checked out in the project's other worktrees: git allows one checkout per branch. */
  busyBranches: string[];
  onAsk: (request: BranchRequest) => void;
  onConfirm: (request: ConfirmRequest) => void;
  onDone: () => void;
}

/** Where this checkout stands: its branch, its upstream, its base, and the task and pull request it belongs to. */
export function BranchBar({
  target,
  task,
  branch,
  info,
  pull,
  busyBranches,
  onAsk,
  onConfirm,
  onDone,
}: Props) {
  const pending = useGitOpPending((state) => state.label);
  const base = task?.worktree ? task.baseBranch || "main" : null;
  const local = info.branches?.branches ?? [];
  const listed = branch && !local.includes(branch) ? [branch, ...local] : local;
  const run = (done: string, label: string, work: () => Promise<unknown>) =>
    void gitOp(done, "Could not change the branch", work, label).then(onDone);
  const ctx: BranchContext = {
    target,
    current: branch,
    local: listed,
    trunk: trunkOf(base, listed),
    busyBranches,
    base,
    onAsk,
    onConfirm,
    run,
  };
  const actions: BranchAction[] = [
    { id: "new-branch", label: "New branch…", run: () => useShell.getState().toggle("newBranch") },
    {
      id: "update",
      label: "Update from upstream",
      disabled: !branch,
      run: () =>
        run("Updated", `Updating ${branch}`, () =>
          daemon.request("git.update", target),
        ),
    },
    { id: "push", label: "Push…", run: () => useShell.getState().toggle("push") },
    ...(task && base && base !== branch
      ? [
          {
            id: "merge-worktree",
            label: `Merge into ${base}…`,
            run: () => useMergeWorktree.getState().ask(task.id),
          },
        ]
      : []),
    {
      id: "copy",
      label: "Copy branch name",
      disabled: !branch,
      run: () => copyText(branch, "branch name"),
    },
  ];
  const push = info.push;
  const upstream = !push
    ? null
    : !push.hasUpstream
      ? "Not pushed yet"
      : push.commits.length
        ? `${push.commits.length} to push to ${push.upstream}`
        : `Up to date with ${push.upstream}`;
  const checks = pull ? (pull.checks ?? "none") : "none";

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b px-4 py-1.5 text-xs text-muted-foreground">
      <BranchPicker
        ctx={ctx}
        local={listed}
        remotes={info.branches?.remotes ?? []}
        loading={info.loading}
        error={info.error}
        onRetry={info.retry}
        pending={pending}
        actions={actions}
      />
      <BranchListError info={info} />
      {pending && <span>{pending}…</span>}
      {upstream && <span>{upstream}</span>}
      {base && base !== branch && <span>Based on {base}</span>}
      {!task && <span>Project checkout</span>}

      <span className="ml-auto flex items-center gap-4">
        {pull && (
          <button
            type="button"
            onClick={() => void openExternalLink(pull.url)}
            className="flex items-center gap-1.5 hover:text-foreground"
            title={pull.title}
          >
            <span aria-hidden className={cn("size-2 rounded-full", CHECKS_TONE[checks])} />
            {pull.state === "draft" ? "Draft PR" : "PR"} #{pull.number} ·{" "}
            {checks === "none" ? "no checks" : `checks ${checks}`}
          </button>
        )}
        {task && (
          <button
            type="button"
            onClick={() => useShell.getState().openTask(task.id, task.project)}
            className="flex min-w-0 items-center gap-1.5 hover:text-foreground"
            title={task.title}
          >
            <StatusMark status={runStatus(task, Boolean(pull))} />
            <span className="max-w-48 truncate">{task.title}</span>
          </button>
        )}
      </span>
    </div>
  );
}

function BranchListError({ info }: { info: BranchInfo }) {
  if (!info.error) return null;
  return (
    <span className="flex items-center gap-1.5 text-red-600 dark:text-red-400" title={info.error}>
      Branches did not load
      <Button
        variant="link"
        size="xs"
        className="h-auto p-0"
        disabled={info.loading}
        onClick={info.retry}
      >
        {info.loading ? "Retrying…" : "Retry"}
      </Button>
    </span>
  );
}
