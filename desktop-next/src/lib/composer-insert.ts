import { toast } from "sonner";
import { create } from "zustand";

import { useTaskDraft } from "./new-task";
import { useShell } from "./shell-store";

/** Text waiting to be appended to the open task's composer. */
export const useComposerInsert = create<{
  pending: { id: number; text: string; taskId?: string | null } | null;
  append: (text: string) => void;
  /** Clears a pending insert and reports whether this caller won it. */
  claim: (id: number, taskId?: string) => boolean;
}>((set) => ({
  pending: null,
  append: (text) => set({ pending: { id: Date.now(), text, taskId: useShell.getState().taskId } }),
  claim: (id, taskId) => {
    let won = false;
    set((state) => {
      if (state.pending?.id !== id) return state;
      if (taskId && state.pending.taskId !== taskId) return state;
      won = true;
      return { pending: null };
    });
    return won;
  },
}));

/** Put text in the open task's composer, or start a task with it. */
export function deliverToConversation(project: string, text: string) {
  const shell = useShell.getState();
  if (shell.taskId && shell.project === project) {
    useComposerInsert.getState().append(text);
    shell.setTaskTab("conversation");
    shell.setPage("task");
    toast.success("Added to the conversation");
    return;
  }
  useTaskDraft.getState().open(text);
}
