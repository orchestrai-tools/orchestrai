import { daemon } from "@warpforge/daemon";
import type { Automation } from "@warpforge/protocol";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { PaletteAction } from "./task-palette";

/** Run each automation in this project from the command palette. */
export function useAutomationPalette(project: string | null, open: boolean): PaletteAction[] {
  const [rows, setRows] = useState<Automation[]>([]);
  useEffect(() => {
    if (!open || !project) {
      setRows([]);
      return;
    }
    let cancelled = false;
    void daemon
      .listAutomations(project)
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
  return rows.map((automation) => ({
    id: `run-automation:${automation.id}`,
    label: `Run ${automation.name} now`,
    run: () => {
      void daemon
        .runAutomationNow(automation.id)
        .then(() => toast.success(`Ran ${automation.name}`))
        .catch((err: unknown) =>
          toast.error(err instanceof Error ? err.message : "Could not run it"),
        );
    },
  }));
}
