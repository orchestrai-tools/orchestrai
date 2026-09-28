import { describe, expect, it } from "vitest";

import { quickApproveOption } from "./permissionApproval";

describe("quickApproveOption", () => {
  const options = ["allow", "allow_always", "deny"];

  it("offers the one-shot approval for an agent's tool prompt", () => {
    expect(quickApproveOption({ options })).toBe("allow");
  });

  it("offers nothing for a browser site grant, which is answered in the task", () => {
    expect(quickApproveOption({ options, browser_origin: "https://example.com" })).toBeUndefined();
  });
});
