import { daemon } from "@warpforge/daemon";
import type { TaskInfo } from "@warpforge/protocol";
import { useEffect } from "react";
import { toast } from "sonner";
import { CHAT_ORIGIN, chatAgent, isChat } from "../model/chat";
import { generatedTitle } from "../pages/task/task-title";
import { useShell } from "./shell-store";

/** Opens an empty conversation in the current project; the agent starts on the first message. */
export async function newChat(): Promise<void> {
  const project = useShell.getState().project;
  if (!project) {
    toast.info("Open a project to start a chat");
    return;
  }
  const { tasks, agents } = daemon.getState().snapshot;
  try {
    const id = await daemon.taskCreate({
      agent: chatAgent(tasks, agents ?? [], project),
      origin: CHAT_ORIGIN,
      project,
      prompt: "",
      start: false,
      worktree: false,
    });
    useShell.getState().openTask(id, project);
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Could not start a chat");
  }
}

const named = new Set<string>();

/**
 * Names a chat once its first message has become the prompt. Runs once per
 * chat per window, and not at all when auto-naming is off.
 */
export function useChatAutoName(task: TaskInfo | undefined): void {
  const autoName = useShell((state) => state.autoNameTasks);
  const ready = task && isChat(task) && !task.title.trim() && task.prompt.trim().length > 0;
  const id = ready ? task.id : null;
  const agent = task?.agent;
  useEffect(() => {
    if (!id || !agent || !autoName || named.has(id)) return;
    named.add(id);
    void daemon
      .generateText(id, agent, "task_title")
      .then((text) => {
        const title = generatedTitle(text);
        if (title) return daemon.setTaskTitle(id, title);
      })
      .catch(() => undefined);
  }, [id, agent, autoName]);
}

/** Turns a chat into an ordinary task, so it joins the board. */
export async function promoteChat(taskId: string): Promise<void> {
  try {
    await daemon.setTaskOrigin(taskId, null);
    toast.success("Moved to the board");
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Could not make it a task");
  }
}
