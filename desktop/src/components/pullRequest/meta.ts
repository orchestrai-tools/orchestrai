import {
  CircleCheck,
  CircleDashed,
  CircleX,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  GitPullRequestDraft,
  type LucideIcon,
} from "lucide-react";

import type { PullChecks, TaskPullRequest, TaskPullState } from "@/protocol";

export const PULL_STATE_META: Record<
  TaskPullState,
  { icon: LucideIcon; label: string; toneClass: string }
> = {
  closed: { icon: GitPullRequestClosed, label: "Closed", toneClass: "text-destructive" },
  draft: { icon: GitPullRequestDraft, label: "Draft", toneClass: "text-muted-foreground" },
  merged: { icon: GitMerge, label: "Merged", toneClass: "text-violet-400" },
  open: { icon: GitPullRequest, label: "Open", toneClass: "text-ok" },
};

export const PULL_CHECKS_META: Record<
  PullChecks,
  { icon: LucideIcon; label: string; toneClass: string; dotClass: string }
> = {
  failing: {
    dotClass: "bg-destructive",
    icon: CircleX,
    label: "Checks failing",
    toneClass: "text-destructive",
  },
  passing: { dotClass: "bg-ok", icon: CircleCheck, label: "Checks passing", toneClass: "text-ok" },
  pending: {
    dotClass: "bg-warn",
    icon: CircleDashed,
    label: "Checks running",
    toneClass: "text-warn",
  },
};

/** Checks only matter while the pull request can still change. */
export function liveChecks(pr: TaskPullRequest): PullChecks | null {
  return pr.state === "open" || pr.state === "draft" ? (pr.checks ?? null) : null;
}

/** One line for a tooltip or an accessible name: "PR #12 · Open · Checks failing". */
export function pullRequestSummary(pr: TaskPullRequest): string {
  const checks = liveChecks(pr);
  return [
    `PR #${pr.number}`,
    PULL_STATE_META[pr.state].label,
    checks && PULL_CHECKS_META[checks].label,
  ]
    .filter(Boolean)
    .join(" · ");
}
