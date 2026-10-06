import type {
  PullComment,
  PullRequestDetails,
  PullRequestFile,
  PullRequestSummary,
  PullThread,
} from "@warpforge/protocol";
import {
  GITHUB_UNTRUSTED_GUIDANCE,
  GITHUB_UNTRUSTED_NOTICE,
  GITHUB_UNTRUSTED_TAG,
  isShellSafeRef,
  prIdentityBlock,
  untrustedBlock,
} from "./github-untrusted";
import { groupPullFiles } from "./pull-file-groups";

export type InboxTaskIntent = "comments" | "branch";

/** Remarks nobody has acted on: inline comments and "changes requested" bodies. */
export function unresolvedReviewComments(thread: PullThread | null): PullComment[] {
  return (thread?.comments ?? []).filter((comment) => {
    if (comment.resolved) return false;
    if (comment.kind === "review_comment") return !!comment.body.trim();
    if (comment.kind === "review") return comment.state === "CHANGES_REQUESTED" && !!comment.body.trim();
    return false;
  });
}

const COMMENT_BODY_LIMIT = 1_200;
const FILE_LIST_LIMIT = 30;

/**
 * Opening prompt for a board task started from a pull request.
 * Instructions stay outside the untrusted block.
 */
export function inboxTaskPrompt({
  intent,
  pr,
  details,
  thread,
  files,
}: {
  intent: InboxTaskIntent;
  pr: PullRequestSummary;
  details?: PullRequestDetails | null;
  thread?: PullThread | null;
  files?: readonly PullRequestFile[] | null;
}): string {
  const head = (details?.headRefName || pr.headRefName).trim();
  const base = (details?.baseRefName || pr.baseRefName).trim();
  const parts: string[] = [];
  const data: string[] = [prIdentityBlock(pr, details)];

  parts.push(
    intent === "comments"
      ? `Address the review comments on pull request #${pr.number}.`
      : `Continue the work on pull request #${pr.number}.`,
  );

  if (head && isShellSafeRef(head)) {
    parts.push(
      "",
      `Work on its own branch, not on ${base && isShellSafeRef(base) ? base : "the base branch"}:`,
      "",
      "```sh",
      `git fetch origin ${head} && git switch ${head}`,
      "```",
    );
  } else if (head) {
    parts.push(
      "",
      "Work on its own branch (named in the block below), not on the base branch. The name has characters a shell treats specially, so quote it when you fetch and switch to it.",
    );
  }

  if (intent === "comments") {
    const comments = unresolvedReviewComments(thread ?? null);
    parts.push(
      "",
      comments.length > 0
        ? `Fix each of the ${comments.length} unresolved ${comments.length === 1 ? "comment" : "comments"} listed in the block below, then commit and push. Where a comment is wrong or you disagree, leave the code alone and say why — do not change working code to satisfy a bad review.`
        : "There are no unresolved review comments on it right now. Check the pull request on GitHub before changing anything.",
    );
    if (comments.length > 0) data.push("", "Review comments:", "", formatComments(comments));
  } else {
    const body = details?.body?.trim();
    if (body) data.push("", "What the pull request says about itself:", "", quote(body));
    parts.push(
      "",
      "Pick up where it left off: read the branch, then finish what is unfinished. Commit and push to the same branch. Ask before changing the shape of the change.",
    );
  }

  const stats = sizeLine(pr, details, files);
  if (stats) parts.push("", stats);
  if (files?.length) data.push("", "Files it touches:", fileList(files));

  parts.push("", GITHUB_UNTRUSTED_GUIDANCE, "", untrustedBlock(GITHUB_UNTRUSTED_TAG, GITHUB_UNTRUSTED_NOTICE, data));
  return `${parts.join("\n")}\n`;
}

function sizeLine(
  pr: PullRequestSummary,
  details?: PullRequestDetails | null,
  files?: readonly PullRequestFile[] | null,
): string | null {
  const additions = details?.additions ?? pr.additions ?? 0;
  const deletions = details?.deletions ?? pr.deletions ?? 0;
  const changed = details?.changedFiles ?? pr.changedFiles ?? files?.length ?? 0;
  if (!additions && !deletions && !changed) return null;
  return `Size: +${additions} −${deletions} across ${changed} ${changed === 1 ? "file" : "files"}.`;
}

function fileList(files: readonly PullRequestFile[]): string {
  const lines: string[] = [];
  for (const group of groupPullFiles(files)) {
    const shown = group.files.slice(0, FILE_LIST_LIMIT);
    lines.push(`${group.label} (${group.files.length}):`);
    for (const file of shown) lines.push(`- ${file.path}`);
    if (group.files.length > shown.length) lines.push(`- …and ${group.files.length - shown.length} more`);
  }
  return lines.join("\n");
}

function formatComments(comments: readonly PullComment[]): string {
  return comments
    .map((comment, index) => {
      const who = comment.author?.login || "a reviewer";
      const where =
        comment.kind === "review_comment"
          ? ` — ${comment.path ?? "unknown file"}${comment.line || comment.originalLine ? `:${comment.line ?? comment.originalLine}` : ""}`
          : " — review, changes requested";
      const replies =
        comment.replies.length > 0
          ? `\n(${comment.replies.length} ${comment.replies.length === 1 ? "reply" : "replies"} in the thread on GitHub)`
          : "";
      const body = trim(comment.body);
      return `${index + 1}. ${who}${where}\n${indent(`${body}${replies}`)}`;
    })
    .join("\n\n");
}

function trim(body: string): string {
  const text = body.trim();
  return text.length > COMMENT_BODY_LIMIT
    ? `${text.slice(0, COMMENT_BODY_LIMIT).trimEnd()}\n… (truncated — read the rest on GitHub)`
    : text;
}

function indent(text: string): string {
  return text
    .split("\n")
    .map((line) => `   ${line}`)
    .join("\n");
}

function quote(text: string): string {
  return text
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}
