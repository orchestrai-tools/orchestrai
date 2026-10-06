import { create } from "zustand";

export type InboxScope = "project" | "all";

/** Whether the Inbox shows this project or every project. Home opens it widened. */
export const useInboxScope = create<{ scope: InboxScope; setScope: (scope: InboxScope) => void }>(
  (set) => ({
    scope: "project",
    setScope: (scope) => set({ scope }),
  }),
);
