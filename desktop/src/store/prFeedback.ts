import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Tasks remembered; recording one more drops the least recently recorded. */
const TASK_LIMIT = 200;

interface PrFeedbackState {
  /** Pull-request feedback keys already sent to the agent or dismissed, per task. */
  handledByTask: Record<string, string[]>;
  /** Replace a task's handled keys with everything its pull request shows now. */
  record: (taskId: string, keys: readonly string[]) => void;
}

/**
 * Which failing checks and review remarks each task's agent was already told
 * about. Per device, like the inbox's seen marks (ADR 0010, 0020).
 */
export const usePrFeedbackStore = create<PrFeedbackState>()(
  persist(
    (set) => ({
      handledByTask: {},
      record: (taskId, keys) =>
        set((state) => {
          const next = { ...state.handledByTask };
          delete next[taskId];
          next[taskId] = [...keys];
          const ids = Object.keys(next);
          for (const id of ids.slice(0, Math.max(0, ids.length - TASK_LIMIT))) delete next[id];
          return { handledByTask: next };
        }),
    }),
    {
      name: "wf-pr-feedback",
      partialize: (state) => ({ handledByTask: state.handledByTask }),
      version: 1,
    },
  ),
);
