import type { TaskInfo } from "@warpforge/protocol";
import { useAutomationPalette } from "./automation-palette";
import type { PaletteAction } from "./task-palette";
import { useSessionPalette } from "./session-palette";
import { channelPaletteActions } from "./channel-palette";
import { docsPaletteActions } from "./docs-palette";
import { memoryPaletteActions } from "./memory-palette";
import { useWorkflowPalette } from "./workflow-palette";
import { useWorktreePalette } from "./worktree-palette";

/** Workflows, automations, and sessions for the open project. */
export function useProjectPalette(
  project: string | null,
  open: boolean,
  tasks: TaskInfo[],
): PaletteAction[] {
  return [
    ...useWorkflowPalette(project, open),
    ...useAutomationPalette(project, open),
    ...useSessionPalette(project, open, tasks),
    ...useWorktreePalette(project, open),
    ...docsPaletteActions(project),
    ...channelPaletteActions(project),
    ...memoryPaletteActions(project),
  ];
}
