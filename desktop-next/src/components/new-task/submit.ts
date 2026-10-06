import { daemon } from "@warpforge/daemon";
import type { ConfigOption, EntryRunLocation, PromptAttachment } from "@warpforge/protocol";

import { autoNameCreatedTask } from "../../lib/auto-name-task";
import { collectBacklogIds } from "../../lib/factory-batch";
import { splitConfigPicks, worktreeBaseFrom } from "../../lib/new-task";
import type { BatchScope } from "./factory-batch";

export type Mode = "single" | "orchestrator" | "factory";

export interface NewTaskInput {
  project: string;
  prompt: string;
  attachments?: PromptAttachment[];
  agent: string;
  models: ConfigOption[];
  picks: Record<string, string>;
  mode: Mode;
  tags: string;
  worktree: boolean;
  base: string;
  shareServices: boolean;
  advisor: string | null;
  workflow: string;
  deliver: boolean;
  location: EntryRunLocation;
  batch: string[];
  scope: BatchScope;
  /** Backlog item the task starts from. */
  workItemId: string | null;
}

/** What starting produced: tasks to open, a toast to show, or why nothing started. */
export type NewTaskResult =
  | { kind: "task"; taskId: string; linkError?: string }
  | { kind: "queued"; count: number; firstTaskId: string | null }
  | { kind: "refused"; message: string };

function backlogIds(input: NewTaskInput): Promise<string[]> {
  const { scope, project } = input;
  if (!scope.all) return Promise.resolve(input.batch);
  return collectBacklogIds((page, pageSize) =>
    daemon
      .listBacklog({
        project,
        page,
        pageSize,
        search: scope.search,
        status: scope.status === "all" ? undefined : scope.status,
        source: scope.source === "all" ? undefined : scope.source,
        sortBy: "priority",
        sortDesc: true,
      })
      .then((result) => ({ items: result.items, hasNextPage: result.hasNextPage })),
  );
}

/** Starts the task, or queues a backlog batch in Factory. */
export async function startNewTask(input: NewTaskInput): Promise<NewTaskResult> {
  const { project, mode } = input;
  const queuedCount = input.scope.all ? input.scope.total : input.batch.length;
  const config = splitConfigPicks(input.models, input.picks);

  if (mode === "factory" && input.deliver && queuedCount > 0) {
    if (!input.workflow)
      return { kind: "refused", message: "Pick a workflow for the backlog batch" };
    const ids = await backlogIds(input);
    if (ids.length === 0)
      return { kind: "refused", message: "Nothing matches that backlog filter" };
    const queued = await daemon.runnerEnqueue(project, ids, {
      agent: input.agent,
      deliver: true,
      model: config.model ?? null,
      runLocation: input.location,
      workflow: input.workflow,
    });
    if (queued.created.length === 0)
      return { kind: "refused", message: "Those backlog items were not queued" };
    return {
      kind: "queued",
      count: queued.created.length,
      firstTaskId: queued.created[0]?.taskId ?? null,
    };
  }

  const userTags = input.tags
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  const modeTags =
    mode === "orchestrator" ? ["orchestrator-chat"] : mode === "factory" ? ["runner"] : [];
  const delivers = mode === "factory" && input.deliver;
  const isolated =
    mode === "orchestrator"
      ? false
      : mode === "factory"
        ? input.location === "worktree"
        : input.worktree;
  const result = (await daemon.request("task.create", {
    project,
    prompt: input.prompt.trim(),
    attachments: input.attachments ?? [],
    agent: input.agent,
    tags: [...userTags, ...modeTags],
    worktree: isolated,
    worktree_base: isolated && mode === "single" ? worktreeBaseFrom(input.base) : undefined,
    include_runtime_context: input.shareServices,
    default_model: config.model,
    config_overrides: config.overrides,
    advisor: mode === "single" && input.advisor ? { agent: input.advisor } : undefined,
    workflow: mode === "factory" && input.workflow ? input.workflow : undefined,
    backlog_item_id: input.workItemId ?? undefined,
    factory: delivers ? { deliver: true, runLocation: input.location } : undefined,
  })) as { taskId?: string } | null;
  const id = result?.taskId;
  if (!id) throw new Error("the daemon created no task");
  void autoNameCreatedTask(id);
  // A delivering Factory task is linked by the runner itself.
  if (!input.workItemId || delivers) return { kind: "task", taskId: id };
  try {
    await daemon.linkWorkItemTask(input.workItemId, id);
    return { kind: "task", taskId: id };
  } catch (err) {
    return {
      kind: "task",
      taskId: id,
      linkError: err instanceof Error ? err.message : String(err),
    };
  }
}
