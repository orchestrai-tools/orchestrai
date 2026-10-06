import { describe, expect, it } from "vitest";

import { carryChecks } from "./carry-checks";

describe("carryChecks", () => {
  it("checks everything on the first read", () => {
    expect(carryChecks(null, [], ["a", "b"])).toEqual(["a", "b"]);
  });

  it("keeps an uncheck, checks a new file, drops a gone one", () => {
    expect(carryChecks(["a", "b", "c"], ["a", "c"], ["a", "b", "d"])).toEqual(["a", "d"]);
  });
});
