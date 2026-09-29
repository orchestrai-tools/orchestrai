import type { ItemRun, RunnerSettingsPatch, RunnerStatus } from "../protocol";
import type { CoreClient } from "./client";
import type { Constructor } from "./types";

/**
 * A status the Factory surface can always render, even from the demo
 * transport, which answers unknown methods with `{}`.
 * @param project The project the status belongs to.
 * @param raw What the daemon answered.
 * @returns The status with every missing field filled in.
 */
export function normalizeRunnerStatus(project: string, raw: unknown): RunnerStatus {
  const status = (raw ?? {}) as Partial<RunnerStatus>;
  return {
    settings: {
      project,
      running: false,
      workflow: "review-loop",
      agent: "",
      model: null,
      maxConcurrent: 1,
      maxOpenPrs: 3,
      maxPerDay: 10,
      headroomPct: 80,
      minFreeGb: 25,
      runLocation: "worktree",
      updatedAt: 0,
      ...status.settings,
    },
    entries: Array.isArray(status.entries) ? status.entries : [],
    dispatchedToday: status.dispatchedToday ?? 0,
    hold: status.hold ?? null,
    checkout: status.checkout ?? null,
  };
}

export function RunnerMethods<TBase extends Constructor<CoreClient>>(Base: TBase) {
  // ── Backlog runner RPCs ──
  // Not in the connect snapshot; the Factory surface fetches its project's
  // status and then stays live off `runner.updated` / `runner.runUpdated`.
  return class extends Base {
    async runnerStatus(project: string): Promise<RunnerStatus> {
      return normalizeRunnerStatus(project, await this.request("runner.status", { project }));
    }

    /** Queue backlog items; ones already queued keep their place. */
    async runnerEnqueue(project: string, itemIds: string[]): Promise<RunnerStatus> {
      const result = await this.request("runner.enqueue", { item_ids: itemIds, project });
      return normalizeRunnerStatus(project, result);
    }

    /** Remove an item that has not started yet. */
    async runnerDequeue(project: string, itemId: string): Promise<RunnerStatus> {
      const result = await this.request("runner.dequeue", { item_id: itemId, project });
      return normalizeRunnerStatus(project, result);
    }

    /** Put the queued items in this order. */
    async runnerReorder(project: string, itemIds: string[]): Promise<RunnerStatus> {
      const result = await this.request("runner.reorder", { item_ids: itemIds, project });
      return normalizeRunnerStatus(project, result);
    }

    /** Change settings, including Start (`running: true`) and Pause. */
    async runnerUpdateSettings(project: string, patch: RunnerSettingsPatch): Promise<RunnerStatus> {
      const result = await this.request("runner.updateSettings", { patch, project });
      return normalizeRunnerStatus(project, result);
    }

    /** Pause and stop every running item; they go back to the queue. */
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
