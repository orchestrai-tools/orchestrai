import type { PullRequestSummary, TaskInfo } from "@warpforge/protocol";

const DECISIONS: Record<string, string> = {
  APPROVED: "Approved",
  CHANGES_REQUESTED: "Changes requested",
  REVIEW_REQUIRED: "Review required",
};

/** The review decision as a short label. Unknown values stay hidden. */
export function reviewDecisionLabel(decision?: string | null): string | null {
  if (!decision) return null;
  return DECISIONS[decision.trim().toUpperCase()] ?? null;
}

/** The newest assistant task for this pull request. */
export function assistantTask(
  tasks: readonly TaskInfo[],
  pull: Pick<PullRequestSummary, "repo" | "number">,
): TaskInfo | null {
  const tag = `pr:${pull.repo}#${pull.number}`;
  return (
    tasks
      .filter((item) => item.origin === "pr-review" && item.tags.includes(tag))
      .sort((a, b) => b.createdAt - a.createdAt)[0] ?? null
  );
}

/** Whether the pull request's assistant is working or has a conversation. */
export function assistantMark(
  tasks: readonly TaskInfo[],
  pull: Pick<PullRequestSummary, "repo" | "number">,
): "running" | "ready" | null {
  const task = assistantTask(tasks, pull);
  if (!task) return null;
  if (task.status === "running" || task.status === "queued") return "running";
  return "ready";
}
