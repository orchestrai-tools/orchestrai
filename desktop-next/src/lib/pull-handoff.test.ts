import { describe, expect, it } from "vitest";
import { assistantHandoffHint, commentHandoffHint } from "../pages/github/pull-actions";

describe("pull handoff hints", () => {
  it("explains an empty review and a live assistant thread", () => {
    expect(commentHandoffHint(0)).toBe("Nothing unresolved on this pull request");
    expect(commentHandoffHint(2)).toBe("Starts a task on this branch to fix them, commit and push");
    expect(assistantHandoffHint(false)).toBe("Ask the Assistant something first");
    expect(assistantHandoffHint(true)).toContain("Moves the Assistant's conversation");
  });
});
