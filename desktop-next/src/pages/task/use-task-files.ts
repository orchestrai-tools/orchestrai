import { daemon } from "@warpforge/daemon";
import type { ProjectFile } from "@warpforge/protocol";
import { useEffect, useMemo, useState } from "react";

export interface TaskFiles {
  files: ProjectFile[];
  known: ReadonlySet<string>;
  loading: boolean;
  error: string | null;
}

/** The files in a task's checkout: the composer's @ mentions, and which transcript paths are links. */
export function useTaskFiles(project: string | undefined, taskId: string | undefined): TaskFiles {
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!project) return;
    let cancelled = false;
    setLoading(true);
    void daemon
      .request("file.list", taskId ? { project, task_id: taskId } : { project })
      .then((result) => {
        if (cancelled) return;
        setFiles(Array.isArray(result) ? (result as ProjectFile[]) : []);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setFiles([]);
        setError(err instanceof Error ? err.message : "Could not list files");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [project, taskId]);

  const known = useMemo(() => new Set(files.map((file) => file.path)), [files]);
  return { files, known, loading, error };
}

/** Loads a task's saved conversation once, when nothing has streamed in yet. */
export function useSessionHistory(taskId: string | null, count: number): boolean {
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!taskId || count > 0) return;
    let cancelled = false;
    setLoading(true);
    void daemon.loadSessionHistory(taskId).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [taskId, count]);

  return loading && count === 0;
}
