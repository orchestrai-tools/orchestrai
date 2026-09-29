import {
  formatRemarkList,
  GITHUB_UNTRUSTED_GUIDANCE,
  GITHUB_UNTRUSTED_NOTICE,
  GITHUB_UNTRUSTED_TAG,
} from "@/lib/inboxTaskPrompt";
import { untrustedBlock } from "@/lib/untrustedBlock";
import type { PullCheckRun, PullComment, TaskPullRequest } from "@/protocol";

/** What a task's pull request has said since the agent was last told. */
export interface PrFeedback {
  checks: PullCheckRun[];
  comments: PullComment[];
  /** Every item the pull request shows now, sent or not: what to record once
   *  the user sends or dismisses, so none of it is raised again. */
  keys: string[];
}

/** Body characters per remark; the rest stays on GitHub. */
const BODY_LIMIT = 1_200;
const REPLY_LIMIT = 600;
/** Replies quoted per thread, newest kept. */
const REPLIES_SHOWN = 5;
/** Hunk lines quoted per inline comment. */
const QUOTE_MIN = 3;
const QUOTE_MAX = 12;
/** Lines of a failed job's log the prompt suggests reading. */
const LOG_TAIL = 80;
const ACTIONS_URL =
  /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/actions\/runs\/(\d+)(?:\/jobs?\/(\d+))?\/?(?:[?#].*)?$/;
const DIGITS = /^\d{1,20}$/;

function checkKey(pr: TaskPullRequest, run: PullCheckRun): string {
  return `check:${pr.headOid ?? ""}:${run.name}`;
}

/** A thread is new again only when someone other than the pull request's
 *  author wrote in it: the author's own "fixed" reply is not feedback. */
function commentKey(pr: TaskPullRequest, comment: PullComment): string {
  if (comment.kind !== "review_comment") return `review:${comment.id}`;
  const outside = [comment, ...comment.replies].filter(
    (entry) => !pr.author || entry.author?.login !== pr.author,
  );
  return `thread:${comment.id}:${(outside[outside.length - 1] ?? comment).id}`;
}

/**
 * The failing checks and review remarks of a task's pull request that were
 * not yet sent to its agent or dismissed.
 * @param pr The task's pull request, or null when it has none.
 * @param handled Keys already sent or dismissed for this task.
 * @returns The new feedback, or null when there is nothing new.
 */
export function pendingPrFeedback(
  pr: TaskPullRequest | null,
  handled: readonly string[],
): PrFeedback | null {
  if (!pr || (pr.state !== "open" && pr.state !== "draft")) return null;
  const seen = new Set(handled);
  const failed = pr.failedChecks ?? [];
  const remarks = pr.openComments ?? [];
  const checks = failed.filter((run) => !seen.has(checkKey(pr, run)));
  const comments = remarks.filter((comment) => !seen.has(commentKey(pr, comment)));
  if (checks.length === 0 && comments.length === 0) return null;
  return {
    checks,
    comments,
    keys: [
      ...failed.map((run) => checkKey(pr, run)),
      ...remarks.map((comment) => commentKey(pr, comment)),
    ],
  };
}

/**
 * The notice's one line, e.g. "2 checks failed · 3 new comments".
 * @param feedback What is new.
 * @returns The summary.
 */
export function prFeedbackSummary(feedback: Pick<PrFeedback, "checks" | "comments">): string {
  const parts: string[] = [];
  const checks = feedback.checks.length;
  const comments = feedback.comments.length;
  if (checks > 0) parts.push(`${checks} ${checks === 1 ? "check" : "checks"} failed`);
  if (comments > 0) parts.push(`${comments} new ${comments === 1 ? "comment" : "comments"}`);
  return parts.join(" · ");
}

/**
 * The command that prints the end of a failed Actions job's log, when the
 * check links to one.
 * @param url The check's details link.
 * @returns A shell command, or null for a check that is not an Actions job.
 */
export function failedLogCommand(url: string): string | null {
  const match = ACTIONS_URL.exec(url);
  if (!match) return null;
  const [, run, job] = match;
  // The link is third-party text; only a bare number reaches the command.
  if (job !== undefined) {
    return DIGITS.test(job) ? `gh run view --job ${job} --log-failed | tail -n ${LOG_TAIL}` : null;
  }
  return DIGITS.test(run) ? `gh run view ${run} --log-failed | tail -n ${LOG_TAIL}` : null;
}

function clip(text: string, limit: number): string {
  const trimmed = text.trim();
  return trimmed.length > limit
    ? `${trimmed.slice(0, limit).trimEnd()}\n… (truncated, the rest is on GitHub)`
    : trimmed;
}

/** The commented lines, from the hunk as it stood when the comment was written. */
function quoteHunk(comment: PullComment): string {
  const lines = (comment.diffHunk ?? "").split("\n").filter((line) => !line.startsWith("@@"));
  if (lines.length === 0 || (lines.length === 1 && !lines[0])) return "";
  const end = comment.line ?? comment.originalLine;
  const start = comment.startLine ?? comment.originalStartLine;
  const span = end && start ? end - start + 1 : 1;
  const count = Math.min(QUOTE_MAX, Math.max(QUOTE_MIN, span));
  return lines
    .slice(-count)
    .map((line) => `> ${line}`.trimEnd())
    .join("\n");
}

function checkRemark(run: PullCheckRun): { heading: string; body: string } {
  return { body: run.url, heading: run.summary ? `${run.name} — ${run.summary}` : run.name };
}

function commentRemark(comment: PullComment): { heading: string; body: string } {
  const who = comment.author?.login || "a reviewer";
  const line = comment.line ?? comment.originalLine;
  const where =
    comment.kind === "review_comment"
      ? `${comment.path || "unknown file"}${line ? `:${line}` : ""}`
      : "review, changes requested";
  const replies = comment.replies
    .slice(-REPLIES_SHOWN)
    .map((reply) => `↳ ${reply.author?.login || "someone"}: ${clip(reply.body, REPLY_LIMIT)}`);
  const hidden = comment.replies.length - Math.min(comment.replies.length, REPLIES_SHOWN);
  return {
    body: [
      comment.kind === "review_comment" ? quoteHunk(comment) : "",
      clip(comment.body, BODY_LIMIT),
      hidden > 0 ? `(${hidden} earlier ${hidden === 1 ? "reply" : "replies"} on GitHub)` : "",
      ...replies,
    ]
      .filter(Boolean)
      .join("\n"),
    heading: `${where} — ${who}`,
  };
}

/**
 * One prompt carrying what the pull request reported back: failing checks
 * with a link, then review remarks with where they point, the quoted lines,
 * who wrote them and what they said — all inside an untrusted block, since
 * anyone who can comment wrote it. The log commands, built from validated
 * job ids, and every instruction stay outside the block.
 * @param pr The task's pull request.
 * @param feedback The new checks and remarks to deliver.
 * @returns Prompt text for the task's agent.
 */
export function formatPrFeedbackPrompt(
  pr: TaskPullRequest,
  feedback: Pick<PrFeedback, "checks" | "comments">,
): string {
  const data = [`Pull request #${pr.number}: ${pr.title}`, pr.url];
  if (feedback.checks.length > 0) {
    data.push(
      "",
      `Failing checks (${feedback.checks.length}):`,
      "",
      formatRemarkList(feedback.checks.map(checkRemark)),
    );
  }
  if (feedback.comments.length > 0) {
    data.push(
      "",
      `Review comments (${feedback.comments.length}):`,
      "",
      formatRemarkList(feedback.comments.map(commentRemark)),
    );
  }
  const parts = [
    `New feedback on your pull request #${pr.number} (${prFeedbackSummary(feedback)}).`,
    "",
    "Fix what it points at, then commit and push to the same branch. Where a comment is wrong or you disagree, leave the code as it is and say why — do not change working code to satisfy a bad review.",
    "",
    GITHUB_UNTRUSTED_GUIDANCE,
    "",
    untrustedBlock(GITHUB_UNTRUSTED_TAG, GITHUB_UNTRUSTED_NOTICE, data),
  ];
  const logs = feedback.checks.flatMap((run, index) => {
    const command = run.url ? failedLogCommand(run.url) : null;
    return command ? [`- failing check ${index + 1}: \`${command}\``] : [];
  });
  if (logs.length > 0) {
    parts.push("", "To read a failed job's log, run the command Warpforge built for it:", ...logs);
  }
  return `${parts.join("\n")}\n`;
}

/**
 * The Needs-you reason for every task whose pull request has new feedback.
 * @param pulls Task pull requests by task id.
 * @param handled Keys already sent or dismissed, by task id.
 * @returns Summary lines by task id, only for tasks with something new.
 */
export function prFeedbackReasons(
  pulls: Readonly<Record<string, TaskPullRequest>> | undefined,
  handled: Readonly<Record<string, readonly string[]>>,
): Map<string, string> {
  const reasons = new Map<string, string>();
  for (const [taskId, pr] of Object.entries(pulls ?? {})) {
    const feedback = pendingPrFeedback(pr, handled[taskId] ?? []);
    if (feedback) reasons.set(taskId, prFeedbackSummary(feedback));
  }
  return reasons;
}
