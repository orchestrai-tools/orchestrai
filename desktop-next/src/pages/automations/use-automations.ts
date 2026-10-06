import { daemon } from "@warpforge/daemon";
import type { Automation, AutomationRun } from "@warpforge/protocol";
import { useCallback, useEffect, useRef, useState } from "react";

import { filterAutomations } from "../../lib/automation-filter";

export type Scope = "project" | "all";
export type StateFilter = "all" | "on" | "off";
export type OutcomeFilter = "all" | "completed" | "failed" | "skipped" | "never";

export interface AutomationFilters {
  search: string;
  state: StateFilter;
  outcome: OutcomeFilter;
}

export const IDLE_FILTERS: AutomationFilters = { search: "", state: "all", outcome: "all" };

/** The toolbar's filters. Skipped and never-run are read from the last run, which the shared filter does not cover. */
export function matchAutomations(rows: Automation[], filters: AutomationFilters): Automation[] {
  const last =
    filters.outcome === "completed" || filters.outcome === "failed" ? filters.outcome : "all";
  return filterAutomations(rows, { search: filters.search, enabled: filters.state, last }).filter(
    (row) => {
      if (filters.outcome === "skipped") return Boolean(row.lastStatus?.startsWith("skipped"));
      if (filters.outcome === "never") return !row.lastRunAt;
      return true;
    },
  );
}

const RUNS_PER_AUTOMATION = 25;
const REFRESH_MS = 60_000;

const message = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);

/** The automations in scope and each one's recent runs, refreshed every minute so next-run times stay true. */
export function useAutomations(project: string, scope: Scope) {
  const [rows, setRows] = useState<Automation[]>([]);
  const [runs, setRuns] = useState<Record<string, AutomationRun[]>>({});
  const [runsError, setRunsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const liveRows = useRef(new Map<string, Automation | null>());
  const liveRuns = useRef(new Map<string, AutomationRun>());

  const reload = useCallback(() => {
    const run = ++generation.current;
    setLoading(true);
    return daemon
      .listAutomations(scope === "all" ? null : project)
      .then(async (next) => {
        if (run !== generation.current) return;
        const merged = new Map(next.map((row) => [row.id, row]));
        for (const [id, row] of liveRows.current) {
          if (row && (scope === "all" || row.project === project)) merged.set(id, row);
          else merged.delete(id);
        }
        next = [...merged.values()];
        setRows(next);
        setError(null);
        const settled = await Promise.allSettled(
          next.map((row) => daemon.automationRuns(row.id, RUNS_PER_AUTOMATION)),
        );
        if (run !== generation.current) return;
        const failure = settled.find((result) => result.status === "rejected");
        setRunsError(failure ? message(failure.reason, "Could not load the runs") : null);
        setRuns(
          Object.fromEntries(
            next.map((row, index) => {
              const result = settled[index];
              const fetched = result?.status === "fulfilled" ? result.value : [];
              const byId = new Map(fetched.map((item) => [item.id, item]));
              for (const item of liveRuns.current.values()) {
                if (item.automationId === row.id) byId.set(item.id, item);
              }
              return [
                row.id,
                [...byId.values()]
                  .sort((a, b) => b.runNumber - a.runNumber)
                  .slice(0, RUNS_PER_AUTOMATION),
              ];
            }),
          ),
        );
      })
      .catch((err: unknown) => {
        if (run === generation.current) setError(message(err, "Could not list automations"));
      })
      .finally(() => {
        if (run === generation.current) setLoading(false);
      });
  }, [project, scope]);

  useEffect(() => {
    liveRows.current.clear();
    liveRuns.current.clear();
    const unsubscribe = daemon.subscribeEvents((event) => {
      if (event.event === "automation.updated") {
        const row = event.data;
        liveRows.current.set(row.id, row);
        setRows((current) => {
          const rest = current.filter((item) => item.id !== row.id);
          return scope === "all" || row.project === project ? [...rest, row] : rest;
        });
      } else if (event.event === "automation.removed") {
        liveRows.current.set(event.data.id, null);
        setRows((current) => current.filter((row) => row.id !== event.data.id));
      } else if (event.event === "automation.runUpdated") {
        const run = event.data;
        liveRuns.current.set(run.id, run);
        setRuns((current) => ({
          ...current,
          [run.automationId]: [
            run,
            ...(current[run.automationId] ?? []).filter((item) => item.id !== run.id),
          ]
            .sort((a, b) => b.runNumber - a.runNumber)
            .slice(0, RUNS_PER_AUTOMATION),
        }));
      }
    });
    void reload();
    const timer = setInterval(() => void reload(), REFRESH_MS);
    return () => {
      clearInterval(timer);
      unsubscribe();
      generation.current++;
    };
  }, [reload, project, scope]);

  const replace = useCallback((automation: Automation) => {
    setRows((current) => current.map((row) => (row.id === automation.id ? automation : row)));
  }, []);

  return { rows, runs, runsError, loading, error, reload, replace };
}
