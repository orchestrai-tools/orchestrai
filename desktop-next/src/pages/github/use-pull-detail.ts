import { daemon } from "@warpforge/daemon";
import type {
  PullCheckRun,
  PullRequestDetails,
  PullRequestDiff,
  PullThread,
} from "@warpforge/protocol";
import { useEffect, useState } from "react";
import { useGithubRefresh } from "../../lib/github-refresh";
import { unresolvedReviewComments } from "../../lib/inbox-task-prompt";
import { errorText } from "./pull-meta";

/** One pull request's body, checks, diff and unresolved comment count, reloaded together. */
export function usePullDetail(project: string, number: number) {
  const refreshTick = useGithubRefresh((state) => state.tick);
  const [reload, setReload] = useState(0);
  const [detail, setDetail] = useState<PullRequestDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checks, setChecks] = useState<PullCheckRun[] | null>(null);
  const [checksError, setChecksError] = useState<string | null>(null);
  const [diff, setDiff] = useState<PullRequestDiff | null>(null);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [unresolved, setUnresolved] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const live =
      <T>(set: (value: T) => void) =>
      (value: T) => {
        if (!cancelled) set(value);
      };
    setDetail(null);
    setError(null);
    setChecks(null);
    setDiff(null);
    setDiffError(null);
    setUnresolved(null);
    daemon
      .pullDetails(project, number)
      .then(live(setDetail))
      .catch((err: unknown) => live(setError)(errorText(err, "Could not load the pull request")));
    daemon
      .pullChecks(project, number)
      .then((rows) => {
        live(setChecks)(rows);
        live(setChecksError)(null);
      })
      .catch((err: unknown) => live(setChecksError)(errorText(err, "Could not load checks")));
    daemon
      .pullDiff(project, number)
      .then(live(setDiff))
      .catch((err: unknown) => live(setDiffError)(errorText(err, "Could not load the diff")));
    daemon
      .pullThread(project, number)
      .then((thread: PullThread) => live(setUnresolved)(unresolvedReviewComments(thread).length))
      .catch(() => live(setUnresolved)(null));
    return () => {
      cancelled = true;
    };
  }, [project, number, reload, refreshTick]);

  return {
    detail,
    error,
    checks,
    checksError,
    diff,
    diffError,
    unresolved,
    reload: () => setReload((value) => value + 1),
  };
}
