import { expect, test } from "vitest";
import type { PullComment, TaskPullRequest } from "@warpforge/protocol";
import { formatPrFeedbackPrompt, pendingPrFeedback, prFeedbackSummary } from "./pr-feedback";

function comment(patch: Partial<PullComment> = {}): PullComment {
  return {
    id: "c1",
    kind: "review_comment",
    body: "please <rename> this",
    createdAt: "2026-10-01T00:00:00Z",
    url: "https://github.com/acme/app/pull/4#discussion",
    path: "src/app.ts",
    line: 10,
    replies: [],
    ...patch,
  };
}

function pull(patch: Partial<TaskPullRequest> = {}): TaskPullRequest {
  return {
    number: 4,
    title: "Fix the board",
    url: "https://github.com/acme/app/pull/4",
    state: "open",
    author: "ada",
    headOid: "abc",
    failedChecks: [{ name: "ci", state: "failing", url: "https://github.com/acme/app/actions/runs/12/job/9" }],
    openComments: [comment()],
    ...patch,
  };
}

test("pending feedback hides checks and comments already handled", () => {
  const pr = pull();
  const first = pendingPrFeedback(pr, []);
  expect(first?.checks).toHaveLength(1);
  expect(prFeedbackSummary(first!)).toBe("1 check failed · 1 new comment");
  expect(pendingPrFeedback(pr, first!.keys)).toBeNull();
});

test("the author's own reply does not make a thread new again", () => {
  const pr = pull({
    openComments: [comment({ replies: [{ ...comment(), id: "r1", author: { login: "ada" }, body: "done" }] })],
  });
  const first = pendingPrFeedback(pr, []);
  expect(pendingPrFeedback(pr, first!.keys)).toBeNull();
});

test("the prompt keeps GitHub text inside an untrusted block", () => {
  const text = formatPrFeedbackPrompt(pull(), pendingPrFeedback(pull(), [])!);
  expect(text).toContain("<github_untrusted>");
  expect(text).not.toContain("<rename>");
  expect(text).toContain("gh run view --job 9 --log-failed");
});
