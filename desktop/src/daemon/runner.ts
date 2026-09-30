import type {
  EnqueueResult,
  FactoryConfig,
  ItemRun,
  RunnerSettingsPatch,
  RunnerStatus,
} from "../protocol";
import type { CoreClient } from "./client";
import type { Constructor } from "./types";

/**
 * A status every Factory view can render, even from the demo transport,
 * which answers unknown methods with `{}`.
 * @param project The project the status belongs to.
 * @param raw What the daemon answered.
 * @returns The status with every missing field filled in.
 */
export function normalizeRunnerStatus(project: string, raw: unknown): RunnerStatus {
  const status = (raw ?? {}) as Partial<RunnerStatus>;
  return {
    settings: {
      project,
      workflow: "review-loop",
      agent: "",
      model: null,
      maxConcurrent: 1,
      maxOpenPrs: 3,
      maxPerDay: 10,
      headroomPct: 80,
      minFreeGb: 25,
      runLocation: "auto",
      updatedAt: 0,
      ...status.settings,
    },
    entries: Array.isArray(status.entries) ? status.entries : [],
    dispatchedToday: status.dispatchedToday ?? 0,
    hold: status.hold ?? null,
    checkout: status.checkout ?? null,
  };
}

/**
 * An enqueue result every caller can read, whatever the transport answered.
 * @param project The project the tasks belong to.
 * @param raw What the daemon answered.
 * @returns The result with empty lists for anything missing.
 */
export function normalizeEnqueueResult(project: string, raw: unknown): EnqueueResult {
  const result = (raw ?? {}) as Partial<EnqueueResult>;
  return {
    created: Array.isArray(result.created) ? result.created : [],
    skipped: Array.isArray(result.skipped) ? result.skipped : [],
    status: normalizeRunnerStatus(project, result.status),
  };
}

export function RunnerMethods<TBase extends Constructor<CoreClient>>(Base: TBase) {
  // ── Factory RPCs ──
  // Not in the connect snapshot: views fetch a project's status and then stay
  // live off `runner.updated` / `runner.runUpdated`.
  return class extends Base {
    async runnerStatus(project: string): Promise<RunnerStatus> {
      return normalizeRunnerStatus(project, await this.request("runner.status", { project }));
    }

    /** One Factory task per backlog item, with one shared configuration. */
    async runnerEnqueue(
      project: string,
      itemIds: string[],
      config: FactoryConfig,
    ): Promise<EnqueueResult> {
      const result = await this.request("runner.enqueue", {
        agent: config.agent ?? undefined,
        deliver: config.deliver,
        item_ids: itemIds,
        model: config.model ?? undefined,
        project,
        run_location: config.runLocation,
        workflow: config.workflow ?? undefined,
      });
      return normalizeEnqueueResult(project, result);
    }

    /** Cancel a queued Factory task before it starts; its task is deleted. */
    async runnerDequeue(project: string, taskId: string): Promise<RunnerStatus> {
      const result = await this.request("runner.dequeue", { project, task_id: taskId });
      return normalizeRunnerStatus(project, result);
    }

    /** Put the queued tasks in this order. */
    async runnerReorder(project: string, taskIds: string[]): Promise<RunnerStatus> {
      const result = await this.request("runner.reorder", { project, task_ids: taskIds });
      return normalizeRunnerStatus(project, result);
    }

    /** Start a queued task now, past the project's limits. */
    async runnerStartNow(project: string, taskId: string): Promise<RunnerStatus> {
      const result = await this.request("runner.startNow", { project, task_id: taskId });
      return normalizeRunnerStatus(project, result);
    }

    /** Start a new Factory task configured like a finished one. */
    async runnerRetry(project: string, taskId: string): Promise<EnqueueResult> {
      const result = await this.request("runner.retry", { task_id: taskId });
      return normalizeEnqueueResult(project, result);
    }

    /** Try again to give back a project folder the Factory could not return. */
    async runnerRetryCheckout(project: string): Promise<RunnerStatus> {
      const result = await this.request("runner.retryCheckout", { project });
      return normalizeRunnerStatus(project, result);
    }

    /** The prompt a Factory task for this backlog item starts from. */
    async runnerBrief(project: string, itemId: string): Promise<string> {
      const result = await this.request("runner.brief", { item_id: itemId, project });
      return (result as { prompt?: string } | null)?.prompt ?? "";
    }

    async runnerUpdateSettings(project: string, patch: RunnerSettingsPatch): Promise<RunnerStatus> {
      const result = await this.request("runner.updateSettings", { patch, project });
      return normalizeRunnerStatus(project, result);
    }

    /** Stop every running Factory task of the project and remove the queued ones. */
    async runnerStop(project: string): Promise<RunnerStatus> {
      const result = await this.request("runner.stop", { project });
      return normalizeRunnerStatus(project, result);
    }

    async runnerRuns(project: string, limit = 25): Promise<ItemRun[]> {
      const result = await this.request("runner.runs", { limit, project });
      const runs = (result as { runs?: ItemRun[] })?.runs;
      return Array.isArray(runs) ? runs : [];
    }
  };
}
