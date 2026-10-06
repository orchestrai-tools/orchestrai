import { describe, expect, it } from "vitest";
import { previousChangeText } from "./change-previous";

describe("previousChangeText", () => {
  it("returns the committed line for a modification and nothing for an addition", () => {
    expect(previousChangeText("shell\n", "project shell\n", 1)).toBe("shell");
    expect(previousChangeText("# Board\n", "# Board\n\nColumns are visible.\n", 2)).toBeNull();
    expect(previousChangeText("a\nb\nc", "a\nc", 2)).toBe("b");
  });
});
