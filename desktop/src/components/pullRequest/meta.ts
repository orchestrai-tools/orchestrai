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
  { icon: LucideIcon; label: string; toneClass: string; chipClass: string }
> = {
  closed: {
    chipClass: "bg-muted text-muted-foreground/70 line-through decoration-muted-foreground/40",
    icon: GitPullRequestClosed,
    label: "Closed",
    toneClass: "text-destructive",
  },
  draft: {
    chipClass: "bg-muted text-muted-foreground",
    icon: GitPullRequestDraft,
    label: "Draft",
    toneClass: "text-muted-foreground",
  },
  merged: {
    chipClass: "bg-violet-400/10 text-violet-400",
    icon: GitMerge,
    label: "Merged",
    toneClass: "text-violet-400",
  },
  open: {
    chipClass: "bg-ok/10 text-ok hover:bg-ok/15",
    icon: GitPullRequest,
    label: "Open",
    toneClass: "text-ok",
  },
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

/** Checks as one phrase: the count when known, else the generic label. */
function checksPhrase(pr: TaskPullRequest, checks: PullChecks): string {
  const failed = pr.failedChecks?.length ?? 0;
  if (checks === "failing" && failed > 0) {
    return `${failed} check${failed === 1 ? "" : "s"} failing`;
  }
  return PULL_CHECKS_META[checks].label;
}

/** One line for a tooltip or an accessible name: "PR #12 · Open · 2 checks failing". */
export function pullRequestSummary(pr: TaskPullRequest): string {
  const checks = liveChecks(pr);
  return [`PR #${pr.number}`, PULL_STATE_META[pr.state].label, checks && checksPhrase(pr, checks)]
    .filter(Boolean)
    .join(" · ");
}
