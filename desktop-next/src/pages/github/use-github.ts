import { daemon } from "@warpforge/daemon";
import type { BacklogItem, PullRequestSummary } from "@warpforge/protocol";
import { useEffect, useState } from "react";
import { useGithubRefresh } from "../../lib/github-refresh";
import { seedSeen } from "../../lib/inbox-seen";
import { useShell } from "../../lib/shell-store";
import { listErrorText } from "./pull-meta";

/** The project's pull requests from GitHub, with the server-side filters the shell remembers. */
export function usePulls(project: string) {
  const inbox = useShell((state) => state.inbox);
  const refreshTick = useGithubRefresh((state) => state.tick);
  const [pulls, setPulls] = useState<PullRequestSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    daemon
      .listPulls(project, {
        state: inbox.state,
        search: inbox.search || undefined,
        assignedToMe: inbox.assignedToMe || undefined,
      })
      .then((rows) => {
        if (cancelled) return;
        seedSeen(rows);
        setPulls(rows);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(listErrorText(err, "Could not list pull requests"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [project, inbox.state, inbox.search, inbox.assignedToMe, refreshTick, tick]);

  return { pulls, error, loading, reload: () => setTick((value) => value + 1) };
}

/** GitHub issues that the project backlog imported. */
export function useIssues(project: string) {
  const refreshTick = useGithubRefresh((state) => state.tick);
  const [issues, setIssues] = useState<BacklogItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    daemon
      .listBacklog({ project, page: 1, pageSize: 100, source: "github" })
      .then((page) => {
        if (cancelled) return;
        setIssues(Array.isArray(page.items) ? page.items : []);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(listErrorText(err, "Could not load issues"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [project, refreshTick, tick]);

  return { issues, error, loading, reload: () => setTick((value) => value + 1) };
}
