import { daemon } from "@warpforge/daemon";
import type { GitBranchList, GitPushInfo } from "@warpforge/protocol";
import { useEffect, useState } from "react";

import { targetKey, type RepoTarget } from "../../lib/repo-target";

/**
 * Local and remote branches plus what a push would send, read again whenever
 * `tick` moves. A failed branch list keeps its error until `retry` succeeds.
 */
export function useBranchInfo(target: RepoTarget | null, tick: number) {
  const key = target ? targetKey(target) : "";
  const [branches, setBranches] = useState<GitBranchList | null>(null);
  const [push, setPush] = useState<GitPushInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!target) {
      setBranches(null);
      setError(null);
      setLoading(false);
      return;
    }
    let live = true;
    setLoading(true);
    daemon
      .request("git.branches", target)
      .then(
        (result) => {
          if (!live) return;
          setBranches(result as GitBranchList);
          setError(null);
        },
        (err: unknown) => {
          if (!live) return;
          setBranches(null);
          setError(err instanceof Error ? err.message : String(err));
        },
      )
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick, attempt]);

  useEffect(() => {
    setPush(null);
    if (!target) return;
    let live = true;
    void daemon.request("git.pushInfo", target).then(
      (result) => live && setPush(result as GitPushInfo),
      () => live && setPush(null),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick]);

  return { branches, push, error, loading, retry: () => setAttempt((count) => count + 1) };
}

export type BranchInfo = ReturnType<typeof useBranchInfo>;
