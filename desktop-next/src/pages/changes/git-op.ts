import { daemon } from "@warpforge/daemon";
import type { GitOpResult } from "@warpforge/protocol";
import { toast } from "sonner";
import { create } from "zustand";

import { runExclusive } from "../../lib/git-actions";
import { describeGitResult, isGitOpResult, reportGitFailure } from "../../lib/git-result";
import type { RepoTarget } from "../../lib/repo-target";

/** The branch action in flight, named for the branch bar while it runs. */
export const useGitOpPending = create<{ label: string | null }>(() => ({ label: null }));

const gate = { current: false };

/**
 * Run a git call and say what happened; a conflict or refusal is shown with its files.
 * One runs at a time: a second call while one is in flight is refused, not queued.
 */
export async function gitOp(
  done: string,
  failure: string,
  work: () => Promise<unknown>,
  pending = done,
): Promise<boolean> {
  let ok = false;
  const ran = await runExclusive(gate, async () => {
    useGitOpPending.setState({ label: pending });
    try {
      ok = await report(done, failure, work);
    } finally {
      useGitOpPending.setState({ label: null });
    }
  });
  if (!ran)
    toast.info(`Wait for “${useGitOpPending.getState().label ?? "the last git action"}” to finish`);
  return ran && ok;
}

async function report(
  done: string,
  failure: string,
  work: () => Promise<unknown>,
): Promise<boolean> {
  try {
    const result = await work();
    if (!isGitOpResult(result)) {
      toast.success(done);
      return true;
    }
    const described = describeGitResult(result);
    if (described.level === "success") toast.success(described.message || done);
    else if (described.level === "info") toast.info(described.message);
    else toast.error(described.message, { description: described.detail });
    return described.level !== "error";
  } catch (err) {
    reportGitFailure(failure, err);
    return false;
  }
}

export function switchBranch(repo: RepoTarget, branch: string) {
  return daemon.request("git.switchBranch", { ...repo, branch });
}

/** A remote ref checks out as a local branch of the same name. */
export function checkoutRemote(repo: RepoTarget, ref: string) {
  const name = ref.split("/").slice(1).join("/") || ref;
  return daemon.request("git.branchCreate", { ...repo, name, from: ref, checkout: true });
}

export async function checkoutAndUpdate(repo: RepoTarget, branch: string) {
  const switched = (await switchBranch(repo, branch)) as GitOpResult;
  if (switched.status === "error" || switched.status === "conflict") return switched;
  return daemon.request("git.update", repo);
}

export function rebase(repo: RepoTarget, branch: string, target: string) {
  return daemon.request("git.rebase", { ...repo, branch, target });
}

export function mergeIn(repo: RepoTarget, target: string) {
  return daemon.request("git.merge", { ...repo, target });
}

export function deleteBranch(repo: RepoTarget, branch: string) {
  return daemon.request("git.branchDelete", { ...repo, branch, force: true });
}

export function renameBranch(repo: RepoTarget, branch: string, newName: string) {
  return daemon.request("git.branchRename", { ...repo, branch, new_name: newName });
}
