import { describe, expect, it } from "vitest";
import { describeGitResult, gitFailureNotice, isGitOpResult, remoteNameTaken } from "./git-result";

describe("describeGitResult", () => {
  it("treats a clean sync as success and a conflict as an error naming the files", () => {
    expect(describeGitResult({ status: "ok", message: "Updated", conflicts: [] }).level).toBe(
      "success",
    );
    expect(
      describeGitResult({ status: "up_to_date", message: "Current", conflicts: [] }).level,
    ).toBe("info");
    const conflict = describeGitResult({
      status: "conflict",
      message: "Could not update",
      conflicts: ["a.ts"],
    });
    expect(conflict.level).toBe("error");
    expect(conflict.detail).toBe("a.ts");
  });

  it("leads a long git failure with the last line and keeps the log to copy", () => {
    const notice = gitFailureNotice("Could not commit", new Error("hook output\nrejected"));
    expect(notice.title).toBe("Could not commit");
    expect(notice.description).toBe("rejected");
    expect(notice.copy).toBe("hook output\nrejected");
    expect(gitFailureNotice("Could not commit", new Error("rejected")).copy).toBeUndefined();
  });

  it("recognizes a git result and leaves a pull request payload alone", () => {
    expect(isGitOpResult({ status: "conflict", message: "Blocked", conflicts: ["a.ts"] })).toBe(
      true,
    );
    expect(isGitOpResult({ url: "https://github.com/org/repo/pull/1" })).toBe(false);
    expect(isGitOpResult(null)).toBe(false);
  });

  it("treats origin/main as taken and ignores an empty name", () => {
    expect(remoteNameTaken(["origin/main", "upstream/dev"], "main")).toBe(true);
    expect(remoteNameTaken(["origin/main"], "feature")).toBe(false);
    expect(remoteNameTaken(["origin/main"], "  ")).toBe(false);
  });
});
