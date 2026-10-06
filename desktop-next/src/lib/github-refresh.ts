import type { PullRequestSummary } from "@warpforge/protocol";
import { useEffect } from "react";
import { create } from "zustand";
import { toast } from "sonner";
import { useShell } from "./shell-store";
import type { PaletteAction } from "./task-palette";

/** Bumps when the palette asks the GitHub page to load again. */
export const useGithubRefresh = create<{ tick: number; refresh: () => void }>((set) => ({
  tick: 0,
  refresh: () => set((state) => ({ tick: state.tick + 1 })),
}));

export function githubPaletteActions(): PaletteAction[] {
  return [
    {
      id: "refresh-pulls",
      label: "Refresh pull requests",
      run: () => {
        useShell.getState().setPage("github");
        useGithubRefresh.getState().refresh();
      },
    },
  ];
}

type ReviewEvent = "APPROVE" | "REQUEST_CHANGES" | "COMMENT";

type PullReview = {
  review: (event: ReviewEvent) => void;
  draft: boolean;
};

let pullReview: PullReview | null = null;

/** The open pull request registers its review so the palette can submit one. */
export function usePullReview(next: PullReview): void {
  useEffect(() => {
    pullReview = next;
    return () => {
      pullReview = null;
    };
  }, [next]);
}

function submitReview(event: ReviewEvent): void {
  useShell.getState().setPage("github");
  if (!pullReview) {
    toast.error("Open a pull request first");
    return;
  }
  if (pullReview.draft && event !== "COMMENT") {
    toast.error("Draft pull requests cannot receive a review verdict");
    return;
  }
  pullReview.review(event);
}

/** Copy the open pull request's branch or base, or submit a review. */
export function pullCopyActions(pull: PullRequestSummary | null): PaletteAction[] {
  if (!pull) return [];
  function copy(id: string, name: string): PaletteAction {
    return {
      id,
      label: id === "copy-branch" ? "Copy branch" : "Copy base",
      run: () => {
        void navigator.clipboard.writeText(name).then(
          () => toast.success(`Copied ${name}`),
          () => toast.error("Could not copy the branch"),
        );
      },
    };
  }
  return [
    copy("copy-branch", pull.headRefName),
    copy("copy-base", pull.baseRefName),
    {
      id: "approve-pull",
      label: "Approve pull request",
      run: () => submitReview("APPROVE"),
    },
    {
      id: "request-changes",
      label: "Request changes",
      run: () => submitReview("REQUEST_CHANGES"),
    },
    {
      id: "comment-pull",
      label: "Comment on pull request",
      run: () => submitReview("COMMENT"),
    },
    {
      id: "address-comments",
      label: "Address review comments",
      run: () => handoff("Address review comments"),
    },
    {
      id: "work-on-branch",
      label: "Work on this branch",
      run: () => handoff("Work on this branch"),
    },
    {
      id: "continue-in-task",
      label: "Continue in a task",
      run: () => handoff("Continue in a task"),
    },
  ];
}

function handoff(label: string): void {
  useShell.getState().setPage("github");
  const button = [...document.querySelectorAll("button")].find((item) => {
    const text = item.textContent?.trim() ?? "";
    return text === label || text.startsWith(`${label} `);
  });
  if (!(button instanceof HTMLButtonElement)) {
    toast.error("Open a pull request first");
    return;
  }
  if (button.disabled) {
    toast.error(button.title || "That handoff is not available");
    return;
  }
  button.click();
}
