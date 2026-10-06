import { create } from "zustand";

/** `checkout` is the `targetKey` of the worktree being pulled or pushed. */
export type GitActivity = { checkout: string; kind: "pull" | "push" } | null;

export const useGitActivity = create<{ activity: GitActivity }>(() => ({ activity: null }));

/** Show pull or push progress in the title bar until the git call finishes. */
export async function trackGit<T>(checkout: string, kind: "pull" | "push", work: () => Promise<T>): Promise<T> {
  useGitActivity.setState({ activity: { checkout, kind } });
  try {
    return await work();
  } finally {
    useGitActivity.setState({ activity: null });
  }
}

export function gitActivityLabel(activity: GitActivity): string {
  if (!activity) return "";
  return activity.kind === "pull" ? "Pulling…" : "Pushing…";
}
