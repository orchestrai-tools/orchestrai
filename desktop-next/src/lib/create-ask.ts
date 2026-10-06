import { create } from "zustand";

export type CreateAsk = "work" | "automation" | null;

/** The palette opens a create dialog on the page that owns it. */
export const useCreateAsk = create<{
  kind: CreateAsk;
  ask: (kind: Exclude<CreateAsk, null>) => void;
  clear: () => void;
}>((set) => ({
  kind: null,
  ask: (kind) => set({ kind }),
  clear: () => set({ kind: null }),
}));
