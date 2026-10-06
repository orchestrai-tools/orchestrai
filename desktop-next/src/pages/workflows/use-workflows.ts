import { daemon } from "@warpforge/daemon";
import { PROJECT_DIR, type FileDoc, type WorkflowMeta } from "@warpforge/protocol";
import { useCallback, useEffect, useState } from "react";

export const workflowPath = (id: string) => `${PROJECT_DIR}/workflows/${id}.yaml`;

const message = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);

/** The workflows the daemon lists for a project: its own files first, then the built-ins. */
export function useWorkflowList(project: string) {
  const [rows, setRows] = useState<WorkflowMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    return daemon
      .workflowList(project)
      .then((next) => {
        setRows(next);
        setError(null);
        return next;
      })
      .catch((err: unknown) => {
        setError(message(err, "Could not list workflows"));
        return null;
      })
      .finally(() => setLoading(false));
  }, [project]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { rows, loading, error, reload };
}

/** A project workflow's YAML file. Built-ins have no file until they are copied into the project. */
export function useWorkflowFile(project: string, workflow: WorkflowMeta | undefined) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const id = workflow?.source === "project" ? workflow.id : null;

  useEffect(() => {
    setText(null);
    setError(null);
    if (!id) return;
    let cancelled = false;
    void daemon
      .request("file.contents", { project, path: workflowPath(id), task_id: "" })
      .then((result) => !cancelled && setText((result as FileDoc).newText ?? ""))
      .catch((err: unknown) => !cancelled && setError(message(err, "Could not read the workflow")));
    return () => {
      cancelled = true;
    };
  }, [project, id, tick]);

  return { text, error, reload: () => setTick((count) => count + 1), setText };
}

export function saveWorkflowFile(project: string, id: string, content: string) {
  return daemon.request("file.save", { project, path: workflowPath(id), content, task_id: "" });
}

export function deleteWorkflowFile(project: string, id: string) {
  return daemon.request("file.delete", { project, path: workflowPath(id), task_id: "" });
}

/** The first `<base>`, `<base>-2`, … that no listed workflow uses. */
export function uniqueId(base: string, rows: WorkflowMeta[]) {
  const taken = new Set(rows.map((row) => row.id));
  if (!taken.has(base)) return base;
  let count = 2;
  while (taken.has(`${base}-${count}`)) count += 1;
  return `${base}-${count}`;
}

/** The YAML with its top-level `name:` replaced, or one added when the file has none. */
export function renameYaml(yaml: string, name: string) {
  const line = `name: ${JSON.stringify(name)}`;
  return /^name:.*$/m.test(yaml) ? yaml.replace(/^name:.*$/m, line) : `${line}\n${yaml}`;
}
