import { describe, expect, it } from "vitest";
import { generatedTitle } from "./task-title";

describe("generatedTitle", () => {
  it("keeps the first line and drops a code fence", () => {
    expect(generatedTitle("```text\nRename the shell\nextra\n```")).toBe("Rename the shell");
  });

  it("stops at 80 characters", () => {
    expect(generatedTitle("a".repeat(90))).toHaveLength(80);
  });
});
