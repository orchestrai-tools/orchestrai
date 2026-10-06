import { describe, expect, it } from "vitest";
import { isExternalLink } from "./external-link";

describe("isExternalLink", () => {
  it("treats http and https as links that leave the app", () => {
    expect(isExternalLink("https://github.com/orchestrai-tools/orchestrai")).toBe(true);
    expect(isExternalLink("http://localhost:5174")).toBe(true);
    expect(isExternalLink("/tasks/42")).toBe(false);
    expect(isExternalLink("src/main.rs")).toBe(false);
  });
});
