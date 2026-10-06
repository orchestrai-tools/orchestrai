import { create } from "zustand";

export type CommitAsk = "draft" | "amend" | "shelf" | "stash";

/** The Changes commit box runs this when it is on screen. The palette sets it from any page. */
export const useCommitAsk = create<{
  pending: CommitAsk | null;
  ask: (kind: CommitAsk) => void;
  clear: () => void;
}>((set) => ({
  pending: null,
  ask: (pending) => set({ pending }),
  clear: () => set({ pending: null }),
}));
