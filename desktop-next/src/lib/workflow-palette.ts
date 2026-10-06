import { daemon } from "@warpforge/daemon";
import type { WorkflowMeta } from "@warpforge/protocol";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useTaskDraft } from "./new-task";
import type { PaletteAction } from "./task-palette";

/** Run or copy each workflow, once the command palette is open. */
export function useWorkflowPalette(project: string | null, open: boolean): PaletteAction[] {
  const [rows, setRows] = useState<WorkflowMeta[]>([]);
  useEffect(() => {
    if (!open || !project) {
      setRows([]);
      return;
    }
    let cancelled = false;
    void daemon
      .workflowList(project)
      .then((next) => {
        if (!cancelled) setRows(next);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, project]);
  if (!project) return [];
  return rows.flatMap((workflow) => [
    {
      id: `run-workflow:${workflow.id}`,
      label: `Run ${workflow.name}…`,
      run: () => {
        if (!workflow.valid) {
          toast.error(workflow.error || "This workflow is not valid");
          return;
        }
        useTaskDraft.getState().open("", workflow.id);
      },
    },
    {
      id: `copy-workflow:${workflow.id}`,
      label: `Copy ${workflow.name} into the project`,
      run: () => {
        void daemon
          .workflowEject(project, workflow.id)
          .then((path) => toast.success(path ? `Copied into ${path}` : "Copied into the project"))
          .catch((err: unknown) =>
            toast.error(err instanceof Error ? err.message : "Could not copy the workflow"),
          );
      },
    },
  ]);
}
