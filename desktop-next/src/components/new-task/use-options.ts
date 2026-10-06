import { daemon } from "@warpforge/daemon";
import type { ExternalSession, GitBranchList, WorkflowMeta } from "@warpforge/protocol";
import { useEffect, useState } from "react";

/** Workflows, resumable sessions, and branches for the new task form, loaded while it is open. */
export function useNewTaskOptions(open: boolean, project: string | undefined, worktree: boolean) {
  const [workflows, setWorkflows] = useState<WorkflowMeta[]>([]);
  const [sessions, setSessions] = useState<ExternalSession[]>([]);
  const [branches, setBranches] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!open || !project) return;
    let cancelled = false;
    const fail = (err: unknown) => {
      if (!cancelled)
        setLoadError(err instanceof Error ? err.message : "Could not load the new task options");
    };
    setLoadError(null);
    void daemon
      .workflowList(project)
      .then((next) => {
        if (!cancelled) setWorkflows(next);
      })
      .catch(fail);
    void daemon
      .listSessions(project)
      .then((next) => {
        if (!cancelled) setSessions(next);
      })
      .catch(fail);
    if (worktree) {
      void daemon
        .request("git.branches", { project })
        .then((result) => {
          if (!cancelled) setBranches((result as GitBranchList).branches ?? []);
        })
        .catch(fail);
    }
    return () => {
      cancelled = true;
    };
  }, [open, project, worktree, reload]);

  return {
    workflows,
    sessions,
    branches,
    loadError,
    retry: () => setReload((count) => count + 1),
  };
}
