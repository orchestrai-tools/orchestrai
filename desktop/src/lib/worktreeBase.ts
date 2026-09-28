import type { GitBranchList, WorktreeBase } from "../protocol";

/** Short chip label for where a worktree starts. `null` is the default: a new
 *  branch from whatever the project checkout has checked out. */
export function worktreeBaseLabel(base: WorktreeBase | null, current: string | null): string {
  if (!base) return "From " + (current ?? "HEAD");
  switch (base.kind) {
    case "branch":
      return "From " + base.name;
    case "origin":
      return "From origin";
    case "existing":
      return "On " + base.branch;
    case "pullRequest":
      return "PR #" + base.number;
  }
}

/** The branch the task's worktree will be on, when it is not a new one. */
export function worktreeBaseBranch(base: WorktreeBase | null): string | null {
  return base?.kind === "existing" ? base.branch : null;
}

export function sameWorktreeBase(a: WorktreeBase | null, b: WorktreeBase | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Local branches a person would pick from; task branches are noise here. */
export function pickableBranches(list: GitBranchList | undefined): string[] {
  return (list?.branches ?? []).filter((branch) => !branch.startsWith("warpforge/task/"));
}

/** Remote branches with no local branch of the same name — checking one out
 *  creates that local branch. */
export function pickableRemotes(list: GitBranchList | undefined): string[] {
  const local = new Set(list?.branches ?? []);
  return (list?.remotes ?? []).filter((ref) => {
    const slash = ref.indexOf("/");
    return !ref.endsWith("/HEAD") && !local.has(ref.slice(slash + 1));
  });
}
