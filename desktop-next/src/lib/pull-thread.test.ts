import { describe, expect, it } from "vitest";
import type { PullComment } from "@warpforge/protocol";
import { codeCommentCounts, commentHeading, isActivityItem, outdatedQuote, reviewRoster } from "./pull-thread";

function comment(patch: Partial<PullComment> = {}): PullComment {
  return {
    id: "c1",
    kind: "review_comment",
    body: "Move this.",
    createdAt: "",
    url: "",
    replies: [],
    ...patch,
  };
}

describe("activity", () => {
  it("keeps reviews and outdated threads, and counts code comments on the latest review", () => {
    const review = comment({ id: "r1", kind: "review", author: { login: "ada" }, body: "ok", state: "APPROVED" });
    const inline = comment({ id: "c1", kind: "review_comment", author: { login: "ada" }, line: 2 });
    const outdated = comment({ id: "c2", kind: "review_comment", author: { login: "ada" }, line: null });
    expect(isActivityItem(review)).toBe(true);
    expect(isActivityItem(inline)).toBe(false);
    expect(isActivityItem(outdated)).toBe(true);
    expect(codeCommentCounts([review, inline, outdated]).get("r1")).toBe(2);
    expect(
      outdatedQuote(
        comment({
          kind: "review_comment",
          diffHunk: "@@ -1,2 +1,3 @@\n columns\n-shell\n+project shell",
        }),
      ),
    ).toBe(" columns\n-shell\n+project shell");
    expect(outdatedQuote(inline)).toBe("");
  });
});

describe("commentHeading", () => {
  it("names the author, the file, and a resolved thread", () => {
    expect(
      commentHeading(
        comment({ author: { login: "ada" }, path: "src/app.ts", line: 12, resolved: true }),
      ),
    ).toBe("ada · src/app.ts:12 · resolved");
  });

  it("keeps a request until that person reviews", () => {
    const roster = reviewRoster(
      ["linus", "ada"],
      [comment({ kind: "review", author: { login: "ada" }, state: "APPROVED" })],
    );
    expect(roster).toEqual([
      { login: "linus", state: "REQUESTED" },
      { login: "ada", state: "APPROVED" },
    ]);
  });

  it("falls back when the author and the location are missing", () => {
    expect(commentHeading(comment({ kind: "comment", state: "COMMENTED" }))).toBe("someone · COMMENTED");
  });
});
