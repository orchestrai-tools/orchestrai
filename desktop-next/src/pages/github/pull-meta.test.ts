import { describe, expect, it } from "vitest";

import { listErrorText } from "./pull-meta";

describe("listErrorText", () => {
  it("explains a project without a GitHub remote", () => {
    const err = new Error(
      "internal: could not determine GitHub repo here: none of the git remotes configured for this repository point to a known GitHub host.",
    );
    expect(listErrorText(err, "fallback")).toMatch(/no GitHub remote/);
  });

  it("keeps other errors as they are", () => {
    expect(listErrorText(new Error("internal: rate limited"), "fallback")).toBe("internal: rate limited");
    expect(listErrorText("nope", "Could not list pull requests")).toBe("Could not list pull requests");
  });
});
