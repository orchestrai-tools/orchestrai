import { daemon } from "@warpforge/daemon";
import type { GitOpResult } from "@warpforge/protocol";
import { toast } from "sonner";

import { trackGit } from "./git-activity";
import { describeGitResult, reportGitFailure } from "./git-result";
import { targetKey, type RepoTarget } from "./repo-target";
import { useChangesRefresh } from "./shelf-palette";

/** Run one git action at a time. A second call while the first is in flight is ignored. */
export async function runExclusive(
  gate: { current: boolean },
  work: () => Promise<void>,
): Promise<boolean> {
  if (gate.current) return false;
  gate.current = true;
  try {
    await work();
    return true;
  } finally {
    gate.current = false;
  }
}

/** Pull the checkout's branch from its remote and say what happened. */
export async function syncTask(target: RepoTarget): Promise<void> {
  try {
    const result = (await trackGit(targetKey(target), "pull", () =>
      daemon.request("git.update", target),
    )) as GitOpResult;
    const described = describeGitResult(result);
    if (described.level !== "error") useChangesRefresh.getState().refresh();
    if (described.level === "success") toast.success(described.message);
    else if (described.level === "info") toast.info(described.message);
    else toast.error(described.message, { description: described.detail });
  } catch (error) {
    reportGitFailure("Could not sync with the remote", error);
  }
}
