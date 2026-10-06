import { daemon } from "@warpforge/daemon";

import { generatedTitle } from "../pages/task/task-title";
import { useShell } from "./shell-store";

/** Restore the original opt-in naming after creation, without delaying the task. */
export async function autoNameCreatedTask(taskId: string): Promise<void> {
  const { autoNameTasks, textGenAgentId, textGenModel } = useShell.getState();
  if (!autoNameTasks || !textGenAgentId) return;
  try {
    const title = generatedTitle(
      await daemon.generateText(taskId, textGenAgentId, "task_title", textGenModel || undefined),
    );
    if (title) await daemon.setTaskTitle(taskId, title);
  } catch {
    // A title is optional; a failed naming request must not fail task creation.
  }
}
