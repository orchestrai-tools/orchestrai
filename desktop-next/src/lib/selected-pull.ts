import { create } from "zustand";
import type { PullRequestSummary } from "@warpforge/protocol";

/** The pull request open on the GitHub page. Cleared when that page unmounts. */
export const useSelectedPull = create<{
  pull: PullRequestSummary | null;
  select: (pull: PullRequestSummary | null) => void;
}>((set) => ({
  pull: null,
  select: (pull) => set({ pull }),
}));

export function pullSizeLabel(pull: Pick<PullRequestSummary, "additions" | "deletions" | "changedFiles">): string {
  const files = pull.changedFiles ?? 0;
  return `${files} ${files === 1 ? "file" : "files"} · +${pull.additions ?? 0} −${pull.deletions ?? 0}`;
}
