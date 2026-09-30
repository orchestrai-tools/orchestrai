import type {
  EnqueueResult,
  EntryRunLocation,
  RunLocation,
  RunnerEntry,
  RunnerStatus,
  RunnerWait,
  TaskInfo,
  WorkflowMeta,
} from "@/protocol";

export type ResolvedLocation = Exclude<RunLocation, "auto">;

export const LOCATION_LABEL: Record<EntryRunLocation, string> = {
  checkout: "Your project folder",
  default: "Automatic (recommended)",
  worktree: "Background copy",
};

export const LOCATION_HINT: Record<EntryRunLocation, string> = {
  checkout: "Switches your checkout to a branch. One at a time; needed for browser checks",
  default: "Your project folder when it tests the app, otherwise a background copy",
  worktree: "A separate git worktree. Runs beside your work, several at once",
};

/**
 * Whether a task is a Factory task: one the Factory schedules, or a workflow
 * pipeline started on the spot (the former Workflow mode).
 * @param task The task.
 * @returns True for a Factory task's parent, never for its stage tasks.
 */
export function isFactoryTask(task: Pick<TaskInfo, "tags">): boolean {
  return task.tags.some((tag) => tag === "runner" || tag.startsWith("workflow:"));
}

/**
 * Whether a Factory task can run again: its run failed or was stopped.
 * @param task The task.
 * @returns True for a failed, stopped or blocked Factory task.
 */
export function canRunAgain(task: Pick<TaskInfo, "tags" | "status" | "workflowRun">): boolean {
  if (!isFactoryTask(task)) return false;
  return (
    task.status === "interrupted" ||
    task.status === "blocked" ||
    task.workflowRun?.stage === "failed"
  );
}

/**
 * The queued Factory tasks of a project, first to start first.
 * @param entries The project's entries, as the daemon orders them.
 * @returns Task ids.
 */
export function queuedOrder(entries: Pick<RunnerEntry, "state" | "taskId">[]): string[] {
  return entries.filter((entry) => entry.state === "queued").map((entry) => entry.taskId);
}

/**
 * Where a Factory task runs, as the daemon resolves it when it starts: its
 * own choice, else the project's, with Automatic taking the project folder
 * for a template that tests the running app.
 * @param project The project's default.
 * @param choice The task's own choice.
 * @param workflow The template it runs, when known.
 * @returns `worktree` or `checkout`.
 */
export function resolveLocation(
  project: RunLocation,
  choice: EntryRunLocation,
  workflow: WorkflowMeta | null | undefined,
): ResolvedLocation {
  if (choice !== "default") return choice;
  if (project !== "auto") return project;
  return workflow?.verifyRequired == null ? "worktree" : "checkout";
}

/**
 * The one-line note that says where a task will run and why.
 * @param resolved Where it will run.
 * @param choice What the person picked.
 * @param tests Whether the template tests the running app.
 * @returns For example "Runs in your project folder, because it tests the running app."
 */
export function locationNote(
  resolved: ResolvedLocation,
  choice: EntryRunLocation,
  tests: boolean,
): string {
  if (resolved === "checkout") {
    return choice === "default" && tests
      ? "Runs in your project folder, because it tests the running app."
      : "Runs in your project folder, one Factory task at a time.";
  }
  return choice === "default"
    ? "Runs in a background copy of the repository, side by side with other tasks."
    : "Runs in a background copy of the repository.";
}

/**
 * A clock time for a wait's end, in the user's locale.
 * @param epochSec Unix seconds.
 * @returns For example "14:00".
 */
