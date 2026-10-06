import type { PullComment } from "@warpforge/protocol";

const REVIEWER_STATES = new Set(["APPROVED", "CHANGES_REQUESTED", "COMMENTED", "DISMISSED"]);

/** People asked to review, then anyone whose review replaced that request. */
export function reviewRoster(
  requests: readonly string[] | undefined,
  comments: readonly PullComment[],
): { login: string; state: string }[] {
  const byLogin = new Map<string, { login: string; state: string }>();
  for (const login of requests ?? []) {
    const name = login.trim();
    if (name) byLogin.set(name, { login: name, state: "REQUESTED" });
  }
  for (const comment of comments) {
    if (comment.kind !== "review" || !comment.author?.login || !comment.state) continue;
    if (!REVIEWER_STATES.has(comment.state)) continue;
    byLogin.set(comment.author.login, { login: comment.author.login, state: comment.state });
  }
  return [...byLogin.values()];
}

/** A short label for one reviewer's last state. */
export function reviewerLabel(state: string): string {
  switch (state) {
    case "REQUESTED":
      return "Requested";
    case "APPROVED":
      return "Approved";
    case "CHANGES_REQUESTED":
      return "Changes requested";
    case "COMMENTED":
      return "Commented";
    case "DISMISSED":
      return "Dismissed";
    default:
      return state;
  }
}

/** Conversation nodes that belong in the timeline. Inline comments stay on the diff. */
export function isActivityItem(comment: PullComment): boolean {
  if (comment.kind === "comment") return true;
  if (comment.kind === "review") return !!comment.body.trim() || !!comment.state;
  return !comment.line;
}

/** How many inline comments to credit each author's latest review. */
export function codeCommentCounts(comments: readonly PullComment[]): Map<string, number> {
  const byAuthor = new Map<string, number>();
  for (const comment of comments) {
    if (comment.kind !== "review_comment" || !comment.author?.login) continue;
    byAuthor.set(comment.author.login, (byAuthor.get(comment.author.login) ?? 0) + 1);
  }
  const latest = new Map<string, string>();
  for (const comment of comments) {
    if (comment.kind !== "review" || !comment.author?.login) continue;
    latest.set(comment.author.login, comment.id);
  }
  const counts = new Map<string, number>();
  for (const [login, id] of latest) {
    const count = byAuthor.get(login) ?? 0;
    if (count > 0) counts.set(id, count);
  }
  return counts;
}

/** The last lines of an outdated thread's hunk, when the diff no longer has a line for it. */
export function outdatedQuote(comment: PullComment): string {
  if (comment.kind !== "review_comment" || comment.line) return "";
  return (comment.diffHunk ?? "")
    .split("\n")
    .filter((line) => line.length > 0 && !line.startsWith("@@") && !line.startsWith("\\"))
    .slice(-4)
    .join("\n");
}

/** Who wrote a conversation node, and where it sits on the diff. */
export function commentHeading(comment: PullComment): string {
  const who = comment.author?.login || "someone";
  const where = comment.path ? ` · ${comment.path}${comment.line ? `:${comment.line}` : ""}` : "";
  const state = comment.resolved ? " · resolved" : comment.state ? ` · ${comment.state}` : "";
  return `${who}${where}${state}`;
}
