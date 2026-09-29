import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";
import { toast } from "sonner";

import { daemon } from "@/daemon";
import type { DaemonEvent, EntryRunLocation, ItemRun, RunnerStatus } from "@/protocol";

export const RUNNER_RUNS_LIMIT = 25;
export const runnerStatusKey = (project: string) => ["runner", project, "status"] as const;
export const runnerRunsKey = (project: string) => ["runner", project, "runs"] as const;

/**
 * Merge one attempt into a newest-first run list.
 * @param runs The cached runs.
 * @param run The attempt the daemon just wrote.
 * @returns The list with the attempt replaced or added, capped.
 */
export function upsertItemRun(runs: ItemRun[], run: ItemRun): ItemRun[] {
  const next = runs.some((candidate) => candidate.id === run.id)
    ? runs.map((candidate) => (candidate.id === run.id ? run : candidate))
    : [run, ...runs];
  return next.sort((a, b) => b.dispatchedAt - a.dispatchedAt).slice(0, RUNNER_RUNS_LIMIT);
}

/**
 * One project's Factory status and recent runs, kept live off the daemon's
 * `runner.*` events.
 * @param project The project name.
 * @returns The status and runs queries.
 */
export function useRunner(project: string) {
  const queryClient = useQueryClient();
  const status = useQuery({
    enabled: project.length > 0,
    queryFn: () => daemon.runnerStatus(project),
    queryKey: runnerStatusKey(project),
  });
  const runs = useQuery({
    enabled: project.length > 0,
    queryFn: () => daemon.runnerRuns(project, RUNNER_RUNS_LIMIT),
    queryKey: runnerRunsKey(project),
  });
  useEffect(
    () =>
      daemon.subscribeEvents((event: DaemonEvent) => {
        if (event.event === "runner.updated" && event.data.settings.project === project) {
          queryClient.setQueryData<RunnerStatus>(runnerStatusKey(project), event.data);
          return;
        }
        if (event.event === "runner.runUpdated" && event.data.project === project) {
          const run = event.data;
          queryClient.setQueryData<ItemRun[]>(runnerRunsKey(project), (previous) =>
            previous ? upsertItemRun(previous, run) : previous,
          );
        }
      }),
    [project, queryClient],
  );
  return { runs, status };
}

/**
 * Queue backlog items in the Factory and say what happens next.
 * @param project The project the items belong to.
 * @returns A function that queues the given item ids where they should run
 *   and resolves to whether they were queued.
 */
export function useQueueInFactory(project: string) {
  const queryClient = useQueryClient();
  return useCallback(
    async (itemIds: string[], runLocation: EntryRunLocation = "default"): Promise<boolean> => {
      try {
        const status = await daemon.runnerEnqueue(project, itemIds, runLocation);
        queryClient.setQueryData(runnerStatusKey(project), status);
        await queryClient.invalidateQueries({ queryKey: ["backlog", project] });
        const count = itemIds.length === 1 ? "Item" : `${itemIds.length} items`;
        if (status.settings.running) {
          toast.success(`${count} queued in the Factory`, {
            description: status.hold ?? "It starts as soon as a slot is free.",
          });
        } else {
          toast.success(`${count} queued in the Factory`, {
            description: "The Factory is paused. Start it to run the queue.",
            action: {
              label: "Start",
              onClick: () => {
                void daemon
                  .runnerUpdateSettings(project, { running: true })
                  .then((next) => queryClient.setQueryData(runnerStatusKey(project), next))
                  .catch((error: unknown) =>
                    toast.error("Could not start the Factory", {
                      description: error instanceof Error ? error.message : String(error),
                    }),
                  );
              },
            },
          });
        }
        return true;
      } catch (error) {
        toast.error("Could not queue in the Factory", {
          description: error instanceof Error ? error.message : String(error),
        });
        return false;
      }
    },
    [project, queryClient],
  );
}
