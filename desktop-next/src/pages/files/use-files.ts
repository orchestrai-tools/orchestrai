import { daemon } from "@warpforge/daemon";
import type { ProjectFile, SymbolMatch } from "@warpforge/protocol";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useSavedFind } from "../../lib/file-tabs";
import { useRequestGate } from "../../lib/request-gate";

/** The project's file list for the task's worktree, or the project checkout when no task is open. */
export function useProjectFiles(project: string, taskId: string) {
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const gate = useRequestGate(JSON.stringify([project, taskId]));

  function load() {
    if (!project) return;
    const current = gate.begin();
    setLoading(true);
    daemon
      .request("file.list", taskId ? { project, task_id: taskId } : { project })
      .then((result) => {
        if (!current()) return;
        setFiles(result as ProjectFile[]);
        setError(null);
      })
      .catch((err: unknown) => {
        if (current()) setError(err instanceof Error ? err.message : "Could not list files");
      })
      .finally(() => {
        if (current()) setLoading(false);
      });
  }

  useEffect(() => {
    setFiles([]);
    setError(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, taskId]);

  return { files, error, loading, load };
}

/** Run one file RPC against the open worktree, then toast the outcome. */
export async function fileAct(
  project: string,
  taskId: string,
  label: string,
  method: string,
  params: Record<string, unknown>,
): Promise<boolean> {
  try {
    await daemon.request(method, { project, task_id: taskId, ...params });
    toast.success(label);
    return true;
  } catch (err) {
    toast.error(err instanceof Error ? err.message : `Could not ${label.toLowerCase()}`);
    return false;
  }
}

/** Find in files, searched as you type and kept with the task. */
export function useFileFind(project: string, taskId: string, worktree: string | undefined) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SymbolMatch[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const gate = useRequestGate(JSON.stringify([project, taskId, worktree]));
  useSavedFind(taskId, project, worktree, query, setQuery);

  async function search() {
    if (!project || !query.trim()) return;
    const current = gate.begin();
    try {
      const matches = (await daemon.request("file.search", {
        limit: 50,
        query,
        project,
        task_id: taskId,
      })) as SymbolMatch[];
      if (!current()) return;
      setHits(matches);
      setError(null);
    } catch (err) {
      if (!current()) return;
      setHits([]);
      setError(err instanceof Error ? err.message : "Could not search files");
    } finally {
      if (current()) setSearched(true);
    }
  }

  useEffect(() => {
    if (query.trim()) void search();
    else {
      gate.invalidate();
      setHits([]);
      setSearched(false);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, project, taskId, worktree]);

  return { query, setQuery, hits, error, searched, search };
}
