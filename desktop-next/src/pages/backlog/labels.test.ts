import { describe, expect, it } from "vitest";

import { availableSources } from "./labels";

describe("availableSources", () => {
  it("offers every source until the project's trackers are known", () => {
    expect(availableSources(undefined)).toEqual(["local", "github", "linear"]);
  });

  it("offers only the trackers the project reaches", () => {
    expect(availableSources({ github: true, linear: false })).toEqual(["local", "github"]);
    expect(availableSources({ github: false, linear: false })).toEqual(["local"]);
  });

  it("keeps a chosen source listed so the filter can be cleared", () => {
    expect(availableSources({ github: false, linear: false }, "linear")).toEqual([
      "local",
      "linear",
    ]);
  });
});
