import { demoPullWrite, mergeDemoThread, resetDemoPulls } from "@warpforge/daemon/demo-pulls";
import { afterEach, describe, expect, it } from "vitest";

afterEach(() => resetDemoPulls());

describe("demo pull replies", () => {
  it("keeps a reply on the thread it answered", () => {
    const written = demoPullWrite("tracker.pulls.comment", {
      body: "Renamed.",
      in_reply_to: "th-moved",
      number: 7,
    });
    expect(written?.url).toContain("pull/7");
    const merged = mergeDemoThread(7, {
      comments: [{ body: "This moved.", replies: [], threadId: "th-moved" }],
    });
    expect(merged.comments[0]?.replies).toEqual([
      expect.objectContaining({ body: "Renamed.", kind: "review_comment" }),
    ]);
  });

  it("keeps a new line comment on the file and line it was written on", () => {
    const written = demoPullWrite("tracker.pulls.reviewComment", {
      body: "Widen this.",
      line: 3,
      number: 7,
      path: "src/board.tsx",
    });
    expect(written?.url).toContain("pull/7");
    const merged = mergeDemoThread(7, { comments: [] });
    expect(merged.comments).toEqual([
      expect.objectContaining({
        body: "Widen this.",
        kind: "review_comment",
        line: 3,
        path: "src/board.tsx",
      }),
    ]);
  });

  it("adds a new conversation comment when there is no thread", () => {
    demoPullWrite("tracker.pulls.comment", { body: "One more note.", number: 7 });
    const merged = mergeDemoThread(7, { comments: [] });
    expect(merged.comments.map((comment) => comment)).toEqual([
      expect.objectContaining({ body: "One more note.", kind: "comment" }),
    ]);
  });
});
