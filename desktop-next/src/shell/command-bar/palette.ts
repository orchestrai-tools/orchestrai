import { useEffect, useMemo } from "react";
import type { PaletteAction } from "../../lib/task-palette";
import { useShell } from "../../lib/shell-store";
import { useCommandRun } from "./run-store";

/**
 * The project's just recipes, package scripts, and Makefile targets as palette
 * actions. They run the way the command bar runs them, parameters and
 * terminal routing included.
 */
export function useRunCommandPalette(open: boolean): PaletteAction[] {
  const inProject = useShell((state) => !state.home && Boolean(state.project));
  const detected = useCommandRun((state) => state.detected);
  const load = useCommandRun((state) => state.load);

  useEffect(() => {
    if (open && inProject) load();
  }, [open, inProject, load]);

  return useMemo(() => {
    if (!inProject) return [];
    return (detected?.commands ?? []).map((command) => ({
      id: `run:${command.id}`,
      label: `Run: ${command.command}${command.params?.length ? " …" : ""}`,
      keywords: [command.name, command.description, ...(command.aliases ?? []), command.group]
        .filter(Boolean)
        .join(" "),
      run: () =>
        useCommandRun
          .getState()
          .choose({ key: command.id, line: command.command, command }, false),
    }));
  }, [detected, inProject]);
}