export function clockTime(epochSec: number): string {
  return new Date(epochSec * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * Why a queued Factory task is waiting, as a person reads it.
 * @param wait The daemon's structured reason.
 * @returns A short sentence without a trailing period.
 */
export function waitSentence(wait: RunnerWait): string {
  switch (wait.kind) {
    case "slots":
      return "waiting for a free slot";
    case "open_prs":
      return `${wait.open} draft PR${wait.open === 1 ? " is" : "s are"} open — merge or close one`;
    case "daily":
      return `${wait.started} task${wait.started === 1 ? "" : "s"} started in the last 24 hours${
        wait.nextAt ? ` — next at ${clockTime(wait.nextAt)}` : ""
      }`;
    case "quota": {
      const when = wait.resetsAt ? ` — starts after ${clockTime(wait.resetsAt)}` : "";
      const full = (wait.usedPct ?? 0) >= 100;
      return `${wait.agent} is ${full ? "out of" : "near"} its quota${when}`;
    }
    case "disk":
      return `low disk space — ${wait.freeGb} GB free, keeps at least ${wait.minGb} GB`;
    case "checkout_busy":
      switch (wait.cause) {
        case "dirty":
          return "your project folder has uncommitted changes";
        case "operation":
          return wait.detail ?? "a git operation is in progress in your project folder";
        case "task_running":
          return wait.detail
            ? `“${wait.detail}” is running in your project folder`
            : "another task is running in your project folder";
        case "in_use":
          return "another task is using your project folder";
        case "yaml_backlog":
          return "your backlog is stored in the project folder, so it can't open a PR from there";
        default:
          return wait.detail ?? "your project folder is busy";
      }
    case "checkout_held":
      return "your project folder needs you first";
    case "workflow_invalid":
      return `the workflow template “${wait.workflow}” can't be used`;
    case "other":
      return wait.detail;
  }
}

/**
 * Why a queued Factory task is waiting: what holds the whole project first,
 * since the daemon judges it fresh on every pass, else the task's own reason.
 * @param entry The task's Factory entry.
 * @param status The project's Factory status.
 * @returns The wait, or null when the task is not queued or is next in line.
 */
export function factoryWait(
  entry: Pick<RunnerEntry, "state" | "wait"> | null | undefined,
  status: Pick<RunnerStatus, "hold"> | null | undefined,
): RunnerWait | null {
  if (entry?.state !== "queued") return null;
  return status?.hold ?? entry.wait ?? null;
}

const STAGE_WORD: Record<string, string> = {
  fix: "Fixing",
  implement: "Implementing",
  plan: "Planning",
  review: "Reviewing",
  verify: "Verifying",
};

/**
 * The stage chip of a Factory task: where it is right now.
 * @param task The task.
 * @param entry Its Factory entry, while the Factory schedules it.
 * @param prNumber Its pull request, when one is known.
 * @returns For example "Reviewing · round 2/3", or null when nothing is worth saying.
 */
export function factoryStage(
  task: Pick<TaskInfo, "status" | "workflowRun">,
  entry: Pick<RunnerEntry, "state" | "prNumber"> | null | undefined,
  prNumber?: number | null,
): string | null {
  if (entry?.state === "queued" || (!task.workflowRun && task.status === "queued")) {
    return "Queued";
  }
  if (entry?.state === "delivering") return "Opening PR";
  const pr = entry?.prNumber ?? prNumber;
  if (entry?.state === "delivered") return pr ? `PR #${pr}` : "Ready for review";
  const run = task.workflowRun;
  if (!run) return null;
  if (run.stage === "done") return pr ? `PR #${pr}` : null;
  if (run.stage === "failed") return null;
  const word = STAGE_WORD[run.stage] ?? run.stage;
  const rounds =
    (run.stage === "review" || run.stage === "fix") && run.round > 0
      ? ` · round ${run.round}/${run.maxRounds}`
      : "";
  return word + rounds;
}

/**
 * What a start request did, as one toast line.
 * @param result The daemon's answer.
 * @returns For example "3 started · 1 queued · 1 already in Factory".
 */
export function enqueueSummary(result: EnqueueResult): string {
  const started = result.created.filter((task) => task.started).length;
  const queued = result.created.length - started;
  const already = result.skipped.filter((s) => s.reason.kind === "already_in_factory").length;
  const closed = result.skipped.filter((s) => s.reason.kind === "closed").length;
  const other = result.skipped.length - already - closed;
  const parts = [
    started > 0 && `${started} started`,
    queued > 0 && `${queued} queued`,
    already > 0 && `${already} already in Factory`,
    closed > 0 && `${closed} already done`,
    other > 0 && `${other} skipped`,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "Nothing to start";
}
