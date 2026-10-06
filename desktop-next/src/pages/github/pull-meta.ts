import type {
  PullChecks,
  PullRequestSummary,
  TaskInfo,
  TaskPullRequest,
} from "@warpforge/protocol";
import { toast } from "sonner";
import { formatElapsed } from "../../lib/live-line";

export const CHECK_DOT: Record<string, string> = {
  passing: "bg-emerald-500",
  failing: "bg-red-500",
  pending: "bg-amber-500",
};

export const CHECK_LABEL: Record<string, string> = {
  passing: "Passing",
  failing: "Failing",
  pending: "Running",
};

export function checkDot(state: PullChecks | string | null | undefined): string {
  return (state && CHECK_DOT[state]) || "border border-muted-foreground/50";
}

export function checkLabel(state: PullChecks | string | null | undefined): string {
  return (state && CHECK_LABEL[state]) || "No checks";
}

export function isLive(pull: Pick<PullRequestSummary, "state">): boolean {
  return pull.state === "open";
}

/** Draft, Open, Merged or Closed, the way GitHub names it. */
export function stateLabel(pull: Pick<PullRequestSummary, "state" | "draft">): string {
  if (pull.state === "open") return pull.draft ? "Draft" : "Open";
  if (pull.state === "merged") return "Merged";
  if (pull.state === "closed") return "Closed";
  return pull.state;
}

/** "3m ago" from a Unix timestamp in seconds; empty when it is unknown. */
export function ago(unix: number): string {
  if (!unix || !Number.isFinite(unix)) return "";
  return `${formatElapsed(unix, Math.floor(Date.now() / 1000))} ago`;
}

/** The task whose pull request this is, from the daemon's task-to-PR map. */
export function pullTask(
  pull: Pick<PullRequestSummary, "number" | "url" | "project">,
  tasks: readonly TaskInfo[],
  taskPulls: Record<string, TaskPullRequest> | undefined,
): { task: TaskInfo; link: TaskPullRequest } | null {
  if (!taskPulls) return null;
  for (const task of tasks) {
    if (task.project !== pull.project) continue;
    const link = taskPulls[task.id];
    if (link && (link.url === pull.url || link.number === pull.number)) return { task, link };
  }
  return null;
}

export function copyText(text: string, what: string): void {
  void navigator.clipboard.writeText(text).then(
    () => toast.success(`Copied ${what}`),
    () => toast.error(`Could not copy the ${what}`),
  );
}

export function errorText(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

/** The repository list error, in words for a project that is not on GitHub. */
export function listErrorText(err: unknown, fallback: string): string {
  const text = errorText(err, fallback);
  if (/could not determine GitHub repo|known GitHub host/i.test(text)) {
    return "This project has no GitHub remote. Add one to see its pull requests and issues here.";
  }
  return text;
}
