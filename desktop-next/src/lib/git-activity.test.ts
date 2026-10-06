import { describe, expect, it } from "vitest";
import { gitActivityLabel, trackGit, useGitActivity } from "./git-activity";

describe("git activity", () => {
  it("shows the operation only while the call is running", async () => {
    let release: () => void = () => {};
    const pending = trackGit("task-1", "push", () => new Promise<string>((resolve) => {
      release = () => resolve("done");
    }));
    expect(useGitActivity.getState().activity).toEqual({ checkout: "task-1", kind: "push" });
    expect(gitActivityLabel(useGitActivity.getState().activity)).toBe("Pushing…");
    release();
    await pending;
    expect(useGitActivity.getState().activity).toBeNull();
    expect(gitActivityLabel({ checkout: "task-1", kind: "pull" })).toBe("Pulling…");
  });
});
