import { describe, expect, it } from "vitest";

import { plural } from "./plural";

describe("plural", () => {
  it("uses the singular for one only", () => {
    expect(plural(1, "project")).toBe("1 project");
    expect(plural(0, "project")).toBe("0 projects");
    expect(plural(3, "project")).toBe("3 projects");
  });

  it("takes an irregular plural", () => {
    expect(plural(2, "match", "matches")).toBe("2 matches");
  });
});
