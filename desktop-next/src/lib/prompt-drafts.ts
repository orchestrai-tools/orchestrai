import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface PromptDrafts {
  texts: Record<string, string>;
  sending: Record<string, number>;
  set: (taskId: string, text: string) => void;
  beginSend: (taskId: string) => number | null;
  finishSend: (taskId: string, token: number, submitted?: string) => boolean;
  forget: (taskId: string) => void;
}
let sendToken = 0;

/** Typed messages survive tab/page switches and reloads within this browser session. */
export const usePromptDrafts = create<PromptDrafts>()(
  persist(
    (set) => ({
      texts: {},
      sending: {},
      beginSend: (taskId) => {
        let token: number | null = null;
        set((state) => {
          if (state.sending[taskId]) return state;
          token = ++sendToken;
          return { sending: { ...state.sending, [taskId]: token } };
        });
        return token;
      },
      finishSend: (taskId, token, submitted) => {
        let accepted = false;
        set((state) => {
          if (state.sending[taskId] !== token) return state;
          accepted = true;
          const sending = { ...state.sending };
          delete sending[taskId];
          const texts = { ...state.texts };
          if (submitted !== undefined && (texts[taskId] ?? "") === submitted) delete texts[taskId];
          return { sending, texts };
        });
        return accepted;
      },
      set: (taskId, text) =>
        set((state) => {
          const texts = { ...state.texts };
          if (text) texts[taskId] = text;
          else delete texts[taskId];
          return { texts };
        }),
      forget: (taskId) =>
        set((state) => {
          const texts = { ...state.texts };
          delete texts[taskId];
          const sending = { ...state.sending };
          delete sending[taskId];
          return { texts, sending };
        }),
    }),
    {
      name: "orchestrai-prompt-drafts",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({ texts: state.texts }),
    },
  ),
);
